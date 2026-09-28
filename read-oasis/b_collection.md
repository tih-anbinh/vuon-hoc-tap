# Read Oasis — Library Collection Brief (Year 1)

Author: Huy Tran · Cadence Design Systems Vietnam · huytran@cadence.com · Created: 2026-09-27
For: a content-authoring agent producing original English books for the Read Oasis child reader.
Owner/approver: the parent. Nothing you produce is published; it enters the pipeline as `DRAFT`.

---

## 0. The one-paragraph version

Write **original** short English books as JSON files that pass `python3 tools/validate_content.py` with
zero errors, following the schema in §4 exactly. Target the child's **first 12 months**: mostly bands
A–C and D–J, a smaller set of K–P read-alouds, all four reading modes, fiction and nonfiction, with
comprehension questions that cannot be answered from pictures alone and that cite the page(s) that
prove the answer. Deliver files into `content/books/` (and optional SVGs into `content/images/`) with
`"status": "DRAFT"`, plus a short `BATCH_NOTES.md`. Do not invent facts, do not copy or adapt any
existing book, character, or leveling system, and do not claim any book is "approved".

---

## 1. Hard rules (a violation rejects the whole batch)

1. **Original only.** No retellings, translations, paraphrases, or "inspired by" versions of published
   books, fairy tales with recognisable plots, TV/film/game characters, or brand names. Public-domain
   folk tales are also excluded (we want text the child has never seen anywhere else — transfer checks
   depend on that). `rights.original` must be `true` and truthful.
2. **`"status": "DRAFT"` and all three `review.*_approved` flags `false`.** You never publish.
3. **Every factual claim in nonfiction has a checkable source** (URL or citation to a primary/reliable
   source: RHS, NASA, national museums, university extension pages, Britannica, peer-reviewed simplified
   sources). Mark `"reviewed": false` — the parent flips it after checking. No source → no claim.
4. **Essential text is text.** Never put story words, labels, or instructions inside an SVG.
5. **No medical, diet, safety, religious, or political instruction** in child-facing text. No fear
   content (death, injury, abandonment) for bands A–J.
6. **Levels A–Z are Read Oasis internal labels.** Do not reference Lexile, Fountas & Pinnell, DRA,
   Oxford levels, grades, or ages anywhere in the JSON.
7. **A `decodable` book must genuinely be decodable** (§6). Short sentences are not enough.
8. **Every closed question must be unanswerable from the illustration alone** and must cite
   `evidence_page_ids` that actually contain the answer.
9. **Names/IDs**: `book_id` pattern `ro-<level lowercase>-<3 digits>`, e.g. `ro-c-004`. Check
   `content/books/` and do not reuse an existing id. Start numbering at `010` per level to leave room.
10. **Run the validator before delivering.** A batch with validator errors is returned unread.

---

## 2. Year-1 target set (planning guide, not a quota to pad)

Total target: **~48 books** in two waves. Quality beats count; if a book is weak, drop it.

### Wave 1 — Months 1–6: habit, comfort, foundations (~28 books)

| Band | Mode | Count | Genre split | Purpose |
|---|---|---|---|---|
| A–C | `shared_reading` | 8 | 6 fiction / 2 nonfiction | Parent+child; who/what/where, simple retell, 1 new word per book |
| A–C | `decodable` | 6 | fiction | Phonics sequence in §6, steps 1–4 |
| A–C | `independent_reading` | 4 | 3 fiction / 1 nonfiction | First solo reads; very high repetition, 1 idea per page |
| D–J | `read_aloud` | 6 | 3 fiction / 3 nonfiction | Rich language above decoding level; listening comprehension, cause/effect, sequence |
| D–J | `shared_reading` | 4 | 2 / 2 | Bridge to independent |

### Wave 2 — Months 7–12: transfer and deeper understanding (~20 books)

| Band | Mode | Count | Genre split | Purpose |
|---|---|---|---|---|
| A–C | `decodable` | 4 | fiction | Phonics steps 5–7 |
| D–J | `independent_reading` | 6 | 3 / 3 | Main idea, cause/effect, evidence-finding |
| D–J | `read_aloud` **paired texts** | 4 (2 pairs) | 1 fiction + 1 nonfiction on the same topic per pair | Compare texts (`compare` skill) — add `"pair_id"` |
| K–P | `read_aloud` | 4 | 2 / 2 | Paragraph-level meaning, inference with evidence, summary |
| any | **unseen-check texts** | 2 | 1 / 1 | Flag `"reserved_for_unseen_check": true` — parent uses these only for transfer checks |

