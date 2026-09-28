// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
//
// Parent area: PIN gate (local only), baseline (L01), settings, evidence (L03), review of open answers,
// content studio (pipeline + approvals, C02), suggestions (L02/L04), data export/import/delete (D03-D05).

import { ProgressStore, evidenceSummary, suggestLevelChange, DEFAULT_SETTINGS } from './progress-store.mjs';
import { validateBook, nextStatus, isPublishable, STATUSES, SKILL_TO_STRAND, STRANDS } from './schema.mjs';
import { h, btn, applySettings, toast, fmtDate, loadJSON, isFileProtocol, narrator } from './ui.mjs';
import { syncState, onSyncChange, attachSync, signIn, signUp, signOut, push, pull, cachedSessionUser } from './sync.mjs';

const store = new ProgressStore(window.localStorage);
const S = store.load();
applySettings(S.settings);
store.onChange(applySettings);
const app = document.getElementById('app');
const STUDIO_KEY = 'read_oasis.studio.v1';   // parent-only drafts live apart from progress
let studio = loadStudio();
let unlocked = sessionStorage.getItem('ro.parent.unlocked') === '1';
let published = [];
let tab = 'evidence';

document.getElementById('btnLock').onclick = () => { sessionStorage.removeItem('ro.parent.unlocked'); unlocked = false; render(); };

