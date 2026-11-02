#!/usr/bin/env python3
"""Cut ChatGPT art into game assets: card sheets (2x2 portrait panels), boss sheets (two landscape panels,
one above the other), backgrounds and standing figures.

    python3 tools/cut_art.py <Images folder> [sheet ...]

Panels are found from the image's own gutters (flat-colour rows and columns near the expected cuts), so an
uneven grid still cuts cleanly. Cards become 640x960, bosses 1280x853 (both centre-cropped to their
ratio), backgrounds 1600x1067. ART below says what each file holds.
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'game', 'assets')

# file -> (rows, cols, kind, [names in reading order]); kind: card | boss | bg
ART = {
    'sheet_trial_cards_1.png': (2, 2, 'card', ['wind_imp', 'bronze_maw', 'stone_puppet', 'chaos_wisp']),
    'sheet_trial_cards_2.png': (2, 2, 'card', ['serpent_guard', 'xiangliu_fire', 'xiangliu_water', 'xiangliu_wood']),
    'sheet_trial_cards_3.png': (2, 2, 'card', ['pill_golem', 'herb_spirit', 'shrine_spirit', 'snow_wolf']),
    'sheet_bosses_1.png': (2, 1, 'boss', ['boss_qiongqi', 'boss_taotie']),
    'sheet_bosses_2.png': (2, 1, 'boss', ['boss_taowu', 'boss_hundun']),
    'sheet_bosses_3.png': (2, 1, 'boss', ['boss_furnace_guardian', 'boss_yellow_dragon']),
    'sheet_bosses_4.png': (2, 1, 'boss', ['boss_azure_dragon', 'boss_white_tiger']),
    'sheet_bosses_5.png': (2, 1, 'boss', ['boss_vermilion_bird', 'boss_black_tortoise']),
    **{f'bg_{k}.png': (1, 1, 'bg', [k]) for k in ['howling_gorge', 'bronze_wastes', 'stone_forest', 'formless_marsh', 'nine_head_swamp',
                                                  'medicine_king_valley', 'five_phases_shrines', 'artifact_forge']},
}
SIZE = {'card': (640, 960), 'boss': (1280, 853), 'bg': (1600, 1067)}


def bands(lum, axis, n):
    """Tile spans along one axis. A gutter is a thin run of dark, flat lines near each expected cut."""
    size = lum.shape[1 - axis]
    if n == 1:
        return [(0, size)]
    score = lum.mean(axis=axis) + lum.std(axis=axis)  # dark and flat: low score
    edges = [0]
    for k in range(1, n):
        c = round(size * k / n); w = max(8, size // 16)
        lo, hi = c - w, c + w
        i0 = lo + int(np.argmin(score[lo:hi]))
        thr = score[i0] + 12
        a = i0
        while a > lo and score[a - 1] <= thr and i0 - a < 20: a -= 1
        b = i0
        while b < hi - 1 and score[b + 1] <= thr and b - i0 < 20: b += 1
        edges += [a, b + 1]
    edges.append(size)
    return [(edges[2 * i], edges[2 * i + 1]) for i in range(n)]


def fit(im, w, h):
    """Centre-crop to w:h, then resize."""
    W, H = im.size
    if W / H > w / h:
        nw = round(H * w / h); im = im.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
    else:
        nh = round(W * h / w); top = max(0, (H - nh) // 3)  # keep heads: crop more from the bottom
        im = im.crop((0, top, W, top + nh))
    return im.resize((w, h), Image.LANCZOS)


def cut(path, rows, cols, kind, names):
    im = Image.open(path).convert('RGB')
    lum = np.asarray(im.convert('L'), dtype=float)
    rs, cs = bands(lum, 1, rows), bands(lum, 0, cols)
    sub = {'card': 'cards', 'boss': 'cards', 'bg': 'bg'}[kind]
    os.makedirs(os.path.join(ASSETS, sub), exist_ok=True)
    for i, name in enumerate(names):
        (y0, y1), (x0, x1) = rs[i // cols], cs[i % cols]
        pad = 4 if kind != 'bg' else 0  # skip the gutter's edge
        panel = im.crop((x0 + pad, y0 + pad, x1 - pad, y1 - pad))
        out = fit(panel, *SIZE[kind])
        out.save(os.path.join(ASSETS, sub, f'{name}.webp'), 'WEBP', quality=84 if kind != 'bg' else 80, method=6)
    return rs, cs


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else '.'
    only = set(sys.argv[2:])
    for f, (r, c, kind, names) in ART.items():
        if only and f not in only: continue
        # take the latest version of a file: name_v3.png beats name_v2.png beats name.png
        base, ext = os.path.splitext(f)
        cands = [os.path.join(src, f)] + [os.path.join(src, f'{base}_v{i}{ext}') for i in range(2, 6)]
        have = [p for p in cands if os.path.exists(p)]
        if not have:
            print('missing', f); continue
        rs, cs = cut(have[-1], r, c, kind, names)
        print(f'{os.path.basename(have[-1])}: {names} rows {rs} cols {cs}')
