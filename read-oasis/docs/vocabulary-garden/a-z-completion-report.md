<!--
Author: Huy Tran
Company: Cadence Design Systems Vietnam
Email: huytran@cadence.com
Created: 2026-09-29
-->
# Vocabulary Garden — A–Z Completion Report

**Scope of "complete A–Z":** every eligible source record across all 26 letters
receives **exactly one explicit disposition**. This is achieved and verified.
It does **not** mean every word has hand-authored teaching content — only a
human-authored, editor-approved batch is `editorially_approved`; the remainder is
honestly `draft` (awaiting authoring) or explicitly blocked. Nothing is
fabricated as reviewed.

## Totals (verified from generated artifacts)

- Source records processed: **1403** (all 26 letters).
- Enrichment entries produced: **1403** (one per source record).
- Dispositions:
  - `draft`: **742**
  - `blocked_source_review`: **77** (source `review_required` / quarantined)
  - `not_teachable_as_standalone`: **53** (proper names / titles)
  - `editorially_approved`: **531** (hand-authored, sense-verified)
- Idempotent: re-running the builder produces byte-identical output (verified by
  `test_enrichment_is_idempotent`).
- Validator: all 8 fail-closed gates **PASS** (exit 0).

## Per-letter disposition coverage

| Letter | Total | Approved | Draft | Blocked (source) | Not teachable |
|:------:|------:|---------:|------:|-----------------:|--------------:|
| A | 71 | 12 | 54 | 2 | 3 |
| B | 108 | 63 | 37 | 5 | 3 |
| C | 107 | 61 | 33 | 11 | 2 |
| D | 56 | 28 | 23 | 2 | 3 |
| E | 49 | 12 | 32 | 3 | 2 |
| F | 78 | 30 | 35 | 11 | 2 |
| G | 53 | 28 | 21 | 2 | 2 |
| H | 69 | 26 | 38 | 1 | 4 |
| I | 29 | 8 | 21 | 0 | 0 |
| J | 20 | 7 | 7 | 1 | 5 |
| K | 20 | 12 | 4 | 2 | 2 |
| L | 58 | 16 | 33 | 7 | 2 |
| M | 79 | 30 | 37 | 5 | 7 |
| N | 32 | 11 | 20 | 0 | 1 |
| O | 34 | 8 | 25 | 0 | 1 |
| P | 91 | 51 | 34 | 3 | 3 |
| Q | 9 | 1 | 8 | 0 | 0 |
| R | 42 | 23 | 12 | 5 | 2 |
| S | 178 | 69 | 96 | 8 | 5 |
| T | 101 | 15 | 77 | 8 | 1 |
| U | 18 | 3 | 15 | 0 | 0 |
| V | 9 | 0 | 8 | 0 | 1 |
| W | 76 | 12 | 62 | 1 | 1 |
| X | 1 | 0 | 1 | 0 | 0 |
| Y | 11 | 3 | 8 | 0 | 0 |
| Z | 4 | 2 | 1 | 0 | 1 |
| **All** | **1403** | **531** | **742** | **77** | **53** |

Every letter has full disposition coverage (`Total = Approved + Draft + Blocked +
Not teachable` in every row).

## The 531 approved words

Approved words come from four authoring batches, all hand-written and
sense-verified against a single eligible Cambridge sense:

**Batch 1 — book-anchored (14).** Words that appear in a real Read Oasis book
page *and* resolve to a single eligible Cambridge sense, so each is verified
against a book context and auto-maps into the reader:

`behind`, `cross`, `cycle`, `dry`, `empty`, `heavy`, `inside`, `kite`, `midday`,
`slow`, `still`, `tail`, `umbrella`, `under`.

**Batch 2 — core-vocabulary for standalone garden games (46 net).** High-frequency,
concrete, single-sense **Pre A1 Starters** words chosen for the garden's
teaching games (Listen & Find, Look & Say, Meaning Match, Word Detective,
Position/Action Play). These are the everyday words a very young learner needs
first and are not tied to the current 43-book set. Themes:

- **Animals:** `cat`, `dog`, `bird`, `fish`, `cow`, `duck`, `frog`, `horse`, `elephant`
- **Body:** `hand`, `arm`, `nose`, `mouth`, `ear`, `eye`, `hair`
- **Family:** `mother`, `father`, `sister`, `brother`, `baby`
- **Food & drink:** `apple`, `banana`, `milk`, `bread`, `egg`
- **Everyday objects:** `ball`, `book`, `chair`, `bed`, `sun`, `tree`
- **Colours:** `red`, `blue`, `green`, `yellow`
- **Contrast adjectives:** `big`/`small`, `happy`/`sad`, `new`/`old`
- **Actions:** `run`, `jump`, `sit`, `sing`, `sleep`

Every Batch-2 entry has an original child-friendly English definition, a
Vietnamese support gloss, an English example and Vietnamese translation, and —
where it aids contrast — a non-example. All content is original Read Oasis
writing; the source list is used only to pick *which* eligible words to teach.

**Batch 3 — core visual vocabulary with human-in-the-loop art review (46).**
High-value, concrete, single-sense words that *already have a matching SVG on
disk*, so teaching content and picture land together. Themes:

- **People & family:** `boy`, `girl`, `grandmother`, `grandfather`, `aunt`
- **Home & things:** `bedroom`, `bathroom`, `kitchen`, `door`, `window`, `table`,
  `clock`, `lamp`, `cup`, `plate`, `spoon`
