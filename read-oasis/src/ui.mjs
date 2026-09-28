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
 * Narrator. Source of truth for sound is the BUILT audio (content/audio/*, rendered from the pronunciation
 * lexicon by tools/build_audio.py). Device speechSynthesis is only a fallback, and then we still prefer a
 * native en-GB voice over "any English". Word highlighting is intentionally NOT done (R02).
 */
export const narrator = {
  supported: typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined',
  audio: null, speaking: false, onend: null, onstart: null, lastSource: null, deviceAllowed: true, accent: 'en-GB',
  /** clips: { normal, slow, us } -> urls (any may be null). speed: 'normal'|'slow'|'very_slow'. */
  speak(text, { clips = {}, speed = 'normal', accent = this.accent } = {}) {
    this.stop();
    const url = accent === 'en-US' && clips.us ? clips.us : (speed !== 'normal' && clips.slow) ? clips.slow : clips.normal;
    if (url) {
      this.lastSource = 'built';
      this.audio = new Audio(url);
      // If only a normal clip exists, slow it down in-place (pitch preserved by the browser).
      if (speed !== 'normal' && !clips.slow) this.audio.playbackRate = speed === 'very_slow' ? 0.6 : 0.8;
      if (accent === 'en-US' && !clips.us) { /* no US clip: fall through to UK clip silently */ }
      this.audio.onplay = () => this.onstart?.();
      this.audio.onended = () => { this.speaking = false; this.onend?.(); };
      this.audio.onerror = () => { this.audio = null; this._tts(text, speed, accent); };
      this.speaking = true; this.audio.play().catch(() => { this.audio = null; this._tts(text, speed, accent); });
      return true;
    }
    return this._tts(text, speed, accent);
  },
  _pickVoice(lang) {
    if (!this.supported) return null;
    const voices = speechSynthesis.getVoices();
    const exact = voices.filter(v => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
    // Prefer local, non-novelty voices; on Windows/Edge "Sonia"/"Libby"/"Ryan" online voices are en-GB natural.
    const pref = /sonia|libby|ryan|maisie|hazel|susan|george|daniel|kate|serena|arthur|martha/i;
    return exact.find(v => pref.test(v.name)) || exact.find(v => v.localService) || exact[0] || voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2))) || null;
  },
  _tts(text, speed, accent) {
    if (!this.supported || !this.deviceAllowed) { this.speaking = false; return false; }
    this.lastSource = 'device';
    const u = new SpeechSynthesisUtterance(text);
    const v = this._pickVoice(accent); if (v) u.voice = v; u.lang = accent;
    u.rate = speed === 'very_slow' ? 0.6 : speed === 'slow' ? 0.8 : 0.95; u.pitch = 1;
    u.onstart = () => this.onstart?.();
    u.onend = u.onerror = () => { this.speaking = false; this.onend?.(); };
    this.speaking = true; speechSynthesis.speak(u); return true;
  },
  pause() { if (this.audio) this.audio.pause(); else if (this.supported) speechSynthesis.pause(); },
  resume() { if (this.audio) this.audio.play().catch(() => {}); else if (this.supported) speechSynthesis.resume(); },
  stop() { if (this.audio) { this.audio.pause(); this.audio = null; } if (this.supported) speechSynthesis.cancel(); this.speaking = false; },
  /** Human-readable description of what will play, for the parent settings screen. */
  describe(accent = this.accent) { const v = this._pickVoice(accent); return v ? `${v.name} (${v.lang}${v.localService ? ', on device' : ', online'})` : 'no matching device voice'; },
};
if (narrator.supported && typeof speechSynthesis.addEventListener === 'function') speechSynthesis.addEventListener('voiceschanged', () => {});

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
