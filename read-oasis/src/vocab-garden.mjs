// Author: Huy Tran
// Email: hqt.msg@gmail.com
// Created: 2026-09-29
//
// Vocabulary Garden — companion learning area for Read Oasis (Phase 4).
// Additive: it never replaces reading. It loads only APPROVED, public-safe enrichment
// (content/vocabulary/manifest.json + per-letter shards) and the approved book-page
// mappings, on demand. If any Vocabulary Garden data is missing, the reader keeps working.
//
// All child interactions are keyboard- and touch-completable; drag has a button/list
// alternative; audio-denied still leaves every task completable; fast guessing is not
// rewarded; no voice recording is ever required.

import { h, btn, icon, toast, narrator, shuffle, loadJSON, assetUrl } from './ui.mjs';

const VOCAB_BASE = 'vocabulary/';
let manifest = null;                 // content/vocabulary/manifest.json
const shardCache = new Map();        // letter -> [entry, ...]
const entryById = new Map();         // entry_id -> entry (approved only, lazily filled)
let mappings = null;                 // approved book-page mappings

/** Load the small manifest once. Returns null (not throwing) if unavailable. */
export async function loadVocabManifest() {
  if (manifest) return manifest;
  try { manifest = await loadJSON(VOCAB_BASE + 'manifest.json'); }
  catch { manifest = null; }
  return manifest;
}

/** Load one letter shard on demand (never the whole A-Z at once). */
async function loadShard(letter) {
  if (shardCache.has(letter)) return shardCache.get(letter);
  let entries = [];
  try { entries = await loadJSON(VOCAB_BASE + 'entries/' + letter + '.json'); }
  catch { entries = []; }
  // Only teachable, approved/published senses are ever surfaced to the child.
  const usable = entries.filter(e => e.status === 'editorially_approved' || e.status === 'published');
  shardCache.set(letter, usable);
  for (const e of usable) entryById.set(e.entry_id, e);
  return usable;
}

/** Approved book-page mappings (used to build "Story Words" from finished books). */
export async function loadMappings() {
  if (mappings) return mappings;
  try { const doc = await loadJSON(VOCAB_BASE + 'mappings/book-page-mappings.json'); mappings = doc.mappings || []; }
  catch { mappings = []; }
  return mappings;
}

/** Return all approved entries (loads every shard listed in the manifest). Small by design. */
export async function loadApprovedEntries() {
  const m = await loadVocabManifest();
  if (!m) return [];
  const letters = m.shards || [];
  const all = [];
  for (const l of letters) all.push(...await loadShard(l));
  return all;
}

async function getEntry(entryId) {
  if (entryById.has(entryId)) return entryById.get(entryId);
  // entry_id form: ro-vocab:<slug>:...:r1 -> first letter of slug picks the shard.
  const slug = entryId.split(':')[1] || '';
  const letter = (slug.match(/[a-z]/) || ['other'])[0];
  await loadShard(letter);
  return entryById.get(entryId) || null;
}

// ---------- visual rendering helpers ------------------------------------------
const REPR_LABELS = {
  scene_svg: 'Picture word',
  action_svg: 'Action word',
  position_svg: 'Position word',
  concept_card: 'Idea word',
  no_visual_needed: null,
};
const REPR_ICONS = {
  scene_svg: 'image',
  action_svg: 'play',
  position_svg: 'eye',
  concept_card: 'book',
  no_visual_needed: null,
};

/** Build a visual-type badge chip for a vocabulary entry. */
function visualBadge(entry) {
  const vis = entry.teaching?.visual;
  if (!vis) return null;
  const rt = vis.representation_type || 'no_visual_needed';
  const label = REPR_LABELS[rt];
  if (!label) return null;
  const cls = rt === 'position_svg' ? 'chip accent' : rt === 'action_svg' ? 'chip primary' : 'chip';
  return h('span', { class: cls, text: label });
}

/**
 * Render a type-aware learning visual for the basket card.
 * - scene_svg / action_svg: placeholder art area (future: actual SVG asset)
 * - position_svg: structured position diagram with anchor objects
 * - concept_card: structured mini-lesson with contrast/sequence
 * - no_visual_needed: nothing
 */
