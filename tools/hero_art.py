#!/usr/bin/env python3
"""A heroine's card art from one ChatGPT portrait: the card, her face (round portrait) and her cut-in.

    python3 tools/hero_art.py <Images folder> <key> [--face X,Y,SIZE] [--src card_<key>.png]

<key> is her id without its type (hero:gu_youlan -> gu_youlan). The source is card_<key>.png (or its latest
_vN redo), a 2:3 portrait. --face gives the centre of her face as fractions of the image's width and height
and the face crop's size as a fraction of the width (default 0.5,0.22,0.32).

Writes game/assets/cards/card_<key>.webp (640x960), game/assets/ui/<key>_face.webp (192x192, round, alpha)
and game/assets/ui/<key>_cutin.webp (1280x853: the full width, her face in the upper third).
"""
import argparse
import glob
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'game', 'assets')


def latest(src, name):
    base, ext = os.path.splitext(name)
    best, n = os.path.join(src, name), 1
    for p in glob.glob(os.path.join(src, f'{base}_v*{ext}')):
        tail = os.path.basename(p)[len(base) + 2:-len(ext)]
        if tail.isdigit() and int(tail) > n:
            best, n = p, int(tail)
    return best


def fit(im, w, h, top_bias=3):
    W, H = im.size
    if W / H > w / h:
        nw = round(H * w / h); im = im.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
    else:
        nh = round(W * h / w); top = max(0, (H - nh) // top_bias); im = im.crop((0, top, W, top + nh))
    return im.resize((w, h), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('key')
    ap.add_argument('--face', default='0.5,0.22,0.32')
    ap.add_argument('--file', default=None)
    a = ap.parse_args()
    path = latest(a.src, a.file or f'card_{a.key}.png')
    im = Image.open(path).convert('RGB')
    W, H = im.size
    fx, fy, fs = (float(x) for x in a.face.split(','))
    # the card
    fit(im, 640, 960).save(os.path.join(ASSETS, 'cards', f'card_{a.key}.webp'), 'WEBP', quality=86, method=6)
    # the face: a square around it, round with a soft edge
    s = round(W * fs); cx, cy = round(W * fx), round(H * fy)
    x0 = min(max(0, cx - s // 2), W - s); y0 = min(max(0, cy - s // 2), H - s)
    face = im.crop((x0, y0, x0 + s, y0 + s)).resize((192, 192), Image.LANCZOS).convert('RGBA')
    mask = Image.new('L', (192 * 4, 192 * 4), 0); ImageDraw.Draw(mask).ellipse((4, 4, 192 * 4 - 4, 192 * 4 - 4), fill=255)
    mask = mask.resize((192, 192), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    face.putalpha(mask)
    face.save(os.path.join(ASSETS, 'ui', f'{a.key}_face.webp'), 'WEBP', quality=88, method=6)
    # the cut-in: full width, 3:2, her face a third of the way down
    ch = round(W / 1.5); top = min(max(0, cy - round(ch * 0.36)), H - ch)
    im.crop((0, top, W, top + ch)).resize((1280, 853), Image.LANCZOS).save(os.path.join(ASSETS, 'ui', f'{a.key}_cutin.webp'), 'WEBP', quality=84, method=6)
    print(f'{a.key}: {os.path.basename(path)} {W}x{H}, face at {fx:.2f},{fy:.2f} size {fs:.2f}')


if __name__ == '__main__':
    main()