Recurring original characters are welcome (they build comfort): **Mo** (small round yellow bird,
curious, no speech bubbles), **Sam** (child, blue shirt, practical), **Pip** (draft exists; reserved).
You may add up to 3 new recurring characters; describe each in `BATCH_NOTES.md` (name, look, personality)
so the illustrator can keep them consistent.

Topics (rotate; child interests unknown yet): home & family routines, animals & habitats, weather &
seasons, plants & growing, simple machines & how things work, food & cooking (no nutrition advice),
neighbourhood & helpers, water/rivers/sea, sky & space (nonfiction), friendship & sharing, making &
building, sounds & music. Include some Vietnamese-context-friendly settings (rice fields, markets, rain
season, motorbikes as background) without stereotypes; keep text English.

---

## 3. Band writing guide (text difficulty; keep concept difficulty and picture support separate)

| Band | Words/page | Pages | Sentence shape | Vocabulary | Comprehension moves |
|---|---|---|---|---|---|
| A–C | 3–10 | 5–8 | One simple sentence per page; strong repetition; present tense | Concrete, high-frequency; ≤2 new content words per book | `explicit_detail`, `sequence` (first/last), `expression` (retell) |
| D–J | 15–45 | 8–12 | 2–4 sentences per page; some compound sentences; dialogue allowed | 3–5 new words with in-text support; `vocabulary` entries required | + `cause_effect`, `main_idea`, `word_knowledge`, simple `inference` |
| K–P | 50–110 | 10–14 | Short paragraphs; varied openings; past tense OK | 5–8 new words; figurative language sparingly | + `inference` with evidence, `summary`, `compare` (pairs) |

`difficulty` field: rate `text`, `conceptual`, `visual_support` independently (`low|medium|high`). A book
with easy words about an abstract idea is `text: low, conceptual: medium/high`.

Every book needs an `off_screen_prompt` (draw / tell someone / find something at home) and, for
`read_aloud`/`shared_reading`, 2–4 `parent_prompts` (open questions; at least one "why" or "how do you know").

---

## 4. File format (schema v1)

One JSON file per book: `content/books/<book_id>.json`, UTF-8, 2-space indent, LF line endings.
Unknown extra fields are allowed but ignored; the fields below are validated.

```jsonc
{
  "schema_version": 1,
  "book_id": "ro-c-010",                 // ^[a-z0-9][a-z0-9_-]{1,63}$ ; pattern ro-<level>-<nnn>
  "revision": 1,
  "status": "DRAFT",                     // always DRAFT from you
  "title": "The Little Red Boat",
  "language": "en",
  "level": "C",                          // single letter A-Z
  "reading_mode": "shared_reading",      // read_aloud | shared_reading | decodable | independent_reading
  "topic": "water",                      // short lowercase tag from §2 list
  "genre": "fiction",                    // fiction | nonfiction
  "learning_objectives": ["Retell three events in order", "Explain why the boat stopped"],
  "prerequisite_skills": [],             // phonics pattern ids (decodable only) - see §6
  "target_phonics": [],                  // phonics pattern ids (decodable only)
  "irregular_words": [],                 // sight words allowed outside patterns (decodable only)
  "difficulty": { "text": "low", "conceptual": "low", "visual_support": "high" },
  "rights": {
    "text_author": "<agent name/model> for Read Oasis (original)",
    "text_license": "family-use, all rights reserved",
    "media_license": "family-use, original SVG",
    "original": true
  },
  "pair_id": null,                       // optional: same string on both books of a paired set
  "reserved_for_unseen_check": false,    // optional
  "parent_prompts": ["Before reading: ...", "After page 3: ...", "After reading: ..."],
  "pages": [
    {
      "page_id": "p01",                  // p01..pNN, unique
      "text": "Mo sees a red boat.",     // real text; may include ? ! , . ' only
      "image_asset": "images/ro-c-010-p01.svg",   // OPTIONAL. If present the file MUST exist.
      "image_alt": "Mo stands on a wooden dock looking at a small red boat.",  // required with image
      "image_provenance": "original SVG by <agent>, 2026-10-01",              // required with image
      "illustration_brief": "Dock, calm blue water, red boat with one white sail, Mo on the left.", // if you do NOT supply an SVG
      "audio_script": "Mo sees a red boat.",      // usually = text; write out numerals/abbreviations
      "timing_segments": [],             // leave empty
      "vocabulary": [                    // 0-2 per page; required somewhere in D-J+ books
        { "word": "dock", "definition": "A place by the water where boats stop.", "example": "The boat waits at the dock." }
      ]
    }
  ],
  "quiz": [                              // 3-5 questions; see §5
    {
      "question_id": "q01",
      "skill": "explicit_detail",        // see enum below
      "difficulty": "easy",              // easy | medium | hard
      "prompt": "What does Mo see?",
      "options": [ { "id": "boat", "text": "A red boat" }, { "id": "kite", "text": "A red kite" }, { "id": "fish", "text": "A big fish" } ],
      "correct_option_id": "boat",
      "evidence_page_ids": ["p01"],
      "explanation": "Page 1 says: Mo sees a red boat.",
      "distractors_reviewed": true       // you assert you checked no distractor is also correct
    },
    {
      "question_id": "q04",
      "skill": "expression",
      "difficulty": "easy",
      "response_type": "open",           // open questions: no options, need a rubric, never auto-graded
      "prompt": "Tell a grown-up what happened first, next, and last.",
      "rubric": "not yet: names a picture only; with support: two events with prompting; independent: three events in order in own words",
      "explanation": "A retell in order shows the child followed the story, not just the pictures."
    }
  ],
  "activities": [                        // 1-3; see §5.3
    { "activity_id": "a01", "type": "sequence_events", "skill": "sequence", "prompt": "Put the story in order.",
      "items": [ { "id": "s1", "text": "Mo sees the boat.", "page_id": "p01" }, { "id": "s2", "text": "The boat stops.", "page_id": "p04" }, { "id": "s3", "text": "Mo pushes the boat.", "page_id": "p06" } ],
      "correct_order": ["s1", "s2", "s3"] },
    { "activity_id": "a02", "type": "discussion", "skill": "listening_comprehension", "prompts": ["Why did the boat stop?", "What would you do?"] }
  ],
  "factual_claims": [                    // REQUIRED for nonfiction; omit for fiction
    { "claim": "Boats float because they push water out of the way.", "source": "https://... (name of source)", "reviewed": false }
  ],
  "off_screen_prompt": "Float a spoon and a cup in a bowl of water. Which one sinks? Tell someone.",
  "review": { "content_approved": false, "media_approved": false, "parent_approved": false }
}
```

