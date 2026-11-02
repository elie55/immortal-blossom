#!/usr/bin/env python3
"""Cut a ChatGPT sheet of icons on a transparent background into one file per icon.

    python3 tools/icon_sheet.py <sheet.png> <name>,<name>,... [--size 160]

The names go in reading order (rows top to bottom, each row left to right) and become game/assets/ui/<name>.webp.
Rows may hold different numbers of icons: the rows are found first, then the icons within each row. An icon is found
by its opaque pixels (the faint glow around it is ignored to find it, then kept in a margin), centred on a square
and saved at `size` px with its alpha. tools/tab_icons.py and tools/hall_icons.py use it.
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'ui')
SOLID = 24          # alpha above which a pixel belongs to an icon rather than its glow
MARGIN = 0.07       # room left around an icon, as a share of its longer side


def runs(counts, at_least=2, min_len=40):
    """Spans of consecutive indexes whose count is above `at_least`, at least `min_len` long."""
    out, start = [], None
    for i, c in enumerate(counts):
        if c > at_least and start is None: start = i
        elif c <= at_least and start is not None: out.append((start, i)); start = None
    if start is not None: out.append((start, len(counts)))
    return [r for r in out if r[1] - r[0] >= min_len]


def cut(path, names, size=160, out_dir=OUT):
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    solid = np.array(im)[..., 3] > SOLID
    mid = lambda spans, i, n: ((spans[i - 1][1] + spans[i][0]) // 2 if i else 0, (spans[i][1] + spans[i + 1][0]) // 2 if i + 1 < len(spans) else n)
    boxes = []                     # each icon's opaque box, and its cell: halfway to the icons around it
    rows = runs(solid.sum(1))
    for r, (y0, y1) in enumerate(rows):
        cols = runs(solid[y0:y1].sum(0))
        for c, (x0, x1) in enumerate(cols):
            ys, xs = np.nonzero(solid[y0:y1, x0:x1])
            boxes.append(((x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1), (*mid(cols, c, W), *mid(rows, r, H))))
    if len(boxes) != len(names):
        raise SystemExit(f'{path}: found {len(boxes)} icons, expected {len(names)} ({", ".join(names)})')
    os.makedirs(out_dir, exist_ok=True)
    for name, ((bx0, by0, bx1, by1), (cx0, cx1, cy0, cy1)) in zip(names, boxes):
        own = Image.new('RGBA', im.size, (0, 0, 0, 0))   # only this icon's cell, so a wide one takes no piece of its neighbours
        own.paste(im.crop((cx0, cy0, cx1, cy1)), (cx0, cy0))
        side = int(max(bx1 - bx0, by1 - by0) * (1 + 2 * MARGIN))
        cx, cy = (bx0 + bx1) // 2, (by0 + by1) // 2
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.alpha_composite(own.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)))
        out = os.path.join(out_dir, f'{name}.webp')
        sq.resize((size, size), Image.LANCZOS).save(out, quality=90, method=6)
        print(f'{name:16s} from {bx1 - bx0}x{by1 - by0} at ({bx0},{by0}) -> {os.path.relpath(out, ROOT)}')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    size = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 160
    if '--size' in sys.argv: args.remove(str(size))
    if len(args) != 2:
        raise SystemExit(__doc__)
    cut(args[0], args[1].split(','), size)
