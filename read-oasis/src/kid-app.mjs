// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
// Revision: 2.0 - richer library/reader/quiz presentation; learning logic preserved
//
// Read Oasis child app. Flow: Choose -> Preview -> Listen/Read -> Pause & Think ->
// Discuss -> Quiz -> Celebrate -> Stop or Continue. Only PUBLISHED books from content/index.json.

import { ProgressStore } from './progress-store.mjs';
import { isPublishable } from './schema.mjs';
import { h, btn, icon, applySettings, toast, narrator, BreakTimer, shuffle, loadJSON, assetUrl, isBundled, isFileProtocol } from './ui.mjs';
import { attachSync } from './sync.mjs';
import { requireAuth } from './auth-gate.mjs';
import { renderGarden, loadVocabManifest } from './vocab-garden.mjs';

// All module state is declared before any store listener can fire (save() notifies synchronously).
const store = new ProgressStore(window.localStorage);
const S = store.load();
applySettings(S.settings);

// Push the parent-chosen reading voice / accent / device-TTS flag into the shared narrator.
// Done at startup AND on every settings change so EVERY route — reader, quiz, AND the Vocabulary
// Garden — speaks with the same chosen voice (single source of truth = S.settings.voice_uri).
function syncNarrator(s) {
  narrator.deviceAllowed = s.allow_device_tts !== false;
  narrator.accent = s.accent || 'en-GB';
  narrator.voiceURI = s.voice_uri || null;
}
syncNarrator(S.settings);

const app = document.getElementById('app');
const titleEl = document.getElementById('titleText') || document.getElementById('title');
let library = [];                      // published book summaries
let libraryIndex = null;               // full content/index.json (greeting clips etc.)
const bookCache = new Map();           // book_id -> full book
let route = { view: 'library' };
const history = [];                    // in-app back stack
let audioUsedThisBook = false;
let lastStars = null;
let session = null;
let breakTimer = null;
let gardenAvailable = false;           // true when content/vocabulary/manifest.json loads (Phase 4)

store.onChange(d => { applySettings(d.settings); syncNarrator(d.settings); renderStars(); if (breakTimer && breakTimer.minutes !== d.settings.break_minutes) breakTimer.setMinutes(d.settings.break_minutes); });
session = store.startSession();
breakTimer = new BreakTimer({ minutes: S.settings.break_minutes, onCue: showBreak });

// ---------- boot
// Hidden parent gate: double-tap (or press-and-hold 1.2 s) on the title/mascot opens parent.html.
// No visible link for the child; the PIN gate still applies on the other side.
(() => {
  const t = document.getElementById('title'); if (!t) return;
  let taps = 0, tapTimer = null, holdTimer = null;
  const open = () => { narrator.stop(); location.href = 'parent.html'; };
  t.style.cursor = 'default'; t.style.userSelect = 'none';
  t.addEventListener('pointerdown', () => { holdTimer = setTimeout(open, 1200); });
  const cancel = () => { clearTimeout(holdTimer); };
  t.addEventListener('pointerup', cancel); t.addEventListener('pointerleave', cancel); t.addEventListener('pointercancel', cancel);
  t.addEventListener('click', () => { taps++; clearTimeout(tapTimer); if (taps >= 2) { taps = 0; open(); } else tapTimer = setTimeout(() => { taps = 0; }, 450); });
  t.addEventListener('dblclick', e => e.preventDefault());
})();
document.getElementById('btnHome').onclick = () => go({ view: 'library' });
document.getElementById('btnBack').onclick = back;
document.getElementById('btnExit').onclick = stopNow;
document.getElementById('breakOk').onclick = () => { hideBreak(true); };
window.addEventListener('pagehide', () => { store.endSession(session.id); store.save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { narrator.stop(); store.save(); } });
if ('serviceWorker' in navigator && !isBundled && !isFileProtocol) navigator.serviceWorker.register('sw.js').catch(() => { /* offline optional */ });