**Enums**
- `skill`: `listening_comprehension`, `decoding`, `word_knowledge`, `fluency`, `explicit_detail`,
  `sequence`, `cause_effect`, `main_idea`, `inference`, `compare`, `summary`, `knowledge`, `expression`
- `activities[].type`: `sequence_events`, `match_pairs`, `word_to_meaning`, `image_to_sentence`,
  `choose_evidence`, `build_summary`, `discussion` (the reader currently renders `sequence_events`,
  `word_to_meaning`/`match_pairs`, `choose_evidence`, `discussion`; others are stored for later)
- asset paths: `^(images|audio)/[a-z0-9][a-z0-9._-]*\.(svg|png|jpg|jpeg|webp|mp3|ogg|wav|m4a)$`

---

## 5. Question and activity quality bar

### 5.1 Mix per book
- A–C: 3 questions = 2 closed (`explicit_detail`, `sequence` or `cause_effect`) + 1 open retell.
- D–J: 4 questions = 3 closed (include one `main_idea` or `inference`) + 1 open.
- K–P: 5 questions = 4 closed (include `inference` + `summary`/`compare`) + 1 open.
- Nonfiction: at least one `word_knowledge` question on a vocabulary word **in context**.

### 5.2 Closed questions
- The answer must require the **text**. Test: cover the words, look at the picture — if the answer is
  still obvious, rewrite the question or the distractors.
- 3 options (2 for A–C is acceptable). Distractors are plausible, same length/grammar as the key, never
  silly, never partially correct, never "all/none of the above".
- `evidence_page_ids`: the page(s) whose text proves the answer. For `main_idea` cite first + last page.
- `explanation`: one or two sentences that quote or point to the page text ("Page 3 says…").
- Vary the position of the correct answer (the app shuffles anyway, but keep JSON honest).
- No trick wording, negatives ("Which is NOT…"), or double questions.

### 5.3 Activities
- `sequence_events`: 3 items (A–C) or 4 items (D–J+), each with `page_id`; `correct_order` lists every id once.
- `word_to_meaning`: 3–4 pairs; `right` is a child-friendly definition (≤ 8 words).
- `choose_evidence`: a `claim` that is true in the book plus `correct_page_ids` (1–2 pages) — the child
  picks the page that shows it.
- `discussion`: 2–3 open prompts for the grown-up.

### 5.4 Open questions
- One per book, `response_type: "open"`, always with a 3-level `rubric` written as
  `not yet: …; with support: …; independent: …`. Never set `auto_grade`.

---

