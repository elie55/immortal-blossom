# Vertical slice

The first playable slice of Immortal Blossoms: chapter 1 of the Journey, from the dream at the Jade Pool to the Wraith Captain of the Ford, with the Pavilion Hall, Formation, card battles, the victory flow, the heroine screens and the Fate Pond. Everything it shows comes from `data/`.

## Run it

```
python3 tools/build_game.py          # regenerates game/js/gamedata.js and game/js/assets.js, builds dist/
cd dist && python3 -m http.server     # then open http://localhost:8000
```

`game/` also runs as is from any local web server (`cd game && python3 -m http.server`), as plain ES modules. `dist/index.html` is the same game in one page (styles and scripts inlined) next to `dist/assets/`, which is what the artifact publishes. Rebuild after editing anything in `data/`.

## What is in it

| Screen | What it does |
| --- | --- |
| Title | New game or continue; the save lives in IndexedDB (local storage as a fallback) |
| Story scenes | Chapter 1's scenes: standing figures with no background (speaker lit, others dimmed, a small move per expression), nameplates, typewriter text, tap anywhere, Auto, Log, Skip, title cards |
| Card battles | The prototype's engine, now fed by stage, heroine and enemy data: Haste, Kindred Qi, all 27 statuses, three Twin Blooms, missions; the dream battle keeps the 23-step tutorial |
| Victory | Mission seals, MVP, EXP and level ups, first-clear rewards and drops, battle report |
| Pavilion Hall | Lobby heroine (tap her), Journey, Heroines, Fate Pond; the Sect and Market are shown locked |
| Journey | The 8 stages of chapter 1 with enemies, missions, rewards, stars and the three star chests |
| Formation | Four slots, guests, Yellow Dragon array, team power, Harmony order and the team's Twin Blooms |
| Heroines | Roster, overview (stats, techniques, passives, Twin Blooms, profile), Cultivate with EXP pills, Breakthrough |
| Fate Pond | Featured 5★, rates, pity, ×1 and ×10 summons with the lotus reveal; the first ten summons are guided |
| Settings | Sound, text speed, save code export and import, reset |
| Storage Ring | Every piece in pages of 40: sort, filters, select and salvage, auto-salvage rules, buy back the last 30; a piece's rolls with gauges, refining, engraving, reforging, lock |
| Heroine gear | Her ten slots, stats with gear, set bonuses and effects, compare before equipping (from the heroine's Gear tab) |
| Trials | The hub for the battle modes outside the story (opens after chapter 1): Demon Hunts, Medicine King Valley, Five Phases Shrines, the Artifact Forge; Secret Realms, the Pagoda, the Trial Tower and Raids are shown with their unlocks |
| Demon Hunts | Five beasts with their gimmicks (Qiongqi's double recharge, Taotie devouring buffs, Taowu's 24-segment Qi shield, Hundun scrambling cooldowns, Xiangliu's three heads), 13 levels each, two gear sets and their manuals per hunt, repeat battles on Auto |
| Medicine King Valley | Eight levels opened by your best realm, enemies of the day's phase (your pick at weekends), three missions per level, sweeps after three stars |
| Five Phases Shrines | Five shrines of eight levels for essences and Enlightenment Scrolls; the day's shrine drops double |
| Artifact Forge | Craft a piece of a chosen set and slot from a Forging Manual (at your highest cleared tier), Spirit Artefacts from Artefact Essence, natal gear from Mahayana on; one job at a time, in real hours |

Ten heroines have art in the slice: the four founders, Wei Zi (5★), and five 3★ heroines (Ning Suxin, Tang Mian, Lin Chaxue, An Baihe, Fang Yanzhi). The Fate Pond only offers heroines with art.

Everyone who speaks in chapter 1 (Tao Yao, the four founders and six villagers and foes) has a standing figure with a transparent background in `assets/stand/<key>.webp`, made from `stand_<key>.png` in the Images folder by `python3 tools/stand_art.py <Images folder>` (trimmed to the figure, 1200 px high, alpha kept). Scenes and the dialogues where a character talks (Tao Yao at the Fate Pond, Old Qian's cart) use it; a speaker without one falls back to her card or portrait.

## Code

| File | Holds |
| --- | --- |
| `js/engine.js` | The battle engine: the prototype's clock, effects, cards, choreography, rules, battle HUD and tutorial, plus a generic technique executor that plays any technique from its data |
| `js/data.js` | Records by id, stats by level, techniques and units for the engine, stage battles, rewards |
| `js/state.js` | The save, wallet, EXP and breakthroughs, stage clears and stars, summons |
| `js/app.js` | Screen router, top bar, dialogs, toasts, battle host |
| `js/story.js` | Scene player and the chapter flow |
| `js/gear.js` | Gear rules: rolling pieces from drop tables, stat values by tier and roll, refining, engraving, reforging, salvage, sets, a heroine's gear bonus |
| `js/ring.js` | The Storage Ring and heroine gear screens, piece details and the gear dialogs |
| `js/trials.js` | The Trials hub, Demon Hunts, Medicine King Valley and Five Phases Shrines, with repeat battles and sweeps |
| `js/forge.js` | The Artifact Forge |
| `js/journey.js`, `js/hall.js`, `js/heroines.js`, `js/pond.js` | The screens |
| `js/gamedata.js`, `js/assets.js` | Generated by `tools/build_game.py` |

The four founders keep their hand-made choreography from the prototype. Every other heroine and enemy plays the shared effects of her phase.
