// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
//
// Read Oasis child app. Flow: Choose -> Preview -> Listen/Read -> Pause & Think ->
// Discuss -> Quiz -> Celebrate -> Stop or Continue. Only PUBLISHED books from content/index.json.

import { ProgressStore } from './progress-store.mjs';
import { isPublishable } from './schema.mjs';
import { h, btn, icon, applySettings, toast, narrator, BreakTimer, shuffle, loadJSON, assetUrl, isBundled, isFileProtocol } from './ui.mjs';
import { attachSync } from './sync.mjs';

// All module state is declared before any store listener can fire (save() notifies synchronously).
const store = new ProgressStore(window.localStorage);
const S = store.load();
applySettings(S.settings);

const app = document.getElementById('app');
const titleEl = document.getElementById('titleText') || document.getElementById('title');
let library = [];                      // published book summaries
const bookCache = new Map();           // book_id -> full book
let route = { view: 'library' };
const history = [];                    // in-app back stack
let audioUsedThisBook = false;
let lastStars = null;
let session = null;
let breakTimer = null;

store.onChange(d => { applySettings(d.settings); renderStars(); if (breakTimer && breakTimer.minutes !== d.settings.break_minutes) breakTimer.setMinutes(d.settings.break_minutes); });
session = store.startSession();
breakTimer = new BreakTimer({ minutes: S.settings.break_minutes, onCue: showBreak });

// ---------- boot
document.getElementById('btnHome').onclick = () => go({ view: 'library' });
document.getElementById('btnBack').onclick = back;
document.getElementById('btnExit').onclick = stopNow;
document.getElementById('breakOk').onclick = () => { hideBreak(true); };
window.addEventListener('pagehide', () => { store.endSession(session.id); store.save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { narrator.stop(); store.save(); } });
if ('serviceWorker' in navigator && !isBundled && !isFileProtocol) navigator.serviceWorker.register('sw.js').catch(() => { /* offline optional */ });

// Cloud sync only if a parent enabled it (src/sync.mjs); never blocks the child app.
if (S.settings.cloud_sync_enabled && !isFileProtocol) attachSync(store).then(ok => { if (ok && route.view === 'library') render(); }).catch(() => {});

loadLibrary().then(() => {
  const last = store.lastOpened();
  renderStars();
  if (last && library.some(b => b.book_id === last.book_id && b.revision === last.revision) && last.completed_reads === 0) {
    go({ view: 'preview', bookId: last.book_id, resume: true });
  } else go({ view: 'library' });
});

async function loadLibrary() {
  try {
    const idx = await loadJSON('index.json');
    library = idx.books || [];
  } catch {
    library = [];
    toast(isFileProtocol ? 'This copy needs the single-file build (dist/index.html) or a local web server. See README.' : 'Could not load the library. If you are offline, open the app once while online first.', 8000);
  }
}
async function loadBook(id) {
  if (bookCache.has(id)) return bookCache.get(id);
  const meta = library.find(b => b.book_id === id); if (!meta) return null;
  const book = await loadJSON(meta.file);
  if (!isPublishable(book)) return null;                 // C02 defense in depth
  bookCache.set(id, book); return book;
}

// ---------- routing
function go(r, push = true) { if (push && route) history.push(route); route = r; render(); }
function back() { narrator.stop(); const prev = history.pop(); if (prev) { route = prev; render(); } else go({ view: 'library' }, false); }
function stopNow() {
  narrator.stop(); store.endSession(session.id); store.save();
  app.replaceChildren(h('section', { class: 'card celebrate fade' },
    h('div', { class: 'big', text: 'Nice reading. See you next time.' }),
    h('p', { class: 'muted', text: 'Your place is saved. You can close this window now.' }),
    btn('Back to library', () => { session = store.startSession(); go({ view: 'library' }); }, { primary: true })));
  titleEl.textContent = 'Read Oasis';
}
function renderStars() {
  const el = document.getElementById('stars'); el.replaceChildren();
  if (!S.settings.rewards_enabled) return;
  const n = store.totalStars();
  el.append(icon('star'), h('span', { text: String(n) }), h('span', { class: 'sr-only', text: ' stars' }));
  if (lastStars != null && n > lastStars) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  lastStars = n;
}
function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}
function setTitle(t) { titleEl.textContent = t; document.title = t + ' - Read Oasis'; }

