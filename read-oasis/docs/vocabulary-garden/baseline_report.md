<!--
Author: Huy Tran
Company: Cadence Design Systems Vietnam
Email: huytran@cadence.com
Created: 2026-09-29
-->
# Vocabulary Garden — Phase 0 Baseline Report

Observed facts recorded **before** any Vocabulary Garden change. Counts come from
reading the actual repository, not estimates.

Repository root: `read-oasis/`
Source lexicon repository: `ref_docs/cambridge-yle-word-list-2025/`

## 1. Environment / runners (observed)

| Tool | Version / fact |
| --- | --- |
| Node.js | v24.14.1 (present) |
| Python | 3.14.x at `C:/Users/huytran/AppData/Local/Python/pythoncore-3.14-64/python.exe` |
| Package manager | **No `package.json`** anywhere under `read-oasis/` — no npm scripts |
| JS test runner | Node built-in. Node 24 needs a glob: `node --test "test/*.test.mjs"` (bare `test/` is now read as a module path and fails with `MODULE_NOT_FOUND`) |
| Python tests | `python -m unittest` / direct execution |
| Full gate | `sh tools/check_all.sh`; per-book `sh tools/gate.sh <id>` |
| Content gate + index build + sw stamp | `python tools/validate_content.py --index` |

## 2. Baseline validation & test results (actual)

| Command | Result | Exit |
| --- | --- | --- |
| `python tools/validate_content.py` | `43 publishable book(s); 0 error(s); 1 warning(s)` | 0 |
| `node --test "test/*.test.mjs"` | `tests 24 / pass 24 / fail 0` | 0 |

The single content warning is pre-existing and unrelated to Vocabulary Garden.

## 3. Content counts (actual)

| Metric | Value |
| --- | --- |
| Book JSON files on disk | 44 |
| Published books (in `content/index.json`) | 43 |
| Non-published book files (excluded from index) | 1 (`ro-a-002-draft.json`, `CONTENT_REVIEW`) |
| Total page-vocabulary entries (published) | 92 |
| Unique vocabulary surface forms | 91 (only duplicate: `observation`) |
| Books with **no** vocabulary | 8 of 43 |
| Progress-store schema version | `STORE_VERSION = 1` (`read_oasis.store.v1`) |
| Book schema version | `SCHEMA_VERSION = 1` |
| Content index version | `index_version = 1` |

### Existing activity / quiz types

- Declared in `schema.mjs` `ACTIVITY_TYPES`: `sequence_events`, `match_pairs`,
  `word_to_meaning`, `image_to_sentence`, `choose_evidence`, `build_summary`,
  `discussion`.
- Rendered in `kid-app.mjs`: `sequence_events`, `match_pairs`/`word_to_meaning`,
  `choose_evidence`, `discussion`. (`image_to_sentence`, `build_summary` declared
  but not yet rendered.)
- Quiz: closed multiple-choice + open (rubric, no auto-grade). Reward only on
  first-attempt correct.

## 4. Source lexicon counts (actual — `lexicon.json`)

| Metric | Value |
| --- | --- |
| Total lexicon records | 1403 |
| `integration_status = eligible_after_editorial_mapping` | 1326 |
| `integration_status = quarantined` (`review_required = true`) | 77 |
| Proper nouns (`part_of_speech.normalized` contains `proper_noun`) | 51 |
| Eligible **Pre A1 Starters** records | 469 |
| Levels | Pre A1 Starters 495 · A1 Movers 398 · A2 Flyers 510 |

Record shape: `word_id`, `display_form`, `lookup_forms[]`,
`part_of_speech{normalized[],printed[]}`, `source_qualifier`,
`first_listed_level`, `listed_at_levels[]`, `variants[]`, `theme_ids[]`,
`source_occurrence_ids[]`, `review_required`, `integration_status`,
`enrichment{...}` (all fields `null` / empty / `not_authored`).

## 5. Book-vocab → eligible-lexicon match survey (actual)

Normalization: Unicode NFKC + whitespace collapse + case-fold. Against **eligible,
non-review** lexicon lookup forms only:

| Bucket | Count |
| --- | --- |
| Unique book words with exactly **one** eligible candidate (auto-suggestable) | 14 |
| Ambiguous (>1 eligible candidate) → editorial queue | 1 (`then`) |
| No eligible candidate (inflected / higher-level science words) | 76 |

Auto-suggestable 14: `behind, cross, cycle, dry, empty, heavy, inside, kite,
midday, slow, still, tail, umbrella, under`.

This confirms the fail-closed posture is real: only 14 of 91 book words can be
*suggested* automatically, and even those require editorial approval before a
mapping is stored.

## 6. Files backed up before editing

Timestamped copies in `read-oasis/bak/` (`*.20260929_095612.bak`):
`kid-app.mjs`, `parent-dashboard.mjs`, `schema.mjs`, `progress-store.mjs`,
`ui.mjs`, `sw.js`, `app.css`, `index.html`, `parent.html`,
`validate_content.py`, `build_single_file.py`.

## 7. Deviations from the prompt's assumed layout

The prompt assumed generic paths (`content/vocabulary/...`). The actual repo has
its own conventions, which are followed instead:

- Entry points are `index.html` (kid) and `parent.html` (parent) — there is no
  separate `parent.html` flow module beyond `src/parent-dashboard.mjs`.
- No `package.json`; tests run via Node's built-in runner and Python unittest.
- The service-worker `VERSION` is auto-stamped by `tools/validate_content.py`;
  it must not be edited by hand.
- Enrichment data will live under `content/vocabulary/` as the prompt suggests,
  which fits the existing `content/`-relative asset model and service worker.
