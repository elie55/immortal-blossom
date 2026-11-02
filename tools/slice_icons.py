#!/usr/bin/env python3
"""Slice ChatGPT icon sheets (a grid of square tiles on dark gutters) into game/assets/icons/<key>.webp.

    python3 tools/slice_icons.py <Images folder>

The gutters are found from the image itself: near-black lines around 1/3 and 2/3 (or 1/2 for a 2x2 sheet), else
rows and columns of near-uniform colour there, so a sheet whose rows came out uneven still slices cleanly. Each tile is
trimmed to a centred square and saved at 160 px. SHEETS below names every tile in reading order.
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'icons')
SIZE = 160

SHEETS = {
    'sheet_gear_slots.png': ['gear_weapon', 'gear_helmet', 'gear_body', 'gear_gloves', 'gear_pants', 'gear_boots', 'gear_ring', 'gear_pendant', 'gear_artefact'],
    'sheet_artefacts_v3.png': ['art_immortal_slaying_knife', 'art_demon_revealing_mirror', 'art_plantain_fan', 'art_immortal_binding_rope', 'art_wind_fire_wheels',
                               'art_heaven_shaking_seal', 'art_lotus_lantern', 'art_qiankun_pouch', 'art_purple_gold_gourd'],
    'sheet_forge_v3.png': ['art_dinghai_pearl', 'cat_manual', 'dao_mark', 'cat_fragment', 'spirit_silver', 'starfall_iron', 'void_gold', 'artefact_essence', 'dao_crystal'],
    'sheet_materials.png': ['bodhi_leaf', 'array_flag', 'heavenly_fortune', 'sect_merit', 'metal_essence', 'wood_essence', 'water_essence', 'fire_essence', 'earth_essence'],
    'sheet_herbs_v3.png': ['egg_common', 'egg_rare', 'egg_celestial', 'fire_lingzhi', 'nine_leaf_lingzhi', 'snow_lotus', 'spirit_elixir', 'resolve_elixir', 'revival_elixir'],
    'sheet_pills_gifts.png': ['nascent_soul_pill', 'severing_pill', 'void_pill', 'integration_pill', 'mahayana_pill', 'gift_hawthorn_candy', 'gift_plum_wine',
                              'gift_embroidered_pouch', 'gift_jade_hairpin'],
    'sheet_gifts_menu_v2.png': ['gift_calligraphy_scroll', 'gift_guqin_strings', 'gift_poetry_anthology', 'gift_sandalwood_incense', 'gift_silk_fan', 'gift_spirit_tea',
                                'gift_sword_tassel', 'ui_storage_ring', 'ui_forge'],
    # Sect buildings (bigger: they show at 150 px in a building's screen)
    'sheet_sect_buildings.png': ['bld_main_hall', 'bld_closed_door_caves', 'bld_spirit_herb_garden', 'bld_alchemy_pavilion', 'bld_mission_hall', 'bld_spirit_beast_garden',
                                 'bld_array_platform', 'bld_scripture_pavilion', 'bld_tea_house'],
    # technique icons go to assets/ui/<key>_s<n>.webp, like the founders'
    'sheet_icons_heroines_1.png': ['ui:hu_qiangwei_s1', 'ui:hu_qiangwei_s2', 'ui:hu_qiangwei_s3', 'ui:gui_chanjuan_s1', 'ui:gui_chanjuan_s2', 'ui:gui_chanjuan_s3',
                                   'ui:gu_youlan_s1', 'ui:gu_youlan_s2', 'ui:gu_youlan_s3'],
    'sheet_icons_heroines_2.png': ['ui:ying_wucai_s1', 'ui:ying_wucai_s2', 'ui:ying_wucai_s3', 'ui_tea'],
}
GRID = {'sheet_icons_heroines_2.png': 2}           # sheets that are not 3x3
SIZES = {'sheet_sect_buildings.png': 256}           # tiles saved bigger than 160 px


def dark_gutters(lum, axis, n):
    """Tile spans from near-black gutter lines (the usual ChatGPT sheet), or None when a cut has no dark line near it."""
    size = lum.shape[1 - axis]
    dark = (lum.mean(axis=axis) < 25) & (np.percentile(lum, 95, axis=axis) < 60)
    runs = []
    for i in np.flatnonzero(dark):
        if runs and i == runs[-1][1] + 1: runs[-1][1] = i
        else: runs.append([i, i])
    cuts = []
    for k in range(1, n):
        c = size * k / n
        near = [r for r in runs if abs((r[0] + r[1]) / 2 - c) < size / 12]
        if not near: return None
        cuts.append(max(near, key=lambda r: r[1] - r[0]))
    b0 = runs[0][1] + 1 if runs and runs[0][0] == 0 else 0
    b1 = runs[-1][0] if runs and runs[-1][1] == size - 1 else size
    edges = [int(e) for e in [b0] + [x for c in cuts for x in (c[0], c[1] + 1)] + [b1]]
    return [(edges[2 * i], edges[2 * i + 1]) for i in range(n)]


def gutters(lum, axis, n):
    """Return the n-1 inner gutter bands and the outer border along one axis, as [(start, end)] of the tiles."""
    d = dark_gutters(lum, axis, n)
    if d: return d
    size = lum.shape[1 - axis]
    std = lum.std(axis=axis)                      # a gutter line is one flat colour across the image
    flat = std < np.percentile(std, 12) * 1.3 + 2
    cuts = []
    for k in range(1, n):
        c = round(size * k / n)
        lo, hi = c - size // 10, c + size // 10
        idx = [i for i in range(lo, hi) if flat[i]]
        if not idx:
            cuts.append((c - 4, c + 4)); continue
        # the longest run of flat lines near the expected cut
        runs, s = [], idx[0]
        for a, b in zip(idx, idx[1:] + [None]):
            if b != a + 1: runs.append((s, a)); s = b
        cuts.append(max(runs, key=lambda r: r[1] - r[0]))
    # outer border: flat lines at the very edge
    b0 = 0
    while b0 < size // 20 and flat[b0]: b0 += 1
    b1 = size - 1
    while b1 > size - size // 20 and flat[b1]: b1 -= 1
    edges = [b0] + [x for c in cuts for x in (c[0], c[1] + 1)] + [b1 + 1]
    return [(edges[2 * i], edges[2 * i + 1]) for i in range(n)]


def slice_sheet(path, names, n=3, size=SIZE):
    im = Image.open(path).convert('RGB')
    lum = np.asarray(im.convert('L'), dtype=float)
    rows, cols = gutters(lum, 1, n), gutters(lum, 0, n)
    out = []
    for i, name in enumerate(names):
        (y0, y1), (x0, x1) = rows[i // n], cols[i % n]
        s = min(y1 - y0, x1 - x0)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        sq = im.crop((cx - s // 2, cy - s // 2, cx - s // 2 + s, cy - s // 2 + s))
        if name.startswith('ui:'):   # a technique icon: assets/ui at 400 px
            sq.resize((400, 400), Image.LANCZOS).save(os.path.join(ROOT, 'game', 'assets', 'ui', f'{name[3:]}.webp'), 'WEBP', quality=86, method=6)
        else:
            sq.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=85, method=6)
        out.append(name)
    return rows, cols


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[2:])
    for sheet, names in SHEETS.items():
        if only and sheet not in only: continue
        base, ext = os.path.splitext(sheet)
        cands = [os.path.join(src, sheet)] + [os.path.join(src, f'{base}_v{i}{ext}') for i in range(2, 6)]
        have = [c for c in cands if os.path.exists(c)]
        if not have:
            print('missing', sheet); continue
        p = have[-1]
        rows, cols = slice_sheet(p, names, GRID.get(sheet, 3), SIZES.get(sheet, SIZE))
        print(f'{sheet}: rows {rows} cols {cols}')