async function hashPin(pin) {
  const buf = new TextEncoder().encode('read-oasis|' + pin);
  if (crypto?.subtle) { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  return 'plain:' + pin; // insecure contexts only (file://); documented limitation
}

(async function boot() {
  try { published = (await loadJSON('index.json')).books || []; } catch { published = []; }
  render();
  onSyncChange(() => { if (unlocked && tab === 'cloud') render(); });
  if (S.settings.cloud_sync_enabled && !isFileProtocol) attachSync(store).then(ok => { if (ok) render(); }).catch(() => {});
})();

function render() {
  if (!unlocked) return renderGate();
  app.replaceChildren(h('div', { class: 'parent-shell' },
    h('nav', { class: 'tabs', role: 'tablist' }, [
      ['evidence', 'Evidence'], ['library', 'Library'], ['answers', 'Answers to review'], ['baseline', 'Baseline'], ['settings', 'Display & sound'],
      ['studio', 'Content studio'], ['cloud', 'Cloud sync'], ['data', 'Data'],
    ].map(([id, label]) => btn(label, () => { tab = id; render(); }, { quiet: tab !== id, attrs: { role: 'tab', 'aria-selected': String(tab === id) } }))),
    h('div', {}, ({ evidence: renderEvidence, library: renderLibraryTab, answers: renderAnswers, baseline: renderBaseline, settings: renderSettings, studio: renderStudio, cloud: renderCloud, data: renderData })[tab]())));
}

// ---------- library veto: every published book, show/hide per child, with review provenance
const bookDetail = new Map();
function renderLibraryTab() {
  const hidden = new Set(S.settings.hidden_books || []);
  const rows = published.map(b => {
    const isHidden = hidden.has(b.book_id);
    const t = h('input', { type: 'checkbox', checked: !isHidden, 'aria-label': `Show ${b.title} to the child` });
    t.onchange = () => { store.setBookHidden(b.book_id, !t.checked); toast(t.checked ? 'Shown in the child library.' : 'Hidden from the child library.'); render(); };
    const prov = h('span', { class: 'muted', text: '…' });
    const d = bookDetail.get(b.book_id);
    const fill = (bk) => {
      const rv = bk.review || {}; const fc = bk.factual_claims || [];
      const pending = fc.filter(c => /pending/i.test(c.reviewed_by || '') || !c.reviewed).length;
      prov.replaceChildren(h('span', { text: `by ${rv.reviewer || 'unknown'} on ${rv.review_date || (rv.published_at || '').slice(0, 10)}` }),
        bk.genre === 'nonfiction' ? h('span', { class: pending ? 'badge-warn' : 'badge-ok', text: pending ? `  · ${pending} fact(s) await your check` : '  · facts checked' }) : null);
      if (!bk.pages.some(p => p.image_asset)) prov.append(h('span', { class: 'muted', text: '  · no pictures yet' }));
      if (!bk.pages.some(p => p.audio_asset)) prov.append(h('span', { class: 'muted', text: '  · device voice (no built audio)' }));
    };
    if (d) fill(d); else loadJSON(b.file).then(bk => { bookDetail.set(b.book_id, bk); fill(bk); }).catch(() => { prov.textContent = 'could not load'; });
    const p = store.bookProgress(b.book_id, b.revision, false);
    return h('tr', { style: isHidden ? 'opacity:.55' : '' },
      h('td', {}, h('label', { class: 'check' }, t, h('span', { text: isHidden ? 'Hidden' : 'Shown' }))),
      h('td', {}, h('b', { text: b.title }), h('br'), h('span', { class: 'chip', text: b.level }), h('span', { class: 'chip', text: b.reading_mode.replace('_', ' ') }), h('span', { class: 'chip', text: b.genre })),
      h('td', {}, prov),
      h('td', { class: 'muted', text: p?.completed_reads ? `read ${p.completed_reads}x` : p?.page_index ? `page ${p.page_index + 1}` : 'not opened' }),
      h('td', {}, btn('Mark facts checked', () => markFactsChecked(b), { quiet: true, attrs: { disabled: b.genre !== 'nonfiction' } })));
  });
  return h('section', { class: 'fade' },
    h('div', { class: 'card' }, h('h3', { text: `Child library (${published.length - hidden.size} of ${published.length} shown)` }),
      h('p', { class: 'muted', text: 'Books are authored and verified automatically, then published. You keep the veto: untick a book to hide it from the child on this profile immediately (no rebuild). Hidden books keep their progress and can be shown again. Your choices sync with the cloud store if enabled.' }),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Visible' }), h('th', { text: 'Book' }), h('th', { text: 'Reviewed' }), h('th', { text: 'Child progress' }), h('th', {}))), h('tbody', {}, rows))),
    h('div', { class: 'card' }, h('h3', { text: 'Permanent removal' }), h('p', { class: 'muted', text: 'To remove a book for every device, run: python tools/approve.py --reject <book_id> -m "reason", then update_content.cmd. It returns to DRAFT and leaves the library index.' })));
}
function markFactsChecked(b) {
  // Records the parent's fact-check in the local store (content files are read-only in the browser).
  store.addObservation({ text: `Parent checked the factual claims of ${b.book_id} (${b.title})`, kind: 'fact_check', bookId: b.book_id });
  toast('Recorded. To stamp the book file itself: python tools/approve.py --facts ' + b.book_id + ' --reviewer parent');
}

// ---------- cloud sync (opt-in; same Supabase project/accounts as the other family apps)
function renderCloud() {
  const st = syncState; const user = st.user || cachedSessionUser();
  const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'parent@example.com' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password' });
  const msg = h('p', { 'aria-live': 'polite', class: 'muted' });
  const busy = async (fn) => { try { await fn(); render(); } catch (e) { msg.textContent = e.message || String(e); } };
  const enabled = !!S.settings.cloud_sync_enabled;
  const toggle = h('input', { type: 'checkbox', checked: enabled, disabled: !user });
  toggle.onchange = () => busy(async () => { store.setSettings({ cloud_sync_enabled: toggle.checked }); if (toggle.checked) { const ok = await attachSync(store); if (!ok) throw new Error(st.error || 'could not start sync'); toast('Cloud sync on.'); } else toast('Cloud sync off. Data stays on this device.'); });
  return h('section', { class: 'fade' },
    h('div', { class: 'card' }, h('h3', { text: 'Cloud sync (optional)' }),
      h('p', { class: 'muted', text: 'Off by default. When on, the progress store (settings, reading progress, answers, stars, your observations) is saved to your family Supabase account so another device can continue. No child name, birth date or voice is ever included.' }),
      isFileProtocol ? h('p', { class: 'explain', text: 'Cloud sync needs the app to be opened from a web address (https), not from a file on disk.' }) : null,
      user
        ? h('div', {}, h('p', {}, 'Signed in as ', h('b', { text: user.email })),
            h('label', { class: 'check' }, toggle, h('span', { text: 'Cloud sync enabled' })),
            h('p', { class: 'muted' }, `Status: ${st.status}` + (st.lastPush ? ` · last push ${fmtDate(st.lastPush)}` : '') + (st.lastPull ? ` · last pull ${fmtDate(st.lastPull)}` : '') + (st.error ? ` · ${st.error}` : '')),
            h('div', { class: 'row' },
              btn('Push now', () => busy(async () => { if (!(await push(store))) throw new Error(st.error || 'push failed'); toast('Pushed.'); }), { primary: true, attrs: { disabled: !enabled } }),
              btn('Pull and merge', () => busy(async () => { await pull(store); toast('Merged.'); }), { attrs: { disabled: !enabled } }),
              btn('Sign out', () => busy(async () => { await signOut(); store.setSettings({ cloud_sync_enabled: false }); }), { quiet: true })))
        : h('div', {}, lab('Email', email), lab('Password', pass),
            h('div', { class: 'row' },
              btn('Sign in', () => busy(async () => { await signIn(email.value.trim(), pass.value); toast('Signed in.'); }), { primary: true }),
              btn('Create account', () => busy(async () => { await signUp(email.value.trim(), pass.value); msg.textContent = 'Account created. If email confirmation is on in Supabase, confirm it, then sign in.'; }), { quiet: true }))),
      msg),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Setup (once per Supabase project)' }),
      h('p', { class: 'muted', text: 'Run supabase_read_oasis.sql in the Supabase SQL editor. It creates table ro_progress with row-level security so each account can only read and write its own row.' })));
}

// ---------- gate
function renderGate() {
  const has = !!S.settings.parent_pin_hash;
  const input = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': has ? 'Parent PIN' : 'Choose a 4 to 8 digit PIN', maxlength: 8 });
  const msg = h('p', { class: 'muted', 'aria-live': 'polite' });
  const submit = async () => {
    const pin = input.value.trim(); if (!/^\d{4,8}$/.test(pin)) { msg.textContent = 'Use 4 to 8 digits.'; return; }
    const hsh = await hashPin(pin);
    if (!has) { store.setSettings({ parent_pin_hash: hsh }); toast('PIN set.'); }
    else if (hsh !== S.settings.parent_pin_hash) { msg.textContent = 'That PIN does not match.'; input.value = ''; return; }
    sessionStorage.setItem('ro.parent.unlocked', '1'); unlocked = true; render();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  app.replaceChildren(h('section', { class: 'card gate' },
    h('h2', { text: has ? 'Enter parent PIN' : 'Set a parent PIN' }),
    h('p', { class: 'muted', text: 'This PIN keeps the child out of settings on this device. It is not a security boundary for a shared or online service.' }),
    input, msg, h('div', { class: 'row', style: 'margin-top:.8rem' }, btn(has ? 'Unlock' : 'Save PIN', submit, { primary: true }))));
  setTimeout(() => input.focus(), 50);
}

// ---------- evidence (L03: practice vs learning evidence, unseen separate)
function renderEvidence() {
  const ev = evidenceSummary(S);
  const strandRows = STRANDS.map(strand => {
    const skills = Object.entries(ev.practice_by_skill).filter(([sk]) => SKILL_TO_STRAND[sk] === strand);
    const fa = skills.reduce((n, [, v]) => n + v.first_attempts, 0), fc = skills.reduce((n, [, v]) => n + v.first_attempt_correct, 0);
    const un = Object.entries(ev.unseen_by_skill).filter(([sk]) => SKILL_TO_STRAND[sk] === strand);
    const ut = un.reduce((n, [, v]) => n + v.total, 0), uc = un.reduce((n, [, v]) => n + v.correct, 0);
    return h('tr', {}, h('td', { text: strand.replace('_', ' ') }),
      h('td', {}, fa ? `${fc}/${fa} first tries` : h('span', { class: 'muted', text: 'no data' })),
      h('td', {}, ut ? `${uc}/${ut} on unseen text` : h('span', { class: 'muted', text: 'not checked yet' })));
  });
  const sugg = ['independent', 'read_aloud'].map(t => suggestLevelChange(S, published, t)).filter(Boolean);
  const pending = S.level_suggestions.filter(s => s.decision === 'pending');
  return h('section', { class: 'fade' },
    h('div', { class: 'grid stagger' },
      h('div', { class: 'card stat' }, h('b', { text: String(ev.books_read) }), h('span', { text: 'book readings' }), h('span', { class: 'muted', text: 'practice volume' })),
      h('div', { class: 'card stat' }, h('b', { text: String(ev.practice_attempts) }), h('span', { text: 'practice answers' }), h('span', { class: 'muted', text: `${ev.stars} stars · volume is not evidence` })),
      h('div', { class: 'card stat' }, h('b', { text: String(ev.unseen_attempts) }), h('span', { text: 'unseen-text answers' }), h('span', { class: 'muted', text: 'learning evidence' })),
      h('div', { class: 'card stat' }, h('b', { text: String(ev.rubric.independent) }), h('span', { text: 'independent (rubric)' }), h('span', { class: 'muted', text: `${ev.rubric.with_support} with support · ${ev.rubric.not_yet} not yet` }))),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'By strand' }), h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Strand' }), h('th', { text: 'Practice (first attempt)' }), h('th', { text: 'Unseen text' }))), h('tbody', {}, strandRows))),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Level suggestions (you decide)' }),
      !sugg.length && !pending.length ? h('p', { class: 'muted', text: 'No suggestion yet. Needs first-attempt evidence across at least 3 books on 3 different days per track.' }) : null,
      sugg.filter(s => !pending.some(p => p.track === s.track && p.to === s.to)).map(s => h('div', { class: 'explain' }, h('p', {}, h('b', { text: `${s.track}: ${s.from} -> ${s.to}` }), ' ', s.note), h('pre', { class: 'small', text: JSON.stringify(s.evidence, null, 1) }), btn('Record this suggestion', () => { store.suggestLevel(s); render(); }))),
      pending.map(p => h('div', { class: 'explain' }, h('p', {}, h('b', { text: `${p.track}: ${p.from} -> ${p.to}` }), ' ', p.note), h('div', { class: 'row' }, btn('Accept', () => { store.decideSuggestion(p.id, 'accepted'); render(); }, { primary: true }), btn('Reject', () => { store.decideSuggestion(p.id, 'rejected'); render(); }, { quiet: true })))),
      S.level_suggestions.filter(s => s.decision !== 'pending').length ? h('details', {}, h('summary', { text: 'Past decisions' }), h('ul', {}, S.level_suggestions.filter(s => s.decision !== 'pending').map(s => h('li', { text: `${fmtDate(s.at)}: ${s.track} ${s.from} -> ${s.to}: ${s.decision}` })))) : null),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Unseen-text check (C06)' }), h('p', { class: 'muted', text: 'Give the child a fresh text (printed or read aloud) with non-repeated questions. Record the result here; it stays separate from practiced quizzes.' }), unseenForm()),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Observations' }), obsForm(), h('ul', {}, S.observations.slice(-10).reverse().map(o => h('li', {}, h('span', { class: 'muted', text: fmtDate(o.at) + ' ' }), o.rubric ? h('span', { class: 'chip', text: o.rubric.replace('_', ' ') }) : null, o.text, ' ', btn('Edit', () => { const t = prompt('Edit observation', o.text); if (t != null) { store.editObservation(o.id, { text: t }); render(); } }, { quiet: true }))))));
}
function unseenForm() {
  const skill = sel(Object.keys(SKILL_TO_STRAND)); const rubric = sel(['not_yet', 'with_support', 'independent']); const support = sel(['none', 'audio', 'parent', 'both']);
  const note = h('input', { type: 'text', placeholder: 'What text, what question, example answer, uncertainty', 'aria-label': 'Notes' });
  return h('div', {}, h('div', { class: 'row' }, lab('Skill', skill), lab('Result', rubric), lab('Help used', support)), lab('Notes', note),
    btn('Save unseen check', () => {
      store.addUnseenCheck({ skill: skill.value, rubric: rubric.value, support: support.value, note: note.value });
      store.recordAttempt({ bookId: 'unseen', revision: 0, questionId: 'unseen-' + Date.now(), skill: skill.value, optionId: null, correct: rubric.value === 'independent', cycle: 0, kind: 'unseen', unseen: true, supportUsed: { audio: /audio|both/.test(support.value), parent: /parent|both/.test(support.value) }, responseText: note.value });
      toast('Saved.'); render();
    }, { primary: true }));
}
function obsForm() {
  const text = h('input', { type: 'text', placeholder: 'One small observation', 'aria-label': 'Observation' }); const rubric = sel(['', 'not_yet', 'with_support', 'independent']);
  return h('div', { class: 'row' }, lab('Note', text), lab('Rubric (optional)', rubric), btn('Add', () => { if (text.value.trim()) { store.addObservation({ text: text.value.trim(), rubric: rubric.value || null }); render(); } }));
}
const sel = (opts, val) => h('select', {}, opts.map(o => h('option', { value: o, text: o.replace('_', ' ') || '-', selected: o === val })));
const lab = (t, el) => h('label', { class: 'field' }, h('span', { text: t }), el);

