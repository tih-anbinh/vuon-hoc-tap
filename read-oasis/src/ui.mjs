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
 * kid reader, word cards and parent settings all agree. Four child-facing speeds. 'very_slow' (0.5) is
 * for children who need to follow every single syllable; it is now a first-class choice in the reader's
 * speed cycle, not just the word-study card. 'slow' is a touch slower than before so struggling readers
 * can keep up; 'fast' ("A bit fast") stays gentle so it never sounds rushed for a young child.
 */
export const SPEED_RATE = { very_slow: 0.5, slow: 0.68, normal: 0.95, fast: 1.12 };
export const rateFor = (speed) => SPEED_RATE[speed] ?? SPEED_RATE.normal;

/**
 * Voice classification — distilled from the community "recommended voices for the Web Speech API"
 * dataset (github.com/HadrienGardeur/web-speech-recommended-voices, now maintained under readium/speech,
 * CC0). The Web Speech API returns dozens of voices per device with unfriendly names and no quality
 * signal, so we curate them for a 6-year-old ESL reader:
 *   - FILTER OUT junk: Apple "novelty" voices (Bad News, Bubbles, Zarvox, Whisper, Albert…), Apple
 *     "Eloquence"/very-low-quality (Eddy, Flo, Grandma/Grandpa, Reed, Rocko, Sandy, Shelley, Fred,
 *     Junior, Kathy, Ralph) and ChromeOS "eSpeak *" — all harsh/robotic and confusing for a child.
 *   - RANK by quality: children voices first (they sound friendly & age-appropriate), then very-high
 *     (MS Natural / Apple Premium / Google Natural), high, normal, low.
 *   - LABEL nicely: "Microsoft Ana Online (Natural) - English (United States)" -> "Ana (US) · kid voice";
 *     "Google US English" -> "Google voice (US)". Region is kept because a child may prefer UK vs US.
 */
// Voices that must never be offered to a child (regex over voice.name). From novelty.json + veryLowQuality.json.
const VOICE_REJECT = /\bnovelty\b|eloquence|espeak|\bbad news\b|\bgood news\b|\bbahh\b|\bboing\b|\bbubbles\b|\bcellos\b|\bwobble\b|\bwhisper\b|\borgan\b|\bbells\b|\bsuperstar\b|\bjester\b|\bzarvox\b|\btrinoids\b|\balbert\b|\bfred\b|\bjunior\b|\bkathy\b|\bralph\b|\beddy\b|\bflo\b|\bgrandma\b|\bgrandpa\b|\breed\b|\brocko\b|\bsandy\b|\bshelley\b/i;
// Named children's voices across platforms (Microsoft Ana/Maisie, Apple Joelle) — ideal for our audience.
const VOICE_CHILDREN = /\bana\b|\bmaisie\b|\bjoelle\b/i;
// Very-high / premium quality markers (Microsoft Natural, Apple Premium/Enhanced, Google Natural).
const VOICE_VERY_HIGH = /\(natural\)|premium|enhanced|neural/i;
// Pleasant, well-known named voices worth a small boost (kept broad; region-agnostic).
const VOICE_GOOD_NAMES = /sonia|libby|ryan|aria|guy|jenny|emma|andrew|brian|natasha|clara|neerja|daniel|serena|kate|arthur|oliver|stephanie|samantha|ava|allison|nicky|zoe|matilda|karen|moira|tessa|google (uk|us|australian) english|google (us|uk) english/i;
const VOICE_COMPACT = /\bcompact\b/i;

