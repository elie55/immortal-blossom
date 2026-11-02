#!/usr/bin/env python3
"""The Android app's icon and splash, made from the game's art into android-res/ (copied over the Capacitor
project's res/ by tools/android_setup.py).

    python3 tools/android_assets.py

Icon: Ling Shuang's face from her card, as a rounded square (legacy), a circle (round) and a full-bleed adaptive
foreground on a deep blue background. Splash: the Jade Pool at night, darkened, with the lotus mark and the title,
at every size the Capacitor template ships (landscape and portrait).
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'android-res')
ASSETS = os.path.join(ROOT, 'game', 'assets')
BG = '#0b1020'
GOLD = (233, 200, 128)
CJK_FONT = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Black.ttc'

DENSITY = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
SPLASH = {'drawable': (480, 320), 'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
          'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280), 'drawable-port-mdpi': (320, 480),
          'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280), 'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920)}


def save(im, rel):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True); im.save(p, optimize=True)


def mask(size, kind):
    k = 4; m = Image.new('L', (size * k, size * k), 0); d = ImageDraw.Draw(m)
    if kind == 'circle': d.ellipse((0, 0, size * k - 1, size * k - 1), fill=255)
    else: d.rounded_rectangle((0, 0, size * k - 1, size * k - 1), radius=int(size * k * 0.2), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def icons():
    card = Image.open(os.path.join(ASSETS, 'cards', 'card_ling.webp')).convert('RGB')
    face = card.crop((162, 10, 422, 270))                       # her face, a little room around it
    wide = card.crop((92, 0, 492, 400))                         # the adaptive foreground: more room, the mask shows the middle
    for name, d in DENSITY.items():
        s = round(48 * d)
        ic = face.resize((s, s), Image.LANCZOS).convert('RGBA'); ic.putalpha(mask(s, 'square'))
        save(ic, f'mipmap-{name}/ic_launcher.png')
        rd = face.resize((s, s), Image.LANCZOS).convert('RGBA'); rd.putalpha(mask(s, 'circle'))
        save(rd, f'mipmap-{name}/ic_launcher_round.png')
        f = round(108 * d)
        save(wide.resize((f, f), Image.LANCZOS), f'mipmap-{name}/ic_launcher_foreground.png')
    os.makedirs(os.path.join(OUT, 'values'), exist_ok=True)
    with open(os.path.join(OUT, 'values', 'ic_launcher_background.xml'), 'w') as fh:
        fh.write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{BG}</color>\n</resources>\n')


def splash():
    src = Image.open(os.path.join(ASSETS, 'bg', 'jade_pool.webp')).convert('RGB')
    for folder, (w, h) in SPLASH.items():
        sw, sh = src.size; r = max(w / sw, h / sh)
        im = src.resize((round(sw * r), round(sh * r)), Image.LANCZOS)
        x0, y0 = (im.width - w) // 2, (im.height - h) // 2
        im = im.crop((x0, y0, x0 + w, y0 + h)).filter(ImageFilter.GaussianBlur(max(w, h) / 320))
        im = Image.blend(im, Image.new('RGB', (w, h), (6, 8, 14)), 0.62)
        d = ImageDraw.Draw(im); u = min(w, h)
        mark = ImageFont.truetype(CJK_FONT, round(u * 0.26), index=0)
        title = ImageFont.truetype(CJK_FONT, round(u * 0.075), index=0)
        cy = h * 0.44
        d.text((w / 2, cy), '蓮', font=mark, fill=GOLD, anchor='mm')
        d.text((w / 2, cy + u * 0.24), 'IMMORTAL BLOSSOMS', font=title, fill=(240, 228, 200), anchor='mm')
        save(im, f'{folder}/splash.png')


if __name__ == '__main__':
    icons(); splash()
    n = sum(len(fs) for _, _, fs in os.walk(OUT))
    print(f'android-res: {n} files')