// Family login gate (src/auth-gate.mjs) runs first; the library loads in parallel and renders once the account
// is verified. Cloud sync only if a parent enabled it (src/sync.mjs); never blocks the child app.
Promise.all([requireAuth({ page: 'kid' }), loadLibrary()]).then(() => {
  if (S.settings.cloud_sync_enabled && !isFileProtocol) attachSync(store).then(ok => { if (ok && route.view === 'library') render(); }).catch(() => {});
  const last = store.lastOpened();
  renderStars();
  if (last && library.some(b => b.book_id === last.book_id && b.revision === last.revision) && last.completed_reads === 0) {
    go({ view: 'preview', bookId: last.book_id, resume: true });
  } else go({ view: 'library' });
});

async function loadLibrary() {
  try {
    const idx = await loadJSON('index.json');
    libraryIndex = idx;
    // Parent veto applied here; unseen-check texts (C06) are never in the child's shelf unless the parent unlocks one
    // for a check session from parent.html (settings.unseen_unlocked = book_id).
    library = (idx.books || []).filter(b => !store.isBookHidden(b.book_id) && (!b.reserved_for_unseen_check || S.settings.unseen_unlocked === b.book_id));
    // Vocabulary Garden is optional: probe its manifest so the shelf can offer it, but never block reading.
    const gm = await loadVocabManifest();
    gardenAvailable = !!gm && ((gm.disposition_counts?.editorially_approved || 0) + (gm.disposition_counts?.published || 0)) > 0;
  } catch {
    library = [];
    toast(isFileProtocol ? 'This copy needs the single-file build (dist/index.html) or a local web server. See README.' : 'Could not load the library. If you are offline, open the app once while online first.', 8000);
  }
}
async function loadBook(id) {
  if (bookCache.has(id)) return bookCache.get(id);
  const meta = library.find(b => b.book_id === id); if (!meta) return null;
  const book = await loadJSON(meta.file);
  if (!isPublishable(book) || store.isBookHidden(id)) return null;   // C02 defense in depth + parent veto
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
// Greetings: short, varied, spoken once per visit. Built clips live in content/audio/greetings/ (rendered by
// tools/build_audio.py --greetings); otherwise the device en-GB voice says the same text.
const GREETINGS = [
  { id: 'g01', text: 'Hello! Which book shall we read today?' },
  { id: 'g02', text: 'Welcome back. Your books are ready.' },
  { id: 'g03', text: 'Hello, reader! Pick a story and off we go.' },
  { id: 'g04', text: 'Good to see you. Shall we listen, or read it ourselves?' },
  { id: 'g05', text: 'Ready for a story? Choose one you like.' },
  { id: 'g06', text: 'Hello again! Let us find out what happens next.' },
];
function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}
let greeted = false;
function speakGreeting() {
  if (greeted || !S.settings.narration || S.settings.greeting_audio === false) return;
  greeted = true;
  const g = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  const name = S.profile.display_name && S.profile.display_name !== 'Reader' ? `${greeting()}, ${S.profile.display_name}. ` : `${greeting()}. `;
  const clips = { normal: greetingClipUrl(g.id) };
  // Autoplay may be blocked until the first tap; if so, the first pointer interaction plays it.
  const tryPlay = () => narrator.speak(name + g.text, { clips, speed: 'normal' });
  const ok = tryPlay();
  if (ok) {
    const audio = narrator.audio;
    if (audio) audio.play().catch(() => armOnFirstTap(tryPlay));
  } else armOnFirstTap(tryPlay);
}
function greetingClipUrl(id) {
  const idx = libraryIndex; if (!idx?.greetings?.[id]) return null;
  return assetUrl(idx.greetings[id]);
}
function armOnFirstTap(fn) {
  const once = () => { document.removeEventListener('pointerdown', once, true); document.removeEventListener('keydown', once, true); setTimeout(fn, 50); };
  document.addEventListener('pointerdown', once, true); document.addEventListener('keydown', once, true);
}