function renderVisualArea(entry) {
  const vis = entry.teaching?.visual;
  if (!vis) return null;
  const rt = vis.representation_type || 'no_visual_needed';
  const t = entry.teaching || {};

  if (rt === 'position_svg') {
    // Structured position diagram with optional SVG illustration
    const anchors = vis.anchor_objects || [];
    const imgEl = vis.asset
      ? h('img', { src: assetUrl(vis.asset), alt: vis.alt || entry.headword,
                   class: 'position-illustration', loading: 'lazy', width: '400', height: '300' })
      : null;
    return h('div', { class: 'visual-position', 'aria-label': `Position: ${entry.headword}` },
      imgEl,
      h('div', { class: 'position-scene' },
        anchors.length >= 2
          ? h('div', { class: 'position-objects' },
              h('span', { class: 'position-obj', text: anchors[0] }),
              h('span', { class: 'position-label', text: entry.headword }),
              h('span', { class: 'position-obj', text: anchors[1] }))
          : h('span', { class: 'position-label', text: entry.headword })),
      t.example_en ? h('p', { class: 'position-example', text: t.example_en }) : null,
      t.nonexample_en ? h('p', { class: 'position-contrast muted', text: 'Not: ' + t.nonexample_en }) : null);
  }

  if (rt === 'concept_card') {
    // Structured concept card: show contrast pair or sequence
    const panels = [];
    if (t.example_en) panels.push(h('div', { class: 'concept-panel concept-yes' },
      h('span', { class: 'concept-icon', text: '✓' }),
      h('p', { text: t.example_en })));
    if (t.nonexample_en) panels.push(h('div', { class: 'concept-panel concept-no' },
      h('span', { class: 'concept-icon', text: '✗' }),
      h('p', { text: t.nonexample_en })));
    if (!panels.length) return null;
    return h('div', { class: 'visual-concept', 'aria-label': `Concept: ${entry.headword}` },
      ...panels);
  }

  if (rt === 'action_svg' || rt === 'scene_svg') {
    // Future: render actual SVG asset. For now: styled placeholder with icon.
    if (vis.asset) {
      return h('div', { class: 'visual-asset' },
        h('img', { src: assetUrl(vis.asset), alt: vis.alt || entry.headword,
                   loading: 'lazy', width: '400', height: '300' }));
    }
    return null; // No placeholder — text-only until assets exist
  }

  return null;
}

// ---------- rendering helpers -------------------------------------------------
// accent defaults to the narrator's current accent (parent's chosen region) — NOT a hardcoded en-GB —
// so the garden speaks with the same voice/accent the parent picked for the book reader.
function say(entry, { accent = narrator.accent } = {}) {
  const t = entry.teaching || {};
  const clips = { normal: t.pronunciation?.audio_uk || null, us: t.pronunciation?.audio_us || null };
  narrator.speak(entry.headword, { clips, accent });
}

function evidence(store, entry, type, dedupKey, occurrence = null) {
  return store.recordVocabEvidence({ entryId: entry.entry_id, wordId: entry.source_ref?.word_id, evidenceType: type, dedupKey, occurrence });
}

/** Choose an adaptive small "basket" — due reviews first, then unseen approved words. */
async function buildBasket(store, limit = 6) {
  const all = await loadApprovedEntries();
  if (!all.length) return [];
  const dueIds = new Set(store.vocabDue().map(w => w.entry_id));
  const due = all.filter(e => dueIds.has(e.entry_id));
  const fresh = shuffle(all.filter(e => !dueIds.has(e.entry_id)));
  return [...due, ...fresh].slice(0, limit);
}

// ---------- public entry point -----------------------------------------------
/**
 * Render the Vocabulary Garden home into `mount`. `ctx` provides:
 *   store, setTitle, go(route), back
 * Modes are one-task-per-screen and reuse the app's design tokens.
 */
