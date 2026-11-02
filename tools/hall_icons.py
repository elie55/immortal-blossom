#!/usr/bin/env python3
"""The Pavilion Hall's icons, cut from two ChatGPT sheets with transparent backgrounds.

    python3 tools/hall_icons.py <Images folder>/hall_menu_icons.png <Images folder>/hall_side_icons.png

The menu sheet holds six emblems in a 3 by 2 grid: Journey, Trials, Heroines (top row), Fate Pond, The Sect, Market
(bottom row). The side sheet holds five: the lock, Settings, the Five Phases (top row), the Storage Ring and the Path
of Ascension (bottom row). They become game/assets/ui/hall_<key>.webp (tools/icon_sheet.py does the cutting).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icon_sheet import cut  # noqa: E402

MENU = ['hall_journey', 'hall_trials', 'hall_heroines', 'hall_pond', 'hall_sect', 'hall_market']
SIDE = ['hall_lock', 'hall_settings', 'hall_phases', 'hall_ring', 'hall_ascension']

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    cut(sys.argv[1], MENU)
    cut(sys.argv[2], SIDE)
