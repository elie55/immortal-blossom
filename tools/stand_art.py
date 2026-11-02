#!/usr/bin/env python3
"""Standing figures for story scenes: stand_<key>.png (transparent, from ChatGPT) -> game/assets/stand/<key>.webp.

    python3 tools/stand_art.py <Images folder> [key ...]     # default: every stand_*.png in the folder

<key> is the speaker's id without its type (hero:su_lianhua -> su_lianhua, npc:tao_yao -> tao_yao).
The figure is trimmed to its visible pixels and scaled to 1200 px high with its alpha channel kept;
a figure cut by the top edge (a crown, a hat) fades out over its top rows instead of ending in a line.
Run tools/build_game.py afterwards so the game's asset list picks the new figures up.
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'stand')
HEIGHT = 1200


def convert(src, key):
    im = Image.open(os.path.join(src, f'stand_{key}.png')).convert('RGBA')
    alpha = im.getchannel('A')
    im = im.crop(alpha.point(lambda v: 255 if v > 12 else 0).getbbox())
    w, h = im.size
    im = im.resize((round(w * HEIGHT / h), HEIGHT), Image.LANCZOS)
    arr = np.array(im)
    arr[arr[:, :, 3] < 3] = 0  # no stray colour under fully transparent pixels
    if (np.array(alpha)[0] > 200).sum() > 5:
        n = HEIGHT // 50
        arr[:n, :, 3] = (arr[:n, :, 3] * (np.arange(n) / n)[:, None]).astype(np.uint8)
    out = os.path.join(OUT, f'{key}.webp')
    Image.fromarray(arr, 'RGBA').save(out, 'WEBP', quality=86, method=6)
    print(f'{key}: {arr.shape[1]}x{arr.shape[0]}, {os.path.getsize(out) // 1024} KB')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    keys = sys.argv[2:] or sorted(os.path.basename(p)[6:-4] for p in glob.glob(os.path.join(src, 'stand_*.png')))
    for k in keys:
        convert(src, k)
