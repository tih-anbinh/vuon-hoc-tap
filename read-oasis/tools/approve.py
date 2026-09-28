#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-28
"""Parent approval CLI: move books through the pipeline from the command line (same rules as parent.html).

  python3 tools/approve.py --list                       # show every book, status, gate results
  python3 tools/approve.py ro-a-020 ro-b-020            # approve these (all three review flags) -> PUBLISHED
  python3 tools/approve.py --all-drafts                 # approve every DRAFT that passes both gates
  python3 tools/approve.py --reject ro-c-023 -m "why"   # back to DRAFT, approvals cleared, note kept
  python3 tools/approve.py --facts ro-b-020             # mark nonfiction factual_claims reviewed (after YOU checked the sources)

Refuses to publish a book that fails validate_content (C01-C05) or review_batch (T1-T7).
Nonfiction is refused until every factual claim is reviewed:true (use --facts once you have checked them).
After approving: python3 tools/validate_content.py --index && python3 tools/build_single_file.py  (or update_content.cmd)
"""
import argparse
import datetime
import json
import os
import subprocess
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
BOOKS = os.path.join(ROOT, 'content', 'books')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import validate_content as vc  # noqa: E402


def load_all():
    out = {}
    for fn in sorted(os.listdir(BOOKS)):
        if fn.endswith('.json'):
            with open(os.path.join(BOOKS, fn), encoding='utf-8') as f:
                out[fn] = json.load(f)
    return out


def save(fn, book):
    with open(os.path.join(BOOKS, fn), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(book, f, indent=2, ensure_ascii=False); f.write('\n')


def review_verdicts():
    """Run review_batch.py once and map book_id -> verdict."""
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'review_batch.py')], capture_output=True, text=True)
    v = {}
    for ln in r.stdout.splitlines():
        parts = ln.split()
        if len(parts) >= 2 and parts[0] in ('OK', 'REVISE', 'REJECT'):
            v[parts[1]] = parts[0]
    return v


def gate(book, lexicon, verdicts):
    errs, _ = vc.validate(book, lambda rel: os.path.isfile(os.path.join(ROOT, 'content', rel)), lexicon)
    problems = [f'[{c}] {p}: {m}' for c, p, m in errs]
    if verdicts.get(book['book_id'], 'OK') != 'OK':
        problems.append(f'review_batch verdict {verdicts[book["book_id"]]}')
    if book.get('genre') == 'nonfiction':
        unrev = [c['claim'][:50] for c in book.get('factual_claims', []) if not c.get('reviewed')]
        if unrev:
            problems.append(f'{len(unrev)} factual claim(s) not reviewed; check sources then run --facts {book["book_id"]}')
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--all-drafts', action='store_true')
    ap.add_argument('--reject', nargs='+', default=[])
    ap.add_argument('--facts', nargs='+', default=[])
    ap.add_argument('-m', '--message', default='')
    ap.add_argument('--reviewer', default='parent')
    args = ap.parse_args()
    with open(os.path.join(ROOT, 'content', 'phonics_lexicon.json'), encoding='utf-8') as f:
        lexicon = {k: v for k, v in json.load(f).items() if not k.startswith('_')}
    books = load_all()
    by_id = {b['book_id']: (fn, b) for fn, b in books.items()}
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    verdicts = review_verdicts()

    for bid in args.facts:
        fn, b = by_id[bid]
        for c in b.get('factual_claims', []):
            c['reviewed'] = True; c['reviewed_by'] = args.reviewer; c['reviewed_at'] = now[:10]
        save(fn, b); print(f'{bid}: {len(b.get("factual_claims", []))} factual claim(s) marked reviewed by {args.reviewer}')

    for bid in args.reject:
        fn, b = by_id[bid]
        b['status'] = 'DRAFT'; rv = b.setdefault('review', {})
        rv.update({'content_approved': False, 'media_approved': False, 'parent_approved': False}); rv.pop('published_at', None)
        rv.setdefault('history', []).append({'action': 'reject', 'at': now, 'by': args.reviewer, 'note': args.message})
        save(fn, b); print(f'{bid}: rejected -> DRAFT')

    targets = list(args.ids)
    if args.all_drafts:
        targets += [b['book_id'] for b in books.values() if b['status'] == 'DRAFT' and b['book_id'] not in targets]
    published = 0
    for bid in targets:
        if bid not in by_id:
            print(f'{bid}: not found'); continue
        fn, b = by_id[bid]
        problems = gate(b, lexicon, verdicts)
        if problems:
            print(f'{bid}: REFUSED'); [print('   ' + p) for p in problems]; continue
        rv = b.setdefault('review', {})
        rv.update({'content_approved': True, 'media_approved': True, 'parent_approved': True, 'published_at': now, 'reviewer': args.reviewer, 'review_date': now[:10]})
        rv.setdefault('history', []).append({'action': 'approve_all', 'at': now, 'by': args.reviewer, 'note': args.message})
        b['status'] = 'PUBLISHED'; save(fn, b); published += 1
        print(f'{bid}: PUBLISHED  ({b["title"]})')

    if args.list or not (targets or args.reject or args.facts):
        print(f'{"book_id":10} {"status":16} {"lvl":3} {"mode":20} {"genre":10} gate')
        for fn, b in load_all().items():
            probs = gate(b, lexicon, verdicts)
            print(f'{b["book_id"]:10} {b["status"]:16} {b["level"]:3} {b["reading_mode"]:20} {b["genre"]:10} {"ready" if not probs else "; ".join(probs)[:70]}')
    if published:
        print(f'\n{published} book(s) published. Now run: python3 tools/validate_content.py --index && python3 tools/build_single_file.py   (or update_content.cmd)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
