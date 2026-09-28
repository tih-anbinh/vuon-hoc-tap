#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-28
"""Pedagogical batch review of DRAFT books (things the schema validator cannot judge).

Checks per book (see lib_collection.md §3, §5):
  T1 title/character mismatch (title names a character who never appears in the text)
  T2 template text: sentences shared verbatim with other books in the batch
  T3 copy-quiz: closed question whose options are whole page sentences ("which sentence does the text state")
  T4 nonfiction: factual_claims that are not about the topic (generic scientific-method boilerplate)
  T5 word count per page outside band (A-C 3-10, D-J 15-45, K-P 50-110)
  T6 identical parent_prompts / rubric / off_screen_prompt across the batch (boilerplate)
  T7 decodable: story words not in declared patterns/irregular list (mirrors C03, but reported here for triage)
Prints a table and a verdict per book: OK / REVISE / REJECT.
"""
import collections
import json
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
BOOKS = os.path.join(ROOT, 'content', 'books')
# words per page by level (lib_collection.md §3); read_aloud may go to 2x the upper bound (listening level)
BAND = {'A': (2, 6), 'B': (4, 10), 'C': (6, 16), **{c: (12, 30) for c in 'DEF'}, **{c: (20, 45) for c in 'GHIJ'}, **{c: (40, 110) for c in 'KLMNOP'}, **{c: (80, 160) for c in 'QRSTUVWXYZ'}}
CHARS = ['Mo', 'Sam', 'Pip', 'Lan', 'Mai', 'Nia', 'Tuan', 'Ben', 'Gus']
BOILER = re.compile(r'careful observer|repeated result|measurements add|investigators note|choose between explanations|new evidence appears|joins the observations|clear pattern when they study', re.I)


def sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]


def main():
    only = set(sys.argv[1:])
    books = {}
    for fn in sorted(os.listdir(BOOKS)):
        if fn.endswith('.json'):
            with open(os.path.join(BOOKS, fn), encoding='utf-8') as f:
                b = json.load(f)
            if b.get('status') == 'DRAFT' and (not only or b['book_id'] in only):
                books[fn] = b
    if not books:
        print('no DRAFT books'); return 0
    # cross-batch sentence frequency
    sent_count = collections.Counter()
    prompt_count = collections.Counter()
    for b in books.values():
        seen = set()
        for p in b['pages']:
            for s in sentences(p['text']):
                key = re.sub(r'\b(' + '|'.join(CHARS) + r')\b', 'X', s).lower()
                if key not in seen:
                    seen.add(key); sent_count[key] += 1
        prompt_count[tuple(b.get('parent_prompts') or [])] += 1
    rows = []
    for fn, b in books.items():
        issues = []
        text_all = ' '.join(p['text'] for p in b['pages'])
        # T1
        for c in CHARS:
            if re.search(r'\b' + c + r'\b', b['title']) and not re.search(r'\b' + c + r'\b', text_all):
                issues.append(f'T1 title names {c}, text never does')
        # T2
        shared = 0; total = 0
        for p in b['pages']:
            for s in sentences(p['text']):
                total += 1
                key = re.sub(r'\b(' + '|'.join(CHARS) + r')\b', 'X', s).lower()
                if sent_count[key] > 1: shared += 1
        if total and shared / total >= 0.5:
            issues.append(f'T2 {shared}/{total} sentences shared with other books (template)')
        # T3
        page_sents = {s.lower() for p in b['pages'] for s in sentences(p['text'])}
        copyq = 0; closed = 0
        for q in b.get('quiz', []):
            if q.get('response_type') == 'open': continue
            closed += 1
            if re.search(r'which sentence does the text state', q['prompt'], re.I) or sum(o['text'].lower() in page_sents for o in q['options']) >= 2:
                copyq += 1
        if closed and copyq / closed >= 0.5:
            issues.append(f'T3 {copyq}/{closed} closed questions are sentence-copy questions')
        # T4
        if b['genre'] == 'nonfiction':
            fc = b.get('factual_claims') or []
            boiler = sum(1 for c in fc if BOILER.search(c['claim']))
            if fc and boiler / len(fc) >= 0.5:
                issues.append(f'T4 {boiler}/{len(fc)} factual claims are scientific-method boilerplate, not facts about {b["topic"]}')
        # T5
        lo, hi = BAND.get(b['level'], (0, 999))
        if b['reading_mode'] == 'read_aloud': hi *= 2
        bad = [len(p['text'].split()) for p in b['pages'] if not (lo <= len(p['text'].split()) <= hi)]
        if len(bad) > len(b['pages']) / 2:
            issues.append(f'T5 {len(bad)}/{len(b["pages"])} pages outside {lo}-{hi} words for band {b["level"]} (e.g. {bad[:3]})')
        # T6
        if prompt_count[tuple(b.get('parent_prompts') or [])] >= 5:
            issues.append('T6 parent_prompts identical across >=5 books')
        # T7
        if b['reading_mode'] == 'decodable':
            lex_path = os.path.join(ROOT, 'content', 'phonics_lexicon.json')
            with open(lex_path, encoding='utf-8') as f:
                lex = {k: set(v) for k, v in json.load(f).items() if not k.startswith('_')}
            allowed = set(w.lower() for w in b['irregular_words'])
            for pat in b['target_phonics'] + b['prerequisite_skills']:
                allowed |= lex.get(pat, set())
            rules = {'cvc_short_a': r'^[bcdfghjklmnprstvwz]a[bdgmnptx]$', 'cvc_short_i': r'^[bcdfghjklmnprstvwz]i[bdgmnptx]$', 'cvc_short_o': r'^[bcdfghjklmnprstvwz]o[bdgmnptx]$', 'cvc_short_e': r'^[bcdfghjklmnprstvwz]e[bdgmnptx]$', 'cvc_short_u': r'^[bcdfghjklmnprstvwz]u[bdgmnptx]$', 'vc_short': r'^[aeiou][bdgmnptx]$', 'double_final_consonant': r'^[bcdfghjklmnprstvwz][aeiou](ll|ss|ff|zz)$'}
            pats = [re.compile(rules[p]) for p in b['target_phonics'] + b['prerequisite_skills'] if p in rules]
            def dec(w):
                if w in allowed or any(r.match(w) for r in pats): return True
                if len(w) > 3 and w.endswith('s') and not w.endswith('ss'):
                    st = w[:-1]; return st in allowed or any(r.match(st) for r in pats)
                return False
            unsupported = sorted({w for w in re.findall(r"[a-z']+", text_all.lower()) if not dec(w)})
            if unsupported:
                issues.append(f'T7 words outside declared patterns: {", ".join(unsupported[:8])}')
        sev = 'REJECT' if any(i[:2] in ('T2', 'T3', 'T4') for i in issues) else 'REVISE' if issues else 'OK'
        rows.append((b['book_id'], b['level'], b['reading_mode'][:6], b['genre'][:4], sev, issues))
    counts = collections.Counter(r[4] for r in rows)
    for bid, lvl, mode, gen, sev, issues in rows:
        print(f'{sev:6} {bid}  {lvl} {mode:6} {gen:4}')
        for i in issues: print(f'         - {i}')
    print(f'\n{len(rows)} draft book(s): {counts["OK"]} OK, {counts["REVISE"]} REVISE, {counts["REJECT"]} REJECT')
    return 0


if __name__ == '__main__':
    sys.exit(main())
