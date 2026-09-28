#!/bin/sh
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-27
# Run every check that works without Node, then build dist/. Exit non-zero on any failure.
set -e
cd "$(dirname "$0")/.."
echo "== JS bracket/import sanity";   python3 tools/js_bracket_check.py
echo "== Content gate + index";       python3 tools/validate_content.py --index
echo "== Gate A unit tests";          python3 test/test_validate_content.py 2>&1 | tail -3
echo "== A03 contrast";               python3 tools/contrast_check.py | tail -1
echo "== Single-file build";          python3 tools/build_single_file.py
echo "== dist sanity"
for f in dist/index.html dist/parent.html; do
  if grep -qE '^import \{|^export |type="module"' "$f"; then echo "FAIL: module syntax left in $f"; exit 1; fi
  grep -q '__RO_BUNDLE__' "$f" || { echo "FAIL: bundle missing in $f"; exit 1; }
  echo "OK   $f ($(wc -c < "$f") bytes)"
done
if command -v node >/dev/null 2>&1; then echo "== node --test"; node --test test/; else echo "== node --test: NOT RUN (node not installed)"; fi
