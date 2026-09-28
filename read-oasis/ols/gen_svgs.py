#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-27
"""Generate the original Read Oasis SVG illustrations and UI icons.

Design rules (spec 6.2): viewBox, no hairlines (<2px), no text inside story art,
<title>/<desc> for meaningful images, no scripts/external refs/event handlers,
simple backgrounds, consistent palette per book.
"""
import os
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content', 'images')
ICONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'icons')

SKY, GRASS, SOIL = '#EAF4FB', '#BFE3B4', '#8B5E3C'
RED, ORANGE, YEL, GREEN, DKGREEN, WHITE, INK = '#D9534F', '#F2A541', '#F7D154', '#6AB04C', '#3E7C3A', '#FFFFFF', '#2B2B2B'
STROKE = f'stroke="{INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"'


def svg(title, desc, body, w=400, h=300, bg=SKY):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-labelledby="t d">\n'
            f'  <title id="t">{title}</title>\n  <desc id="d">{desc}</desc>\n'
            f'  <rect width="{w}" height="{h}" fill="{bg}"/>\n{body}\n</svg>\n')


def ground(y=220):
    return f'  <rect x="0" y="{y}" width="400" height="{300 - y}" fill="{GRASS}"/>\n'


def mo(x, y, s=1.0):
    """Mo: a round bird. Original character."""
    return (f'  <g transform="translate({x} {y}) scale({s})">\n'
            f'    <ellipse cx="0" cy="0" rx="34" ry="30" fill="{YEL}" {STROKE}/>\n'
            f'    <circle cx="12" cy="-8" r="5" fill="{INK}"/>\n'
            f'    <path d="M30 -2 L46 4 L30 10 Z" fill="{ORANGE}" {STROKE}/>\n'
            f'    <path d="M-30 6 Q-48 -4 -34 -18" fill="none" {STROKE}/>\n'
            f'    <path d="M-10 30 L-10 44 M10 30 L10 44" fill="none" {STROKE}/>\n'
            f'  </g>\n')


def kite(x, y, rot=0, s=1.0):
    return (f'  <g transform="translate({x} {y}) rotate({rot}) scale({s})">\n'
            f'    <path d="M0 -40 L30 0 L0 40 L-30 0 Z" fill="{RED}" {STROKE}/>\n'
            f'    <path d="M0 -40 L0 40 M-30 0 L30 0" fill="none" {STROKE}/>\n'
            f'    <path d="M0 40 q10 14 0 28 q-10 14 0 28" fill="none" {STROKE}/>\n'
            f'  </g>\n')


def sun(x, y, r=26, color=YEL):
    return f'  <circle cx="{x}" cy="{y}" r="{r}" fill="{color}" {STROKE}/>\n'


def wind(x, y):
    return (f'  <path d="M{x} {y} q30 -14 60 0 M{x + 10} {y + 22} q40 -14 80 0 M{x} {y + 44} q30 -14 60 0" '
            f'fill="none" stroke="#6C8EBF" stroke-width="5" stroke-linecap="round"/>\n')


def sam(x, y):
    """Sam: a child with round head and simple body."""
    return (f'  <g transform="translate({x} {y})">\n'
            f'    <circle cx="0" cy="-40" r="26" fill="#F5CBA7" {STROKE}/>\n'
            f'    <path d="M-26 -50 q26 -30 52 0" fill="{INK}"/>\n'
            f'    <circle cx="-9" cy="-42" r="3.5" fill="{INK}"/><circle cx="9" cy="-42" r="3.5" fill="{INK}"/>\n'
            f'    <path d="M-8 -30 q8 8 16 0" fill="none" {STROKE}/>\n'
            f'    <rect x="-24" y="-12" width="48" height="56" rx="10" fill="#5B8DEF" {STROKE}/>\n'
            f'    <path d="M-24 0 L-50 20 M24 0 L50 20" fill="none" {STROKE}/>\n'
            f'  </g>\n')


def pot(x, y, lid=False, steam=False):
    b = (f'  <g transform="translate({x} {y})">\n'
         f'    <rect x="-50" y="0" width="100" height="60" rx="12" fill="#7F8C8D" {STROKE}/>\n'
         f'    <path d="M-50 14 L-70 14 M50 14 L70 14" fill="none" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>\n')
    if lid:
        b += f'    <path d="M-52 0 q52 -30 104 0 Z" fill="#95A5A6" {STROKE}/><circle cx="0" cy="-16" r="7" fill="{INK}"/>\n'
    if steam:
        b += (f'    <path d="M-20 -10 q-8 -16 0 -32 M0 -10 q8 -16 0 -32 M20 -10 q-8 -16 0 -32" '
              f'fill="none" stroke="#B0BEC5" stroke-width="5" stroke-linecap="round"/>\n')
    return b + '  </g>\n'