/** Score a raw SpeechSynthesisVoice for a wanted accent. Higher = better. Returns -1 for reject/non-English. */
function scoreVoice(v, wantAccent) {
  if (!v || !v.lang) return -1;
  if (VOICE_REJECT.test(v.name)) return -1;                 // never offer junk/novelty to a child
  const vlang = v.lang.replace('_', '-').toLowerCase();
  const base = vlang.slice(0, 2);
  if (base !== 'en') return -1;                             // English only
  const want = (wantAccent || 'en-GB').replace('_', '-').toLowerCase();
  let s = 0;
  if (vlang === want) s += 100; else s += 40;               // exact accent match beats other English region
  if (VOICE_CHILDREN.test(v.name)) s += 60;                 // a friendly kid voice is best for our readers
  if (VOICE_VERY_HIGH.test(v.name)) s += 50;                // MS Natural / Apple Premium/Enhanced / Google Natural
  if (VOICE_GOOD_NAMES.test(v.name)) s += 20;               // known pleasant named voices
  if (VOICE_COMPACT.test(v.name)) s -= 15;                  // Apple's low-quality compact fallback
  if (v.localService === false) s += 8;                     // network voice is usually the natural one
  return s;
}

/** Turn an ugly engine voice name into a short, child/parent-friendly label with region + kid tag. */
function friendlyVoiceLabel(v) {
  const lang = (v.lang || '').toLowerCase();
  const region = lang.includes('gb') ? 'UK' : lang.includes('au') ? 'Australia' : lang.includes('ca') ? 'Canada'
    : lang.includes('in') ? 'India' : lang.includes('ie') ? 'Ireland' : lang.includes('za') ? 'S.Africa'
    : lang.includes('nz') ? 'NZ' : lang.includes('us') ? 'US' : (v.lang || '').toUpperCase();
  let name = v.name || 'Voice';
  // "Microsoft Ana Online (Natural) - English (United States)" -> "Ana"
  let m = name.match(/^Microsoft\s+([A-Za-z]+?)(?:Multilingual)?\s+(?:Online\b|-)/i);
  if (m) name = m[1];
  else if (/^Microsoft\s+/i.test(name)) name = name.replace(/^Microsoft\s+/i, '').replace(/\s*-\s*English.*$/i, '').trim();
  // "Google US English Female" / "Google UK English" -> "Google voice"
  else if (/^Google\b/i.test(name)) name = 'Google voice';
  // ChromeOS "Female voice 1 (US)" style already friendly; Apple names ("Samantha", "Ava (Enhanced)") -> strip variant tag
  else name = name.replace(/\s*\((Enhanced|Premium|English \([^)]*\))\)\s*$/i, '').trim();
  const kid = VOICE_CHILDREN.test(v.name) ? ' · kid voice' : '';
  return `${name} (${region})${kid}`;
}

/**
 * Narrator. Source of truth for sound is the BUILT audio (content/audio/*, rendered from the pronunciation
 * lexicon by tools/build_audio.py). Device speechSynthesis is only a fallback. When it is used we score the
 * device's installed voices and pick the best English one, strongly preferring Apple "Enhanced"/"Premium"
 * and Google network voices (much nicer on iPad/iPhone/Android than the tiny default "compact" voice), and
 * preferring the parent-chosen accent (en-GB, then en-US, then any English). A specific device voice can be
 * chosen (narrator.voiceURI) which overrides the auto-picker and forces the device path so it always applies.
 * Word-by-word highlight is available via the 'boundary' event and surfaced through narrator.onboundary; it
 * only fires on the device voice path (pre-rendered clips carry no per-word timings).
 */
