// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
// Gate A (C01-C05) unit tests. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBook, isPublishable, nextStatus, checkDecodability } from '../src/schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const load = f => JSON.parse(readFileSync(join(CONTENT, 'books', f), 'utf8'));
const lexicon = JSON.parse(readFileSync(join(CONTENT, 'phonics_lexicon.json'), 'utf8'));
const assetExists = rel => existsSync(join(CONTENT, rel));
const clone = o => JSON.parse(JSON.stringify(o));
const codes = r => r.errors.map(e => e.code);

test('C01: all bundled books validate with asset checks', () => {
  for (const f of readdirSync(join(CONTENT, 'books')).filter(x => x.endsWith('.json'))) {
    const r = validateBook(load(f), { assetExists, phonicsLexicon: lexicon });
    assert.ok(r.ok, `${f}: ${JSON.stringify(r.errors)}`);
  }
});
test('C01: duplicate page id blocks', () => { const b = clone(load('ro-a-001.json')); b.pages[1].page_id = 'p01'; assert.ok(codes(validateBook(b)).includes('C01')); });
test('C01: duplicate question id blocks', () => { const b = clone(load('ro-a-001.json')); b.quiz[1].question_id = 'q01'; assert.ok(!validateBook(b).ok); });
test('C01: unsupported level blocks', () => { const b = clone(load('ro-a-001.json')); b.level = 'AA'; assert.ok(!validateBook(b).ok); });
test('C01: invalid answer id blocks', () => { const b = clone(load('ro-a-001.json')); b.quiz[0].correct_option_id = 'nope'; assert.ok(!validateBook(b).ok); });
test('C01: broken media path blocks', () => { const b = clone(load('ro-a-001.json')); b.pages[0].image_asset = 'images/missing.svg'; assert.ok(!validateBook(b, { assetExists }).ok); assert.ok(validateBook(b).ok, 'without asset checker only path syntax is checked'); });
test('C01: unverified timing segments block (R02 guard)', () => { const b = clone(load('ro-a-001.json')); b.pages[0].timing_segments = [{ start: 0, end: 1 }]; assert.ok(!validateBook(b).ok); b.pages[0].timing_verified = true; assert.ok(validateBook(b).ok); });
test('C01: open question cannot be auto-graded', () => { const b = clone(load('ro-a-001.json')); b.quiz[3].auto_grade = true; assert.ok(!validateBook(b).ok); });
test('C02: partially approved book is not publishable; PUBLISHED without approvals fails', () => {
  const d = load('ro-a-002-draft.json'); assert.equal(isPublishable(d), false);
  const b = clone(load('ro-a-001.json')); b.review.parent_approved = false; assert.ok(codes(validateBook(b)).includes('C02')); assert.equal(isPublishable(b), false);
});
test('C02: pipeline transitions and reject-to-DRAFT reset approvals', () => {
  let b = clone(load('ro-a-002-draft.json')); b.status = 'DRAFT';
  for (const a of ['validate', 'submit_content', 'approve_content', 'approve_media', 'approve_parent']) { const r = nextStatus(b, a); assert.ok(r.ok, a + ': ' + r.reason); b = r.book; }
  assert.equal(b.status, 'PUBLISHED'); assert.ok(isPublishable(b));
  assert.equal(nextStatus(b, 'approve_parent').ok, false, 'no skipping/duplicate transitions');
  const rj = nextStatus(b, 'reject').book; assert.equal(rj.status, 'DRAFT'); assert.equal(rj.review.parent_approved, false); assert.equal(isPublishable(rj), false);
});
test('C03: decodability flags words outside taught patterns', () => {
  const b = load('ro-b-001.json');
  const d = checkDecodability(b, lexicon); assert.deepEqual(d.unsupported, ['lid']);
  const c = clone(b); c.review.decodability_reviewed = false; assert.ok(codes(validateBook(c, { phonicsLexicon: lexicon })).includes('C03'));
  const e = clone(b); e.pages[0].text = 'Sam has a giraffe.'; assert.ok(validateBook(e, { phonicsLexicon: lexicon }).warnings.some(w => w.msg.includes('giraffe')));
});
test('C04: closed question without evidence page or with unknown page blocks', () => {
  const b = clone(load('ro-a-001.json')); b.quiz[0].evidence_page_ids = []; assert.ok(codes(validateBook(b)).includes('C04'));
  const c = clone(load('ro-a-001.json')); c.quiz[0].evidence_page_ids = ['p99']; assert.ok(codes(validateBook(c)).includes('C04'));
  const d = clone(load('ro-a-001.json')); d.quiz[0].distractors_reviewed = false; assert.ok(codes(validateBook(d)).includes('C04'));
});
test('C05: nonfiction needs reviewed sources; media needs provenance; non-original rejected', () => {
  const b = clone(load('ro-d-001.json')); b.factual_claims[0].reviewed = false; assert.ok(codes(validateBook(b)).includes('C05'));
  const c = clone(load('ro-d-001.json')); delete c.factual_claims; assert.ok(codes(validateBook(c)).includes('C05'));
  const d = clone(load('ro-a-001.json')); delete d.pages[0].image_provenance; assert.ok(codes(validateBook(d)).includes('C05'));
  const e = clone(load('ro-a-001.json')); e.rights.original = false; assert.ok(codes(validateBook(e)).includes('C05'));
});
test('C02/index: content/index.json lists only publishable books', () => {
  const idx = JSON.parse(readFileSync(join(CONTENT, 'index.json'), 'utf8'));
  for (const m of idx.books) { const b = JSON.parse(readFileSync(join(CONTENT, m.file), 'utf8')); assert.ok(isPublishable(b), m.file); }
  assert.ok(!idx.books.some(m => m.book_id === 'ro-a-002'), 'draft must not be indexed');
});