- **Animals:** `bear`, `lion`, `monkey`, `rabbit`, `snake`, `goat`, `chicken`, `fish`
- **Food & drink:** `rice`, `cake`, `water`
- **Clothes:** `hat`, `shoe`, `dress`, `shirt`
- **Transport:** `car`, `bus`, `train`, `plane`, `boat`, `bike`
- **Nature:** `flower`, `moon`, `cloud`
- **Actions:** `eat`, `drink`, `read`, `draw`, `walk`, `clap`

**Honest visual gating (new this batch).** The builder can *link* an SVG by name
but cannot *see* it, so every Batch-3 entry is emitted with
`teaching.visual.status = "needs_human_review"` (not auto-"approved"). A new tool,
`tools/vocab/build_visual_review.py`, renders each word's content beside its
inline SVG with one-click verdict buttons (Đúng / Vẽ lại gấp / Vẽ lại sau / Sai
nghĩa / Trùng hình / Không cần hình) and exports a durable
`content/vocabulary/reviews/visual-review-state.json`. Those verdicts feed back
into each entry's `visual_verdict` on the next pass, flipping confirmed pictures
to `approved`. The builder also now records `missing_asset` when a linked SVG
file is absent, instead of falsely claiming it is approved.

**Data-integrity fix.** A stale `AUTHORED` key (`fish:noun:unqualified`) matched
no source record and had silently never applied; the fish noun sense is now
authored under its correct qualifier (`fish:noun:s-pl`).

**Batch 4 — SVG-having draft words, authored to land content + art together (+214).**
Every remaining `draft` word that *already had a matching SVG on disk* was
hand-authored so its teaching content and picture ship in the same pass. This is
the fast path that directly serves both "finish A–Z content" and "finish visuals
for words that truly need one." Themes span time & days, meals, family, people &
jobs (`doctor`, `nurse`, `farmer`, `pilot`, `teacher`…), fantasy, an expanded
transport / school / books / tech / music set, sports, shapes, extended colours &
materials, weather, descriptive adjectives, everyday objects, health, and a large
action-verb set (`bounce`…`race`). Dual-POS words carry BOTH senses where the
source lists them (e.g. `drive`, `fly`, `kick`, `ride`, `swim`, `wave` as
noun+verb). As with Batch 3, each Batch-4 entry is emitted with
`teaching.visual.status = "needs_human_review"` — the builder links the SVG by
name but cannot see it, so a human still confirms every picture in the review
gallery before it flips to `approved`. Content itself is child-ready and
`editorially_approved` now.

With Batch 4, approvals rose from 106 → **531** and drafts fell from 1167 → 742;
the review gallery surfaced **471** words whose art awaited a human verdict.

**Human visual verdicts applied (review loop closed).** A human worked the review
gallery and exported a durable
`content/vocabulary/reviews/visual-review-state.json` (471 verdicts). The builder
now reads that file (`load_visual_verdicts()`) and each human verdict *overrides*
the authored placeholder, so confirmed pictures flip to their real status on the
next build with zero code changes — future rounds just re-export the JSON and
re-run the builder. Result across the 531 approved entries:
**505 pictures `approved`** (457 freshly human-confirmed + earlier confirmed +
concept words), **12 `not_applicable`**, and **14 flagged for follow-up** — 1
`redraw_now` (`airport`), 2 `wrong_sense` (`balcony`, `bat`), and 11
`redraw_later` (`bridge`, `chess`, `chopsticks`, `cousin`, `friday`, `mango`,
`meatballs`, `monday`, `net`, `restaurant`, `sandwich`). The review gallery now
doubles as the redraw worklist: it surfaces only those **14** open words (plus any
never-reviewed or missing-asset ones) so fixed art gets re-confirmed in place.

## Book-page mapping coverage (verified)

- Book vocabulary occurrences examined: **92** (91 unique surface forms).
- Auto-approved mappings (exactly one eligible approved candidate): **14**.
- Ambiguous (surfaced for editorial resolution): **0** among approved candidates.
- Unmapped (inflected forms or higher-level words with no eligible base sense):
  **78**.
- Books with ≥1 approved mapping: **10 / 43**.

This is genuine fail-closed behavior: the remaining book words have no *approved*
single-sense match yet, so they are honestly left unmapped rather than guessed.

## Honest gaps (not fabricated as complete)

- **742 draft words** have full disposition but no teaching content yet. They
  require human authoring before they can appear in a child's garden.
- **14 pictures are flagged for redraw / wrong-sense** and are honestly held back
  from being called correct: 1 `redraw_now` (`airport`), 2 `wrong_sense`
  (`balcony`, `bat`), 11 `redraw_later`. Their content is child-ready and
  `editorially_approved`; only their `teaching.visual.status` gates the art. They
  remain on the review-gallery worklist until the art is fixed and re-confirmed.
  (The other 457 human-reviewed pictures are now `approved`.)
- **Batch-2 words are not yet book-mapped.** They power the standalone garden
  games now; they will auto-map into a reader only when a published book page
  uses them. Book-mapping coverage below is unchanged (still 14 / 92).
- **77 words** remain `blocked_source_review` pending editorial resolution of the
  source layer's grammatical / thematic uncertainty.
- **Automatic publication remains disabled by design.** Only editor-authored,
  approved words are child-facing; parent confirmation adds a second human gate.
