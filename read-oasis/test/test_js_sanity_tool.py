#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-27
"""Regression tests for tools/js_bracket_check.py (the no-Node sanity tool).
Run: python3 test/test_js_sanity_tool.py -v"""
import os
import sys
import unittest

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import js_bracket_check as j  # noqa: E402

# Exact shape of the 2026-09-27 bug: store.onChange(renderStars) fired inside startSession()
# before `let lastStars` was evaluated -> "Cannot access 'lastStars' before initialization".
BUGGY = """
const store = make();
store.onChange(d => { renderStars(); });
let session = store.startSession();
function renderStars() { if (lastStars != null) x(); lastStars = 1; }
let lastStars = null;
"""
FIXED = """
const store = make();
let lastStars = null;
let session = null;
store.onChange(d => { renderStars(); });
session = store.startSession();
function renderStars() { if (lastStars != null) x(); lastStars = 1; }
"""


class TdzCheck(unittest.TestCase):
    def test_detects_use_before_declaration(self):
        problems = j.tdz_check(j.strip(BUGGY))
        self.assertTrue(any('lastStars' in p for p in problems), problems)

    def test_clean_after_hoisting(self):
        self.assertEqual(j.tdz_check(j.strip(FIXED)), [])

    def test_regex_literal_does_not_break_bracket_balance(self):
        s = j.strip("const k = tok.replace(/[^a-z']/g, ''); const a = [1];")
        self.assertEqual(s.count('['), s.count(']'))


if __name__ == '__main__':
    unittest.main()
