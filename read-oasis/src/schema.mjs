// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
//
// Read Oasis book schema v1 + validator (Gate A: C01, C03, C04, C05).
// Pure module: no DOM, no I/O. Mirrors tools/validate_content.py (CLI gate).

export const SCHEMA_VERSION = 1;
export const LEVELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const BANDS = { 'A-C': 'ABC', 'D-J': 'DEFGHIJ', 'K-P': 'KLMNOP', 'Q-Z': 'QRSTUVWXYZ' };
export const READING_MODES = ['read_aloud', 'shared_reading', 'decodable', 'independent_reading'];
export const STATUSES = ['DRAFT', 'SCHEMA_VALIDATED', 'CONTENT_REVIEW', 'MEDIA_REVIEW', 'PARENT_APPROVED', 'PUBLISHED'];
export const SKILLS = [
  'listening_comprehension', 'decoding', 'word_knowledge', 'fluency',
  'explicit_detail', 'sequence', 'cause_effect', 'main_idea', 'inference', 'compare', 'summary',
  'knowledge', 'expression',
];
export const STRANDS = [
  'oral_language', 'decoding', 'word_knowledge', 'fluency', 'comprehension', 'knowledge', 'expression',
];
export const SKILL_TO_STRAND = {
  listening_comprehension: 'oral_language', decoding: 'decoding', word_knowledge: 'word_knowledge',
  fluency: 'fluency', explicit_detail: 'comprehension', sequence: 'comprehension',
  cause_effect: 'comprehension', main_idea: 'comprehension', inference: 'comprehension',
  compare: 'comprehension', summary: 'comprehension', knowledge: 'knowledge', expression: 'expression',
};
export const ACTIVITY_TYPES = ['sequence_events', 'match_pairs', 'word_to_meaning', 'image_to_sentence', 'choose_evidence', 'build_summary', 'discussion'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];

