#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-27
"""Crude static sanity check for JS/MJS files when Node is unavailable:
strips comments/strings/template literals and verifies bracket balance and
that every `import { ... } from './x.mjs'` name is exported by that module.
Not a parser; a stopgap until `node --test` can run."""
import glob
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


def strip(s):
    # regex literals in argument position, e.g. .replace(/[^a-z']/g, '') or .split(/(\s+)/)
    s = re.sub(r'([(,=:]\s*)/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n\[])+/[gimsuy]*', r'\1/re/', s)
    s = re.sub(r'`(?:\\.|[^`\\])*`', '``', s, flags=re.S)
    s = re.sub(r"'(?:\\.|[^'\\\n])*'", "''", s)
    s = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', s)
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    s = re.sub(r'//[^\n]*', '', s)
    return s


def exports_of(path):
    src = open(path, encoding='utf-8').read()
    names = set(re.findall(r'^export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)', src, re.M))
    for m in re.finditer(r'^export\s*\{([^}]*)\}', src, re.M):
        names.update(x.strip().split(' as ')[-1] for x in m.group(1).split(',') if x.strip())
    return names


def main():
    files = sorted(glob.glob(os.path.join(ROOT, 'src', '*.mjs')) + glob.glob(os.path.join(ROOT, 'test', '*.mjs')) + [os.path.join(ROOT, 'sw.js')])
    bad = 0
    for f in files:
        raw = open(f, encoding='utf-8').read()
        s = strip(raw)
        bal = {k: s.count(k[0]) - s.count(k[1]) for k in ('{}', '()', '[]')}
        problems = [f'{k} imbalance {v:+d}' for k, v in bal.items() if v]
        for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*'(\./[^']+|\.\./src/[^']+)'", raw):
            target = os.path.normpath(os.path.join(os.path.dirname(f), m.group(2)))
            if not os.path.isfile(target):
                problems.append(f'import target missing {m.group(2)}'); continue
            exp = exports_of(target)
            for name in (x.strip().split(' as ')[0] for x in m.group(1).split(',') if x.strip()):
                if name not in exp:
                    problems.append(f'{name} not exported by {os.path.basename(target)}')
        rel = os.path.relpath(f, ROOT)
        print(('FAIL ' if problems else 'OK   ') + rel + ('  ' + '; '.join(problems) if problems else ''))
        bad += bool(problems)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