export async function renderGarden(mount, ctx) {
  const { store, setTitle } = ctx;
  setTitle('Vocabulary Garden');
  mount.replaceChildren(h('p', { class: 'muted', text: 'Loading your words...' }));
  const m = await loadVocabManifest();
  if (!m) {
    mount.replaceChildren(h('section', { class: 'card fade' },
      h('h2', { text: 'Vocabulary Garden' }),
      h('p', { class: 'muted', text: 'No word cards are ready yet. Ask a grown-up to add some in the parent area.' }),
      h('div', { class: 'row' }, btn('Back to books', ctx.back, { primary: true, ic: 'home' }))));
    return;
  }
  const basket = await buildBasket(store);
  const summary = store.vocabProgressSummary();
  const approvedCount = (m.disposition_counts?.editorially_approved || 0) + (m.disposition_counts?.published || 0);

  const modeCard = (title, sub, ic, onclick, disabled = false) =>
    h('button', { class: 'book-tile garden-mode', onclick, disabled, 'aria-label': title + '. ' + sub },
      h('div', { class: 'cover garden-cover' }, icon(ic)),
      h('span', { class: 't', text: title }),
      h('span', { class: 'tile-invite', text: sub }));

  mount.replaceChildren(h('section', { class: 'fade' },
    h('div', { class: 'hero hero-no-art' },
      h('div', { class: 'hero-copy' },
        h('span', { class: 'hero-eyebrow', text: 'VOCABULARY GARDEN' }),
        h('h2', { text: 'Grow your words' }),
        h('p', { class: 'sub', text: basket.length ? `You have ${basket.length} word${basket.length === 1 ? '' : 's'} to explore today.` : 'No words to practise right now — read a story to find new words!' }),
        h('div', { class: 'row hero-actions' },
          basket.length ? btn('Start my word basket', () => renderBasket(mount, ctx, basket, 0), { primary: true, ic: 'play' }) : null,
          btn('Back to books', ctx.back, { quiet: true, ic: 'home' }),
          h('span', { class: 'chip accent', text: `${summary.by_support_level.independent + summary.by_support_level.used_in_new_context} words growing` })))),
    h('div', { class: 'shelf' },
      h('div', { class: 'shelf-heading' }, h('div', {}, h('span', { class: 'shelf-kicker', text: 'WAYS TO PLAY' }), h('h2', { text: 'Choose a game' }))),
      h('div', { class: 'grid stagger' },
        modeCard('My Word Basket', 'A few words at a time', 'star', () => basket.length ? renderBasket(mount, ctx, basket, 0) : toast('Read a story to fill your basket.'), !basket.length),
        modeCard('Listen & Find', 'Hear it, then choose it', 'ear', () => renderListenFind(mount, ctx)),
        modeCard('Meaning Match', 'Match word to meaning', 'check', () => renderMeaningMatch(mount, ctx)),
        modeCard('Read in Context', 'Finish the sentence', 'book', () => renderReadInContext(mount, ctx)),
        modeCard('Word Detective', 'Find words in your books', 'eye-break', () => renderWordDetective(mount, ctx)),
        modeCard('Review Garden', 'Come back to old words', 'replay', () => renderReview(mount, ctx))))));
}

// ---------- My Word Basket: a guided sequence per word ------------------------
function renderBasket(mount, ctx, basket, i) {
  const { store, setTitle } = ctx;
  if (i >= basket.length) {
    setTitle('All done');
    mount.replaceChildren(h('section', { class: 'card celebrate fade' },
      h('div', { class: 'big', text: 'Lovely work in the garden!' }),
      h('p', { class: 'muted', text: 'You explored every word in your basket.' }),
      h('div', { class: 'row' },
        btn('Play again', () => renderGarden(mount, ctx), { primary: true, ic: 'replay' }),
        btn('Back to books', ctx.back, { quiet: true, ic: 'home' }))));
    return;
  }
  const e = basket[i];
  setTitle(e.headword);
  const t = e.teaching || {};
  const vis = renderVisualArea(e);
  const badge = visualBadge(e);
  // A single learning card: hear, see meaning, see visual, then advance.
  evidence(store, e, 'listened', `basket-listen|${e.entry_id}|${new Date().toDateString()}`);
  const progress = h('span', { class: 'chip', text: `Word ${i + 1} of ${basket.length}` });
  mount.replaceChildren(h('section', { class: 'card fade vocab-learn' },
    h('div', { class: 'card-head' },
      h('b', { class: 'card-word', text: e.headword }),
      btn('', () => say(e), { primary: true, ic: 'ear', attrs: { 'aria-label': 'Say ' + e.headword } }),
      badge),
    t.definition_en ? h('p', { class: 'card-def', text: t.definition_en }) : null,
    vis,
    // For concept_card / position_svg, the visual already shows example/nonexample; skip text duplication
    !vis && t.example_en ? h('p', { class: 'muted', text: '"' + t.example_en + '"' }) : null,
    !vis && t.nonexample_en ? h('p', { class: 'muted', text: 'Not: ' + t.nonexample_en }) : null,
    vis && t.example_en && !['concept_card', 'position_svg'].includes(t.visual?.representation_type)
      ? h('p', { class: 'muted', text: '"' + t.example_en + '"' }) : null,
    t.explanation_vi ? h('p', { class: 'explain', text: t.explanation_vi }) : null,
    h('div', { class: 'row' },
      btn('Say it again', () => say(e), { ic: 'replay' }),
      btn('I know this', () => { evidence(store, e, 'recognized_in_context', `basket-know|${e.entry_id}|${new Date().toDateString()}`); store.scheduleVocabReview(e.entry_id, 2); next(); }, { primary: true, ic: 'check' }),
      btn('Next word', next, { quiet: true, ic: 'next' })),
    h('div', { class: 'row' }, progress)));
  function next() { renderBasket(mount, ctx, basket, i + 1); }
}

