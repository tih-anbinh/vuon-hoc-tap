<!--
Author: Huy Tran
Company: Cadence Design Systems Vietnam
Email: huytran@cadence.com
Created: 2026-09-29
-->
# Vocabulary Garden — Test Report

All results below are **actual** command output captured on 2026-09-29 on Windows
(Python 3.14 at `AppData/Local/Python/pythoncore-3.14-64/python.exe`, Node
v24.14.1). Nothing here is simulated. Working directory: `read-oasis/`.

> Node 24 requires the glob form `node --test "test/*.test.mjs"`; the bare
> `node --test test/` form fails with `MODULE_NOT_FOUND`.

## Summary

| Gate | Command | Result | Exit |
|------|---------|--------|:----:|
| JS unit tests (all) | `node --test "test/*.test.mjs"` | **34 pass, 0 fail** | 0 |
| Vocab fail-closed validator | `python tools/vocab/validate_vocab.py` | **7/7 gates PASS** | 0 |
| Vocab pipeline (Python) | `python -m unittest test/test_vocab_pipeline.py` | **5 tests OK** | 0 |
| All Python tests | `python -m unittest discover -s test -p "test_*.py"` | **32 tests OK** | 0 |
| Content publication gate + index | `python tools/validate_content.py --index` | **43 books, 0 errors, 1 warning** | 0 |
| Browser E2E (Playwright / Chromium) | `npx playwright test` | **10 pass, 0 fail** | 0 |

## JS unit tests

```
$ node --test "test/*.test.mjs"
ℹ tests 34
ℹ pass 34
ℹ fail 0
```

New vocabulary coverage in `test/vocab-progress.test.mjs` (10 tests):

- empty store carries a `vocab_progress` section at the current store version
- `recordVocabEvidence` is idempotent under repeat / double-click / refresh
- unknown evidence types are rejected, never fabricated
- support level is **derived** from evidence, not asserted
- recording evidence updates the derived support level
- spaced review scheduling surfaces only due words
- summary reports levels, encountered, and due counts
- migrate v1 → current is **non-destructive** and adds `vocab_progress`
- `rebuildVocabWords` reconstructs counts **idempotently** from the ledger
- `mergeStores` de-duplicates the vocab ledger — **offline sync never
  double-counts**

The 24 pre-existing tests (schema Gate A/B/C, progress-store Gates D/R/L) continue
to pass unchanged.

## Vocab fail-closed validator

```
$ python tools/vocab/validate_vocab.py
Vocabulary Garden validator
  source records         : 1403
  enrichment entries     : 1403
  dispositions           : {'blocked_source_review': 77, 'draft': 1259, 'editorially_approved': 14, 'not_teachable_as_standalone': 53}
  authored (approved)    : 14

  [PASS] Every source record has exactly one enrichment entry with one valid disposition
  [PASS] No quarantined / review_required record is approved or published
  [PASS] Every entry + vocab manifest pins the immutable source PDF sha256
  [PASS] Proper names / titles are not_teachable_as_standalone
  [PASS] Only approved/published entries carry teaching content; others are empty
  [PASS] Book-page mappings reference only approved entries and pin book/page/hash
  [PASS] Manifest disposition_counts match recomputed counts

RESULT: ALL GATES PASS
```
Exit code: 0.

## Vocab pipeline (Python)

```
$ python -m unittest test/test_vocab_pipeline.py
Ran 5 tests in ~1.5s
OK
```

Covers, against the real source lexicon and real generators:

- validator passes on committed artifacts;
- every source record has exactly one disposition;
- no quarantined record is approved;
- **enrichment never mutates the source lexicon** (byte-identical before/after);
- **enrichment is idempotent** (byte-identical output across two runs into
  throwaway temp dirs).

## Content publication gate

```
$ python tools/validate_content.py --index
43 publishable book(s); 0 error(s); 1 warning(s)
wrote content/index.json with 43 PUBLISHED book(s) (drafts excluded)
stamped sw.js VERSION=ro-2a6c163583b1-085bcc76
```
Exit code: 0. Existing reading content validates unchanged; the service worker
VERSION is re-stamped to include the new `src/vocab-garden.mjs` shell asset.

## Backward compatibility

- Existing books validate with **0 errors** whether or not vocabulary content is
  present.
- The kid app shows the Vocabulary Garden entry **only** when the manifest reports
  ≥1 approved/published entry; if vocabulary content is absent or fails to load,
  reading is unaffected (the garden probe is wrapped in try/catch).
- Progress store migration v1 → v2 is non-destructive (proven by test).

## Not run / out of scope

- No browser end-to-end automation was run in this environment; the kid and
  parent UIs were verified by module syntax checks (`node --check`) and unit
  tests, not by a headless browser. Manual smoke testing in a browser is
  recommended before release.
- Audio synthesis / pronunciation media generation is unchanged and out of scope
  for this feature; approved entries currently carry text teaching content only.
