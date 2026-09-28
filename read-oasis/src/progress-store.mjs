// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
//
// Read Oasis progress store: local-first persistence, migrations, idempotent
// reward ledger, backup export/import with validation (Gate D: D01, D04-D06).
// Storage-agnostic: pass any object with getItem/setItem/removeItem (localStorage
// or an in-memory shim for tests).

export const STORE_VERSION = 1;
export const STORE_KEY = 'read_oasis.store.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  // Display (testing defaults, not clinical prescriptions; tune with the child)
  font_family: 'rounded',          // rounded | system | serif (rounded falls back to system-ui if Nunito is absent)
  story_font_px: 26,               // 24-30 suggested
  control_font_px: 19,
  line_height: 1.5,
  column_ch: 40,                   // max line width in ch
  illustration_size: 'medium',     // small | medium | large | hidden
  theme: 'light',                  // light | cream | dark  (no medical claims)
  reduced_motion: 'auto',          // auto | on
  // Session
  break_minutes: 20,               // 0 disables cue
  session_minutes: 15,
  sound_effects: true,
  narration: true,
  accent: 'en-GB',                 // en-GB (default) | en-US - which word clips / TTS voice to prefer
  default_speed: 'normal',         // normal | slow - initial narration speed
  allow_device_tts: true,          // fall back to speechSynthesis when a page has no built audio
  // Learning
  band: null,                      // 'A-C' | 'D-J' | 'K-P' | 'Q-Z' (parent-set after baseline)
  independent_track_band: null,    // may differ from read-aloud track (L02)
  read_aloud_track_band: null,
  focus_skills: [],
  language_home: [],
  // Privacy / rewards
  recording_enabled: false,
  recording_retain: false,
  rewards_enabled: true,
  mascot_enabled: true,
  parent_pin_hash: null,
  cloud_sync_enabled: false,       // parent opt-in; see src/sync.mjs
  hidden_books: [],                // parent veto: book_ids removed from the child library on this profile (synced)
  greeting_audio: true,            // spoken greeting when the library opens
  unseen_unlocked: null,           // book_id of a reserved unseen-check text temporarily shown to the child (C06)
});

export function emptyStore(profileId = 'child-1') {
  return {
    store_version: STORE_VERSION,
    profile: { id: profileId, created_at: nowIso(), display_name: 'Reader' }, // no real name / DOB
    settings: { ...DEFAULT_SETTINGS },
    baseline: null,             // L01: {recorded_at, notes, comfortable_text, challenge_text, retell, questions, support_used, visual}
    books: {},                  // book_id -> { revisions: { rev -> BookProgress } }
    attempts: [],               // quiz/activity attempts (append-only)
    observations: [],           // parent notes / rubric entries
    unseen_checks: [],          // C06/L03: transfer checks kept apart from practice
    level_suggestions: [],      // L04: {id, from, to, evidence, decision}
    ledger: [],                 // reward transactions (idempotent)
    sessions: [],               // {started_at, ended_at, minutes, breaks_shown, breaks_dismissed}
    recordings_meta: [],        // only metadata; blobs live in IndexedDB when retained
  };
}

export function nowIso() { return new Date().toISOString(); }

