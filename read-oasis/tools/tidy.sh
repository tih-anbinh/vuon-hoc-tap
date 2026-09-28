#!/bin/sh
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-28
# Move everything that must not be pushed out of the shippable tree into ./bak/ (mirroring paths),
# and delete pure build junk. Idempotent; safe to run before every push.
set -e
cd "$(dirname "$0")/.."
ts=$(date +%Y%m%d_%H%M%S)
moved=0
# 1) nested bak/ folders anywhere except the top-level one
find . -path ./bak -prune -o -type d -name bak -print | while read -r d; do
  dest="bak/$(dirname "$d" | sed 's#^\./##')"; mkdir -p "$dest"
  for f in "$d"/*; do [ -e "$f" ] && mv "$f" "$dest/"; done; rmdir "$d"
  echo "moved $d/* -> $dest/"
done
# 2) stray *.bak files, agent scratch, generators not part of the runtime
find . -path ./bak -prune -o -type f \( -name '*.bak' -o -name '*.orig' -o -name '*~' -o -name '_tmp*' \) -print | while read -r f; do
  dest="bak/$(dirname "$f" | sed 's#^\./##')"; mkdir -p "$dest"; mv "$f" "$dest/$(basename "$f").$ts"; echo "moved $f -> $dest/"
done
for f in BATCH_NOTES.md tools/generate_year1_collection.py lexicon_additions.json; do
  if [ -e "$f" ]; then dest="bak/$(dirname "$f" | sed 's#^\.$##')"; mkdir -p "bak/$(dirname "$f")"; mv "$f" "bak/$f.$ts"; echo "moved $f -> bak/$f.$ts"; fi
done
# 3) build junk: delete (regenerable)
find . -path ./bak -prune -o -type d -name __pycache__ -print -exec rm -rf {} + 2>/dev/null || true
find . -path ./bak -prune -o -type f -name '*.pyc' -delete 2>/dev/null || true
echo "tidy done"
