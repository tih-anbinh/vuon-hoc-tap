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
  - `draft`: **1213**
  - `blocked_source_review`: **77** (source `review_required` / quarantined)
  - `not_teachable_as_standalone`: **53** (proper names / titles)
  - `editorially_approved`: **60** (hand-authored, sense-verified)
- Idempotent: re-running the builder produces byte-identical output (verified by
  `test_enrichment_is_idempotent`).
- Validator: all 7 fail-closed gates **PASS** (exit 0).

## Per-letter disposition coverage

| Letter | Total | Approved | Draft | Blocked (source) | Not teachable |
|:------:|------:|---------:|------:|-----------------:|--------------:|
| A | 71 | 2 | 64 | 2 | 3 |
| B | 108 | 11 | 89 | 5 | 3 |
| C | 107 | 5 | 89 | 11 | 2 |
| D | 56 | 3 | 48 | 2 | 3 |
| E | 49 | 5 | 39 | 3 | 2 |
| F | 78 | 2 | 63 | 11 | 2 |
| G | 53 | 1 | 48 | 2 | 2 |
| H | 69 | 5 | 59 | 1 | 4 |
| I | 29 | 1 | 28 | 0 | 0 |
| J | 20 | 1 | 13 | 1 | 5 |
| K | 20 | 1 | 15 | 2 | 2 |
| L | 58 | 0 | 49 | 7 | 2 |
| M | 79 | 4 | 63 | 5 | 7 |
| N | 32 | 2 | 29 | 0 | 1 |
| O | 34 | 1 | 32 | 0 | 1 |
| P | 91 | 0 | 85 | 3 | 3 |
| Q | 9 | 0 | 9 | 0 | 0 |
| R | 42 | 2 | 33 | 5 | 2 |
| S | 178 | 9 | 156 | 8 | 5 |
| T | 101 | 2 | 90 | 8 | 1 |
| U | 18 | 2 | 16 | 0 | 0 |
| V | 9 | 0 | 8 | 0 | 1 |
| W | 76 | 0 | 74 | 1 | 1 |
| X | 1 | 0 | 1 | 0 | 0 |
| Y | 11 | 1 | 10 | 0 | 0 |
| Z | 4 | 0 | 3 | 0 | 1 |
| **All** | **1403** | **60** | **1213** | **77** | **53** |

Every letter has full disposition coverage (`Total = Approved + Draft + Blocked +
Not teachable` in every row).

## The 60 approved words

Approved words come from two authoring batches, both hand-written and
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

- **1213 draft words** have full disposition but no teaching content yet. They
  require human authoring before they can appear in a child's garden.
- **Batch-2 words are not yet book-mapped.** They power the standalone garden
  games now; they will auto-map into a reader only when a published book page
  uses them. Book-mapping coverage below is unchanged (still 14 / 92).
- **77 words** remain `blocked_source_review` pending editorial resolution of the
  source layer's grammatical / thematic uncertainty.
- **Automatic publication remains disabled by design.** Only editor-authored,
  approved words are child-facing; parent confirmation adds a second human gate.