export function bandOf(level) {
  for (const [name, letters] of Object.entries(BANDS)) if (letters.includes(level)) return name;
  return null;
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const ASSET_RE = /^(images|audio)\/[a-z0-9][a-z0-9._-]*\.(svg|png|jpg|jpeg|webp|mp3|ogg|wav|m4a)$/;

function isStr(v) { return typeof v === 'string' && v.length > 0; }
function isArr(v) { return Array.isArray(v); }

/**
 * Validate a book object. Returns { ok, errors:[{code,path,msg}], warnings:[...] }.
 * `opts.assetExists(path) -> bool` (optional) enables broken-media-path checks.
 * `opts.phonicsLexicon` (optional) { pattern: [words] } used for C03 decodability.
 */
export function validateBook(book, opts = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, path, msg) => errors.push({ code, path, msg });
  const warn = (code, path, msg) => warnings.push({ code, path, msg });

  if (!book || typeof book !== 'object') { err('C01', '', 'book is not an object'); return { ok: false, errors, warnings }; }

  // --- top-level scalars
  if (book.schema_version !== SCHEMA_VERSION) err('C01', 'schema_version', `expected ${SCHEMA_VERSION}`);
  if (!isStr(book.book_id) || !ID_RE.test(book.book_id)) err('C01', 'book_id', 'missing or invalid id');
  if (!Number.isInteger(book.revision) || book.revision < 1) err('C01', 'revision', 'must be integer >= 1');
  if (!STATUSES.includes(book.status)) err('C01', 'status', `must be one of ${STATUSES.join('|')}`);
  if (!isStr(book.title)) err('C01', 'title', 'required');
  if (!isStr(book.language)) err('C01', 'language', 'required');
  if (!LEVELS.includes(book.level)) err('C01', 'level', 'unsupported level (A-Z internal labels only)');
  if (!READING_MODES.includes(book.reading_mode)) err('C01', 'reading_mode', `must be one of ${READING_MODES.join('|')}`);
  if (!isStr(book.topic)) err('C01', 'topic', 'required');
  if (!['fiction', 'nonfiction'].includes(book.genre)) err('C01', 'genre', 'must be fiction|nonfiction');
  if (!isArr(book.learning_objectives) || book.learning_objectives.length === 0) err('C01', 'learning_objectives', 'at least one required');
  if (!isArr(book.prerequisite_skills)) err('C01', 'prerequisite_skills', 'must be an array');
  if (!isArr(book.target_phonics)) err('C01', 'target_phonics', 'must be an array');
  if (!isArr(book.irregular_words)) err('C01', 'irregular_words', 'must be an array (may be empty)');
  if (!book.difficulty || typeof book.difficulty !== 'object') err('C01', 'difficulty', 'required {text, conceptual, visual_support}');
  else for (const k of ['text', 'conceptual', 'visual_support']) {
    if (!['low', 'medium', 'high'].includes(book.difficulty[k])) err('C01', `difficulty.${k}`, 'must be low|medium|high');
  }

  // --- rights / provenance (C05)
  const rights = book.rights;
  if (!rights || typeof rights !== 'object') err('C05', 'rights', 'required {text_author, text_license, media_license, original}');
  else {
    if (!isStr(rights.text_author)) err('C05', 'rights.text_author', 'required');
    if (!isStr(rights.text_license)) err('C05', 'rights.text_license', 'required');
    if (rights.original !== true) err('C05', 'rights.original', 'only original content is accepted (must be true)');
  }

  // --- pages
  const pageIds = new Set();
  if (!isArr(book.pages) || book.pages.length === 0) err('C01', 'pages', 'at least one page required');
  else book.pages.forEach((p, i) => {
    const path = `pages[${i}]`;
    if (!isStr(p.page_id) || !ID_RE.test(p.page_id)) err('C01', `${path}.page_id`, 'missing or invalid');
    else if (pageIds.has(p.page_id)) err('C01', `${path}.page_id`, `duplicate page_id ${p.page_id}`);
    else pageIds.add(p.page_id);
    if (typeof p.text !== 'string') err('C01', `${path}.text`, 'text must be a string (HTML text, never baked into images)');
    if (p.image_asset != null) {
      if (!ASSET_RE.test(p.image_asset)) err('C01', `${path}.image_asset`, 'invalid asset path');
      else if (opts.assetExists && !opts.assetExists(p.image_asset)) err('C01', `${path}.image_asset`, `broken media path ${p.image_asset}`);
      if (!isStr(p.image_alt) && p.image_decorative !== true) err('C01', `${path}.image_alt`, 'meaningful image needs alt text (or image_decorative:true)');
      if (!isStr(p.image_provenance)) err('C05', `${path}.image_provenance`, 'media provenance required');
    }
    if (p.audio_asset != null) {
      if (!ASSET_RE.test(p.audio_asset)) err('C01', `${path}.audio_asset`, 'invalid asset path');
      else if (opts.assetExists && !opts.assetExists(p.audio_asset)) err('C01', `${path}.audio_asset`, `broken media path ${p.audio_asset}`);
      if (!isStr(p.audio_script)) err('C01', `${path}.audio_script`, 'audio_script required when audio present');
    }
    if (p.audio_slow_asset != null) {
      if (!ASSET_RE.test(p.audio_slow_asset)) err('C01', `${path}.audio_slow_asset`, 'invalid asset path');
      else if (opts.assetExists && !opts.assetExists(p.audio_slow_asset)) err('C01', `${path}.audio_slow_asset`, `broken media path ${p.audio_slow_asset}`);
    }
    if (p.timing_segments != null) {
      if (!isArr(p.timing_segments)) err('C01', `${path}.timing_segments`, 'must be an array');
      else if (p.timing_segments.length > 0 && p.timing_verified !== true) {
        err('C01', `${path}.timing_verified`, 'timing_segments present but not verified; highlighting would be unsafe');
      }
    }
    if (isArr(p.vocabulary)) p.vocabulary.forEach((v, j) => {
      if (!isStr(v.word) || !isStr(v.definition)) err('C01', `${path}.vocabulary[${j}]`, 'word and definition required');
      for (const k of ['audio_asset', 'audio_slow_asset', 'audio_us_asset']) if (v[k] != null) {
        if (!ASSET_RE.test(v[k])) err('C01', `${path}.vocabulary[${j}].${k}`, 'invalid asset path');
        else if (opts.assetExists && !opts.assetExists(v[k])) err('C01', `${path}.vocabulary[${j}].${k}`, `broken media path ${v[k]}`);
      }
    });
  });

  // --- quiz (C01 + C04)
  const qIds = new Set();
  if (!isArr(book.quiz)) err('C01', 'quiz', 'must be an array');
  else book.quiz.forEach((q, i) => {
    const path = `quiz[${i}]`;
    if (!isStr(q.question_id) || !ID_RE.test(q.question_id)) err('C01', `${path}.question_id`, 'missing or invalid');
    else if (qIds.has(q.question_id)) err('C01', `${path}.question_id`, `duplicate question_id ${q.question_id}`);
    else qIds.add(q.question_id);
    if (!SKILLS.includes(q.skill)) err('C01', `${path}.skill`, `unknown skill ${q.skill}`);
    if (!DIFFICULTIES.includes(q.difficulty)) err('C01', `${path}.difficulty`, 'must be easy|medium|hard');
    if (!isStr(q.prompt)) err('C01', `${path}.prompt`, 'required');
    if (!isStr(q.explanation)) err('C01', `${path}.explanation`, 'required');
    const open = q.response_type === 'open';
    if (!open) {
      if (!isArr(q.options) || q.options.length < 2) err('C01', `${path}.options`, 'at least two options');
      else {
        const optIds = new Set();
        q.options.forEach((o, j) => {
          if (!isStr(o.id)) err('C01', `${path}.options[${j}].id`, 'required');
          else if (optIds.has(o.id)) err('C01', `${path}.options[${j}].id`, 'duplicate option id');
          else optIds.add(o.id);
          if (!isStr(o.text)) err('C01', `${path}.options[${j}].text`, 'required');
        });
        if (!optIds.has(q.correct_option_id)) err('C01', `${path}.correct_option_id`, 'does not match any option id');
      }
      if (!isArr(q.evidence_page_ids) || q.evidence_page_ids.length === 0) err('C04', `${path}.evidence_page_ids`, 'closed-form question must cite at least one page');
      else q.evidence_page_ids.forEach(pid => { if (!pageIds.has(pid)) err('C04', `${path}.evidence_page_ids`, `unknown page ${pid}`); });
      if (q.distractors_reviewed !== true) err('C04', `${path}.distractors_reviewed`, 'human review must confirm distractors are not also correct');
    } else {
      if (!isStr(q.rubric)) err('C01', `${path}.rubric`, 'open question needs a human-review rubric');
      if (q.auto_grade === true) err('C01', `${path}.auto_grade`, 'open-ended answers must not be auto-graded');
    }
  });

  // --- activities (optional)
  if (book.activities != null) {
    if (!isArr(book.activities)) err('C01', 'activities', 'must be an array');
    else book.activities.forEach((a, i) => {
      const path = `activities[${i}]`;
      if (!isStr(a.activity_id)) err('C01', `${path}.activity_id`, 'required');
      if (!ACTIVITY_TYPES.includes(a.type)) err('C01', `${path}.type`, `unknown activity type ${a.type}`);
      if (!SKILLS.includes(a.skill)) err('C01', `${path}.skill`, 'unknown skill');
      if (a.type === 'sequence_events') {
        if (!isArr(a.items) || a.items.length < 2) err('C01', `${path}.items`, 'sequence needs >= 2 items');
        else a.items.forEach((it, j) => {
          if (!isStr(it.id) || !isStr(it.text)) err('C01', `${path}.items[${j}]`, 'id and text required');
          if (it.page_id && !pageIds.has(it.page_id)) err('C04', `${path}.items[${j}].page_id`, 'unknown page');
        });
        if (!isArr(a.correct_order) || a.correct_order.length !== (a.items || []).length) err('C01', `${path}.correct_order`, 'must list every item id once');
      }
      if (a.type === 'match_pairs' || a.type === 'word_to_meaning') {
        if (!isArr(a.pairs) || a.pairs.length < 2) err('C01', `${path}.pairs`, 'needs >= 2 pairs');
        else a.pairs.forEach((pr, j) => { if (!isStr(pr.left) || !isStr(pr.right)) err('C01', `${path}.pairs[${j}]`, 'left/right required'); });
      }
      if (a.type === 'choose_evidence') {
        if (!isStr(a.claim)) err('C01', `${path}.claim`, 'required');
        if (!isArr(a.correct_page_ids) || !a.correct_page_ids.every(p => pageIds.has(p))) err('C04', `${path}.correct_page_ids`, 'must reference known pages');
      }
      if (a.type === 'discussion' && (!isArr(a.prompts) || !a.prompts.length)) err('C01', `${path}.prompts`, 'required');
    });
  }

  // --- nonfiction sources (C05)
  if (book.genre === 'nonfiction') {
    if (!isArr(book.factual_claims) || book.factual_claims.length === 0) err('C05', 'factual_claims', 'nonfiction needs reviewed factual claims');
    else book.factual_claims.forEach((c, i) => {
      if (!isStr(c.claim) || !isStr(c.source)) err('C05', `factual_claims[${i}]`, 'claim and source required');
      if (book.status !== 'DRAFT' && c.reviewed !== true) err('C05', `factual_claims[${i}].reviewed`, 'claim not reviewed');
    });
  }

  // --- review block (C02 relies on this)
  const rv = book.review;
  if (!rv || typeof rv !== 'object') err('C01', 'review', 'required');
  else {
    for (const k of ['content_approved', 'media_approved', 'parent_approved']) if (typeof rv[k] !== 'boolean') err('C01', `review.${k}`, 'boolean required');
    if (book.status === 'PUBLISHED' && !(rv.content_approved && rv.media_approved && rv.parent_approved)) {
      err('C02', 'status', 'PUBLISHED requires all three approvals');
    }
    if (book.status === 'PUBLISHED' && !isStr(rv.published_at)) err('C02', 'review.published_at', 'timestamp required');
  }

  // --- decodability (C03)
  if (book.reading_mode === 'decodable' && errors.length === 0) {
    const d = checkDecodability(book, opts.phonicsLexicon || {});
    if (!book.target_phonics.length) err('C03', 'target_phonics', 'decodable book must declare taught patterns');
    if (d.unsupported.length) warn('C03', 'pages', `words not covered by declared patterns/irregular list (human review): ${d.unsupported.join(', ')}`);
    if (book.status !== 'DRAFT' && d.unsupported.length && book.review?.decodability_reviewed !== true) err('C03', 'review.decodability_reviewed', 'unsupported words present and not human-reviewed');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Token-level decodability check. Heuristic only; flags words for human review. */
export function checkDecodability(book, lexicon = {}) {
  const allowed = new Set();
  for (const pat of book.target_phonics || []) for (const w of lexicon[pat] || []) allowed.add(w.toLowerCase());
  for (const pat of book.prerequisite_skills || []) for (const w of lexicon[pat] || []) allowed.add(w.toLowerCase());
  for (const w of book.irregular_words || []) allowed.add(w.toLowerCase());
  const seen = new Set(); const unsupported = [];
  for (const p of book.pages || []) {
    for (const raw of (p.text || '').split(/\s+/)) {
      const w = raw.toLowerCase().replace(/[^a-z']/g, '');
      if (!w || seen.has(w)) continue;
      seen.add(w);
      // Plural / 3rd-person -s on a decodable stem (naps, sits) is accepted: it is taught alongside CVC.
      const stem = w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : null;
      const ok = allowed.has(w) || matchesPattern(w, book.target_phonics, book.prerequisite_skills)
        || (stem && (allowed.has(stem) || matchesPattern(stem, book.target_phonics, book.prerequisite_skills)));
      if (!ok) unsupported.push(w);
    }
  }
  return { unsupported, checked: seen.size };
}

// Minimal explicit pattern grammar: "cvc_short_a" etc. Anything unknown -> not matched (forces review).
const PATTERN_RULES = {
  cvc_short_a: /^[bcdfghjklmnprstvwz]a[bdgmnptx]$/,
  cvc_short_i: /^[bcdfghjklmnprstvwz]i[bdgmnptx]$/,
  cvc_short_o: /^[bcdfghjklmnprstvwz]o[bdgmnptx]$/,
  cvc_short_e: /^[bcdfghjklmnprstvwz]e[bdgmnptx]$/,
  cvc_short_u: /^[bcdfghjklmnprstvwz]u[bdgmnptx]$/,
  vc_short: /^[aeiou][bdgmnptx]$/,
  double_final_consonant: /^[bcdfghjklmnprstvwz][aeiou](ll|ss|ff|zz)$/,
};
function matchesPattern(word, ...lists) {
  for (const list of lists) for (const pat of list || []) { const re = PATTERN_RULES[pat]; if (re && re.test(word)) return true; }
  return false;
}

/** C02: only fully approved, PUBLISHED revisions are visible in the child library. */
export function isPublishable(book) {
  return book?.status === 'PUBLISHED' && book.review?.content_approved === true
    && book.review?.media_approved === true && book.review?.parent_approved === true;
}

/** Content pipeline transitions (parent-only UI enforces who may call). */
export function nextStatus(book, action) {
  const s = book.status;
  const T = {
    validate: { from: ['DRAFT'], to: 'SCHEMA_VALIDATED', guard: b => validateBook(b).ok },
    submit_content: { from: ['SCHEMA_VALIDATED'], to: 'CONTENT_REVIEW' },
    approve_content: { from: ['CONTENT_REVIEW'], to: 'MEDIA_REVIEW', set: { content_approved: true } },
    approve_media: { from: ['MEDIA_REVIEW'], to: 'PARENT_APPROVED', set: { media_approved: true } },
    approve_parent: { from: ['PARENT_APPROVED'], to: 'PUBLISHED', set: { parent_approved: true, published_at: 'now' } },
    reject: { from: STATUSES.filter(x => x !== 'DRAFT'), to: 'DRAFT', reset: true },
  };
  const t = T[action];
  if (!t || !t.from.includes(s)) return { ok: false, reason: `cannot ${action} from ${s}` };
  if (t.guard && !t.guard(book)) return { ok: false, reason: 'schema validation failed' };
  const review = { ...(book.review || {}) };
  if (t.reset) { review.content_approved = false; review.media_approved = false; review.parent_approved = false; delete review.published_at; }
  if (t.set) for (const [k, v] of Object.entries(t.set)) review[k] = v === 'now' ? new Date().toISOString() : v;
  review.history = [...(review.history || []), { action, from: s, to: t.to, at: new Date().toISOString() }];
  return { ok: true, book: { ...book, status: t.to, review } };
}