## 6. Decodable books

Phonics ids currently recognised by the checker (`tools/validate_content.py`, `content/phonics_lexicon.json`):
`cvc_short_a`, `cvc_short_i`, `cvc_short_o`, `cvc_short_e`, `cvc_short_u`, `vc_short`,
`double_final_consonant`.

Year-1 sequence (one step per book, cumulative):
1. `cvc_short_a` → 2. `cvc_short_i` → 3. `cvc_short_o` → 4. `cvc_short_e` → 5. `cvc_short_u` →
6. `double_final_consonant` (ll/ss/ff/zz) → 7. review book mixing all short vowels.

Rules:
- `target_phonics` = this book's new pattern; `prerequisite_skills` = earlier steps used.
- `irregular_words`: only high-frequency sight words (`the, a, is, on, in, it, and, of, to, has, not,
  I, you, said, was, we, see, go, no, my`). Max 6 per book, and each must appear in the story at least twice.
- Every other word in `pages[].text` must fit a declared pattern. Run the validator; it lists words
  needing review under `[C03] warn`. Either fix the text or justify each flagged word in `BATCH_NOTES.md`.
- If you need a new pattern (e.g. `digraph_sh`), add its word list to a file `lexicon_additions.json`
  in the same shape as `phonics_lexicon.json` and describe the rule; do not edit the main lexicon.
- Illustrations for decodables must **not** give away the words (no picture of a "pot" on the page that
  says "pot" if that is the target word being decoded — show the scene, not the noun).

---

## 7. Illustrations (choose one per book)

**Option A — deliver SVG** (`content/images/<book_id>-pNN.svg`), one per page:
- Must include `viewBox`, `<title>` and `<desc>` as the first children, `role="img"`.
- Forbidden: `<script>`, `on*=` attributes, external `href`/`xlink:href`, `<image>`, `<foreignObject>`,
  CSS `@import`, fonts. Self-contained shapes only.
- No text elements for story content. Decorative letters are also disallowed.
- Strokes ≥ 3 px at a 400×300 viewBox; simple flat shapes; one clear subject; calm palette
  (see `tools/gen_svgs.py` for the house palette and the Mo/Sam character drawings — reuse them).
- Same character must look the same on every page and across books.
- Keep files < 40 KB.

**Option B — deliver briefs**: omit `image_asset`/`image_alt`/`image_provenance` and put a one-sentence
`illustration_brief` on each page. The parent will have SVGs drawn later. This is fine for Wave 1.

Never mix: a page has either a valid `image_asset` **and** alt + provenance, or none of the three.

---

## 8. Delivery layout and checklist

```
content/books/ro-<l>-<nnn>.json        one per book, status DRAFT
content/images/ro-<l>-<nnn>-pNN.svg    only if Option A
lexicon_additions.json                 only if new phonics patterns
BATCH_NOTES.md                         see below
```

`BATCH_NOTES.md` must contain:
1. Table: `book_id | title | level | mode | genre | pages | wave | pair_id | topic`.
2. New recurring characters (look + personality) if any.
3. Decodability justifications for any `[C03] warn` words you kept.
4. Nonfiction source list (one line per claim: book_id, claim, source, why it is reliable).
5. Validator output pasted verbatim: `python3 tools/validate_content.py` (expect `0 error(s)`).
6. Anything you were unsure about, so the parent can review it first.

Self-check before sending (all must be true):
- [ ] `python3 tools/validate_content.py` → `0 error(s)` for every file (warnings only for C03 decodables).
- [ ] Each closed question fails the "picture-only" test in §5.2.
- [ ] Each `evidence_page_ids` page really contains the answer text.
- [ ] Word counts per page within band (§3); total new vocabulary within band.
- [ ] No brand names, existing characters, known plots, holidays tied to a religion, or fear content (A–J).
- [ ] `status: DRAFT`; all `review` flags `false`; `rights.original: true`.
- [ ] Nonfiction: every claim has a real source; `reviewed: false`.
- [ ] IDs unique against `content/books/` (`grep -h '"book_id"' content/books/*.json`).

---

## 9. What happens after delivery

Parent runs the pipeline in `parent.html → Content studio` (schema → content review → media review →
parent approval), or edits the JSON status directly, then runs
`python3 tools/validate_content.py --index && python3 tools/build_single_file.py`. Only then does a book
reach the child library. Rejections come back as `DRAFT` with a note; expect a revision round.

Reference examples that pass today: `content/books/ro-a-001.json` (shared A, fiction),
`ro-b-001.json` (decodable B), `ro-d-001.json` (independent D, nonfiction with sources).