// ---------- Listen & Find: hear a word, pick the right meaning ----------------
async function renderListenFind(mount, ctx) {
  const { store, setTitle } = ctx;
  setTitle('Listen & Find');
  const pool = await loadApprovedEntries();
  const withDef = pool.filter(e => e.teaching?.definition_en);
  if (withDef.length < 2) return notEnough(mount, ctx);
  const target = shuffle(withDef)[0];
  const distractors = shuffle(withDef.filter(e => e.entry_id !== target.entry_id)).slice(0, Math.min(2, withDef.length - 1));
  const options = shuffle([target, ...distractors]);
  let answered = false;
  say(target);
  mount.replaceChildren(h('section', { class: 'card fade' },
    h('h2', { text: 'Listen and find' }),
    h('p', { class: 'muted', text: 'Tap the button to hear the word, then choose what it means.' }),
    h('div', { class: 'row' }, btn('Hear the word', () => say(target), { primary: true, ic: 'ear' })),
    h('div', { class: 'answers stagger' }, options.map(o =>
      btn(o.teaching.definition_en, (ev) => choose(o, ev.currentTarget), { attrs: { 'data-eid': o.entry_id } }))),
    h('div', { class: 'row' }, btn('Back', () => renderGarden(mount, ctx), { quiet: true, ic: 'back' }))));

  function choose(o, el) {
    if (answered) return; answered = true;
    const correct = o.entry_id === target.entry_id;
    el.classList.add(correct ? 'correct' : 'wrong');
    if (correct) {
      evidence(store, target, 'recognized_from_audio', `lf|${target.entry_id}|${Date.now()}`);
      store.scheduleVocabReview(target.entry_id, 3);
      toast('Yes! That is “' + target.headword + '”.');
    } else {
      toast('Good try. “' + target.headword + '” means: ' + target.teaching.definition_en);
    }
    setTimeout(() => renderListenFind(mount, ctx), 1400);
  }
}

// ---------- Meaning Match: match word to definition --------------------------
async function renderMeaningMatch(mount, ctx) {
  const { store, setTitle } = ctx;
  setTitle('Meaning Match');
  const pool = (await loadApprovedEntries()).filter(e => e.teaching?.definition_en);
  if (pool.length < 2) return notEnough(mount, ctx);
  const target = shuffle(pool)[0];
  const opts = shuffle([target, ...shuffle(pool.filter(e => e.entry_id !== target.entry_id)).slice(0, Math.min(2, pool.length - 1))]);
  let answered = false;
  mount.replaceChildren(h('section', { class: 'card fade' },
    h('h2', { text: 'Which word?' }),
    h('p', { class: 'card-def', text: target.teaching.definition_en }),
    h('div', { class: 'answers stagger' }, opts.map(o => btn(o.headword, (ev) => pick(o, ev.currentTarget), { attrs: { 'data-eid': o.entry_id } }))),
    h('div', { class: 'row' }, btn('Hear the meaning', () => narrator.speak(target.teaching.definition_en), { quiet: true, ic: 'ear' }), btn('Back', () => renderGarden(mount, ctx), { quiet: true, ic: 'back' }))));
  function pick(o, el) {
    if (answered) return; answered = true;
    const correct = o.entry_id === target.entry_id;
    el.classList.add(correct ? 'correct' : 'wrong');
    if (correct) { evidence(store, target, 'recalled_without_choices', `mm|${target.entry_id}|${Date.now()}`); store.scheduleVocabReview(target.entry_id, 4); toast('Correct!'); }
    else toast('The answer was “' + target.headword + '”.');
    setTimeout(() => renderMeaningMatch(mount, ctx), 1400);
  }
}