// ---------- open answers review
function renderAnswers() {
  const open = S.attempts.filter(a => a.kind === 'open');
  return h('section', { class: 'card fade' }, h('h3', { text: 'Open-ended answers' }), h('p', { class: 'muted', text: 'These are never auto-graded. Rate with the rubric and add an example or uncertainty note.' }),
    !open.length ? h('p', { text: 'Nothing to review yet.' }) : h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'When' }), h('th', { text: 'Book / question' }), h('th', { text: 'Answer' }), h('th', { text: 'Rubric' }))),
      h('tbody', {}, open.slice().reverse().map(a => { const r = sel(['', 'not_yet', 'with_support', 'independent'], a.rubric || ''); r.onchange = () => { a.rubric = r.value || null; a.reviewed_at = new Date().toISOString(); store.save(); toast('Saved.'); };
        return h('tr', {}, h('td', { text: fmtDate(a.at) }), h('td', { text: `${a.book_id} ${a.question_id} (${a.skill})` }), h('td', { text: a.response_text || '' }), h('td', {}, r)); }))));
}

// ---------- baseline (L01: no age/diagnosis required)
function renderBaseline() {
  const b = S.baseline || {};
  const f = {
    topics: h('input', { type: 'text', value: b.topics || '', placeholder: 'e.g. animals, space, cooking' }),
    languages: h('input', { type: 'text', value: b.languages || '', placeholder: 'e.g. Vietnamese at home, English at school' }),
    comfortable_text: h('input', { type: 'text', value: b.comfortable_text || '', placeholder: 'What was read comfortably? Help used?' }),
    challenge_text: h('input', { type: 'text', value: b.challenge_text || '', placeholder: 'Slightly harder text: what happened?' }),
    retell: sel(['not_yet', 'with_support', 'independent'], b.retell), direct_q: sel(['not_yet', 'with_support', 'independent'], b.direct_q), inferential_q: sel(['not_yet', 'with_support', 'independent'], b.inferential_q),
    listening: sel(['not_yet', 'with_support', 'independent'], b.listening), decoding: sel(['not_yet', 'with_support', 'independent'], b.decoding),
    visual: h('input', { type: 'text', value: b.visual || '', placeholder: 'Font size/theme confirmed comfortable with prescribed glasses? Device?' }),
    device: h('input', { type: 'text', value: b.device || '', placeholder: 'e.g. 10-inch tablet, landscape' }),
    independent_band: sel(['', 'A-C', 'D-J', 'K-P', 'Q-Z'], S.settings.independent_track_band || ''), read_aloud_band: sel(['', 'A-C', 'D-J', 'K-P', 'Q-Z'], S.settings.read_aloud_track_band || ''),
  };
  const mixed = () => f.listening.value === 'independent' && f.decoding.value !== 'independent';
  const hint = h('p', { class: 'explain', 'aria-live': 'polite' });
  const upd = () => { hint.textContent = mixed() ? 'Listening is stronger than decoding: consider a lower independent band with a richer read-aloud band (two tracks).' : 'Choose bands after the baseline; you can change them any time.'; };
  f.listening.onchange = f.decoding.onchange = upd; upd();
  return h('section', { class: 'card fade' }, h('h3', { text: 'Baseline (observations, not a diagnosis)' }), h('p', { class: 'muted', text: 'No exact age, real name, or medical detail is needed.' }),
    lab('Preferred topics', f.topics), lab('Languages at home', f.languages), lab('Comfortable text', f.comfortable_text), lab('Slightly challenging text', f.challenge_text),
    h('div', { class: 'row' }, lab('Retell', f.retell), lab('Direct questions', f.direct_q), lab('Inferential questions', f.inferential_q), lab('Listening comprehension', f.listening), lab('Decoding', f.decoding)),
    lab('Visual comfort check', f.visual), lab('Target device', f.device), hint,
    h('div', { class: 'row' }, lab('Independent reading band', f.independent_band), lab('Read-aloud / shared band', f.read_aloud_band)),
    btn('Save baseline', () => {
      const out = {}; for (const [k, el] of Object.entries(f)) if (!k.endsWith('_band')) out[k] = el.value;
      store.setBaseline(out); store.setSettings({ independent_track_band: f.independent_band.value || null, read_aloud_track_band: f.read_aloud_band.value || null, band: f.independent_band.value || null });
      toast('Baseline saved.');
    }, { primary: true }),
    S.baseline ? h('p', { class: 'muted', text: 'Last recorded ' + fmtDate(S.baseline.recorded_at) }) : null);
}