// Level model (spec 3.2/3.3): bands are internal labels; two tracks (independent, read-aloud). "Just right" for
// the library = independent band for read-myself/sound-it-out modes, read-aloud band for listen/together modes.
const BAND_ORDER = ['A-C', 'D-J', 'K-P', 'Q-Z'];
function bandOfLevel(l) { return l <= 'C' ? 'A-C' : l <= 'J' ? 'D-J' : l <= 'P' ? 'K-P' : 'Q-Z'; }
function fitFor(book) {
  const ind = S.settings.independent_track_band, ra = S.settings.read_aloud_track_band || ind;
  const target = (book.reading_mode === 'read_aloud' || book.reading_mode === 'shared_reading') ? ra : ind;
  if (!target) return 'unknown';
  const d = BAND_ORDER.indexOf(bandOfLevel(book.level)) - BAND_ORDER.indexOf(target);
  return d === 0 ? 'just_right' : d < 0 ? 'easy' : d === 1 ? 'stretch' : 'later';
}
function setTitle(t) { titleEl.textContent = t; document.title = t + ' - Read Oasis'; }

async function render() {
  narrator.stop();
  // Always start a new view at the top. The father's letter (<footer class="oasis-letter">) is a tall
  // static element below #app; without this, clicking a button re-renders #app but keeps the old scroll
  // position, which can leave the viewport parked down in the letter. Reset before drawing the new view.
  try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch { window.scrollTo(0, 0); }
  app.replaceChildren(h('p', { class: 'muted', text: 'Loading...' }));
  switch (route.view) {
    case 'library': return renderLibrary();
    case 'preview': return renderPreview(await loadBook(route.bookId));
    case 'read': return renderReader(await loadBook(route.bookId));
    case 'think': return renderThink(await loadBook(route.bookId));
    case 'activity': return renderActivity(await loadBook(route.bookId), route.index || 0);
    case 'quiz': return renderQuiz(await loadBook(route.bookId), route.index || 0);
    case 'celebrate': return renderCelebrate(await loadBook(route.bookId));
    case 'garden': return renderGarden(app, gardenCtx());
    default: return renderLibrary();
  }
}

// Vocabulary Garden context: gives the companion area the store, title setter, and navigation
// without letting it touch book routing internals.
function gardenCtx() { return { store, setTitle, go, back: () => go({ view: 'library' }) }; }

