#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-27
"""A03: measure WCAG 2.2 contrast for the actual foreground/background pairs in assets/app.css.

Parses the :root and html[data-theme=...] variable blocks, evaluates the pairs the UI uses,
and prints PASS/FAIL against 4.5:1 (normal text), 3:1 (large text / non-text). Exit 1 on any FAIL.
"""
import os
import re
import sys

CSS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'app.css')


def lum(hexc):
    r, g, b = (int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def parse_themes(css):
    themes = {}
    root = re.search(r':root\s*\{(.*?)\}', css, re.S).group(1)
    base = dict(re.findall(r'--([a-z-]+):\s*(#[0-9A-Fa-f]{6})', root))
    themes['light'] = base
    for m in re.finditer(r'html\[data-theme="(\w+)"\]\s*\{(.*?)\}', css, re.S):
        d = dict(base)
        d.update(dict(re.findall(r'--([a-z-]+):\s*(#[0-9A-Fa-f]{6})', m.group(2))))
        themes[m.group(1)] = d
    return themes


# (label, fg var, bg var, minimum ratio)
PAIRS = [
    ('story/body text on paper', 'ink', 'paper', 4.5),
    ('body text on card surface', 'ink', 'surface', 4.5),
    ('muted text on paper', 'muted', 'paper', 4.5),
    ('muted text on surface', 'muted', 'surface', 4.5),
    ('muted text on chip', 'muted', 'chip', 4.5),
    ('ink on paper-2 (gradient end)', 'ink', 'paper-2', 4.5),
    ('ink on primary-soft (explain box)', 'ink', 'primary-soft', 4.5),
    ('ink on accent-soft (parent prompt)', 'ink', 'accent-soft', 4.5),
    ('primary chip text on primary-soft', 'primary', 'primary-soft', 4.5),
    ('accent chip text on accent-soft', 'accent', 'accent-soft', 4.5),
    ('accent ribbon text on surface', 'accent', 'surface', 4.5),
    ('primary button text', 'primary-ink', 'primary', 4.5),
    ('outline button label (primary on surface)', 'primary', 'surface', 4.5),
    ('success text (accent) on surface', 'accent', 'surface', 4.5),
    ('warn text on surface', 'warn', 'surface', 4.5),
    ('focus ring vs paper (non-text)', 'focus', 'paper', 3.0),
    ('primary border vs surface (non-text)', 'primary', 'surface', 3.0),
    ('accent border vs surface (non-text)', 'accent', 'surface', 3.0),
    ('toast text (paper on ink)', 'paper', 'ink', 4.5),
]


def main():
    with open(CSS, encoding='utf-8') as f:
        css = f.read()
    themes = parse_themes(css)
    fails = 0
    for name, vars_ in themes.items():
        print(f'theme: {name}')
        for label, fg, bg, need in PAIRS:
            if fg not in vars_ or bg not in vars_:
                print(f'  SKIP {label}: missing var'); continue
            r = ratio(vars_[fg], vars_[bg])
            ok = r >= need
            fails += 0 if ok else 1
            print(f'  {"PASS" if ok else "FAIL"} {r:5.2f}:1 (need {need}) {label}  {vars_[fg]} on {vars_[bg]}')
    print(f'\n{fails} failure(s)')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
