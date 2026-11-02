#!/usr/bin/env python3
"""The battle screen's art, cut from the ChatGPT sheets in the Images folder (transparent backgrounds).

    python3 tools/battle_art.py <Images folder>

battle_orbs.png       the Phase Qi orbs (fire, metal, earth, wood / yin, water, yang) and the Spirit Qi lotus
battle_emblems.png    the winged emblems at the foot of a card: the six paths, then demon and boss
battle_medallions.png the jade dragon-and-crane medallion and the End Turn medallion with phoenix wings
battle_pieces.png     the card back, a gold corner ornament, two rolled scrolls
battle_frames.png     the HUD bar, the panel frame and the portrait frame (cut by hand: the bar's tassels touch
                      the frames below); the bar loses its top-centre jewel so it can stretch, which is kept apart
bg_battle_terrace.png the default battle background (assets/bg/battle_terrace.webp)
Everything lands in game/assets/ui/ (tools/icon_sheet.py does the cutting).
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icon_sheet import cut, OUT, ROOT  # noqa: E402


def frames(path):
    im = Image.open(path).convert('RGBA'); al = np.array(im)[..., 3]

    def bbox(x0, y0, x1, y1, thr=120):
        ys, xs = np.nonzero(al[y0:y1, x0:x1] > thr)
        return (x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1)
    gap = next(y for y in range(200, 450) if not (al[y] > 120).any())      # the empty rows under the bar's tassels
    bar, panel, port = bbox(0, 0, im.width, gap), bbox(0, gap, im.width // 2, im.height), bbox(im.width // 2, gap, im.width, im.height)
    b = np.array(im.crop(bar))
    # the jewel on top of the bar's middle: columns whose first opaque row is well above the plain gold line
    first = np.array([np.argmax(b[:, x, 3] > 120) for x in range(b.shape[1])])
    line = int(np.median(first[len(first) // 3: 2 * len(first) // 3]))
    mid = len(first) // 2
    lo = mid - next(i for i in range(mid) if first[mid - i] >= line - 1 and all(first[mid - i - k] >= line - 1 for k in range(1, 6)))
    hi = mid + next(i for i in range(len(first) - mid) if first[mid + i] >= line - 1 and all(first[mid + i + k] >= line - 1 for k in range(1, 6)))
    gem = Image.fromarray(b[:line + 16, lo - 4:hi + 4].copy())                 # the jewel and its base, above the gold line
    plain = b[:, lo - 40: lo - 39]                                          # a plain column, copied over the jewel
    b[:, lo - 4:hi + 4] = np.repeat(plain, hi - lo + 8, axis=1)
    out = Image.fromarray(b)
    out.resize((out.width * 2 // 3, out.height * 2 // 3), Image.LANCZOS).save(os.path.join(OUT, 'frame_bar.webp'), quality=92, method=6)
    g = gem.crop(gem.getbbox()); g.resize((g.width * 2 // 3, g.height * 2 // 3), Image.LANCZOS).save(os.path.join(OUT, 'frame_bar_gem.webp'), quality=92, method=6)
    for name, box in (('frame_panel', panel), ('frame_portrait', port)):
        c = im.crop(box); c.resize((c.width * 2 // 3, c.height * 2 // 3), Image.LANCZOS).save(os.path.join(OUT, f'{name}.webp'), quality=92, method=6)
    print(f'frames: bar {bar} (jewel {lo}..{hi} lifted, gold line at {line}), panel {panel}, portrait {port}')


def clear_haze(names, below=12):
    """ChatGPT's transparent sheets keep a faint haze (alpha 1 to 3) around the art; it would show as a pale box."""
    for n in names:
        p = os.path.join(OUT, f'{n}.webp'); im = np.array(Image.open(p).convert('RGBA'))
        im[im[..., 3] < below] = 0
        Image.fromarray(im).save(p, quality=92, method=6)


def main(folder):
    p = lambda n: os.path.join(folder, n)
    cut(p('battle_orbs.png'), ['orb_fire', 'orb_metal', 'orb_earth', 'orb_wood', 'orb_yin', 'orb_water', 'orb_yang', 'orb_qi'], 128)
    cut(p('battle_emblems.png'), [f'emb_{k}~' for k in ('sword', 'guardian', 'shadow', 'talisman', 'arcane', 'healer', 'demon', 'boss')], 160)
    cut(p('battle_medallions.png'), ['medal_jade~@560', 'medal_turn~@420'])
    cut(p('battle_pieces.png'), ['card_back~@420', 'corner~@96', 'scroll_a~@260', 'scroll_b~@260'])
    frames(p('battle_frames.png'))
    bg = Image.open(p('bg_battle_terrace.png')).convert('RGB')
    bg.resize((1600, round(bg.height * 1600 / bg.width)), Image.LANCZOS).save(os.path.join(ROOT, 'game', 'assets', 'bg', 'battle_terrace.webp'), quality=84, method=6)
    clear_haze(['medal_jade', 'medal_turn', 'card_back', 'corner', 'scroll_a', 'scroll_b', 'frame_bar', 'frame_bar_gem', 'frame_panel', 'frame_portrait']
               + [f'orb_{k}' for k in ('fire', 'metal', 'earth', 'wood', 'yin', 'water', 'yang', 'qi')]
               + [f'emb_{k}' for k in ('sword', 'guardian', 'shadow', 'talisman', 'arcane', 'healer', 'demon', 'boss')])
    # the bar's soft glow below its bottom line would show as a pale band: keep only the tassels there
    p = os.path.join(OUT, 'frame_bar.webp'); im = np.array(Image.open(p).convert('RGBA'))
    below = int(np.median([np.nonzero(im[:, x, 3] > 200)[0].max() for x in range(im.shape[1] // 3, 2 * im.shape[1] // 3)])) + 2
    band = im[below:]; band[band[..., 3] < 140] = 0; Image.fromarray(im).save(p, quality=92, method=6)
    # the corner ornament is a top-left piece: its mirrors dress the other three corners of a card
    c = Image.open(os.path.join(OUT, 'corner.webp')).convert('RGBA')
    for name, img in (('corner_tl', c), ('corner_tr', c.transpose(Image.FLIP_LEFT_RIGHT)), ('corner_bl', c.transpose(Image.FLIP_TOP_BOTTOM)), ('corner_br', c.rotate(180))):
        img.save(os.path.join(OUT, f'{name}.webp'), quality=92, method=6)
    os.remove(os.path.join(OUT, 'corner.webp'))
    print('background: assets/bg/battle_terrace.webp')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