async function render() {
  narrator.stop();
  app.replaceChildren(h('p', { class: 'muted', text: 'Loading...' }));
  switch (route.view) {
    case 'library': return renderLibrary();
    case 'preview': return renderPreview(await loadBook(route.bookId));
    case 'read': return renderReader(await loadBook(route.bookId));
    case 'think': return renderThink(await loadBook(route.bookId));
    case 'activity': return renderActivity(await loadBook(route.bookId), route.index || 0);
    case 'quiz': return renderQuiz(await loadBook(route.bookId), route.index || 0);
    case 'celebrate': return renderCelebrate(await loadBook(route.bookId));
    default: return renderLibrary();
  }
}

// ---------- library (Choose)
function renderLibrary() {
  setTitle('Choose a book');
  const bandFilter = S.settings.independent_track_band;
  const last = store.lastOpened();
  const tiles = library.map(b => {
    const p = store.bookProgress(b.book_id, b.revision, false);
    const cover = h('div', { class: 'cover' });
    const img = b.assets?.find(a => a.startsWith('images/'));
    if (img && S.settings.illustration_size !== 'hidden') { const im = h('img', { src: assetUrl(img), alt: '' }); im.onerror = () => cover.replaceChildren(icon('book', '')); cover.append(im); }
    else cover.append(icon('book'));
    const inProgress = p && !p.completed_reads && p.page_index > 0;
    if (inProgress) cover.append(h('span', { class: 'ribbon', text: 'Continue' }));
    else if (p?.completed_reads) cover.append(h('span', { class: 'ribbon', text: 'Read ' + p.completed_reads + 'x' }));
    const pct = p ? Math.round(100 * (p.completed_reads ? 1 : p.page_index / Math.max(1, b.pages - 1))) : 0;
    return h('button', { class: 'book-tile', onclick: () => go({ view: 'preview', bookId: b.book_id }), 'aria-label': `${b.title}. ${modeLabel(b.reading_mode)}. ${inProgress ? 'In progress.' : p?.completed_reads ? 'Read before.' : 'New.'}` },
      cover,
      h('span', { class: 't', text: b.title }),
      h('span', {}, h('span', { class: 'chip primary', text: modeLabel(b.reading_mode) }), h('span', { class: 'chip', text: b.genre })),
      h('span', { class: 'progress', 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%` })));
  });
  const mascot = S.settings.mascot_enabled ? icon('mascot', 'mascot') : null;
  app.replaceChildren(
    h('section', { class: 'fade' },
      h('div', { class: 'hero' }, mascot,
        h('div', {}, h('h2', { text: `${greeting()}, ${S.profile.display_name || 'Reader'}!` }),
          h('p', { class: 'sub', text: last && !last.completed_reads && last.page_index > 0 ? 'Your book is waiting where you left it.' : 'Pick a book. Read, listen, and tell someone about it.' }))),
      h('div', { class: 'row between' }, h('h2', { style: 'margin:.2em 0', text: 'Books ready for you' }), bandFilter ? h('span', { class: 'chip accent', text: 'Band ' + bandFilter }) : null),
      library.length ? h('div', { class: 'grid stagger' }, tiles) : h('p', { class: 'card', text: 'No approved books yet. Ask a grown-up to approve a book in the parent area.' }),
      h('p', { class: 'muted', style: 'margin-top:1.5rem' }, 'Grown-ups: ', h('a', { href: 'parent.html', text: 'parent area' }))));
}
function modeLabel(m) { return { read_aloud: 'Listen', shared_reading: 'Read together', decodable: 'Sound it out', independent_reading: 'Read myself' }[m] || m; }

// ---------- preview
function renderPreview(book) {
  if (!book) return renderLibrary();
  setTitle(book.title);
  const p = store.bookProgress(book.book_id, book.revision);
  audioUsedThisBook = false;
  const resumeAt = p.page_index > 0 && p.page_index < book.pages.length ? p.page_index : 0;
  app.replaceChildren(h('section', { class: 'card fade' },
    h('h2', { text: book.title }),
    h('p', {}, h('span', { class: 'chip', text: modeLabel(book.reading_mode) }), h('span', { class: 'chip', text: book.topic }), h('span', { class: 'chip', text: book.pages.length + ' pages' })),
    p.migrated_from_revision ? h('p', { class: 'explain', text: `This book was updated since you last read it. Your earlier reading is kept; this is a fresh copy.` }) : null,
    book.reading_mode === 'read_aloud' || book.reading_mode === 'shared_reading' ? h('p', { class: 'parent-prompt', text: (book.parent_prompts?.[0]) || 'Grown-up: read together and talk about the story.' }) : null,
    h('p', { text: 'What will you do?' }),
    h('div', { class: 'row' },
      resumeAt ? btn(`Continue from page ${resumeAt + 1}`, () => go({ view: 'read', bookId: book.book_id, page: resumeAt }), { primary: true, ic: 'play' }) : null,
      btn(resumeAt ? 'Start again' : 'Read', () => go({ view: 'read', bookId: book.book_id, page: 0 }), { primary: !resumeAt, ic: 'next' }),
      narrator.supported || book.pages.some(pg => pg.audio_asset) ? btn('Listen', () => go({ view: 'read', bookId: book.book_id, page: resumeAt, listen: true }), { ic: 'ear' }) : null,
      p.completed_reads > 0 && book.quiz?.length ? btn('Questions', () => go({ view: 'quiz', bookId: book.book_id, index: 0 })) : null)));
}

// ---------- reader (Listen / Read)
function renderReader(book) {
  if (!book) return renderLibrary();
  let i = Math.min(Math.max(route.page || 0, 0), book.pages.length - 1);
  const listenMode = !!route.listen;
  setTitle(book.title);
  const wrap = h('section', { class: 'fade' });
  app.replaceChildren(wrap);
  const draw = () => {
    narrator.stop();
    const pg = book.pages[i];
    store.setPage(book.book_id, book.revision, i, { audio: listenMode && S.settings.narration });
    const illus = h('figure', { class: 'illus', style: 'margin:0' });
    if (pg.image_asset) {
      const img = h('img', { src: assetUrl(pg.image_asset), alt: pg.image_decorative ? '' : (pg.image_alt || '') });
      img.onerror = () => illus.replaceChildren(h('div', { class: 'illus-fallback', role: 'img', 'aria-label': 'Picture missing. ' + (pg.image_alt || '') }, icon('image-missing'), h('span', { text: 'Picture is missing. ' + (pg.image_alt || '') })));
      illus.append(img);
    } else illus.classList.add('hidden');
    const story = h('p', { class: 'story', lang: book.language }, ...wordSpans(pg));
    const dots = h('div', { class: 'page-dots', 'aria-hidden': 'true' }, book.pages.map((_, k) => h('i', { class: k === i ? 'on' : k < i ? 'done' : '' })));
    const vocabBox = h('div', { class: 'vocab-box hidden', 'aria-live': 'polite' });
    story.addEventListener('click', e => { const b = e.target.closest('button.w'); if (b?.dataset.def) { store.setPage(book.book_id, book.revision, i, { vocab_tap: true }); showVocab(b, vocabBox); } });
    const parentPrompt = (book.reading_mode === 'shared_reading' || book.reading_mode === 'read_aloud') && book.parent_prompts?.[Math.min(i, book.parent_prompts.length - 1)];
    const playBtn = btn(listenMode ? 'Play' : 'Listen', () => togglePlay(pg, playBtn), { ic: 'play', attrs: { 'aria-pressed': 'false' } });
    const nav = h('nav', { class: 'reader-nav', 'aria-label': 'Pages' },
      btn('Back', () => { if (i > 0) { i--; draw(); } else back(); }, { quiet: true, ic: 'back' }),
      h('div', { class: 'mid' }, S.settings.narration && (narrator.supported || pg.audio_asset) ? playBtn : null, btn('Again', () => { narrator.stop(); playBtn.click(); }, { quiet: true, ic: 'replay', attrs: { 'aria-label': 'Replay this page' } })),
      h('span', { class: 'pagecount', text: `${i + 1} / ${book.pages.length}` }),
      i < book.pages.length - 1
        ? btn('Next', () => { i++; draw(); }, { primary: true, ic: 'next' })
        : btn('Done', () => { store.completeRead(book.book_id, book.revision); store.setPage(book.book_id, book.revision, 0); go({ view: 'think', bookId: book.book_id }); }, { primary: true, ic: 'check' }));
    wrap.replaceChildren(
      h('div', { class: 'reader' }, illus, h('div', {}, h('div', { class: 'story-card fade' }, story), vocabBox, parentPrompt && i > 0 ? h('p', { class: 'parent-prompt', text: 'Grown-up: ' + parentPrompt }) : null)),
      dots, nav);
    if (listenMode && S.settings.narration) setTimeout(() => playBtn.click(), 150);
    story.focus?.();
  };
  const togglePlay = (pg, b) => {
    if (narrator.speaking) { narrator.stop(); b.setAttribute('aria-pressed', 'false'); b.querySelector('span').textContent = 'Listen'; return; }
    audioUsedThisBook = true; store.setPage(book.book_id, book.revision, i, { audio: true });
    narrator.onend = () => { b.setAttribute('aria-pressed', 'false'); b.querySelector('span').textContent = 'Listen'; };
    const ok = narrator.speak(pg.audio_script || pg.text, { assetUrl: pg.audio_asset ? assetUrl(pg.audio_asset) : null });
    if (!ok) toast('Sound is not available on this device. You can read the words yourself.');
    else { b.setAttribute('aria-pressed', 'true'); b.querySelector('span').textContent = 'Pause'; }
  };
  draw();
}
function wordSpans(pg) {
  const vocab = new Map((pg.vocabulary || []).map(v => [v.word.toLowerCase(), v]));
  return pg.text.split(/(\s+)/).map(tok => {
    if (!tok.trim()) return tok;
    const key = tok.toLowerCase().replace(/[^a-z']/g, '');
    const v = vocab.get(key);
    if (!v) return h('span', { class: 'w', text: tok });
    return h('button', { class: 'w vocab', type: 'button', text: tok, dataset: { def: v.definition, ex: v.example || '', word: v.word }, 'aria-label': `${tok}. Tap to hear what it means.` });
  });
}
function showVocab(b, box) {
  box.classList.remove('hidden');
  box.replaceChildren(h('b', { text: b.dataset.word }), h('p', { text: b.dataset.def }), b.dataset.ex ? h('p', { class: 'muted', text: 'Example: ' + b.dataset.ex }) : null,
    h('div', { class: 'row' }, btn('Hear it', () => narrator.speak(`${b.dataset.word}. ${b.dataset.def}. ${b.dataset.ex || ''}`), { ic: 'ear' }), btn('Close', () => { box.classList.add('hidden'); b.focus(); }, { quiet: true })));
}

// ---------- think & tell (Pause and Think / Discuss)
function renderThink(book) {
  if (!book) return renderLibrary();
  setTitle('Think and tell');
  const disc = (book.activities || []).find(a => a.type === 'discussion');
  const hasActs = (book.activities || []).some(a => a.type !== 'discussion');
  app.replaceChildren(h('section', { class: 'card fade' },
    h('h2', { text: 'You finished the book!' }),
    h('p', { class: 'quiz-prompt', text: 'Tell someone: what happened in this story? What surprised you?' }),
    disc ? h('div', { class: 'parent-prompt' }, h('b', { text: 'Grown-up, you could ask:' }), h('ul', {}, disc.prompts.map(p => h('li', { text: p })))) : null,
    book.off_screen_prompt ? h('p', { class: 'explain' }, h('b', { text: 'Off screen: ' }), book.off_screen_prompt) : null,
    h('div', { class: 'row' },
      hasActs ? btn('Try an activity', () => go({ view: 'activity', bookId: book.book_id, index: 0 }), { primary: true }) : null,
      book.quiz?.length ? btn('Questions', () => go({ view: 'quiz', bookId: book.book_id, index: 0 }), { primary: !hasActs }) : null,
      btn('Read it again', () => go({ view: 'read', bookId: book.book_id, page: 0 }), { quiet: true, ic: 'replay' }),
      btn('Stop for now', stopNow, { quiet: true }))));
  // Policy (5.5): one reading-completion reward per book revision; rereads stay available without duplicate stars.
  maybeAward({ bookId: book.book_id, revision: book.revision, activity: 'read_complete', cycle: 0 });
}

// ---------- activities (keyboard + touch alternatives; no drag-only)
function renderActivity(book, idx) {
  const acts = (book?.activities || []).filter(a => a.type !== 'discussion');
  if (!book || !acts.length) return go({ view: 'quiz', bookId: book?.book_id, index: 0 }, false);
  if (idx >= acts.length) return go({ view: 'quiz', bookId: book.book_id, index: 0 }, false);
  const a = acts[idx]; setTitle('Activity ' + (idx + 1));
  const next = () => go({ view: 'activity', bookId: book.book_id, index: idx + 1 });
  const cycle = store.quizCycle(book.book_id, book.revision);
  const finish = (correct, attemptsUsed) => {
    store.recordAttempt({ bookId: book.book_id, revision: book.revision, questionId: a.activity_id, skill: a.skill, optionId: null, correct, cycle, kind: 'activity', supportUsed: { audio: audioUsedThisBook } });
    if (correct && attemptsUsed === 1) maybeAward({ bookId: book.book_id, revision: book.revision, activity: 'activity_first_try', questionId: a.activity_id, cycle });
  };
  const sec = h('section', { class: 'card fade' }, h('h2', { class: 'quiz-prompt', text: a.prompt || 'Activity' }));
  app.replaceChildren(sec);
  if (a.type === 'sequence_events') sec.append(sequenceWidget(a, book, finish, next));
  else if (a.type === 'word_to_meaning' || a.type === 'match_pairs') sec.append(matchWidget(a, finish, next));
  else if (a.type === 'choose_evidence') sec.append(evidenceWidget(a, book, finish, next));
  else sec.append(h('p', { text: 'This activity type is not available yet.' }), btn('Skip', next, { quiet: true }));
  sec.append(h('div', { class: 'row', style: 'margin-top:1rem' }, btn('Skip this', next, { quiet: true })));
}

function sequenceWidget(a, book, finish, next) {
  let order = shuffle(a.items.map(x => x.id)); if (order.join() === a.correct_order.join()) order.reverse();
  let tries = 0; const byId = Object.fromEntries(a.items.map(x => [x.id, x]));
  const list = h('ol', { class: 'seq-list', 'aria-label': 'Story events. Use the up and down buttons to reorder.' });
  const feedback = h('div', { 'aria-live': 'polite' });
  const draw = () => list.replaceChildren(...order.map((id, k) => h('li', { class: 'seq-item' },
    h('span', { class: 'chip', text: String(k + 1) }), h('span', { class: 'txt', text: byId[id].text }),
    h('span', { class: 'ctl' },
      btn('', () => { if (k > 0) { [order[k - 1], order[k]] = [order[k], order[k - 1]]; draw(); list.children[k - 1].querySelector('button').focus(); } }, { quiet: true, ic: 'up', attrs: { 'aria-label': `Move "${byId[id].text}" up`, disabled: k === 0 } }),
      btn('', () => { if (k < order.length - 1) { [order[k + 1], order[k]] = [order[k], order[k + 1]]; draw(); list.children[k + 1].querySelectorAll('button')[1].focus(); } }, { quiet: true, ic: 'down', attrs: { 'aria-label': `Move "${byId[id].text}" down`, disabled: k === order.length - 1 } })))));
  draw();
  const check = btn('Check', () => {
    tries++;
    if (order.join() === a.correct_order.join()) { finish(true, tries); feedback.replaceChildren(h('p', { class: 'explain', text: 'Yes, that is the order.' }), btn('Next', next, { primary: true, ic: 'next' })); check.disabled = true; }
    else {
      const firstWrong = order.findIndex((id, k) => id !== a.correct_order[k]);
      const pg = byId[order[firstWrong]]?.page_id; const pIdx = book.pages.findIndex(p => p.page_id === pg);
      feedback.replaceChildren(h('p', { class: 'explain', text: 'Not yet. Look again and try once more.' }),
        pIdx >= 0 ? btn('Look at page ' + (pIdx + 1), () => go({ view: 'read', bookId: book.book_id, page: pIdx }), { quiet: true }) : null);
      if (tries >= 3) { finish(false, tries); feedback.append(h('p', { text: 'The order was: ' + a.correct_order.map(id => byId[id].text).join(' -> ') }), btn('Next', next, { primary: true })); check.disabled = true; }
    }
  }, { primary: true, ic: 'check' });
  return h('div', {}, list, h('div', { class: 'row', style: 'margin-top:.8rem' }, check), feedback);
}

function matchWidget(a, finish, next) {
  const lefts = shuffle(a.pairs.map(p => p.left)); const rights = shuffle(a.pairs.map(p => p.right));
  const ans = Object.fromEntries(a.pairs.map(p => [p.left, p.right]));
  let selL = null, wrong = 0, done = 0;
  const status = h('p', { 'aria-live': 'polite', class: 'muted', text: 'Pick a word, then pick its meaning.' });
  const grid = h('div', { class: 'match-grid' });
  const lBtns = lefts.map(t => btn(t, () => { selL = t; lBtns.forEach(b => b.setAttribute('aria-pressed', String(b.textContent === t))); status.textContent = `"${t}" picked. Now pick its meaning.`; }, { attrs: { 'aria-pressed': 'false' } }));
  const rBtns = rights.map(t => btn(t, () => {
    if (!selL) { status.textContent = 'Pick a word first.'; return; }
    if (ans[selL] === t) {
      done++; const lb = lBtns.find(b => b.textContent === selL); const rb = rBtns.find(b => b.textContent === t);
      lb.classList.add('done'); rb.classList.add('done'); lb.disabled = rb.disabled = true; lb.setAttribute('aria-pressed', 'false'); selL = null;
      status.textContent = 'Yes! ' + (done === a.pairs.length ? 'All matched.' : 'Pick another word.');
      if (done === a.pairs.length) { finish(wrong === 0, wrong + 1); wrapper.append(btn('Next', next, { primary: true, ic: 'next' })); }
    } else { wrong++; status.textContent = 'Not that one. Try another meaning.'; }
  }));
  grid.append(h('div', { role: 'group', 'aria-label': 'Words', class: 'options' }, lBtns), h('div', { role: 'group', 'aria-label': 'Meanings', class: 'options' }, rBtns));
  const wrapper = h('div', {}, status, grid);
  return wrapper;
}

function evidenceWidget(a, book, finish, next) {
  let tries = 0; const fb = h('div', { 'aria-live': 'polite' });
  const opts = h('div', { class: 'options' }, book.pages.map((p, k) => btn(`Page ${k + 1}: "${p.text}"`, (e) => {
    tries++;
    if (a.correct_page_ids.includes(p.page_id)) { e.currentTarget.classList.add('correct'); finish(true, tries); fb.replaceChildren(h('p', { class: 'explain', text: 'Yes. That page shows it.' }), btn('Next', next, { primary: true, ic: 'next' })); [...opts.children].forEach(b => b.disabled = true); }
    else { e.currentTarget.classList.add('wrong'); fb.replaceChildren(h('p', { class: 'explain', text: 'Read that page again. Does it show the claim?' })); if (tries >= 3) { finish(false, tries); fb.append(btn('Next', next, { primary: true })); } }
  })));
  return h('div', {}, h('p', {}, h('b', { text: 'Claim: ' }), a.claim), opts, fb);
}

// ---------- quiz (R04: first-attempt credit only)
function renderQuiz(book, idx) {
  if (!book || !book.quiz?.length) return go({ view: 'celebrate', bookId: book?.book_id }, false);
  if (idx >= book.quiz.length) { store.finishQuizCycle(book.book_id, book.revision); return go({ view: 'celebrate', bookId: book.book_id }, false); }
  const q = book.quiz[idx]; const cycle = store.quizCycle(book.book_id, book.revision);
  setTitle(`Question ${idx + 1} of ${book.quiz.length}`);
  const next = () => go({ view: 'quiz', bookId: book.book_id, index: idx + 1 });
  const fb = h('div', { 'aria-live': 'polite' });
  const sec = h('section', { class: 'card fade' }, h('h2', { class: 'quiz-prompt', text: q.prompt }), h('div', { class: 'row' }, S.settings.narration && narrator.supported ? btn('Read it to me', () => narrator.speak(q.prompt + '. ' + (q.options || []).map(o => o.text).join('. ')), { quiet: true, ic: 'ear' }) : null));
  app.replaceChildren(sec);
  if (q.response_type === 'open') {
    const ta = h('textarea', { 'aria-label': 'Your answer (a grown-up can also type what you say)' });
    sec.append(h('p', { class: 'muted', text: 'Say your answer out loud to a grown-up, or type it. A grown-up will look at it later.' }), ta,
      h('div', { class: 'row' },
        btn('Save answer', () => { store.recordAttempt({ bookId: book.book_id, revision: book.revision, questionId: q.question_id, skill: q.skill, optionId: null, correct: null, cycle, kind: 'open', responseText: ta.value.trim() || '(said out loud)', supportUsed: { audio: audioUsedThisBook } }); toast('Saved for a grown-up to see.'); next(); }, { primary: true, ic: 'check' }),
        btn('Skip', next, { quiet: true })));
    return;
  }
  let answered = false; let attempts = 0;
  const opts = h('div', { class: 'options', role: 'group', 'aria-label': 'Answers' }, shuffle(q.options).map(o => btn(o.text, (e) => {
    if (answered) return;
    attempts++;
    const correct = o.id === q.correct_option_id;
    const att = store.recordAttempt({ bookId: book.book_id, revision: book.revision, questionId: q.question_id, skill: q.skill, optionId: o.id, correct, cycle, supportUsed: { audio: audioUsedThisBook } });
    if (correct) {
      answered = true; e.currentTarget.classList.add('correct'); [...opts.children].forEach(b => b.disabled = true);
      if (att.first_attempt) maybeAward({ bookId: book.book_id, revision: book.revision, activity: 'quiz_first_try', questionId: q.question_id, cycle });
      fb.replaceChildren(h('p', { class: 'explain' }, h('b', { text: att.first_attempt ? 'Yes! ' : 'That is it. ' }), q.explanation), btn('Next', next, { primary: true, ic: 'next' }));
    } else {
      e.currentTarget.classList.add('wrong'); e.currentTarget.disabled = true;
      const pIdx = book.pages.findIndex(p => p.page_id === q.evidence_page_ids?.[0]);
      fb.replaceChildren(h('p', { class: 'explain', text: 'Not yet. You can look back at the book and try again.' }),
        pIdx >= 0 ? btn('Look at page ' + (pIdx + 1), () => go({ view: 'read', bookId: book.book_id, page: pIdx }), { quiet: true, ic: 'book' }) : null);
    }
  })));
  sec.append(opts, fb, h('div', { class: 'row', style: 'margin-top:1rem' }, btn('Skip', next, { quiet: true })));
}

// ---------- celebrate (finite, calm)
function renderCelebrate(book) {
  setTitle('Well done');
  const mascot = S.settings.mascot_enabled ? icon('mascot', 'mascot mascot-big') : null;
  const sparkles = h('div', { class: 'sparkles', 'aria-hidden': 'true' }, Array.from({ length: 10 }, (_, k) => h('i', { style: `left:${8 + k * 9}%; animation-delay:${(k % 5) * .12}s` })));
  app.replaceChildren(h('section', { class: 'card celebrate fade' },
    sparkles, mascot,
    h('div', { class: 'big', text: 'You read and you thought about it.' }),
    book?.off_screen_prompt ? h('p', { class: 'explain' }, h('b', { text: 'Off screen idea: ' }), book.off_screen_prompt) : null,
    h('div', { class: 'row' },
      btn('Stop for now', stopNow, { primary: true }),
      btn('Choose another book', () => go({ view: 'library' }), { quiet: true, ic: 'home' }),
      book ? btn('Read this again', () => go({ view: 'read', bookId: book.book_id, page: 0 }), { quiet: true, ic: 'replay' }) : null)));
}

function maybeAward(x) {
  const r = store.award(x);
  if (r.granted) { renderStars(); toast('You earned a star.'); }
}

// ---------- break cue (A07)
function showBreak() { document.getElementById('breakBanner').classList.remove('hidden'); store.noteBreak(session.id, false); document.getElementById('breakOk').focus(); }
function hideBreak(dismissed) { document.getElementById('breakBanner').classList.add('hidden'); if (dismissed) { const s = S.sessions.find(x => x.id === session.id); if (s) { s.breaks_dismissed++; store.save(); } } }