export class ProgressStore {
  constructor(storage, key = STORE_KEY) {
    this.storage = storage; this.key = key; this.data = null; this.listeners = new Set();
  }
  load() {
    let raw = null;
    try { raw = this.storage.getItem(this.key); } catch { raw = null; }
    if (!raw) { this.data = emptyStore(); this.save(); return this.data; }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { // corrupt: keep a copy, start fresh (never silently overwrite)
      try { this.storage.setItem(this.key + '.corrupt.' + Date.now(), raw); } catch { /* ignore */ }
      this.data = emptyStore(); this.save(); return this.data;
    }
    this.data = migrate(parsed);
    if (this.data.store_version !== parsed.store_version) this.save();
    return this.data;
  }
  save() {
    this.data.updated_at = nowIso();
    try { this.storage.setItem(this.key, JSON.stringify(this.data)); this.lastSaveError = null; }
    catch (e) { this.lastSaveError = e; }
    for (const fn of this.listeners) fn(this.data);
    return !this.lastSaveError;
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // ---------- settings
  setSettings(patch) { this.data.settings = { ...this.data.settings, ...patch }; this.save(); return this.data.settings; }
  /** Parent veto (L04-style): hide/show a published book for this child without touching content files. */
  setBookHidden(bookId, hidden) {
    const set = new Set(this.data.settings.hidden_books || []);
    hidden ? set.add(bookId) : set.delete(bookId);
    this.setSettings({ hidden_books: [...set] });
    this.addObservation({ text: `${hidden ? 'Hid' : 'Restored'} book ${bookId} in the child library`, kind: 'library', bookId });
  }
  isBookHidden(bookId) { return (this.data.settings.hidden_books || []).includes(bookId); }

  // ---------- book progress (keyed by revision; D06 never overwrites history)
  bookProgress(bookId, revision, create = true) {
    const b = this.data.books[bookId] || (create ? (this.data.books[bookId] = { revisions: {} }) : null);
    if (!b) return null;
    const r = b.revisions[revision];
    if (r || !create) return r || null;
    // New revision: carry over nothing but note prior revisions for the UI (D06)
    const prior = Object.keys(b.revisions).map(Number).filter(n => n < revision);
    return (b.revisions[revision] = {
      revision, page_index: 0, opened_at: nowIso(), last_seen_at: nowIso(),
      completed_reads: 0, support_used: { audio: false, parent: false, vocab_taps: 0 },
      quiz_done_cycles: 0, migrated_from_revision: prior.length ? Math.max(...prior) : null,
    });
  }
  setPage(bookId, revision, pageIndex, support = {}) {
    const p = this.bookProgress(bookId, revision);
    p.page_index = pageIndex; p.last_seen_at = nowIso();
    if (support.audio) p.support_used.audio = true;
    if (support.parent) p.support_used.parent = true;
    if (support.vocab_tap) p.support_used.vocab_taps += 1;
    this.save(); return p;
  }
  completeRead(bookId, revision) {
    const p = this.bookProgress(bookId, revision); p.completed_reads += 1; p.completed_at = nowIso(); this.save(); return p;
  }
  lastOpened() {
    let best = null;
    for (const [book_id, b] of Object.entries(this.data.books)) for (const r of Object.values(b.revisions)) {
      if (!best || r.last_seen_at > best.last_seen_at) best = { book_id, ...r };
    }
    return best;
  }

  // ---------- attempts (R04: first-attempt credit tracked per question per cycle)
  recordAttempt({ bookId, revision, questionId, skill, optionId, correct, cycle, kind = 'quiz', supportUsed = {}, unseen = false, responseText = null }) {
    const prev = this.data.attempts.filter(a => a.book_id === bookId && a.revision === revision && a.question_id === questionId && a.cycle === cycle);
    const a = {
      id: `${bookId}:${revision}:${questionId}:${cycle}:${prev.length + 1}`, book_id: bookId, revision, question_id: questionId, skill,
      option_id: optionId, correct: !!correct, first_attempt: prev.length === 0, cycle, kind, at: nowIso(),
      support_used: supportUsed, unseen: !!unseen, response_text: responseText, rubric: null,
    };
    this.data.attempts.push(a); this.save(); return a;
  }
  quizCycle(bookId, revision) { return this.bookProgress(bookId, revision).quiz_done_cycles; }
  finishQuizCycle(bookId, revision) { const p = this.bookProgress(bookId, revision); p.quiz_done_cycles += 1; this.save(); return p.quiz_done_cycles; }

  // ---------- reward ledger (D01: idempotent key)
  award({ childId = this.data.profile.id, bookId, revision, activity, questionId = '-', cycle = 0, stars = 1 }) {
    if (!this.data.settings.rewards_enabled) return { granted: false, reason: 'rewards_disabled' };
    const key = [childId, bookId, revision, activity, questionId, cycle].join('|');
    if (this.data.ledger.some(t => t.key === key)) return { granted: false, reason: 'duplicate', key };
    const tx = { key, stars, at: nowIso() }; this.data.ledger.push(tx); this.save();
    return { granted: true, key, tx };
  }
  totalStars() { return this.data.ledger.reduce((s, t) => s + (t.stars || 0), 0); }

  // ---------- observations / rubric (Section 9)
  addObservation({ text, rubric = null, bookId = null, skill = null, example = null, uncertainty = null, kind = 'note' }) {
    const o = { id: 'obs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), at: nowIso(), text, rubric, book_id: bookId, skill, example, uncertainty, kind };
    this.data.observations.push(o); this.save(); return o;
  }
  editObservation(id, patch) { const o = this.data.observations.find(x => x.id === id); if (!o) return null; Object.assign(o, patch, { edited_at: nowIso() }); this.save(); return o; }
  addUnseenCheck(entry) { const e = { id: 'unseen-' + Date.now(), at: nowIso(), ...entry }; this.data.unseen_checks.push(e); this.save(); return e; }
  setBaseline(b) { this.data.baseline = { recorded_at: nowIso(), ...b }; this.save(); return this.data.baseline; }

  // ---------- level suggestions (L04: parent accepts/rejects; history kept)
  suggestLevel(s) { const e = { id: 'sug-' + Date.now(), at: nowIso(), decision: 'pending', ...s }; this.data.level_suggestions.push(e); this.save(); return e; }
  decideSuggestion(id, decision) {
    const s = this.data.level_suggestions.find(x => x.id === id); if (!s) return null;
    s.decision = decision; s.decided_at = nowIso();
    if (decision === 'accepted') this.setSettings({ [s.track === 'read_aloud' ? 'read_aloud_track_band' : 'independent_track_band']: s.to });
    this.save(); return s;
  }

  // ---------- sessions / breaks (A07)
  startSession() { const s = { id: 'ses-' + Date.now(), started_at: nowIso(), breaks_shown: 0, breaks_dismissed: 0 }; this.data.sessions.push(s); this.save(); return s; }
  endSession(id) { const s = this.data.sessions.find(x => x.id === id); if (s && !s.ended_at) { s.ended_at = nowIso(); this.save(); } return s; }
  noteBreak(id, dismissed) { const s = this.data.sessions.find(x => x.id === id); if (s) { s.breaks_shown += 1; if (dismissed) s.breaks_dismissed += 1; this.save(); } }

  // ---------- backup (D04, D05)
  exportBackup() {
    const payload = { format: 'read-oasis-backup', store_version: STORE_VERSION, exported_at: nowIso(), data: this.data };
    payload.checksum = checksum(JSON.stringify(payload.data));
    return JSON.stringify(payload, null, 2);
  }
  /** Validates fully before touching existing data; returns {ok, reason, merged:{...counts}} */
  importBackup(text, { policy = 'merge' } = {}) {
    let payload;
    try { payload = JSON.parse(text); } catch { return { ok: false, reason: 'not valid JSON' }; }
    const v = validateBackup(payload);
    if (!v.ok) return v;
    const incoming = migrate(structuredCloneSafe(payload.data));
    const prior = structuredCloneSafe(this.data);
    try {
      const merged = policy === 'replace' ? incoming : mergeStores(prior, incoming);
      const counts = summarize(prior, merged);
      this.data = merged;
      if (!this.save()) { this.data = prior; this.save(); return { ok: false, reason: 'storage write failed; prior data kept' }; }
      return { ok: true, merged: counts };
    } catch (e) {
      this.data = prior; // D05: failure leaves prior data intact
      return { ok: false, reason: 'merge failed: ' + (e?.message || e) };
    }
  }

  // ---------- deletion (D03)
  deleteRecordingsMeta() { this.data.recordings_meta = []; this.save(); }
  deleteProfile() { this.data = emptyStore(); try { this.storage.removeItem(this.key); } catch { /* ignore */ } this.save(); }
}

export function validateBackup(payload) {
  if (!payload || payload.format !== 'read-oasis-backup') return { ok: false, reason: 'unrecognized backup format' };
  if (!Number.isInteger(payload.store_version) || payload.store_version > STORE_VERSION) return { ok: false, reason: `incompatible store_version ${payload.store_version}` };
  if (!payload.data || typeof payload.data !== 'object') return { ok: false, reason: 'missing data' };
  if (payload.checksum !== checksum(JSON.stringify(payload.data))) return { ok: false, reason: 'checksum mismatch (corrupt or edited backup)' };
  const d = payload.data;
  for (const k of ['profile', 'settings', 'books', 'attempts', 'ledger']) if (!(k in d)) return { ok: false, reason: `missing section ${k}` };
  if (!Array.isArray(d.ledger) || d.ledger.some(t => typeof t.key !== 'string')) return { ok: false, reason: 'ledger entries malformed' };
  if (!Array.isArray(d.attempts) || d.attempts.some(a => typeof a.id !== 'string')) return { ok: false, reason: 'attempt entries malformed' };
  return { ok: true };
}

/** Merge without duplicates: ledger/attempts/observations by id; books by (id, revision) keep the latest last_seen_at. */
export function mergeStores(a, b) {
  const out = structuredCloneSafe(a);
  out.settings = { ...DEFAULT_SETTINGS, ...a.settings, ...b.settings, parent_pin_hash: a.settings?.parent_pin_hash || b.settings?.parent_pin_hash || null,
    hidden_books: [...new Set([...(a.settings?.hidden_books || []), ...(b.settings?.hidden_books || [])])] };
  out.baseline = out.baseline || b.baseline;
  const byKey = (arr, k) => new Set(arr.map(x => x[k]));
  const dedupPush = (target, src, k) => { const seen = byKey(target, k); for (const x of src) if (!seen.has(x[k])) { target.push(x); seen.add(x[k]); } };
  dedupPush(out.ledger, b.ledger || [], 'key');
  dedupPush(out.attempts, b.attempts || [], 'id');
  dedupPush(out.observations, b.observations || [], 'id');
  dedupPush(out.unseen_checks, b.unseen_checks || [], 'id');
  dedupPush(out.level_suggestions, b.level_suggestions || [], 'id');
  dedupPush(out.sessions, b.sessions || [], 'id');
  for (const [bid, bk] of Object.entries(b.books || {})) {
    out.books[bid] = out.books[bid] || { revisions: {} };
    for (const [rev, rp] of Object.entries(bk.revisions || {})) {
      const cur = out.books[bid].revisions[rev];
      if (!cur || (rp.last_seen_at || '') > (cur.last_seen_at || '')) out.books[bid].revisions[rev] = rp;
    }
  }
  return out;
}

function summarize(before, after) {
  return {
    ledger_added: after.ledger.length - before.ledger.length,
    attempts_added: after.attempts.length - before.attempts.length,
    observations_added: after.observations.length - before.observations.length,
  };
}

/** Migration chain: add new versions here; never destructive. */
export function migrate(data) {
  let d = data;
  if (!d.store_version) d = { ...emptyStore(), ...d, store_version: 1 };
  // future: if (d.store_version === 1) { ...; d.store_version = 2; }
  // Backfill any missing sections from the empty template.
  const tpl = emptyStore(d.profile?.id);
  for (const k of Object.keys(tpl)) if (!(k in d)) d[k] = tpl[k];
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  return d;
}

export function checksum(str) { // FNV-1a 32-bit, hex; integrity only (not security)
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

/** In-memory storage shim for tests / private mode. */
export class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

// ---------- evidence summaries used by the dashboard (Section 9, L03)
export function evidenceSummary(data) {
  const practice = data.attempts.filter(a => !a.unseen);
  const unseen = data.attempts.filter(a => a.unseen);
  const bySkill = {};
  for (const a of practice) {
    const s = bySkill[a.skill] || (bySkill[a.skill] = { first_attempt_correct: 0, first_attempts: 0, repeats: 0, with_support: 0 });
    if (a.first_attempt) { s.first_attempts++; if (a.correct) s.first_attempt_correct++; } else s.repeats++;
    if (a.support_used?.audio || a.support_used?.parent) s.with_support++;
  }
  const unseenBySkill = {};
  for (const a of unseen) {
    const s = unseenBySkill[a.skill] || (unseenBySkill[a.skill] = { correct: 0, total: 0, with_support: 0 });
    s.total++; if (a.correct) s.correct++; if (a.support_used?.audio || a.support_used?.parent) s.with_support++;
  }
  const rubric = { not_yet: 0, with_support: 0, independent: 0 };
  for (const o of data.observations) if (o.rubric && rubric[o.rubric] != null) rubric[o.rubric]++;
  const booksRead = Object.values(data.books).reduce((n, b) => n + Object.values(b.revisions).filter(r => r.completed_reads > 0).length, 0);
  return { practice_by_skill: bySkill, unseen_by_skill: unseenBySkill, rubric, books_read: booksRead, stars: data.ledger.reduce((s, t) => s + t.stars, 0), practice_attempts: practice.length, unseen_attempts: unseen.length };
}

/**
 * Conservative level-change suggestion (Section 3.3): requires first-attempt evidence across
 * >= 3 distinct books on >= 3 distinct days in the same track. Returns null or a suggestion object.
 */
export function suggestLevelChange(data, publishedBooks, track = 'independent') {
  const modes = track === 'read_aloud' ? ['read_aloud', 'shared_reading'] : ['independent_reading', 'decodable'];
  const bookMap = Object.fromEntries(publishedBooks.map(b => [b.book_id, b]));
  const rel = data.attempts.filter(a => a.first_attempt && !a.unseen && bookMap[a.book_id] && modes.includes(bookMap[a.book_id].reading_mode));
  const books = new Set(rel.map(a => a.book_id)); const days = new Set(rel.map(a => a.at.slice(0, 10)));
  if (books.size < 3 || days.size < 3 || rel.length < 9) return null;
  const acc = rel.filter(a => a.correct).length / rel.length;
  const supported = rel.filter(a => a.support_used?.audio || a.support_used?.parent).length / rel.length;
  const current = track === 'read_aloud' ? data.settings.read_aloud_track_band : data.settings.independent_track_band;
  const order = ['A-C', 'D-J', 'K-P', 'Q-Z']; const i = order.indexOf(current);
  if (i < 0) return null;
  const evidence = { books: [...books], days: [...days], attempts: rel.length, first_attempt_accuracy: +acc.toFixed(2), support_rate: +supported.toFixed(2) };
  if (acc >= 0.85 && supported <= 0.3 && i < order.length - 1) return { track, from: current, to: order[i + 1], direction: 'up', evidence, note: 'Strong first-attempt accuracy across several texts and days with little support. Parent decides.' };
  if (acc <= 0.5 && i > 0) return { track, from: current, to: order[i - 1], direction: 'vary_support', evidence, note: 'Low accuracy. Consider more support or different texts before changing level.' };
  return null;
}