// ---------- settings
function renderSettings() {
  const s = S.settings;
  const num = (k, min, max, step = 1) => { const i = h('input', { type: 'range', min, max, step, value: s[k], 'aria-valuetext': String(s[k]) }); const out = h('output', { text: String(s[k]) }); i.oninput = () => { out.textContent = i.value; store.setSettings({ [k]: Number(i.value) }); }; return h('label', { class: 'field' }, h('span', { text: labelOf(k) + ' ' }), h('span', { class: 'row' }, i, out)); };
  const choice = (k, opts) => { const e = sel(opts, s[k]); e.onchange = () => store.setSettings({ [k]: e.value }); return lab(labelOf(k), e); };
  const check = (k) => { const c = h('input', { type: 'checkbox', checked: !!s[k] }); c.onchange = () => store.setSettings({ [k]: c.checked }); return h('label', { class: 'check' }, c, h('span', { text: labelOf(k) })); };
  return h('section', { class: 'fade' },
    h('div', { class: 'card' }, h('h3', { text: 'Display (testing defaults, tune with the child on the real device)' }),
      num('story_font_px', 18, 44), num('control_font_px', 16, 28), num('line_height', 1.2, 2.0, 0.1), num('column_ch', 24, 70),
      choice('font_family', ['rounded', 'system', 'serif']), choice('theme', ['light', 'cream', 'dark']), choice('illustration_size', ['small', 'medium', 'large', 'hidden']), choice('reduced_motion', ['auto', 'on']),
      h('p', { class: 'story', style: 'border:2px dashed var(--line);padding:.5rem;border-radius:10px', text: 'Preview: The wind blows. Up goes the kite!' }),
      h('p', { class: 'muted', text: 'No theme is medically superior; pick what the child finds comfortable. Follow your eye-care professional for vision advice.' })),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Session' }), num('break_minutes', 0, 60, 5), num('session_minutes', 5, 60, 5), h('p', { class: 'muted', text: 'Break cue is a dismissible reminder, never a lock. 0 disables it.' })),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Sound and pronunciation' }),
      check('narration'), check('sound_effects'),
      choice('accent', ['en-GB', 'en-US']), choice('default_speed', ['normal', 'slow']), check('allow_device_tts'),
      h('p', { class: 'explain' }, h('b', { text: 'How narration works. ' }), 'Books with built audio play studio-rendered British English clips (made from the pronunciation lexicon with the configured TTS provider, see README §TTS). Pages without built audio fall back to this device\'s voice: ',
        h('b', { text: narratorDescribe(s.accent || 'en-GB') }), '. Turn the fallback off if that voice is poor; the child can still read.'),
      h('div', { class: 'row' }, btn('Test device voice', () => { narrator.accent = s.accent || 'en-GB'; narrator.deviceAllowed = true; narrator.speak('My name is Yuki. I go to school every day.', { speed: s.default_speed || 'normal', accent: s.accent || 'en-GB' }); }, { ic: 'ear' }))),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Rewards and mascot' }), check('rewards_enabled'), check('mascot_enabled')),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Recording (not yet enabled in this build)' }), h('p', { class: 'muted', text: 'Microphone recording is absent in this release until gates R06, D03 and D07 pass. Nothing is simulated.' })),
    h('div', { class: 'card', style: 'margin-top:1rem' }, btn('Reset display defaults', () => { const d = {}; for (const k of ['font_family', 'story_font_px', 'control_font_px', 'line_height', 'column_ch', 'illustration_size', 'theme', 'reduced_motion']) d[k] = DEFAULT_SETTINGS[k]; store.setSettings(d); render(); }, { quiet: true })));
}
function narratorDescribe(accent) { try { return narrator.describe(accent); } catch { return 'unknown'; } }
const labelOf = k => ({ accent: 'Preferred accent for words', default_speed: 'Starting narration speed', allow_device_tts: 'Allow device voice when a page has no built audio', story_font_px: 'Story text size (px)', control_font_px: 'Button text size (px)', line_height: 'Line spacing', column_ch: 'Line width (characters)', font_family: 'Font', theme: 'Theme', illustration_size: 'Illustration size', reduced_motion: 'Reduce motion', break_minutes: 'Break cue every (minutes)', session_minutes: 'Suggested session length (minutes)', sound_effects: 'Sound effects', narration: 'Narration / read-aloud button', rewards_enabled: 'Stars enabled', mascot_enabled: 'Mascot shown' }[k] || k);