export const narrator = {
  supported: typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined',
  audio: null, speaking: false, onend: null, onstart: null, onboundary: null, lastSource: null, deviceAllowed: true, accent: 'en-GB',
  voiceURI: null, // when set, the parent/child explicitly chose this device voice; it overrides the auto-picker
  _voiceCache: {}, // accent -> chosen SpeechSynthesisVoice (invalidated on 'voiceschanged')
  /**
   * List the device's installed English voices, best first, for a voice-picker UI. Junk (novelty /
   * very-low-quality / eSpeak) voices are filtered out and each voice gets a short, friendly label; the
   * child-friendly voices (Ana / Maisie / Joelle) are flagged and float to the top, then higher-quality
   * voices. Each item is { uri, name, label, lang, online, kid }. Returns [] when the engine has no voices
   * yet (retry on 'voiceschanged'). accent biases the ordering toward the parent's chosen region.
   */
  listVoices(accent = this.accent) {
    if (!this.supported) return [];
    const voices = speechSynthesis.getVoices() || [];
    return voices
      .map(v => ({ v, sc: scoreVoice(v, accent) }))
      .filter(x => x.sc >= 0)                                    // drop non-English + rejected junk voices
      .sort((a, b) => b.sc - a.sc || (a.v.lang || '').localeCompare(b.v.lang) || (a.v.name || '').localeCompare(b.v.name))
      .map(({ v }) => ({
        uri: v.voiceURI, name: v.name, label: friendlyVoiceLabel(v),
        lang: v.lang, online: v.localService === false, kid: VOICE_CHILDREN.test(v.name),
      }));
  },
  /** True when a specific device voice is chosen AND still installed — then we always use device TTS. */
  hasChosenVoice() {
    if (!this.supported || !this.voiceURI) return false;
    return (speechSynthesis.getVoices() || []).some(v => v.voiceURI === this.voiceURI);
  },
  /** clips: { normal, slow, us } -> urls (any may be null). speed: 'very_slow'|'slow'|'normal'|'fast'. */
  speak(text, { clips = {}, speed = 'normal', accent = this.accent } = {}) {
    this.stop();
    // When the user has explicitly picked a device voice, honour it: skip the pre-rendered clips and use
    // device TTS so the chosen voice AND word-by-word highlighting (onboundary) both work.
    if (this.hasChosenVoice()) return this._tts(text, speed, accent);
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
    // An explicitly chosen device voice always wins (if it is still installed).
    if (this.voiceURI) {
      const chosen = (speechSynthesis.getVoices() || []).find(v => v.voiceURI === this.voiceURI);
      if (chosen) return chosen;
    }
    if (this._voiceCache[accent]) return this._voiceCache[accent];
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null; // voices not ready yet; 'voiceschanged' will retry
    // Reuse the shared curated scorer (children-first, quality-ranked, junk filtered out).
    let best = null, bestScore = -Infinity;
    for (const v of voices) { const sc = scoreVoice(v, accent); if (sc > bestScore) { bestScore = sc; best = v; } }
    // Fallback: if everything scored as reject (all junk/non-English), take any English voice at all.
    if (!best || bestScore < 0) best = voices.find(v => (v.lang || '').toLowerCase().startsWith('en')) || null;
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
    // Word-by-word highlight: only the device voice fires 'boundary'. We forward the character offset
    // and length so the caller can map it to a rendered word span. (Pre-rendered clips have no timings.)
    u.onboundary = (e) => { if (e.name === 'word' || e.name === undefined) this.onboundary?.(e.charIndex, e.charLength || 0); };
    u.onend = u.onerror = () => { this.speaking = false; this.onend?.(); };
    this.speaking = true; speechSynthesis.speak(u); return true;
  },
  pause() { if (this.audio) this.audio.pause(); else if (this.supported) speechSynthesis.pause(); },
  resume() { if (this.audio) this.audio.play().catch(() => {}); else if (this.supported) speechSynthesis.resume(); },
  stop() { if (this.audio) { this.audio.pause(); this.audio = null; } if (this.supported) speechSynthesis.cancel(); this.speaking = false; },
  /** Human-readable description of what will play, for the parent settings screen. */
  describe(accent = this.accent) { const v = this._pickVoice(accent); if (!v) return 'no matching device voice'; const chosen = this.voiceURI && v.voiceURI === this.voiceURI ? ' — your choice' : ''; return `${friendlyVoiceLabel(v)}${v.localService === false ? ', online' : ', on device'}${chosen}`; },
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
