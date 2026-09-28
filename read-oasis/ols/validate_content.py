#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-27
"""Content gate CLI (Gate A: C01-C05) + index builder.

  python3 tools/validate_content.py            # validate every book, print report
  python3 tools/validate_content.py --index    # also write content/index.json (PUBLISHED only)
  python3 tools/validate_content.py --strict   # non-zero exit on warnings too

This mirrors src/schema.mjs (the browser/Node validator). If the two ever
disagree, tests/schema.test.mjs must be updated and both fixed together.
"""
import argparse
import hashlib
import json
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
CONTENT = os.path.join(ROOT, 'content')
BOOKS = os.path.join(CONTENT, 'books')

LEVELS = set('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
MODES = {'read_aloud', 'shared_reading', 'decodable', 'independent_reading'}
STATUSES = ['DRAFT', 'SCHEMA_VALIDATED', 'CONTENT_REVIEW', 'MEDIA_REVIEW', 'PARENT_APPROVED', 'PUBLISHED']
SKILLS = {'listening_comprehension', 'decoding', 'word_knowledge', 'fluency', 'explicit_detail', 'sequence',
          'cause_effect', 'main_idea', 'inference', 'compare', 'summary', 'knowledge', 'expression'}
ACTIVITIES = {'sequence_events', 'match_pairs', 'word_to_meaning', 'image_to_sentence', 'choose_evidence', 'build_summary', 'discussion'}
ID_RE = re.compile(r'^[a-z0-9][a-z0-9_-]{1,63}$')
ASSET_RE = re.compile(r'^(images|audio)/[a-z0-9][a-z0-9._-]*\.(svg|png|jpg|jpeg|webp|mp3|ogg|wav|m4a)$')
PATTERN_RULES = {
    'cvc_short_a': re.compile(r'^[bcdfghjklmnprstvwz]a[bdgmnptx]$'),
    'cvc_short_i': re.compile(r'^[bcdfghjklmnprstvwz]i[bdgmnptx]$'),
    'cvc_short_o': re.compile(r'^[bcdfghjklmnprstvwz]o[bdgmnptx]$'),
    'cvc_short_e': re.compile(r'^[bcdfghjklmnprstvwz]e[bdgmnptx]$'),
    'cvc_short_u': re.compile(r'^[bcdfghjklmnprstvwz]u[bdgmnptx]$'),
    'vc_short': re.compile(r'^[aeiou][bdgmnptx]$'),
    'double_final_consonant': re.compile(r'^[bcdfghjklmnprstvwz][aeiou](ll|ss|ff|zz)$'),
}
SVG_FORBIDDEN = re.compile(r'<script|\son[a-z]+\s*=|xlink:href\s*=\s*"(?!#)|\shref\s*=\s*"(?!#)|<foreignObject|<image', re.I)


def s(v):
    return isinstance(v, str) and len(v) > 0


def validate(book, asset_exists, lexicon):
    errors, warnings = [], []
    E = lambda c, p, m: errors.append((c, p, m))
    W = lambda c, p, m: warnings.append((c, p, m))
    if not isinstance(book, dict):
        E('C01', '', 'book is not an object'); return errors, warnings
    if book.get('schema_version') != 1: E('C01', 'schema_version', 'expected 1')
    if not s(book.get('book_id')) or not ID_RE.match(book['book_id']): E('C01', 'book_id', 'missing or invalid id')
    if not isinstance(book.get('revision'), int) or book['revision'] < 1: E('C01', 'revision', 'integer >= 1')
    if book.get('status') not in STATUSES: E('C01', 'status', 'invalid status')
    for k in ('title', 'language', 'topic'):
        if not s(book.get(k)): E('C01', k, 'required')
    if book.get('level') not in LEVELS: E('C01', 'level', 'unsupported level')
    if book.get('reading_mode') not in MODES: E('C01', 'reading_mode', 'invalid reading_mode')
    if book.get('genre') not in ('fiction', 'nonfiction'): E('C01', 'genre', 'fiction|nonfiction')
    if not isinstance(book.get('learning_objectives'), list) or not book['learning_objectives']: E('C01', 'learning_objectives', 'required')
    for k in ('prerequisite_skills', 'target_phonics', 'irregular_words'):
        if not isinstance(book.get(k), list): E('C01', k, 'must be array')
    d = book.get('difficulty')
    if not isinstance(d, dict): E('C01', 'difficulty', 'required')
    else:
        for k in ('text', 'conceptual', 'visual_support'):
            if d.get(k) not in ('low', 'medium', 'high'): E('C01', f'difficulty.{k}', 'low|medium|high')
    r = book.get('rights')
    if not isinstance(r, dict): E('C05', 'rights', 'required')
    else:
        for k in ('text_author', 'text_license'):
            if not s(r.get(k)): E('C05', f'rights.{k}', 'required')
        if r.get('original') is not True: E('C05', 'rights.original', 'only original content accepted')
    page_ids = set()
    pages = book.get('pages')
    if not isinstance(pages, list) or not pages: E('C01', 'pages', 'at least one page')
    else:
        for i, p in enumerate(pages):
            path = f'pages[{i}]'
            pid = p.get('page_id')
            if not s(pid) or not ID_RE.match(pid): E('C01', f'{path}.page_id', 'missing or invalid')
            elif pid in page_ids: E('C01', f'{path}.page_id', f'duplicate page_id {pid}')
            else: page_ids.add(pid)
            if not isinstance(p.get('text'), str): E('C01', f'{path}.text', 'text must be string')
            if p.get('image_asset') is not None:
                if not ASSET_RE.match(p['image_asset']): E('C01', f'{path}.image_asset', 'invalid asset path')
                elif not asset_exists(p['image_asset']): E('C01', f'{path}.image_asset', f"broken media path {p['image_asset']}")
                if not s(p.get('image_alt')) and p.get('image_decorative') is not True: E('C01', f'{path}.image_alt', 'alt required')
                if not s(p.get('image_provenance')): E('C05', f'{path}.image_provenance', 'media provenance required')
            if p.get('audio_asset') is not None:
                if not ASSET_RE.match(p['audio_asset']): E('C01', f'{path}.audio_asset', 'invalid asset path')
                elif not asset_exists(p['audio_asset']): E('C01', f'{path}.audio_asset', f"broken media path {p['audio_asset']}")
                if not s(p.get('audio_script')): E('C01', f'{path}.audio_script', 'required with audio')
            ts = p.get('timing_segments')
            if ts is not None:
                if not isinstance(ts, list): E('C01', f'{path}.timing_segments', 'must be array')
                elif ts and p.get('timing_verified') is not True: E('C01', f'{path}.timing_verified', 'timing present but unverified')
            for j, v in enumerate(p.get('vocabulary') or []):
                if not s(v.get('word')) or not s(v.get('definition')): E('C01', f'{path}.vocabulary[{j}]', 'word+definition required')
    q_ids = set()
    quiz = book.get('quiz')
    if not isinstance(quiz, list): E('C01', 'quiz', 'must be array')
    else:
        for i, q in enumerate(quiz):
            path = f'quiz[{i}]'
            qid = q.get('question_id')
            if not s(qid) or not ID_RE.match(qid): E('C01', f'{path}.question_id', 'missing or invalid')
            elif qid in q_ids: E('C01', f'{path}.question_id', f'duplicate question_id {qid}')
            else: q_ids.add(qid)
            if q.get('skill') not in SKILLS: E('C01', f'{path}.skill', 'unknown skill')
            if q.get('difficulty') not in ('easy', 'medium', 'hard'): E('C01', f'{path}.difficulty', 'easy|medium|hard')
            for k in ('prompt', 'explanation'):
                if not s(q.get(k)): E('C01', f'{path}.{k}', 'required')
            if q.get('response_type') != 'open':
                opts = q.get('options')
                if not isinstance(opts, list) or len(opts) < 2: E('C01', f'{path}.options', '>=2 options')
                else:
                    oids = set()
                    for j, o in enumerate(opts):
                        if not s(o.get('id')): E('C01', f'{path}.options[{j}].id', 'required')
                        elif o['id'] in oids: E('C01', f'{path}.options[{j}].id', 'duplicate option id')
                        else: oids.add(o['id'])
                        if not s(o.get('text')): E('C01', f'{path}.options[{j}].text', 'required')
                    if q.get('correct_option_id') not in oids: E('C01', f'{path}.correct_option_id', 'invalid answer id')
                ev = q.get('evidence_page_ids')
                if not isinstance(ev, list) or not ev: E('C04', f'{path}.evidence_page_ids', 'must cite a page')
                else:
                    for pid in ev:
                        if pid not in page_ids: E('C04', f'{path}.evidence_page_ids', f'unknown page {pid}')
                if q.get('distractors_reviewed') is not True: E('C04', f'{path}.distractors_reviewed', 'human review required')
            else:
                if not s(q.get('rubric')): E('C01', f'{path}.rubric', 'rubric required')
                if q.get('auto_grade') is True: E('C01', f'{path}.auto_grade', 'no auto-grading of open answers')
    for i, a in enumerate(book.get('activities') or []):
        path = f'activities[{i}]'
        if not s(a.get('activity_id')): E('C01', f'{path}.activity_id', 'required')
        if a.get('type') not in ACTIVITIES: E('C01', f'{path}.type', 'unknown type')
        if a.get('skill') not in SKILLS: E('C01', f'{path}.skill', 'unknown skill')
        if a.get('type') == 'sequence_events':
            items = a.get('items')
            if not isinstance(items, list) or len(items) < 2: E('C01', f'{path}.items', '>=2 items')
            else:
                for j, it in enumerate(items):
                    if not s(it.get('id')) or not s(it.get('text')): E('C01', f'{path}.items[{j}]', 'id+text')
                    if it.get('page_id') and it['page_id'] not in page_ids: E('C04', f'{path}.items[{j}].page_id', 'unknown page')
                co = a.get('correct_order')
                if not isinstance(co, list) or sorted(co) != sorted(it['id'] for it in items): E('C01', f'{path}.correct_order', 'must list each item id once')
        if a.get('type') in ('match_pairs', 'word_to_meaning'):
            prs = a.get('pairs')
            if not isinstance(prs, list) or len(prs) < 2: E('C01', f'{path}.pairs', '>=2 pairs')
            else:
                for j, pr in enumerate(prs):
                    if not s(pr.get('left')) or not s(pr.get('right')): E('C01', f'{path}.pairs[{j}]', 'left/right')
        if a.get('type') == 'choose_evidence':
            if not s(a.get('claim')): E('C01', f'{path}.claim', 'required')
            cp = a.get('correct_page_ids')
            if not isinstance(cp, list) or not cp or any(p not in page_ids for p in cp): E('C04', f'{path}.correct_page_ids', 'must reference known pages')
        if a.get('type') == 'discussion' and not a.get('prompts'): E('C01', f'{path}.prompts', 'required')
    if book.get('genre') == 'nonfiction':
        fc = book.get('factual_claims')
        if not isinstance(fc, list) or not fc: E('C05', 'factual_claims', 'nonfiction needs reviewed claims')
        else:
            for i, c in enumerate(fc):
                if not s(c.get('claim')) or not s(c.get('source')): E('C05', f'factual_claims[{i}]', 'claim+source')
                if book.get('status') != 'DRAFT' and c.get('reviewed') is not True: E('C05', f'factual_claims[{i}].reviewed', 'not reviewed')
    rv = book.get('review')
    if not isinstance(rv, dict): E('C01', 'review', 'required')
    else:
        for k in ('content_approved', 'media_approved', 'parent_approved'):
            if not isinstance(rv.get(k), bool): E('C01', f'review.{k}', 'boolean required')
        if book.get('status') == 'PUBLISHED':
            if not (rv.get('content_approved') and rv.get('media_approved') and rv.get('parent_approved')): E('C02', 'status', 'PUBLISHED requires all approvals')
            if not s(rv.get('published_at')): E('C02', 'review.published_at', 'required')
    if book.get('reading_mode') == 'decodable' and not errors:
        if not book['target_phonics']: E('C03', 'target_phonics', 'decodable book must declare taught patterns')
        allowed = set(w.lower() for w in book['irregular_words'])
        for pat in book['target_phonics'] + book['prerequisite_skills']:
            allowed.update(w.lower() for w in lexicon.get(pat, []))
        pats = [PATTERN_RULES[p] for p in book['target_phonics'] + book['prerequisite_skills'] if p in PATTERN_RULES]
        seen, unsupported = set(), []
        for p in pages:
            for raw in (p.get('text') or '').split():
                w = re.sub(r"[^a-z']", '', raw.lower())
                if not w or w in seen: continue
                seen.add(w)
                if w not in allowed and not any(rx.match(w) for rx in pats): unsupported.append(w)
        if unsupported:
            W('C03', 'pages', 'words needing human review: ' + ', '.join(unsupported))
            if book.get('status') != 'DRAFT' and rv.get('decodability_reviewed') is not True: E('C03', 'review.decodability_reviewed', 'unsupported words not human-reviewed')
    return errors, warnings


def check_svg(path):
    """C05/6.2: bundled SVG must be self-contained, no scripts/handlers/external refs, have viewBox."""
    with open(path, encoding='utf-8') as f:
        txt = f.read()
    problems = []
    if 'viewBox' not in txt: problems.append('missing viewBox')
    if SVG_FORBIDDEN.search(txt): problems.append('forbidden content (script/handler/external ref)')
    if path.startswith(os.path.join(CONTENT, 'images')) and ('<title' not in txt or '<desc' not in txt):
        problems.append('meaningful illustration missing <title>/<desc>')
    return problems


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--index', action='store_true')
    ap.add_argument('--strict', action='store_true')
    args = ap.parse_args()
    with open(os.path.join(CONTENT, 'phonics_lexicon.json'), encoding='utf-8') as f:
        lexicon = {k: v for k, v in json.load(f).items() if not k.startswith('_')}
    asset_exists = lambda rel: os.path.isfile(os.path.join(CONTENT, rel))
    total_err = total_warn = 0
    published = []
    seen_ids = {}
    for fn in sorted(os.listdir(BOOKS)):
        if not fn.endswith('.json'): continue
        fp = os.path.join(BOOKS, fn)
        try:
            with open(fp, encoding='utf-8') as f:
                book = json.load(f)
        except Exception as e:
            print(f'[C01] {fn}: unreadable JSON: {e}'); total_err += 1; continue
        errors, warnings = validate(book, asset_exists, lexicon)
        key = (book.get('book_id'), book.get('revision'))
        if key in seen_ids: errors.append(('C01', 'book_id', f'duplicate book_id/revision also in {seen_ids[key]}'))
        seen_ids[key] = fn
        for p in book.get('pages') or []:
            ia = p.get('image_asset')
            if ia and asset_exists(ia) and ia.endswith('.svg'):
                for prob in check_svg(os.path.join(CONTENT, ia)):
                    errors.append(('C05', ia, prob))
        status = 'OK' if not errors else 'FAIL'
        print(f'{status:4} {fn}  status={book.get("status")}  errors={len(errors)} warnings={len(warnings)}')
        for c, p, m in errors: print(f'     [{c}] {p}: {m}')
        for c, p, m in warnings: print(f'     [{c}] warn {p}: {m}')
        total_err += len(errors); total_warn += len(warnings)
        rv = book.get('review') or {}
        if not errors and book.get('status') == 'PUBLISHED' and rv.get('content_approved') and rv.get('media_approved') and rv.get('parent_approved'):
            published.append({
                'book_id': book['book_id'], 'revision': book['revision'], 'file': f'books/{fn}', 'title': book['title'],
                'level': book['level'], 'reading_mode': book['reading_mode'], 'topic': book['topic'], 'genre': book['genre'],
                'pages': len(book['pages']), 'sha256': sha256(fp),
                'assets': sorted({p[k] for p in book['pages'] for k in ('image_asset', 'audio_asset') if p.get(k)}),
            })
    print(f'\n{len(published)} publishable book(s); {total_err} error(s); {total_warn} warning(s)')
    if args.index:
        # content_hash covers every published book file + every referenced asset, so any content change
        # (text, SVG, approval flip) yields a new hash. sw.js derives its cache VERSION from it (see stamp_sw).
        h = hashlib.sha256()
        for b in published:
            h.update(b['sha256'].encode())
            for rel in b['assets']:
                p = os.path.join(CONTENT, rel)
                if os.path.isfile(p):
                    h.update(sha256(p).encode())
        content_hash = h.hexdigest()[:12]
        idx = {'index_version': 1, 'generated_by': 'tools/validate_content.py', 'content_hash': content_hash, 'books': published}
        with open(os.path.join(CONTENT, 'index.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(idx, f, indent=2, ensure_ascii=False); f.write('\n')
        print(f'wrote content/index.json with {len(published)} PUBLISHED book(s) (drafts excluded); content_hash={content_hash}')
        stamp_sw(content_hash)
    return 1 if total_err or (args.strict and total_warn) else 0


def stamp_sw(content_hash):
    """Rewrite the VERSION line in sw.js so returning visitors get a fresh cache whenever content
    or app code changes. Version = ro-<content_hash>-<hash of shell files>."""
    sw_path = os.path.join(ROOT, 'sw.js')
    if not os.path.isfile(sw_path):
        return
    h = hashlib.sha256()
    for rel in ('index.html', 'parent.html', 'manifest.webmanifest', 'assets/app.css',
                *sorted('src/' + f for f in os.listdir(os.path.join(ROOT, 'src')) if f.endswith('.mjs'))):
        p = os.path.join(ROOT, rel)
        if os.path.isfile(p):
            h.update(sha256(p).encode())
    version = f'ro-{content_hash}-{h.hexdigest()[:8]}'
    with open(sw_path, encoding='utf-8') as f:
        src = f.read()
    new = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", src, count=1)
    if new != src:
        with open(sw_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new)
        print(f'stamped sw.js VERSION={version}')
    else:
        print(f'sw.js VERSION unchanged ({version})')


if __name__ == '__main__':
    sys.exit(main())