// ---------- content studio (pipeline; only PUBLISHED reaches content/index.json via tools/validate_content.py)
function loadStudio() { try { return JSON.parse(localStorage.getItem(STUDIO_KEY)) || { drafts: [] }; } catch { return { drafts: [] }; } }
function saveStudio() { localStorage.setItem(STUDIO_KEY, JSON.stringify(studio)); }
function renderStudio() {
  const ta = h('textarea', { placeholder: 'Paste a book JSON draft here (AI or hand-written). It becomes DRAFT; nothing is published without your approvals.', style: 'min-height:10em' });
  const importBtn = btn('Add as DRAFT', () => { try { const b = JSON.parse(ta.value); b.status = 'DRAFT'; b.review = { content_approved: false, media_approved: false, parent_approved: false }; studio.drafts.push(b); saveStudio(); ta.value = ''; render(); } catch (e) { toast('Not valid JSON: ' + e.message); } }, { primary: true });
  const rows = studio.drafts.map((b, i) => {
    const v = validateBook(b);
    const act = (name, label, primary = false) => btn(label, () => { const r = nextStatus(b, name); if (!r.ok) { toast(r.reason); return; } studio.drafts[i] = r.book; saveStudio(); render(); }, { primary, quiet: !primary });
    return h('div', { class: 'card', style: 'margin-top:.6rem' },
      h('div', { class: 'row between' }, h('b', { text: `${b.title || '(untitled)'} - ${b.book_id || '?'} rev ${b.revision ?? '?'}` }), h('span', { class: 'chip', text: b.status })),
      h('p', { class: 'muted', text: `Pipeline: ${STATUSES.join(' -> ')}` }),
      v.ok ? h('p', { class: 'explain', text: 'Schema OK (C01/C04/C05). Media paths are checked by tools/validate_content.py.' }) : h('details', {}, h('summary', { text: `${v.errors.length} schema error(s)` }), h('ul', {}, v.errors.map(e => h('li', { text: `[${e.code}] ${e.path}: ${e.msg}` })))),
      v.warnings.length ? h('ul', {}, v.warnings.map(w => h('li', { class: 'muted', text: `[${w.code}] ${w.path}: ${w.msg}` }))) : null,
      h('div', { class: 'row' },
        b.status === 'DRAFT' ? act('validate', 'Validate schema', true) : null,
        b.status === 'SCHEMA_VALIDATED' ? act('submit_content', 'Send to content review', true) : null,
        b.status === 'CONTENT_REVIEW' ? act('approve_content', 'Approve content (facts, distractors, wording)', true) : null,
        b.status === 'MEDIA_REVIEW' ? act('approve_media', 'Approve media (alt text, provenance)', true) : null,
        b.status === 'PARENT_APPROVED' ? act('approve_parent', 'Parent approve -> PUBLISHED', true) : null,
        b.status !== 'DRAFT' ? act('reject', 'Reject (back to DRAFT)') : null,
        btn('Export JSON', () => download(`${b.book_id || 'book'}.json`, JSON.stringify(b, null, 2)), { quiet: true }),
        btn('Delete draft', () => { if (confirm('Delete this draft?')) { studio.drafts.splice(i, 1); saveStudio(); render(); } }, { quiet: true })),
      isPublishable(b) ? h('p', { class: 'explain', text: 'Approved. To make it appear in the child library: save the exported JSON into content/books/ and run tools/validate_content.py --index (media checks + index).' }) : null);
  });
  return h('section', { class: 'fade' },
    h('div', { class: 'card' }, h('h3', { text: 'Published in child library' }), h('ul', {}, published.map(b => h('li', { text: `${b.title} (${b.book_id} rev ${b.revision}, level ${b.level}, ${b.reading_mode})` }))), !published.length ? h('p', { class: 'muted', text: 'None.' }) : null),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Drafts and review' }), ta, importBtn, rows));
}

// ---------- data (D03-D05)
function renderData() {
  const file = h('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Backup file' });
  const policy = sel(['merge', 'replace']);
  const out = h('p', { 'aria-live': 'polite' });
  return h('section', { class: 'fade' },
    h('div', { class: 'card' }, h('h3', { text: 'Backup' }), h('p', { class: 'muted', text: 'Browser storage is not a permanent backup. Export regularly.' }),
      btn('Export backup (JSON)', () => download(`read-oasis-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportBackup()), { primary: true })),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Restore / import' }), lab('File', file), lab('Merge policy', policy),
      btn('Import', async () => { const f = file.files?.[0]; if (!f) { out.textContent = 'Choose a file first.'; return; } const r = store.importBackup(await f.text(), { policy: policy.value }); out.textContent = r.ok ? `Imported. Added: ${JSON.stringify(r.merged)}` : `Import refused: ${r.reason}. Existing data unchanged.`; if (r.ok) setTimeout(() => location.reload(), 800); })), out,
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('h3', { text: 'Privacy' }), h('p', { text: 'No analytics, no third-party calls, no uploads. Recording is not enabled in this build.' }),
      h('div', { class: 'row' }, btn('Delete recording metadata', () => { store.deleteRecordingsMeta(); toast('Done.'); }, { quiet: true }),
        btn('Delete whole child profile', () => { if (confirm('Delete all progress, settings, observations and stars on this device? Export first if you want a copy.')) { store.deleteProfile(); localStorage.removeItem(STUDIO_KEY); location.reload(); } }, { attrs: { style: 'border-color:var(--warn);color:var(--warn)' } }))),
    h('div', { class: 'card', style: 'margin-top:1rem' }, h('details', {}, h('summary', { text: 'Raw store (read-only view)' }), h('pre', { class: 'small', text: JSON.stringify(S, null, 1).slice(0, 20000) }))));
}
function download(name, text) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name }); document.body.append(a); a.click(); a.remove(); }
