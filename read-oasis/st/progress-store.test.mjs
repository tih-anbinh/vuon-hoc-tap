// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
// Gate D (D01, D04-D06) + R01/R04 + L02-L04 logic tests. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressStore, MemoryStorage, STORE_KEY, evidenceSummary, suggestLevelChange, validateBackup, checksum } from '../src/progress-store.mjs';

const fresh = () => { const s = new ProgressStore(new MemoryStorage()); s.load(); return s; };

test('R01: page position persists per book revision and survives reload', () => {
  const mem = new MemoryStorage(); const s = new ProgressStore(mem); s.load();
  s.setPage('ro-a-001', 1, 3);
  const s2 = new ProgressStore(mem); s2.load();
  assert.equal(s2.bookProgress('ro-a-001', 1).page_index, 3);
  assert.equal(s2.lastOpened().book_id, 'ro-a-001');
});
test('D01: reward ledger is idempotent under repeat/double-click/replay', () => {
  const s = fresh();
  const k = { bookId: 'ro-a-001', revision: 1, activity: 'quiz_first_try', questionId: 'q01', cycle: 0 };
  assert.equal(s.award(k).granted, true);
  assert.equal(s.award(k).granted, false);
  assert.equal(s.award(k).reason, 'duplicate');
  assert.equal(s.totalStars(), 1);
  assert.equal(s.award({ ...k, cycle: 1 }).granted, true, 'new cycle may award again (configurable policy)');
  s.setSettings({ rewards_enabled: false }); assert.equal(s.award({ ...k, cycle: 2 }).reason, 'rewards_disabled');
});
test('R04: wrong then right is not a first attempt', () => {
  const s = fresh();
  const a1 = s.recordAttempt({ bookId: 'b', revision: 1, questionId: 'q1', skill: 'explicit_detail', optionId: 'x', correct: false, cycle: 0 });
  const a2 = s.recordAttempt({ bookId: 'b', revision: 1, questionId: 'q1', skill: 'explicit_detail', optionId: 'y', correct: true, cycle: 0 });
  assert.equal(a1.first_attempt, true); assert.equal(a2.first_attempt, false);
  const a3 = s.recordAttempt({ bookId: 'b', revision: 1, questionId: 'q1', skill: 'explicit_detail', optionId: 'y', correct: true, cycle: 1 });
  assert.equal(a3.first_attempt, true, 'new cycle is a new first attempt');
});
test('D04: export/import on a clean profile restores everything without duplicates', () => {
  const a = fresh(); a.setSettings({ story_font_px: 30, theme: 'cream' }); a.setPage('ro-a-001', 1, 2);
  a.award({ bookId: 'ro-a-001', revision: 1, activity: 'read_complete', cycle: 1 }); a.addObservation({ text: 'retold two events', rubric: 'with_support' });
  const backup = a.exportBackup();
  const b = fresh(); const r = b.importBackup(backup); assert.ok(r.ok, r.reason);
  assert.equal(b.data.settings.story_font_px, 30); assert.equal(b.data.ledger.length, 1); assert.equal(b.data.observations.length, 1); assert.equal(b.bookProgress('ro-a-001', 1).page_index, 2);
  const r2 = b.importBackup(backup); assert.ok(r2.ok); assert.equal(b.data.ledger.length, 1, 'no duplicate on re-import'); assert.equal(r2.merged.ledger_added, 0);
});
test('D05: corrupt / incompatible / tampered import leaves existing data intact', () => {
  const s = fresh(); s.award({ bookId: 'x', revision: 1, activity: 'read_complete', cycle: 1 });
  const before = JSON.stringify(s.data);
  assert.equal(s.importBackup('{not json').ok, false);
  assert.equal(s.importBackup(JSON.stringify({ format: 'other' })).ok, false);
  const good = JSON.parse(s.exportBackup()); good.store_version = 99; assert.match(s.importBackup(JSON.stringify(good)).reason, /incompatible/);
  const tam = JSON.parse(s.exportBackup()); tam.data.ledger.push({ key: 'forged', stars: 100 }); assert.match(s.importBackup(JSON.stringify(tam)).reason, /checksum/);
  const bad = JSON.parse(s.exportBackup()); bad.data.ledger = [{ nokey: 1 }]; bad.checksum = checksum(JSON.stringify(bad.data)); assert.match(s.importBackup(JSON.stringify(bad)).reason, /ledger/);
  assert.equal(JSON.stringify(s.data), before);
});
test('D06: newer book revision keeps prior revision history', () => {
  const s = fresh(); s.setPage('ro-a-001', 1, 4); s.completeRead('ro-a-001', 1);
  const p2 = s.bookProgress('ro-a-001', 2);
  assert.equal(p2.page_index, 0); assert.equal(p2.migrated_from_revision, 1);
  assert.equal(s.bookProgress('ro-a-001', 1).completed_reads, 1, 'history intact');
});
test('store: corrupt localStorage is preserved as .corrupt copy, not overwritten silently', () => {
  const mem = new MemoryStorage(); mem.setItem(STORE_KEY, '{{{'); const s = new ProgressStore(mem); s.load();
  assert.ok([...mem.m.keys()].some(k => k.startsWith(STORE_KEY + '.corrupt.')));
});
test('L03: evidence summary separates practice from unseen and counts support', () => {
  const s = fresh();
  s.recordAttempt({ bookId: 'b', revision: 1, questionId: 'q1', skill: 'inference', optionId: 'a', correct: true, cycle: 0, supportUsed: { audio: true } });
  s.recordAttempt({ bookId: 'unseen', revision: 0, questionId: 'u1', skill: 'inference', optionId: null, correct: false, cycle: 0, unseen: true });
  const ev = evidenceSummary(s.data);
  assert.equal(ev.practice_attempts, 1); assert.equal(ev.unseen_attempts, 1);
  assert.equal(ev.practice_by_skill.inference.with_support, 1); assert.equal(ev.unseen_by_skill.inference.total, 1);
});
test('L02/L04: level suggestion needs multi-book multi-day evidence; parent decision updates only its track', () => {
  const s = fresh(); s.setSettings({ independent_track_band: 'A-C', read_aloud_track_band: 'D-J' });
  const books = [{ book_id: 'b1', reading_mode: 'independent_reading' }, { book_id: 'b2', reading_mode: 'independent_reading' }, { book_id: 'b3', reading_mode: 'decodable' }];
  assert.equal(suggestLevelChange(s.data, books, 'independent'), null);
  let day = 0;
  for (const b of books) for (let q = 0; q < 3; q++) { const a = s.recordAttempt({ bookId: b.book_id, revision: 1, questionId: 'q' + q, skill: 'explicit_detail', optionId: 'x', correct: true, cycle: 0 }); a.at = `2026-09-0${++day}T10:00:00Z`; }
  const sg = suggestLevelChange(s.data, books, 'independent');
  assert.ok(sg && sg.to === 'D-J' && sg.direction === 'up');
  assert.equal(suggestLevelChange(s.data, books, 'read_aloud'), null, 'other track unaffected');
  const rec = s.suggestLevel(sg); s.decideSuggestion(rec.id, 'rejected');
  assert.equal(s.data.settings.independent_track_band, 'A-C'); assert.equal(s.data.level_suggestions[0].decision, 'rejected');
  const rec2 = s.suggestLevel(sg); s.decideSuggestion(rec2.id, 'accepted');
  assert.equal(s.data.settings.independent_track_band, 'D-J'); assert.equal(s.data.settings.read_aloud_track_band, 'D-J'); assert.equal(s.data.level_suggestions.length, 2, 'history kept');
});
test('backup validator rejects newer store versions and missing sections', () => {
  assert.equal(validateBackup({ format: 'read-oasis-backup', store_version: 1, data: {}, checksum: checksum('{}') }).ok, false);
});
