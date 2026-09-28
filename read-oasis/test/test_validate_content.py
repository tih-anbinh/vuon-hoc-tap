#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-27
"""Gate A tests against tools/validate_content.py (the CLI publication gate).
Run: python3 -m unittest test/test_validate_content.py -v
Mirrors test/schema.test.mjs so Gate A has executed evidence even without Node."""
import copy
import json
import os
import sys
import unittest

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import validate_content as vc  # noqa: E402

CONTENT = os.path.join(ROOT, 'content')


def load(fn):
    with open(os.path.join(CONTENT, 'books', fn), encoding='utf-8') as f:
        return json.load(f)


with open(os.path.join(CONTENT, 'phonics_lexicon.json'), encoding='utf-8') as f:
    LEX = {k: v for k, v in json.load(f).items() if not k.startswith('_')}
EXISTS = lambda rel: os.path.isfile(os.path.join(CONTENT, rel))
NOASSET = lambda rel: True


def codes(book, exists=NOASSET):
    errs, _ = vc.validate(book, exists, LEX)
    return [c for c, _, _ in errs]


class GateA(unittest.TestCase):
    def test_c01_all_bundled_books_validate(self):
        for fn in sorted(os.listdir(os.path.join(CONTENT, 'books'))):
            if fn.endswith('.json'):
                errs, _ = vc.validate(load(fn), EXISTS, LEX)
                self.assertEqual(errs, [], fn)

    def test_c01_duplicate_page_id(self):
        b = load('ro-a-001.json'); b['pages'][1]['page_id'] = 'p01'
        self.assertIn('C01', codes(b))

    def test_c01_duplicate_question_id(self):
        b = load('ro-a-001.json'); b['quiz'][1]['question_id'] = 'q01'
        self.assertIn('C01', codes(b))

    def test_c01_unsupported_level(self):
        b = load('ro-a-001.json'); b['level'] = 'AA'
        self.assertIn('C01', codes(b))

    def test_c01_invalid_answer_id(self):
        b = load('ro-a-001.json'); b['quiz'][0]['correct_option_id'] = 'nope'
        self.assertIn('C01', codes(b))

    def test_c01_broken_media_path(self):
        b = load('ro-a-001.json'); b['pages'][0]['image_asset'] = 'images/missing.svg'
        self.assertIn('C01', codes(b, EXISTS))

    def test_c01_unverified_timing_blocks(self):
        b = load('ro-a-001.json'); b['pages'][0]['timing_segments'] = [{'start': 0, 'end': 1}]
        self.assertIn('C01', codes(b))
        b['pages'][0]['timing_verified'] = True
        self.assertEqual(codes(b), [])

    def test_c02_published_requires_all_approvals(self):
        b = load('ro-a-001.json'); b['review']['parent_approved'] = False
        self.assertIn('C02', codes(b))

    def test_c03_decodability_flags_and_requires_review(self):
        b = load('ro-b-001.json')
        _, warns = vc.validate(b, NOASSET, LEX)
        self.assertTrue(any('lid' in m for _, _, m in warns))
        b['review']['decodability_reviewed'] = False
        self.assertIn('C03', codes(b))
        c = load('ro-b-001.json'); c['target_phonics'] = []
        self.assertIn('C03', codes(c))

    def test_c04_evidence_rules(self):
        b = load('ro-a-001.json'); b['quiz'][0]['evidence_page_ids'] = []
        self.assertIn('C04', codes(b))
        c = load('ro-a-001.json'); c['quiz'][0]['evidence_page_ids'] = ['p99']
        self.assertIn('C04', codes(c))
        d = load('ro-a-001.json'); d['quiz'][0]['distractors_reviewed'] = False
        self.assertIn('C04', codes(d))

    def test_c05_sources_provenance_originality(self):
        b = load('ro-d-001.json'); b['factual_claims'][0]['reviewed'] = False
        self.assertIn('C05', codes(b))
        c = load('ro-d-001.json'); del c['factual_claims']
        self.assertIn('C05', codes(c))
        d = load('ro-a-001.json'); del d['pages'][0]['image_provenance']
        self.assertIn('C05', codes(d))
        e = load('ro-a-001.json'); e['rights']['original'] = False
        self.assertIn('C05', codes(e))

    def test_c05_svg_assets_are_safe_and_described(self):
        img_dir = os.path.join(CONTENT, 'images')
        for fn in os.listdir(img_dir):
            self.assertEqual(vc.check_svg(os.path.join(img_dir, fn)), [], fn)
        bad = os.path.join(ROOT, 'test', '_tmp_bad.svg')
        with open(bad, 'w', encoding='utf-8') as f:
            f.write('<svg viewBox="0 0 1 1" onload="x()"><script>1</script></svg>')
        try:
            self.assertTrue(vc.check_svg(bad))
        finally:
            os.remove(bad)

    def test_c02_index_lists_only_publishable(self):
        with open(os.path.join(CONTENT, 'index.json'), encoding='utf-8') as f:
            idx = json.load(f)
        ids = {b['book_id'] for b in idx['books']}
        self.assertNotIn('ro-a-002', ids)
        for m in idx['books']:
            with open(os.path.join(CONTENT, m['file']), encoding='utf-8') as f:
                b = json.load(f)
            rv = b['review']
            self.assertEqual(b['status'], 'PUBLISHED')
            self.assertTrue(rv['content_approved'] and rv['media_approved'] and rv['parent_approved'])
            self.assertEqual(vc.sha256(os.path.join(CONTENT, m['file'])), m['sha256'], 'index hash stale; rerun --index')


if __name__ == '__main__':
    unittest.main()
