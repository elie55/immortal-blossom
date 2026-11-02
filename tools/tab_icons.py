#!/usr/bin/env python3
"""The heroine screen's tab icons, cut from one ChatGPT sheet with a transparent background.

    python3 tools/tab_icons.py <Images folder>/tab_icons.png

The sheet holds six emblems in a 3 by 2 grid, in the order of the tabs: Techniques, Gear, Meridians (top row),
Blossom, Bond, Ties (bottom row). They become game/assets/ui/tab_<key>.webp (tools/icon_sheet.py does the cutting).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icon_sheet import cut  # noqa: E402

NAMES = ['tab_tech', 'tab_gear', 'tab_meri', 'tab_bloom', 'tab_bond', 'tab_ties']

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    cut(sys.argv[1], NAMES)
