#!/usr/bin/env python3
"""The menus' UI kit (the bright gold-and-jade look of the mockups), cut from ChatGPT sheets in the Images folder.

    python3 tools/ui_kit.py <Images folder>

ui_panels.png   the avatar ring (with its level socket), the glowing arch behind the chosen tab of the bottom bar,
                a teal plate and a parchment panel
ui_buttons.png  the red button with a dragon, a teal pill and a red pill with clouds, the teal plate with a dragon
ui_plaques.png  the cream menu plaque with a jade socket (and its lit twin), the arched frame of a mode card,
                a round jade button and a red ribbon
ui_icons.png    twelve menu icons: pavilion, summon cards, team, book / rates seal, gift, hourglass, back arrow /
                brush, trophy, forge, war banner
bg_home_terrace.png  the Pavilion Hall's terrace (assets/bg/home_terrace.webp)
Everything lands in game/assets/ui/. The pieces are found as connected shapes (the rows of a sheet can overlap)
and named in reading order. Some sheets keep ChatGPT's white "transparent" smoke around the art, nearly opaque
next to it: those keep only the art's own pixels (alpha at the top of the range) with a soft one-pixel edge.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'ui')
MARGIN = 0.04


def load(path, haze=None, fill=False):
    """The sheet as RGBA; with haze=t, only the art (alpha >= t) is kept, opaque, with a soft edge. fill=True also
    keeps what the art encloses (a button's glossy face is a little translucent in places)."""
    im = np.array(Image.open(path).convert('RGBA')).astype(np.float32)
    if haze is not None:
        art = im[..., 3] >= haze
        art = ndimage.binary_opening(art, iterations=1)           # drop specks of dense smoke
        if fill: art = ndimage.binary_fill_holes(art)
        soft = ndimage.gaussian_filter(art.astype(np.float32), 1.1)
        im[..., 3] = np.clip((soft - .3) / .45, 0, 1) * 255 * art
    return im.astype(np.uint8)


def pieces(im, rows, solid=24, join=10, min_area=4000):
    """Each piece's mask, in reading order: `rows` bands top to bottom, left to right within a band."""
    m = im[..., 3] > solid
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=join))
    objs = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        own = (lab == i) & m
        if own.sum() < min_area: continue
        ys, xs = np.nonzero(own)
        objs.append((ys.mean(), xs.mean(), own))
    objs.sort(key=lambda o: o[0])
    out, per = [], len(objs) / rows
    bands = np.array_split(np.arange(len(objs)), rows) if per == int(per) else None
    if bands is None:   # unequal rows: cut the list where the vertical gap between centres is widest
        gaps = sorted(range(1, len(objs)), key=lambda k: objs[k][0] - objs[k - 1][0], reverse=True)[:rows - 1]
        cuts = [0, *sorted(gaps), len(objs)]
        bands = [np.arange(cuts[k], cuts[k + 1]) for k in range(rows)]
    for b in bands:
        out += sorted((objs[k] for k in b), key=lambda o: o[1])
    return [o[2] for o in out]


def cut(path, names, rows, size=160, haze=None, box=None, fill=False, **kw):
    """Cut `names` from the sheet (or from `box` = (x0, y0, x1, y1) of it, for a piece that needs its own haze level)."""
    im = load(path, haze, fill)
    if box: im = im[box[1]:box[3], box[0]:box[2]]
    found = pieces(im, rows, **kw)
    if len(found) != len(names):
        raise SystemExit(f'{path}: found {len(found)} pieces, expected {len(names)} ({", ".join(names)})')
    os.makedirs(OUT, exist_ok=True)
    for spec, own in zip(names, found):
        keep = '~' in spec; name, _, sz = spec.replace('~', '').partition('@'); sz = int(sz) if sz else size
        ys, xs = np.nonzero(own)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        piece = im.copy(); piece[~ndimage.binary_dilation(own, iterations=2)] = 0
        w, h = x1 - x0, y1 - y0
        if keep:
            W, H = int(w * (1 + 2 * MARGIN)), int(h * (1 + 2 * MARGIN))
        else:
            W = H = int(max(w, h) * (1 + 2 * MARGIN))
        box = np.zeros((H, W, 4), np.uint8)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        sx0, sy0 = cx - W // 2, cy - H // 2
        a0, b0 = max(0, sx0), max(0, sy0); a1, b1 = min(im.shape[1], sx0 + W), min(im.shape[0], sy0 + H)
        box[b0 - sy0:b1 - sy0, a0 - sx0:a1 - sx0] = piece[b0:b1, a0:a1]
        k = sz / max(W, H)
        img = Image.fromarray(box).resize((max(1, round(W * k)), max(1, round(H * k))), Image.LANCZOS)
        out = os.path.join(OUT, f'{name}.webp'); img.save(out, quality=92, method=6)
        print(f'{name:16s} from {w}x{h} at ({x0},{y0}) -> {os.path.relpath(out, ROOT)} {img.size[0]}x{img.size[1]}')


def main(folder):
    p = lambda n: os.path.join(folder, n)
    cut(p('ui_panels.png'), ['ring_avatar~@320', 'glow_arch~@520', 'plate_teal~@640', 'panel_parch~@600'], 2)
    cut(p('ui_buttons.png'), ['btn_red_dragon~@640', 'btn_teal~@600', 'btn_red~@600', 'btn_teal_dragon~@640'], 2, haze=249, fill=True)
    # the plaques sit in denser smoke than the arched frame, whose thin gold sides are a little translucent
    cut(p('ui_plaques.png'), ['plaque~@600', 'plaque_on~@600'], 1, haze=250, box=(0, 0, 1536, 310), fill=True)
    cut(p('ui_plaques.png'), ['frame_arch~@560'], 1, haze=236, box=(40, 300, 620, 1010))
    cut(p('ui_plaques.png'), ['btn_round~@200', 'ribbon_red~@400'], 1, haze=250, box=(620, 440, 1536, 840), fill=True)
    if os.path.exists(p('ui_icons.png')):
        cut(p('ui_icons.png'), ['ic_home', 'ic_summon', 'ic_team', 'ic_book', 'ic_rates', 'ic_gift', 'ic_hourglass', 'ic_back',
                                'ic_brush', 'ic_trophy', 'ic_forge', 'ic_banner'], 3, 128)
    if os.path.exists(p('bg_home_terrace.png')):
        bg = Image.open(p('bg_home_terrace.png')).convert('RGB')
        bg.resize((1600, round(bg.height * 1600 / bg.width)), Image.LANCZOS).save(os.path.join(ROOT, 'game', 'assets', 'bg', 'home_terrace.webp'), quality=84, method=6)
        print('background: assets/bg/home_terrace.webp')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
