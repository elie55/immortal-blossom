#!/usr/bin/env python3
"""Bundle the game's Google Fonts into dist/ so the Android app needs no network (run after tools/build_game.py,
on a machine with internet, as the Android workflow does).

    python3 tools/offline_fonts.py

Cinzel, Oswald and Cormorant Garamond come whole (their Latin and Latin Extended files). Noto Serif SC, the
Chinese face, would be megabytes, so it comes as a subset of exactly the Chinese characters the game shows
(Google Fonts' `text=` request). The fonts land in dist/assets/fonts/ with a fonts.css, and dist/index.html links
that instead of fonts.googleapis.com. If anything fails, dist/ stays as it was and the game falls back to system
fonts.
"""
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
OUT = os.path.join(DIST, 'assets', 'fonts')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
LATIN = 'family=Cinzel:wght@500;700;900&family=Oswald:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600'
CJK = 'family=Noto+Serif+SC:wght@600;900'
LINK = re.compile(r'<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*')


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
        return r.read()


def localize(css, keep=None):
    """Download every font file a Google Fonts stylesheet names; keep only the @font-face blocks for the given
    subsets (the comment Google puts before each block), and point them at the local files."""
    out = []
    for comment, block in re.findall(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*{[^}]*})', css) or [('', b) for b in re.findall(r'@font-face\s*{[^}]*}', css)]:
        if keep and comment and comment not in keep: continue
        url = re.search(r'url\((https://[^)]+)\)', block).group(1)
        name = re.sub(r'[^\w.-]', '_', urllib.parse.urlparse(url).path.split('/')[-1])
        fam = re.search(r"font-family:\s*'([^']+)'", block).group(1).replace(' ', '')
        style = re.search(r'font-style:\s*(\w+)', block).group(1); weight = re.search(r'font-weight:\s*(\d+)', block).group(1)
        fname = f'{fam}-{weight}{"i" if style == "italic" else ""}-{comment or "text"}-{name[-12:]}'
        with open(os.path.join(OUT, fname), 'wb') as fh: fh.write(get(url))
        out.append(block.replace(url, fname))
    return out


def main():
    html_path = os.path.join(DIST, 'index.html')
    html = open(html_path, encoding='utf8').read()
    os.makedirs(OUT, exist_ok=True)
    faces = localize(get(f'https://fonts.googleapis.com/css2?{LATIN}&display=swap').decode(), keep={'latin', 'latin-ext'})
    chars = ''.join(sorted({c for c in html if '⺀' <= c <= '鿿' or '豈' <= c <= '﫿' or '＀' <= c <= '￯' or c in '·…—'}))
    faces += localize(get(f'https://fonts.googleapis.com/css2?{CJK}&text={urllib.parse.quote(chars)}&display=swap').decode())
    with open(os.path.join(OUT, 'fonts.css'), 'w', encoding='utf8') as fh: fh.write('\n'.join(faces) + '\n')
    html = LINK.sub('', html).replace('</head>', '<link rel="stylesheet" href="assets/fonts/fonts.css">\n</head>', 1)
    with open(html_path, 'w', encoding='utf8') as fh: fh.write(html)
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'fonts: {len(faces)} faces, {len(chars)} Chinese characters, {size // 1024} KB in dist/assets/fonts')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # the game still runs on system fonts
        print('fonts: left on Google Fonts:', e, file=sys.stderr)
