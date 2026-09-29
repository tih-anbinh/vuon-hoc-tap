// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
//
// Shared browser helpers: DOM builder, settings -> CSS variables, narration, toast, break timer,
// and content loading that works both from an HTTP server (fetch) and from the single-file build
// (tools/build_single_file.py embeds content into window.__RO_BUNDLE__ so file:// double-click works).

const BUNDLE = (typeof window !== 'undefined' && window.__RO_BUNDLE__) || null;
export const CONTENT_BASE = 'content/';
export const isBundled = !!BUNDLE;
export const isFileProtocol = typeof location !== 'undefined' && location.protocol === 'file:';
/** Load a JSON document relative to content/ (e.g. 'index.json', 'books/ro-a-001.json'). */
export async function loadJSON(rel) {
  if (BUNDLE) { if (rel in BUNDLE.json) return BUNDLE.json[rel]; throw new Error('not in bundle: ' + rel); }
  const r = await fetch(CONTENT_BASE + rel, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} loading ${rel}`);
  return r.json();
}
/** URL for a media asset relative to content/ (data: URL when bundled). */
export function assetUrl(rel) { return (BUNDLE && BUNDLE.assets[rel]) || CONTENT_BASE + rel; }

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // only for trusted, app-authored markup (icons)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
export const icon = (name, extra = '') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ic ' + extra); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-' + name); s.append(u); return s; };
export function btn(label, onclick, { primary = false, quiet = false, ic = null, attrs = {} } = {}) {
  return h('button', { class: primary ? 'primary' : quiet ? 'quiet' : '', onclick, type: 'button', ...attrs }, ic ? icon(ic) : null, h('span', { text: label }));
}

export function applySettings(s) {
  const r = document.documentElement;
  r.style.setProperty('--story-px', s.story_font_px + 'px');
  r.style.setProperty('--control-px', s.control_font_px + 'px');
  r.style.setProperty('--lh', String(s.line_height));
  r.style.setProperty('--col-ch', s.column_ch + 'ch');
  r.dataset.theme = s.theme; r.dataset.font = s.font_family; r.dataset.illus = s.illustration_size;
  r.dataset.motion = s.reduced_motion === 'on' ? 'reduce' : 'auto';
}

let toastTimer = null;
export function toast(msg, ms = 3500) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

/**
 * Reading speed -> speechSynthesis rate (and <audio>.playbackRate) map. Single source of truth so the
 * kid reader, word cards and parent settings all agree. Three child-facing speeds plus 'very_slow' for
 * the word-study card. 'slow' is intentionally a touch slower than the old 0.8 so struggling readers can
 * follow every syllable; 'fast' ("A bit fast") stays gentle so it never sounds rushed for a young child.
 */
export const SPEED_RATE = { very_slow: 0.6, slow: 0.72, normal: 0.95, fast: 1.12 };
export const rateFor = (speed) => SPEED_RATE[speed] ?? SPEED_RATE.normal;

/**
 * Narrator. Source of truth for sound is the BUILT audio (content/audio/*, rendered from the pronunciation
 * lexicon by tools/build_audio.py). Device speechSynthesis is only a fallback. When it is used we score the
 * device's installed voices and pick the best English one, strongly preferring Apple "Enhanced"/"Premium"
 * and Google network voices (much nicer on iPad/iPhone/Android than the tiny default "compact" voice), and
 * preferring the parent-chosen accent (en-GB, then en-US, then any English). Word highlighting is intentionally
 * NOT done (R02).
 */
export const narrator = {
  supported: typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined',
  audio: null, speaking: false, onend: null, onstart: null, lastSource: null, deviceAllowed: true, accent: 'en-GB',
  _voiceCache: {}, // accent -> chosen SpeechSynthesisVoice (invalidated on 'voiceschanged')
  /** clips: { normal, slow, us } -> urls (any may be null). speed: 'very_slow'|'slow'|'normal'|'fast'. */
  speak(text, { clips = {}, speed = 'normal', accent = this.accent } = {}) {
    this.stop();
    const url = accent === 'en-US' && clips.us ? clips.us : (speed !== 'normal' && clips.slow) ? clips.slow : clips.normal;
    if (url) {
      this.lastSource = 'built';
      this.audio = new Audio(url);
      // If only a normal clip exists, adjust it in-place (browser preserves pitch). A dedicated 'slow' clip
      // already sounds slow, so only nudge it for the extremes.
      if (!clips.slow && speed !== 'normal') this.audio.playbackRate = rateFor(speed) / SPEED_RATE.normal;
      else if (clips.slow && speed === 'fast') this.audio.playbackRate = SPEED_RATE.fast / SPEED_RATE.normal;
      if (accent === 'en-US' && !clips.us) { /* no US clip: fall through to UK clip silently */ }
      this.audio.onplay = () => this.onstart?.();
      this.audio.onended = () => { this.speaking = false; this.onend?.(); };
      this.audio.onerror = () => { this.audio = null; this._tts(text, speed, accent); };
      this.speaking = true; this.audio.play().catch(() => { this.audio = null; this._tts(text, speed, accent); });
      return true;
    }
    return this._tts(text, speed, accent);
  },
  /**
   * Score every installed voice for the wanted accent and return the best one. Higher score = better.
   * Recognises the high-quality voices shipped on real devices:
   *   - Apple (iOS/iPadOS/macOS): names contain "(Enhanced)"/"(Premium)"; good named voices are Daniel,
   *     Serena, Kate, Arthur, Oliver, Stephanie, Martha, Shelley (en-GB) and Samantha, Ava, Allison,
   *     Nicky, Aaron, Zoe, Evan (en-US). The tiny built-in one is often just "compact".
   *   - Google (Android/Chrome): "Google UK English Female/Male", "Google US English" (network, natural).
   *   - Windows/Edge: Sonia, Libby, Ryan, Maisie, Hazel, George, Aria, Guy (natural online).
   */
  _pickVoice(accent) {
    if (!this.supported) return null;
    if (this._voiceCache[accent]) return this._voiceCache[accent];
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null; // voices not ready yet; 'voiceschanged' will retry
    const want = accent.replace('_', '-').toLowerCase();       // e.g. 'en-gb'
    const base = want.slice(0, 2);                              // 'en'
    const premium = /premium|enhanced|neural|natural/i;
    const goodNames = /sonia|libby|ryan|maisie|hazel|susan|george|aria|guy|jenny|daniel|serena|kate|arthur|oliver|stephanie|martha|shelley|samantha|ava|allison|susan|nicky|aaron|zoe|evan|google (uk|us) english/i;
    const novelty = /novelty|eloquence|zarvox|trinoids|bells|bad news|good news|bahh|boing|bubbles|cellos|wobble|whisper|organ|superstar|jester|albert|fred|junior|ralph|kathy|princess|deranged|hysterical/i;
    const score = (v) => {
      const vlang = v.lang.replace('_', '-').toLowerCase();
      let s = 0;
      if (vlang === want) s += 100;                 // exact accent match
      else if (vlang.startsWith(base)) s += 40;     // same language, other region
      else return -1;                               // not English at all -> reject
      if (novelty.test(v.name)) s -= 80;            // never pick a joke voice for a child
      if (premium.test(v.name)) s += 50;            // Apple Enhanced/Premium, Neural
      if (goodNames.test(v.name)) s += 25;          // known pleasant named voices
      if (/compact/i.test(v.name)) s -= 15;         // Apple's low-quality fallback
      // A network/remote voice is usually the natural one; a purely local generic voice is often robotic.
      if (v.localService === false) s += 8;
      return s;
    };
    let best = null, bestScore = -Infinity;
    for (const v of voices) { const sc = score(v); if (sc > bestScore) { bestScore = sc; best = v; } }
    if (!best || bestScore < 0) best = voices.find(v => v.lang.toLowerCase().startsWith(base)) || null;
    if (best) this._voiceCache[accent] = best;
    return best;
  },
  _tts(text, speed, accent) {
    if (!this.supported || !this.deviceAllowed) { this.speaking = false; return false; }
    this.lastSource = 'device';
    const u = new SpeechSynthesisUtterance(text);
    const v = this._pickVoice(accent); if (v) u.voice = v; u.lang = accent;
    u.rate = rateFor(speed); u.pitch = 1;
    u.onstart = () => this.onstart?.();
    u.onend = u.onerror = () => { this.speaking = false; this.onend?.(); };
    this.speaking = true; speechSynthesis.speak(u); return true;
  },
  pause() { if (this.audio) this.audio.pause(); else if (this.supported) speechSynthesis.pause(); },
  resume() { if (this.audio) this.audio.play().catch(() => {}); else if (this.supported) speechSynthesis.resume(); },
  stop() { if (this.audio) { this.audio.pause(); this.audio = null; } if (this.supported) speechSynthesis.cancel(); this.speaking = false; },
  /** Human-readable description of what will play, for the parent settings screen. */
  describe(accent = this.accent) { const v = this._pickVoice(accent); return v ? `${v.name} (${v.lang}${v.localService === false ? ', online' : ', on device'})` : 'no matching device voice'; },
};
// getVoices() is empty on the first call in many mobile browsers; it populates asynchronously and fires
// 'voiceschanged'. Clear the cache then so the best voice is re-picked once the full list has loaded.
if (narrator.supported && typeof speechSynthesis.addEventListener === 'function') {
  speechSynthesis.addEventListener('voiceschanged', () => { narrator._voiceCache = {}; });
  try { speechSynthesis.getVoices(); } catch { /* some engines need a first nudge to start loading */ }
}

/** Break cue (A07): banner after N minutes of an active session; dismissible; never blocks Stop. */
export class BreakTimer {
  constructor({ minutes, onCue }) { this.minutes = minutes; this.onCue = onCue; this.t = null; this.start(); }
  start() { this.stop(); if (this.minutes > 0) this.t = setTimeout(() => { this.onCue(); this.start(); }, this.minutes * 60000); }
  stop() { if (this.t) clearTimeout(this.t); this.t = null; }
  setMinutes(m) { this.minutes = m; this.start(); }
}

export function fmtDate(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }
export function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function escapeText(s) { return String(s); } // textContent is used everywhere; kept for clarity