// ---------- Read in Context: choose the word that fits a sentence -------------
async function renderReadInContext(mount, ctx) {
  const { store, setTitle } = ctx;
  setTitle('Read in Context');
  const pool = (await loadApprovedEntries()).filter(e => e.teaching?.example_en && e.teaching.example_en.toLowerCase().includes(e.headword.toLowerCase()));
  if (pool.length < 2) return notEnough(mount, ctx);
  const target = shuffle(pool)[0];
  const re = new RegExp('\\b' + target.headword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  const blanked = target.teaching.example_en.replace(re, '____');
  const opts = shuffle([target, ...shuffle(pool.filter(e => e.entry_id !== target.entry_id)).slice(0, Math.min(2, pool.length - 1))]);
  let answered = false;
  mount.replaceChildren(h('section', { class: 'card fade' },
    h('h2', { text: 'Finish the sentence' }),
    h('p', { class: 'card-def', text: blanked }),
    h('div', { class: 'answers stagger' }, opts.map(o => btn(o.headword, (ev) => pick(o, ev.currentTarget)))),
    h('div', { class: 'row' }, btn('Back', () => renderGarden(mount, ctx), { quiet: true, ic: 'back' }))));
  function pick(o, el) {
    if (answered) return; answered = true;
    const correct = o.entry_id === target.entry_id;
    el.classList.add(correct ? 'correct' : 'wrong');
    if (correct) { evidence(store, target, 'recognized_in_context', `ric|${target.entry_id}|${Date.now()}`); store.scheduleVocabReview(target.entry_id, 4); toast('That fits! ' + target.teaching.example_en); }
    else toast('It was “' + target.headword + '”. ' + target.teaching.example_en);
    setTimeout(() => renderReadInContext(mount, ctx), 1600);
  }
}

// ---------- Word Detective: find a garden word inside a real book -------------
async function renderWordDetective(mount, ctx) {
  const { setTitle, store } = ctx;
  setTitle('Word Detective');
  const maps = await loadMappings();
  if (!maps.length) {
    mount.replaceChildren(h('section', { class: 'card fade' },
      h('h2', { text: 'Word Detective' }),
      h('p', { class: 'muted', text: 'No book words are linked yet. Read some stories first!' }),
      h('div', { class: 'row' }, btn('Back', () => renderGarden(mount, ctx), { primary: true, ic: 'back' }))));
    return;
  }
  const pick = shuffle(maps)[0];
  const entry = await getEntry(pick.entry_id);
  mount.replaceChildren(h('section', { class: 'card fade' },
    h('h2', { text: 'Be a word detective' }),
    h('p', {}, 'The word ', h('b', { text: entry ? entry.headword : pick.surface_form }), ' is hiding in a book you can read.'),
    entry?.teaching?.definition_en ? h('p', { class: 'card-def', text: entry.teaching.definition_en }) : null,
    h('p', { class: 'muted', text: `Look for it in the story “${pick.book_id}”, page ${pick.page_id}.` }),
    h('div', { class: 'row' },
      btn('I found it!', () => { if (entry) { store.recordVocabEvidence({ entryId: entry.entry_id, wordId: entry.source_ref?.word_id, evidenceType: 'recognized_in_context', dedupKey: `detective|${entry.entry_id}|${pick.book_id}|${pick.page_id}`, occurrence: { book_id: pick.book_id, page_id: pick.page_id, at: new Date().toISOString() } }); } toast('Great detective work!'); renderGarden(mount, ctx); }, { primary: true, ic: 'check' }),
      btn('Another word', () => renderWordDetective(mount, ctx), { ic: 'replay' }),
      btn('Back', () => renderGarden(mount, ctx), { quiet: true, ic: 'back' }))));
}

// ---------- Review Garden: spaced retrieval of due words ----------------------
async function renderReview(mount, ctx) {
  const { store, setTitle } = ctx;
  setTitle('Review Garden');
  const due = store.vocabDue();
  if (!due.length) {
    mount.replaceChildren(h('section', { class: 'card fade' },
      h('h2', { text: 'Review Garden' }),
      h('p', { class: 'muted', text: 'Nothing to review right now. Come back later — your words need a little rest to grow strong!' }),
      h('div', { class: 'row' }, btn('Back', () => renderGarden(mount, ctx), { primary: true, ic: 'back' }))));
    return;
  }
  const entries = [];
  for (const w of due) { const e = await getEntry(w.entry_id); if (e) entries.push(e); }
  if (!entries.length) return notEnough(mount, ctx);
  renderBasket(mount, ctx, entries.slice(0, 6), 0);
}

function notEnough(mount, ctx) {
  mount.replaceChildren(h('section', { class: 'card fade' },
    h('h2', { text: 'Not enough words yet' }),
    h('p', { class: 'muted', text: 'We need a few more approved words to play this game. Ask a grown-up to add some.' }),
    h('div', { class: 'row' }, btn('Back', () => renderGarden(mount, ctx), { primary: true, ic: 'back' }))));
}
