<!--
Author: Huy Tran
Company: Cadence Design Systems Vietnam
Email: huytran@cadence.com
Created: 2026-09-29
-->
# Vocabulary Garden — Editorial Guide

This guide explains how an editor turns an eligible source record into an
**approved** word the child can learn. The pipeline is **fail-closed**: nothing
reaches a child until a human authors and approves it. Tooling never invents
teaching content, never approves anything, and never publishes automatically.

## The golden rules

1. **Original content only.** Definitions, examples, non-examples, and the
   Vietnamese support text are original Read Oasis writing. Do **not** copy from
   the source list. Source records are used only to decide *which* words are in
   scope and their part of speech / level.
2. **One sense at a time.** Author for the exact sense that appears in a real
   Read Oasis book page. If a word has multiple plausible senses, it stays
   ambiguous until you resolve it — never auto-map.
3. **Never fabricate approval or tests.** A word is `editorially_approved` only
   after a human writes and checks it. Draft is the honest default.
4. **Quarantine stays quarantined.** Records with `review_required` (grammatical
   or thematic uncertainty) are `blocked_source_review` and must be resolved at
   the source layer first — not worked around in enrichment.

## Where to author

Hand-authored senses live in the `AUTHORED` dictionary at the top of
`tools/vocab/build_enrichment.py`. Each key is the source `word_id`
(`cyle25:v2:<slug>:<pos>:<qualifier>`) and each value provides:

```python
"cyle25:v2:k:noun:kite": {
    "sense_label": "kite (noun)",
    "definition_en": "A toy that flies in the wind on a long string.",
    "explanation_vi": "Con diều — đồ chơi bay trên trời nhờ gió, có dây cầm.",
    "example_en": "We flew a red kite at the park.",
    "example_vi": "Chúng em thả một con diều màu đỏ ở công viên.",
    "nonexample_en": "A ball is not a kite; it does not fly on a string.",
    "kind": "concrete_object",   # feeds teaching.visual.kind
    "activity_templates": ["listen_find", "meaning_match", "read_in_context"],
}
```

The builder sets that entry's status to `editorially_approved` and marks the
language / sense / child-suitability reviews as `approved`. **`parent_approval`
stays `pending`** — the parent confirms in-app before a word is considered fully
published for their child.

## The authoring workflow

1. **Pick a word** that actually appears in a book page (`review_batch.py` /
   book JSON `pages[].vocabulary[]`). Confirm it has exactly one eligible source
   sense (`build_mappings.py` reports ambiguities).
2. **Write the sense** in the `AUTHORED` dict (all fields above).
3. **Rebuild enrichment**:
   ```
   python tools/vocab/build_enrichment.py
   ```
4. **Rebuild mappings** (auto-approves only single-candidate matches):
   ```
   python tools/vocab/build_mappings.py
   ```
5. **Validate** (must exit 0, all gates PASS):
   ```
   python tools/vocab/validate_vocab.py
   ```
6. **Re-stamp the service worker + index** so the new content ships offline:
   ```
   python tools/validate_content.py --index
   ```
7. **Run the tests** (must be green):
   ```
   node --test "test/*.test.mjs"
   python -m unittest test/test_vocab_pipeline.py -v
   ```

## Resolving ambiguity

When a book word maps to more than one eligible sense (e.g. *then* as adverb vs
discourse marker), it lands in `content/vocabulary/mappings/ambiguous_queue.json`.
Resolve by authoring the **specific** intended sense, then re-running the
pipeline. The single authored (approved) sense becomes the only eligible
candidate and the mapping auto-approves.

## What editors must never do

- Never edit `ref_docs/cambridge-yle-word-list-2025/lexicon.json` from enrichment
  work. If a source record is wrong, fix it at the source-ingest layer and
  re-pin the manifest hash.
- Never hand-edit `content/vocabulary/entries/*.json` or `manifest.json` — they
  are generated; edit `AUTHORED` and rebuild.
- Never hand-edit `sw.js` `VERSION` — it is stamped by `validate_content.py`.
- Never mark a word approved without writing real teaching content for it.

## Parent confirmation

In the parent dashboard **Vocabulary** tab, words the child has recalled on their
own appear under "Words to confirm". Confirming records a `parent_reviewed`
evidence event. This keeps a human in the loop for the child-facing side, mirror-
ing the editor-in-the-loop on the content side.