// ---------- library (Choose)
function tile(b) {
  const p = store.bookProgress(b.book_id, b.revision, false);
  const cover = h('div', { class: 'cover' });
  const img = b.assets?.find(a => a.startsWith('images/'));
  if (img && S.settings.illustration_size !== 'hidden') { const im = h('img', { src: assetUrl(img), alt: '' }); im.onerror = () => cover.replaceChildren(icon('book', '')); cover.append(im); }
  else cover.append(icon('book'));
  const inProgress = p && !p.completed_reads && p.page_index > 0;
  if (inProgress) cover.append(h('span', { class: 'ribbon', text: 'Continue' }));
  else if (p?.completed_reads) cover.append(h('span', { class: 'ribbon', text: 'Read ' + p.completed_reads + 'x' }));
  const fit = fitFor(b);
  const fitChip = { just_right: ['Just right', 'accent'], easy: ['Easy', ''], stretch: ['A stretch', 'primary'], later: ['For later', ''], unknown: [null, ''] }[fit];
  const pct = p ? Math.round(100 * (p.completed_reads ? 1 : p.page_index / Math.max(1, b.pages - 1))) : 0;
  return h('button', { class: 'book-tile', dataset: { fit }, onclick: () => go({ view: 'preview', bookId: b.book_id }), 'aria-label': `${b.title}. ${modeLabel(b.reading_mode)}. ${fitChip[0] ? fitChip[0] + '.' : ''} ${inProgress ? 'In progress.' : p?.completed_reads ? 'Read before.' : 'New.'}` },
    cover,
    h('span', { class: 't', text: b.title }),
    h('span', { class: 'tile-invite', text: inProgress ? 'Pick up your story  →' : p?.completed_reads ? 'Read it again  →' : 'Open this book  →' }),
    h('span', {}, h('span', { class: 'chip primary', text: modeLabel(b.reading_mode) }), fitChip[0] ? h('span', { class: 'chip ' + fitChip[1], text: fitChip[0] }) : null, h('span', { class: 'chip', text: 'Level ' + b.level })),
    h('span', { class: 'progress', 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%` })));
}
function renderLibrary() {
  setTitle('Choose a book');
  const last = store.lastOpened();
  const hasBand = !!S.settings.independent_track_band;
  const mascot = S.settings.mascot_enabled ? icon('mascot', 'mascot') : null;
  // Group by fit when a band is set; otherwise by reading mode so the child still sees a structure.
  const groups = [];
  if (hasBand) {
    const by = { just_right: [], stretch: [], easy: [], later: [] };
    for (const b of library) by[fitFor(b)]?.push(b);
    if (by.just_right.length) groups.push(['Just right for you', 'Read on your own or together.', by.just_right]);
    if (by.stretch.length) groups.push(['A little stretch', 'Try with a grown-up or the Listen button.', by.stretch]);
    if (by.easy.length) groups.push(['Easy and fun', 'Good for reading fast and smooth.', by.easy]);
    if (by.later.length) groups.push(['For later', 'Listen if you like; reading these comes later.', by.later]);
  } else {
    const modes = [['independent_reading', 'Read myself'], ['decodable', 'Sound it out'], ['shared_reading', 'Read together'], ['read_aloud', 'Listen']];
    for (const [m, label] of modes) { const arr = library.filter(b => b.reading_mode === m); if (arr.length) groups.push([label, '', arr]); }
  }
  const continueBook = last && !last.completed_reads && last.page_index > 0 ? library.find(b => b.book_id === last.book_id) : null;
  app.replaceChildren(
    h('section', { class: 'fade' },
      h('div', { class: mascot ? 'hero' : 'hero hero-no-art' },
        h('div', { class: 'hero-copy' },
          h('span', { class: 'hero-eyebrow', text: 'WELCOME TO YOUR STORY GARDEN' }),
          h('h2', { text: `${greeting()}, ${S.profile.display_name || 'Reader'}!` }),
          h('p', { class: 'sub', text: continueBook ? `Your book "${continueBook.title}" is waiting where you left it.` : 'A lovely new story is waiting for you. Pick a book and let’s explore together.' }),
          h('div', { class: 'row hero-actions' },
            continueBook ? btn('Continue', () => go({ view: 'preview', bookId: continueBook.book_id }), { primary: true, ic: 'play' }) : null,
            gardenAvailable ? btn('Vocabulary Garden', () => go({ view: 'garden' }), { primary: !continueBook, ic: 'star' }) : null,
            btn('Hear that again', speakGreetingAgain, { quiet: true, ic: 'ear' }),
            hasBand ? h('span', { class: 'chip accent', text: 'Your level: ' + S.settings.independent_track_band + (S.settings.read_aloud_track_band && S.settings.read_aloud_track_band !== S.settings.independent_track_band ? ' · listening ' + S.settings.read_aloud_track_band : '') }) : h('span', { class: 'chip', text: 'A grown-up can set your reading level' }))),
        mascot ? h('div', { class: 'hero-art', 'aria-hidden': 'true' },
          h('span', { class: 'hero-sun' }), h('span', { class: 'hero-cloud cloud-one' }), h('span', { class: 'hero-cloud cloud-two' }),
          h('span', { class: 'hero-book' }, h('span'), h('span')),
          h('span', { class: 'hero-mascot' }, mascot), h('span', { class: 'hero-hill' })) : null),
      ...groups.map(([title, sub, arr]) => h('div', { class: 'shelf' },
        h('div', { class: 'shelf-heading' }, h('div', {}, h('span', { class: 'shelf-kicker', text: 'YOUR BOOKS' }), h('h2', { text: title })), sub ? h('p', { class: 'muted', text: sub }) : null),
        h('div', { class: 'grid stagger' }, arr.map(tile)))),
      library.length ? null : h('p', { class: 'card', text: 'No approved books yet. Ask a grown-up to approve a book in the parent area.' })));
  speakGreeting();
}
function speakGreetingAgain() { greeted = false; speakGreeting(); }
function modeLabel(m) { return { read_aloud: 'Listen', shared_reading: 'Read together', decodable: 'Sound it out', independent_reading: 'Read myself' }[m] || m; }

// ---------- preview
function renderPreview(book) {
  if (!book) return renderLibrary();
  setTitle(book.title);
  const p = store.bookProgress(book.book_id, book.revision);
  audioUsedThisBook = false;
  const resumeAt = p.page_index > 0 && p.page_index < book.pages.length ? p.page_index : 0;
  const previewArt = h('div', { class: 'preview-art', 'aria-hidden': 'true' });
  if (S.settings.illustration_size !== 'hidden' && book.pages[0]?.image_asset) {
    const image = h('img', { src: assetUrl(book.pages[0].image_asset), alt: '' });
    image.onerror = () => previewArt.replaceChildren(icon('book', ''));
    previewArt.append(image);
  } else previewArt.append(icon('book', ''));
  app.replaceChildren(h('section', { class: 'card fade book-preview' },
    previewArt,
    h('div', { class: 'preview-copy' },
    h('span', { class: 'shelf-kicker', text: 'A STORY FOR YOU' }),
    h('h2', { text: book.title }),
    h('p', {}, h('span', { class: 'chip', text: modeLabel(book.reading_mode) }), h('span', { class: 'chip', text: book.topic }), h('span', { class: 'chip', text: book.pages.length + ' pages' })),
    p.migrated_from_revision ? h('p', { class: 'explain', text: `This book was updated since you last read it. Your earlier reading is kept; this is a fresh copy.` }) : null,
    book.reading_mode === 'read_aloud' || book.reading_mode === 'shared_reading' ? h('p', { class: 'parent-prompt', text: (book.parent_prompts?.[0]) || 'Grown-up: read together and talk about the story.' }) : null,
    h('p', { text: 'What will you do?' }),
    h('div', { class: 'row' },
      resumeAt ? btn(`Continue from page ${resumeAt + 1}`, () => go({ view: 'read', bookId: book.book_id, page: resumeAt }), { primary: true, ic: 'play' }) : null,
      btn(resumeAt ? 'Start again' : 'Read', () => go({ view: 'read', bookId: book.book_id, page: 0 }), { primary: !resumeAt, ic: 'next' }),
      narrator.supported || book.pages.some(pg => pg.audio_asset) ? btn('Listen', () => go({ view: 'read', bookId: book.book_id, page: resumeAt, listen: true }), { ic: 'ear' }) : null,
      p.completed_reads > 0 && book.quiz?.length ? btn('Questions', () => go({ view: 'quiz', bookId: book.book_id, index: 0 })) : null))));
}

// ---------- reader (Listen / Read)
function renderReader(book) {
  if (!book) return renderLibrary();
  let i = Math.min(Math.max(route.page || 0, 0), book.pages.length - 1);
  const listenMode = !!route.listen;
  setTitle(book.title);
  const wrap = h('section', { class: 'fade' });
  app.replaceChildren(wrap);
  let reader_clearHighlight = () => {};
  const draw = () => {
    narrator.stop();
    reader_clearHighlight();
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
    story.addEventListener('click', e => { const b = e.target.closest('button.w'); if (b?.dataset.word) { store.setPage(book.book_id, book.revision, i, { vocab_tap: true }); showVocab(pg, b.dataset.word, vocabBox, b); } });
    const parentPrompt = (book.reading_mode === 'shared_reading' || book.reading_mode === 'read_aloud') && book.parent_prompts?.[Math.min(i, book.parent_prompts.length - 1)];
    const hasSound = S.settings.narration && (narrator.supported || pg.audio_asset);
    // Listen bar: Play/Pause, Again, a speed button that cycles Very slow -> Slow -> Normal -> A bit fast,
    // and (when the device supports voices) a Voice button to pick any installed device voice.
    // Built clips play first (see narrator); on iPad/iPhone/Android the device's best English voice is the
    // fallback, unless the user has picked a specific device voice (then that voice is always used).
    const playBtn = btn('Listen', () => togglePlay(pg, playBtn), { primary: true, ic: 'play', attrs: { 'aria-pressed': 'false' } });
    const SPEED_CYCLE = ['very_slow', 'slow', 'normal', 'fast'];
    const speedLabel = sp => sp === 'very_slow' ? 'Very slow' : sp === 'slow' ? 'Slow' : sp === 'fast' ? 'A bit fast' : 'Normal';
    const speedIcon = sp => sp === 'fast' ? 'rabbit' : 'turtle';
    const speedBtn = btn(speedLabel(speed), () => {
      speed = SPEED_CYCLE[(SPEED_CYCLE.indexOf(speed) + 1) % SPEED_CYCLE.length]; // Very slow -> Slow -> Normal -> A bit fast -> ...
      speedBtn.querySelector('span').textContent = speedLabel(speed);
      const useEl = speedBtn.querySelector('use'); if (useEl) useEl.setAttribute('href', '#i-' + speedIcon(speed));
      speedBtn.setAttribute('aria-label', 'Reading speed: ' + speedLabel(speed) + '. Tap to change.');
      if (narrator.speaking) { narrator.stop(); togglePlay(pg, playBtn); }
    }, { quiet: true, ic: speedIcon(speed), attrs: { 'aria-label': 'Reading speed: ' + speedLabel(speed) + '. Tap to change.' } });
    const srcTag = h('span', { class: 'chip src-tag hidden', 'aria-live': 'polite' });
    const voiceBtn = (narrator.supported && narrator.deviceAllowed)
      ? btn('Voice', () => showVoicePicker(voiceBtn), { quiet: true, ic: 'ear', attrs: { 'aria-label': 'Choose the reading voice from this device' } })
      : null;
    const listenBar = hasSound ? h('div', { class: 'listen-bar' }, playBtn, btn('Again', () => { narrator.stop(); togglePlay(pg, playBtn); }, { quiet: true, ic: 'replay', attrs: { 'aria-label': 'Play this page again' } }), speedBtn, voiceBtn, srcTag) : null;
    const nav = h('nav', { class: 'reader-nav', 'aria-label': 'Pages' },
      btn('Back', () => { if (i > 0) { i--; draw(); } else back(); }, { quiet: true, ic: 'back' }),
      h('span', { class: 'pagecount', text: `${i + 1} / ${book.pages.length}` }),
      i < book.pages.length - 1
        ? btn('Next', () => { i++; draw(); }, { primary: true, ic: 'next' })
        : btn('Done', () => { store.completeRead(book.book_id, book.revision); store.setPage(book.book_id, book.revision, 0); go({ view: 'think', bookId: book.book_id }); }, { primary: true, ic: 'check' }));
    wrap.replaceChildren(
      h('div', { class: 'reader' }, illus, h('div', { class: 'reader-copy' }, h('div', { class: 'story-card fade' }, h('span', { class: 'story-eyebrow', text: 'PAGE ' + (i + 1) + ' · ' + book.title }), story, listenBar), vocabBox, parentPrompt && i > 0 ? h('p', { class: 'parent-prompt', text: 'Grown-up: ' + parentPrompt }) : null)),
      dots, nav);
    narrator.onstart = () => { srcTag.textContent = narrator.lastSource === 'built' ? 'British English' : 'device voice'; srcTag.classList.remove('hidden'); };
    // Word-by-word highlight while the DEVICE voice reads (built clips carry no per-word timings, so no
    // boundary fires for them). The .w spans are the whitespace-separated tokens of pg.text, in reading order.
    // The narrator forwards a WORD INDEX (Nth spoken token) rather than a raw char offset, so highlight stays
    // correct even when the spoken audio_script differs from the shown text by punctuation only (e.g. quotes
    // stripped for smoother speech) — the Nth spoken token lines up with the Nth rendered token.
    const wordEls = [...story.querySelectorAll('.w[data-start]')];
    const clearHighlight = () => wordEls.forEach(el => el.classList.remove('reading'));
    // Alignment guard: highlight only when the spoken string has the SAME number of whitespace tokens as the
    // rendered words. That is true for plain pages (audio_script === text) and for our punctuation-only
    // audio_script rewrites; it stays off only if a page genuinely adds/removes spoken words vs what it shows.
    const spoken = pg.audio_script || pg.text || '';
    const spokenTokenCount = (spoken.trim().match(/\S+/g) || []).length;
    const canHighlight = S.settings.highlight_words !== false && spokenTokenCount === wordEls.length && wordEls.length > 0;
    narrator.onboundary = canHighlight ? (_charIndex, _charLen, wordIndex) => {
      clearHighlight();
      const el = wordEls[wordIndex];
      if (el) { el.classList.add('reading'); el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }
    } : null;
    reader_clearHighlight = clearHighlight;
    if (listenMode && S.settings.narration) setTimeout(() => togglePlay(pg, playBtn), 150);
    story.focus?.();
  };
  let speed = S.settings.default_speed || 'normal';
  syncNarrator(S.settings);   // chosen voice / accent / device-TTS (single source of truth)
  const togglePlay = (pg, b) => {
    if (narrator.speaking) { narrator.stop(); reader_clearHighlight(); b.setAttribute('aria-pressed', 'false'); b.querySelector('span').textContent = 'Listen'; return; }
    audioUsedThisBook = true; store.setPage(book.book_id, book.revision, i, { audio: true });
    narrator.onend = () => { reader_clearHighlight(); b.setAttribute('aria-pressed', 'false'); b.querySelector('span').textContent = 'Listen'; };
    const ok = narrator.speak(pg.audio_script || pg.text, { clips: { normal: pg.audio_asset ? assetUrl(pg.audio_asset) : null, slow: pg.audio_slow_asset ? assetUrl(pg.audio_slow_asset) : null }, speed });
    if (!ok) toast('Sound is not available on this device. You can read the words yourself.');
    else { b.setAttribute('aria-pressed', 'true'); b.querySelector('span').textContent = 'Pause'; }
  };
  draw();
}

/** Small voice picker: lists the device's English voices and lets the child/grown-up choose one. The choice
 * is saved (settings.voice_uri) and, once set, is always used for reading so it also enables word highlight. */
function showVoicePicker(anchorBtn) {
  const current = S.settings.voice_uri || null;
  // Pass current so the chosen voice floats to the TOP of the list (default on top).
  const voices = narrator.listVoices(S.settings.accent || 'en-GB', current);
  const overlay = h('div', { class: 'voice-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose a reading voice' });
  const close = () => overlay.remove();
  const pick = (uri) => {
    store.setSettings({ voice_uri: uri });
    narrator.voiceURI = uri;
    close();
    narrator.accent = S.settings.accent || 'en-GB';
    narrator.speak('Hello! I will read with this voice.', { speed: S.settings.default_speed || 'normal', accent: narrator.accent });
    if (anchorBtn) anchorBtn.focus?.();
  };
  const list = h('div', { class: 'voice-list' });
  if (!voices.length) {
    list.append(h('p', { class: 'muted', text: 'No device voices found yet. On iPhone/iPad add voices in Settings › Accessibility › Spoken Content › Voices, then reopen this. On Android use Settings › Accessibility › Text-to-speech.' }));
  } else {
    // "Auto (best voice)" resets to the smart picker.
    const autoRow = h('button', { class: 'voice-row' + (!current ? ' on' : ''), type: 'button' }, h('span', { class: 'voice-name', text: 'Auto (best voice)' }), h('span', { class: 'voice-meta', text: 'let the app choose' }));
    autoRow.onclick = () => pick(null);
    list.append(autoRow);
    for (const v of voices) {
      const row = h('button', { class: 'voice-row' + (v.uri === current ? ' on' : '') + (v.kid ? ' kid' : ''), type: 'button' },
        h('span', { class: 'voice-name', text: v.label }),
        h('span', { class: 'voice-meta', text: (v.kid ? 'made for kids · ' : '') + (v.online ? 'online' : 'on device') }));
      row.onclick = () => pick(v.uri);
      list.append(row);
    }
  }
  const card = h('div', { class: 'voice-card' },
    h('div', { class: 'voice-head' }, h('b', { text: 'Reading voice' }), btn('', close, { quiet: true, ic: 'x', attrs: { 'aria-label': 'Close' } })),
    h('p', { class: 'muted', text: 'Tap a voice to hear it and use it for reading. Add more voices in your device settings.' }),
    list);
  overlay.append(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.append(overlay);
}
function wordSpans(pg) {
  const vocab = new Map((pg.vocabulary || []).map(v => [v.word.toLowerCase(), v]));
  let offset = 0; // running character index into pg.text, so speech 'boundary' events can find each word
  return pg.text.split(/(\s+)/).map(tok => {
    const start = offset; offset += tok.length;
    if (!tok.trim()) return tok;
    const key = tok.toLowerCase().replace(/[^a-z']/g, '');
    const v = vocab.get(key);
    if (!v) return h('span', { class: 'w', text: tok, dataset: { start: String(start) } });
    return h('button', { class: 'w vocab', type: 'button', text: tok, dataset: { word: v.word, start: String(start) }, 'aria-label': `${tok}. Tap to hear the word and what it means.` });
  });
}
/** Learning card (brief §7): word, UK IPA, Slow / Normal, British / American, Repeat. Built from the page's vocabulary entry. */
function showVocab(pg, word, box, anchor) {
  const v = (pg.vocabulary || []).find(x => x.word === word); if (!v) return;
  const clips = { normal: v.audio_asset ? assetUrl(v.audio_asset) : null, slow: v.audio_slow_asset ? assetUrl(v.audio_slow_asset) : null, us: v.audio_us_asset ? assetUrl(v.audio_us_asset) : null };
  let accent = S.settings.accent || 'en-GB'; let spd = 'normal';
  const ipa = h('div', { class: 'ipa', text: accent === 'en-US' ? (v.ipa_us ? '/' + v.ipa_us + '/' : '') : (v.ipa_uk ? '/' + v.ipa_uk + '/' : '') });
  const say = () => narrator.speak(v.word, { clips, speed: spd, accent });
  const seg = (label, on, cb, extra = {}) => btn(label, cb, { quiet: !on, primary: on, attrs: { 'aria-pressed': String(on), ...extra } });
  const redraw = () => {
    ipa.textContent = accent === 'en-US' ? (v.ipa_us ? '/' + v.ipa_us + '/' : '') : (v.ipa_uk ? '/' + v.ipa_uk + '/' : '');
    ctl.replaceChildren(
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Speed' }, seg('Slow', spd === 'slow', () => { spd = 'slow'; redraw(); say(); }, { ic: 'turtle' }), seg('Normal', spd === 'normal', () => { spd = 'normal'; redraw(); say(); }), seg('A bit fast', spd === 'fast', () => { spd = 'fast'; redraw(); say(); }, { ic: 'rabbit' })),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Accent' }, seg('British', accent === 'en-GB', () => { accent = 'en-GB'; redraw(); say(); }), seg('American', accent === 'en-US', () => { accent = 'en-US'; redraw(); say(); }, { disabled: !clips.us && !narrator.supported })));
  };
  const ctl = h('div', { class: 'card-controls' });
  redraw();
  box.classList.remove('hidden');
  box.replaceChildren(
    h('div', { class: 'card-head' }, h('b', { class: 'card-word', text: v.word }), btn('', () => say(), { primary: true, ic: 'ear', attrs: { 'aria-label': 'Say ' + v.word } })),
    ipa,
    h('p', { class: 'card-def', text: v.definition }), v.example ? h('p', { class: 'muted', text: '"' + v.example + '"' }) : null,
    ctl,
    h('div', { class: 'row' }, btn('Repeat', say, { ic: 'replay' }), btn('Hear the meaning', () => narrator.speak(`${v.word}. ${v.definition}. ${v.example || ''}`, { speed: 'normal', accent }), { quiet: true }), btn('Close', () => { box.classList.add('hidden'); anchor?.focus(); }, { quiet: true, ic: 'x' })));
  say();
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
  const sec = h('section', { class: 'card fade quiz-panel' }, h('span', { class: 'shelf-kicker', text: `QUESTION ${idx + 1} OF ${book.quiz.length}` }), h('h2', { class: 'quiz-prompt', text: q.prompt }), h('div', { class: 'row' }, S.settings.narration && narrator.supported ? btn('Read it to me', () => narrator.speak(q.prompt + '. ' + (q.options || []).map(o => o.text).join('. '), { speed: 'normal' }), { quiet: true, ic: 'ear' }) : null));
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
