#!/usr/bin/env python3
"""The battle effects, cut from ChatGPT sheets of glowing sprites on black (the Images folder).

    python3 tools/fx_sheets.py <Images folder> [fx_sheet2.png ...]   (every sheet found, or only the named ones)

Each fx_sheet<N>.png holds a 3 by 3 grid of effects on a pure black background. They become game/assets/fx/<name>.webp,
RGBA with the black turned to transparency (the engine draws them with the 'lighter' blend, so a sprite's own
brightness is its alpha: alpha = max(r, g, b), the colour kept as it is). Names are in reading order.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'fx')
SHEETS = {
    'fx_sheet1.png': ['frost_slash', 'petal_ring', 'ice_shatter', 'thunder_fork', 'thorn_wall', 'fox_rose', 'talisman_fire', 'jade_column', 'ghost_wisp'],
    'fx_sheet2.png': ['fire_arc', 'ice_fall', 'fan_swipe', 'needle_swarm', 'stone_fist', 'bamboo_fang', 'moon_axe', 'blood_bloom', 'chaos_vortex'],
    'fx_sheet3.png': ['sun_crow', 'wave_mirror', 'silk_web', 'crane_feathers', 'dragon_breath', 'snow_lotus', 'vine_canopy', 'bell_shield', 'sorrow_charm'],
    'fx_sheet4.png': ['phoenix_wing', 'serpent_coil', 'torch_eye', 'tide_wall', 'bone_spear', 'ash_veil', 'kite_dart', 'rouge_strike', 'lantern_souls'],
}


def cut(path, names, size=420):
    im = np.array(Image.open(path).convert('RGB')).astype(np.int32)
    lum = im.max(2)
    # find the nine glows (a bright core, dilated a little), then grow each cell out to its faint halo
    mask = ndimage.binary_dilation(lum > 40, iterations=6)
    lab, n = ndimage.label(mask)
    objs = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        core = (lab == i)
        if core.sum() < 6000: continue
        halo = ndimage.binary_dilation(core, iterations=26) & (lum > 4)
        ys, xs = np.nonzero(halo)
        objs.append((ys.mean(), xs.mean(), (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1)), halo))
    objs.sort(key=lambda o: o[0])
    rows = [sorted(objs[k:k + 3], key=lambda o: o[1]) for k in range(0, len(objs), 3)]
    found = [o for r in rows for o in r]
    if len(found) != len(names):
        raise SystemExit(f'{path}: found {len(found)} effects, expected {len(names)}')
    os.makedirs(OUT, exist_ok=True)
    for name, (_, _, sl, own) in zip(names, found):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        piece = im[y0:y1, x0:x1].copy(); piece[~own[y0:y1, x0:x1]] = 0
        a = piece.max(2).astype(np.float32)
        a = np.clip((a - 6) / 249 * 255, 0, 255)
        rgba = np.dstack([piece.astype(np.uint8), a.astype(np.uint8)])
        out = Image.fromarray(rgba, 'RGBA')
        k = size / max(out.size); out = out.resize((max(1, round(out.width * k)), max(1, round(out.height * k))), Image.LANCZOS)
        p = os.path.join(OUT, f'{name}.webp'); out.save(p, quality=88, method=4)
        print(f'{name:16s} {x1 - x0}x{y1 - y0} at ({x0},{y0}) -> {os.path.relpath(p, ROOT)} {out.size[0]}x{out.size[1]}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for f, names in SHEETS.items():
        p = os.path.join(sys.argv[1], f)
        if os.path.exists(p) and (len(sys.argv) < 3 or f in sys.argv[2:]): cut(p, names)
