#!/usr/bin/env python3
"""The heroine screen's tab icons, cut from one ChatGPT sheet with a transparent background.

    python3 tools/tab_icons.py <Images folder>/tab_icons.png

The sheet holds six emblems in a 3 by 2 grid, in the order of the tabs: Techniques, Gear, Meridians (top row),
Blossom, Bond, Ties (bottom row). Each one is found by its opaque pixels (the faint glow around it is ignored to
find it, then kept in a margin), centred on a square and saved as game/assets/ui/tab_<key>.webp at 160 px with its
alpha.
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'ui')
KEYS = [['tech', 'gear', 'meri'], ['bloom', 'bond', 'ties']]
SIZE = 160
SOLID = 24          # alpha above which a pixel belongs to an emblem rather than its glow
MARGIN = 0.07       # room left around an emblem, as a share of its longer side


def runs(counts, at_least=2):
    """Spans of consecutive indexes whose count is above `at_least`."""
    out, start = [], None
    for i, c in enumerate(counts):
        if c > at_least and start is None: start = i
        elif c <= at_least and start is not None: out.append((start, i)); start = None
    if start is not None: out.append((start, len(counts)))
    return [r for r in out if r[1] - r[0] > 40]


def main(path):
    im = Image.open(path).convert('RGBA')
    solid = np.array(im)[..., 3] > SOLID
    cols, rows = runs(solid.sum(0)), runs(solid.sum(1))
    if len(cols) != 3 or len(rows) != 2:
        raise SystemExit(f'expected a 3 by 2 grid, found {len(cols)} columns and {len(rows)} rows')
    os.makedirs(OUT, exist_ok=True)
    for r, (y0, y1) in enumerate(rows):
        for c, (x0, x1) in enumerate(cols):
            cell = solid[y0:y1, x0:x1]
            ys, xs = np.nonzero(cell)
            bx0, bx1, by0, by1 = x0 + xs.min(), x0 + xs.max() + 1, y0 + ys.min(), y0 + ys.max() + 1
            side = int(max(bx1 - bx0, by1 - by0) * (1 + 2 * MARGIN))
            cx, cy = (bx0 + bx1) // 2, (by0 + by1) // 2
            sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            sq.alpha_composite(im.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)))
            out = os.path.join(OUT, f'tab_{KEYS[r][c]}.webp')
            sq.resize((SIZE, SIZE), Image.LANCZOS).save(out, quality=90, method=6)
            print(f'{KEYS[r][c]:5s} from {bx1 - bx0}x{by1 - by0} at ({bx0},{by0}) -> {os.path.relpath(out, ROOT)}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