def seed(x, y, split=False, s=1.0):
    b = f'  <g transform="translate({x} {y}) scale({s})">\n    <ellipse cx="0" cy="0" rx="34" ry="24" fill="#A0522D" {STROKE}/>\n'
    if split:
        b += f'    <path d="M-10 -22 q6 22 0 44" fill="none" stroke="#F5E6D3" stroke-width="5" stroke-linecap="round"/>\n'
    return b + '  </g>\n'


def soil(y=170):
    return f'  <rect x="0" y="{y}" width="400" height="{300 - y}" fill="{SOIL}"/>\n'


BOOKS = {
    'ro-a-001-p01': ('Mo with a red kite', 'Mo, a small round yellow bird, holds the string of a red kite resting on the grass.',
                     ground() + kite(280, 190, 25) + mo(120, 190) + f'  <path d="M156 190 L252 200" fill="none" {STROKE}/>\n'),
    'ro-a-001-p02': ('The kite sits still', 'The kite lies flat on the grass while Mo looks up at an empty sky.',
                     ground() + kite(270, 220, 90, 0.9) + mo(110, 190) + sun(340, 60)),
    'ro-a-001-p03': ('The wind lifts the kite', 'Curved wind lines push the red kite high above Mo.',
                     ground() + wind(40, 60) + kite(300, 80, 15) + f'  <path d="M300 148 Q220 200 156 190" fill="none" {STROKE}/>\n' + mo(120, 190)),
    'ro-a-001-p04': ('Mo runs with the kite', 'Mo runs across the grass; the kite flies behind on its string.',
                     ground() + wind(230, 50) + kite(320, 90, 20) + f'  <path d="M320 156 Q240 200 100 190" fill="none" {STROKE}/>\n' + mo(70, 190, 1.05)),
    'ro-a-001-p05': ('Sunset walk home', 'A big orange sun sits low on the horizon. Mo walks home carrying the kite.',
                     sun(320, 210, 46, ORANGE) + ground(226) + mo(120, 196) + kite(180, 200, 0, 0.6)),
    'ro-b-001-p01': ('Sam has a pot', 'A child, Sam, stands beside a large grey pot.',
                     ground(230) + sam(110, 200) + pot(270, 170)),
    'ro-b-001-p02': ('The pot is hot', 'The grey pot sits on a stove. Steam rises from the pot.',
                     f'  <rect x="0" y="230" width="400" height="70" fill="#D7DBDD"/>\n  <rect x="190" y="228" width="160" height="14" rx="6" fill="#555" />\n'
                     + pot(270, 170, steam=True) + sam(90, 200)),
    'ro-b-001-p03': ('Sam holds a lid', 'Sam smiles and holds up a round lid.',
                     ground(230) + sam(150, 200) + f'  <path d="M180 120 q40 -30 80 0 Z" fill="#95A5A6" {STROKE}/><circle cx="220" cy="106" r="7" fill="{INK}"/>\n' + pot(300, 170, steam=True)),
    'ro-b-001-p04': ('Sam naps', 'The lid covers the pot. Sam rests on a mat with closed eyes.',
                     ground(230) + pot(300, 170, lid=True)
                     + f'  <rect x="30" y="236" width="180" height="20" rx="8" fill="#9B59B6" {STROKE}/>\n'
                     + f'  <g transform="translate(90 214)"><circle cx="0" cy="0" r="24" fill="#F5CBA7" {STROKE}/><path d="M-24 -8 q24 -28 48 0" fill="{INK}"/><path d="M-10 4 q4 3 8 0 M6 4 q4 3 8 0" fill="none" {STROKE}/></g>\n'
                     + f'  <rect x="112" y="200" width="80" height="34" rx="10" fill="#5B8DEF" {STROKE}/>\n'),
    'ro-d-001-p01': ('A seed underground', 'Cross-section: a brown seed in dark soil with a tiny curled plant inside.',
                     soil(120) + seed(200, 200, s=1.6) + f'  <path d="M180 200 q20 -30 40 0 q-20 -10 -30 10" fill="none" stroke="{GREEN}" stroke-width="5" stroke-linecap="round"/>\n'),
    'ro-d-001-p02': ('Rain soaks the seed', 'Blue rain drops fall on the soil. The seed is bigger and its coat is splitting.',
                     ''.join(f'  <path d="M{x} {y} q6 14 0 26" fill="none" stroke="#5DADE2" stroke-width="6" stroke-linecap="round"/>\n' for x, y in [(60, 30), (130, 60), (200, 20), (270, 55), (340, 30)])
                     + soil(140) + seed(200, 210, split=True, s=1.8)),
    'ro-d-001-p03': ('The root grows down', 'A pale root grows down from the split seed into the soil.',
                     soil(120) + seed(200, 160, split=True, s=1.3) + f'  <path d="M200 190 q-10 30 4 60 q10 20 -6 42" fill="none" stroke="#F5E6D3" stroke-width="8" stroke-linecap="round"/>\n'),
    'ro-d-001-p04': ('A sprout reaches for light', 'A green shoot with two small leaves rises above the soil toward a sun.',
                     sun(330, 60) + soil(190) + seed(200, 230, split=True, s=1.1)
                     + f'  <path d="M200 208 L200 130" fill="none" stroke="{GREEN}" stroke-width="8" stroke-linecap="round"/>\n'
                     + f'  <path d="M200 140 q-40 -10 -44 -40 q34 2 44 40 Z M200 140 q40 -10 44 -40 q-34 2 -44 40 Z" fill="{GREEN}" {STROKE}/>\n'
                     + f'  <path d="M200 250 q-8 20 0 40" fill="none" stroke="#F5E6D3" stroke-width="7" stroke-linecap="round"/>\n'),
    'ro-d-001-p05': ('A young plant', 'A small plant with several leaves stands in the soil under the sun.',
                     sun(330, 60) + soil(210)
                     + f'  <path d="M200 210 L200 90" fill="none" stroke="{DKGREEN}" stroke-width="9" stroke-linecap="round"/>\n'
                     + ''.join(f'  <path d="M200 {y} q{d * 44} -12 {d * 50} -42 q-{d * 40} 4 -{d * 50} 42 Z" fill="{GREEN}" {STROKE}/>\n' for y, d in [(190, -1), (170, 1), (140, -1), (120, 1)])
                     + f'  <path d="M200 230 q-14 26 0 50 M200 230 q14 26 0 50" fill="none" stroke="#F5E6D3" stroke-width="6" stroke-linecap="round"/>\n'),
}

ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"'
ICONS_DEF = {
    'play': f'<path d="M22 12 L54 32 L22 52 Z" fill="currentColor"/>',
    'pause': f'<rect x="18" y="12" width="10" height="40" rx="3" fill="currentColor"/><rect x="36" y="12" width="10" height="40" rx="3" fill="currentColor"/>',
    'replay': f'<path d="M48 22 A20 20 0 1 0 50 40" {ICON_STROKE}/><path d="M48 8 L48 24 L32 24" {ICON_STROKE}/>',
    'back': f'<path d="M40 12 L20 32 L40 52" {ICON_STROKE}/>',
    'next': f'<path d="M24 12 L44 32 L24 52" {ICON_STROKE}/>',
    'home': f'<path d="M10 32 L32 12 L54 32 M16 28 L16 52 L48 52 L48 28" {ICON_STROKE}/>',
    'star': f'<path d="M32 8 L38 24 L56 25 L42 36 L47 54 L32 44 L17 54 L22 36 L8 25 L26 24 Z" fill="currentColor"/>',
    'book': f'<path d="M10 14 Q32 6 32 18 L32 54 Q32 44 10 50 Z M54 14 Q32 6 32 18 L32 54 Q32 44 54 50 Z" {ICON_STROKE}/>',
    'ear': f'<path d="M20 30 a12 12 0 1 1 24 0 c0 10 -8 12 -8 20 a6 6 0 0 1 -12 0" {ICON_STROKE}/>',
    'eye-break': f'<path d="M6 32 Q32 8 58 32 Q32 56 6 32 Z" {ICON_STROKE}/><circle cx="32" cy="32" r="8" fill="currentColor"/>',
    'mic': f'<rect x="24" y="8" width="16" height="30" rx="8" {ICON_STROKE}/><path d="M14 30 a18 18 0 0 0 36 0 M32 48 L32 58" {ICON_STROKE}/>',
    'mascot': f'<ellipse cx="32" cy="34" rx="22" ry="20" fill="{YEL}" stroke="currentColor" stroke-width="4"/><circle cx="40" cy="28" r="3.5" fill="currentColor"/><path d="M52 32 L62 36 L52 40 Z" fill="{ORANGE}" stroke="currentColor" stroke-width="3"/>',
    'check': f'<path d="M12 34 L26 48 L52 16" {ICON_STROKE}/>',
    'x': f'<path d="M16 16 L48 48 M48 16 L16 48" {ICON_STROKE}/>',
    'up': f'<path d="M12 40 L32 20 L52 40" {ICON_STROKE}/>',
    'down': f'<path d="M12 24 L32 44 L52 24" {ICON_STROKE}/>',
    'image-missing': f'<rect x="8" y="12" width="48" height="40" rx="4" {ICON_STROKE}/><path d="M14 46 L28 30 L38 40 L46 34 L52 40" {ICON_STROKE}/><circle cx="22" cy="24" r="4" fill="currentColor"/>',
}


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(ICONS, exist_ok=True)
    for name, (t, d, body) in BOOKS.items():
        with open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg(t, d, body))
    # Icons are decorative (aria-hidden applied by the app); no title inside.
    for name, body in ICONS_DEF.items():
        with open(os.path.join(ICONS, name + '.svg'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" focusable="false">{body}</svg>\n')
    print(f'wrote {len(BOOKS)} illustrations to {OUT} and {len(ICONS_DEF)} icons to {ICONS}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
