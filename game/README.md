# Core loop alpha

Immortal Blossoms as it grows from the vertical slice to the core loop alpha: Volume 1 of the Journey (five chapters, from the dream at the Jade Pool to the Netherflame Matriarch), gear and the Storage Ring, the Trials (Demon Hunts, Medicine King Valley, Five Phases Shrines, the Artifact Forge), heroine growth (technique mastery, meridians, Dao Blossom, bonds and Karmic Threads), the Pavilion Hall and the Fate Pond. Everything it shows comes from `data/`.

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
| Story scenes | Volume 1's scenes: standing figures with no background (speaker lit, others dimmed, a small move per expression), nameplates, typewriter text, tap anywhere, Auto, Log, Skip, title cards |
| Card battles | The prototype's engine, now fed by stage, heroine and enemy data: Haste, Kindred Qi, all 27 statuses, three Twin Blooms, missions; the dream battle keeps the 23-step tutorial |
| Victory | Mission seals, MVP, EXP and level ups, first-clear rewards and drops, battle report |
| Pavilion Hall | Lobby heroine (tap her: a few bond points a day), Journey, Trials, Heroines, Fate Pond, the Sect and the Market |
| The Sect | The Hundred Blossoms Pavilion: ten buildings on the mountain with their level and what waits in each; the Main Hall caps the others, and each Journey chapter cleared lets the Main Hall rise two levels. The Spirit Beast Garden and the Scripture Pavilion wait for the content beta |
| Main Hall | Sect Duties: five daily duties (from eight, picked by the date) and eight weekly ones, with their chest tracks |
| Closed-door Caves | Up to 4 heroines (8 from level 6) gain EXP for up to 12 hours away; each full 4 hours may bring an epiphany, a free mastery level up to +3 |
| Spirit Herb Garden | Spirit Stones and herbs grow for up to 12 hours between harvests, faster with each level |
| Alchemy Pavilion | Brews EXP pills, breakthrough pills and elixirs, and turns essences along the generating cycle; batches, more furnaces with levels, a quality roll (High gives two, Perfect three) raised by the level and the alchemist (healers most) |
| Mission Hall | 17 expeditions of 1 to 12 hours whose parties must match phases, paths and power; more slots and longer expeditions with levels |
| Tea House | The day's tea with any heroine, gifts, and the hall's heroine |
| Array Platform | Raises the Battle Arrays (Array Flags and Spirit Stones), up to the platform's level |
| Market | The Myriad Treasures Hall and the Merit Exchange, with weekly limits |
| Journey | Volume 1's five chapters with enemies, missions, rewards, stars and star chests; each stage again on Heaven-Defying |
| Formation | Four slots, guests, the Battle Array and its positions, team power, Harmony order, the team's Twin Blooms and Karmic Thread Resonance |
| Heroines | Roster, overview (stats with meridians, bond and gear), Cultivate with EXP pills, Breakthrough; from Core Formation on, a breakthrough is a tribulation: lightning waves, then her Heart Demon (a darkened copy of her card with her techniques and stats), with three allies of your choice; tabs below |
| Techniques tab | Each technique with its mastery steps: Enlightenment Scrolls and Bodhi Leaves take it to +5 (+6 for her S2 and ultimate once petal 3 or 5 is open); passives; the petals that change each one |
| Meridians tab | The five organ meridians on the generating cycle, five nodes each (essences and Spirit Stones, twice the essence of her own phase); one slot per breakthrough; the Ren and Du vessels at Body Integration halve one technique's Empower cost |
| Blossom tab | Her six petals around her portrait; Blossom Dew opens the next one, duplicates open them too; Full Bloom drifts petals across her card in battle and here |
| Bond tab | Bond 1 to 10 from battles, gifts (liked ones double), one tea a day and taps in the hall; profile entries, voices and outfits unlock with it, and +2% to +6% stats |
| Ties tab | Her Twin Blooms and her Karmic Threads (fielded together: +5% Attack each) |
| Fate Pond | Featured 5★, rates, pity, ×1 and ×10 summons with the lotus reveal; the first ten summons are guided |
| Settings | Sound, text speed, save code export and import, reset |
| Storage Ring | Every piece in pages of 40: sort, filters, select and salvage, auto-salvage rules, buy back the last 30; a piece's rolls with gauges, refining, engraving, reforging, lock |
| Heroine gear | Her ten slots, stats with gear, set bonuses and effects, compare before equipping (from the heroine's Gear tab) |
| Trials | The hub for the battle modes outside the story (opens after chapter 1): Demon Hunts, Medicine King Valley, Five Phases Shrines, the Artifact Forge; Secret Realms, the Pagoda, the Trial Tower and Raids are shown with their unlocks |
| Demon Hunts | Five beasts with their gimmicks (Qiongqi's double recharge, Taotie devouring buffs, Taowu's 24-segment Qi shield, Hundun scrambling cooldowns, Xiangliu's three heads), 13 levels each, two gear sets and their manuals per hunt, repeat battles on Auto |
| Medicine King Valley | Eight levels opened by your best realm, enemies of the day's phase (your pick at weekends), three missions per level, sweeps after three stars |
| Five Phases Shrines | Five shrines of eight levels for essences and Enlightenment Scrolls; the day's shrine drops double |
| Artifact Forge | Craft a piece of a chosen set and slot from a Forging Manual (at your highest cleared tier), Spirit Artefacts from Artefact Essence, natal gear from Mahayana on; one job at a time, in real hours |

Fourteen heroines have art: the four founders, five 5★ (Wei Zi, Hu Qiangwei, Gui Chanjuan, Gu Youlan and Ying Wucai) and five 3★ (Ning Suxin, Tang Mian, Lin Chaxue, An Baihe, Fang Yanzhi). The Fate Pond only offers heroines with art. A heroine's card, round face and cut-in come from one portrait, `card_<key>.png`, through `python3 tools/hero_art.py <Images folder> <key> --face X,Y,SIZE`.

Everyone who speaks in Volume 1 (Tao Yao, the four founders, the Medicine King, villagers, clan elders and foes: 24 figures) has a standing figure with a transparent background in `assets/stand/<key>.webp`, made from `stand_<key>.png` in the Images folder (or its latest `_v2` redo) by `python3 tools/stand_art.py <Images folder>` (trimmed to the figure, 1200 px high, alpha kept). Cards, bosses and backgrounds come from ChatGPT sheets through `python3 tools/cut_art.py <Images folder>`. Scenes and the dialogues where a character talks (Tao Yao at the Fate Pond, Old Qian's cart) use it; a speaker without one falls back to her card or portrait.

## Android

The Android app is the same game in a Capacitor shell, built by GitHub Actions (`.github/workflows/android.yml`) on every push to `core-loop-alpha` that touches the game: it builds `dist/`, bundles the Google Fonts into it (`tools/offline_fonts.py`, Noto Serif SC as a subset of the Chinese characters the game shows), generates the Android project, applies `tools/android_setup.py` (landscape only, immersive full screen, screen kept on, the icon and splash from `android-res/`, which `tools/android_assets.py` makes from the game's art) and assembles a debug APK. The APK is attached to the run and to the [android-alpha pre-release](https://github.com/elie55/immortal-blossom/releases/tag/android-alpha): open that page on the phone, download the APK and install it (Android asks to allow installs from the browser). On a machine with the Android SDK: `npm install && npm run android && npm run apk`.

In the app the hardware back button closes a dialog, offers to retreat from a battle or goes back a screen, and on the Pavilion Hall puts the game in the background. Saves stay in the app's own storage: a new APK installs over the last one and keeps them (every build is signed with the same debug key, `tools/android-debug.keystore`), but uninstalling the app deletes them, so export a save code from Settings first.

## Balance and the economy simulation

How hard each battle is comes from `rules:growth` (enemies' Health and Attack by realm, `stageMultiplier` by class of stage) and from a stage's own `power`; the balance pass set them so the core loop lasts (`docs/economy-report.md`).

```
python3 -m http.server 8765 --directory dist &                 # the built game, for the calibration
node tools/calibrate.cjs --bisect stages.json >> tools/calibration.jsonl   # lowest level at which the founders win each stage on auto
python3 tools/economy_sim.py --hours 30 --runs 20 --quiet --report docs/economy-report.md
```

`tools/calibrate.cjs` plays real battles on auto in a headless browser, on a fast clock (`window.__ib.turbo`), so a battle takes a second or two. `tools/economy_sim.py` replays the data's rules with a simple player who plays two 45-minute sessions a day, and decides battles with a win model fitted to those calibration battles. `--power-base`, `--gear-par` and `--stage-mul` try other enemy numbers without editing the data.

## Code

| File | Holds |
| --- | --- |
| `js/engine.js` | The battle engine: the prototype's clock, effects, cards, choreography, rules, battle HUD and tutorial, plus a generic technique executor that plays any technique from its data |
| `js/data.js` | Records by id, stats by level, growth (mastery steps, petal patches, meridian and bond bonuses), techniques and units for the engine, stage battles, rewards |
| `js/state.js` | The save, wallet, EXP and breakthroughs, mastery, meridians, petals, bonds and the day's tea, stage clears and stars, summons, gear |
| `js/app.js` | Screen router, top bar, dialogs, toasts, battle host |
| `js/story.js` | Scene player and the chapter flow |
| `js/gear.js` | Gear rules: rolling pieces from drop tables, stat values by tier and roll, refining, engraving, reforging, salvage, sets, a heroine's gear bonus |
| `js/ring.js` | The Storage Ring and heroine gear screens, piece details and the gear dialogs |
| `js/trials.js` | The Trials hub, Demon Hunts, Medicine King Valley and Five Phases Shrines, with repeat battles and sweeps |
| `js/forge.js` | The Artifact Forge |
| `js/sect.js` | The Sect: building levels and caps, the caves, garden, alchemy, missions, Tea House and Array Platform (all timed by timestamps, so they run while the game is closed), Sect Duties, the Market |
| `js/journey.js`, `js/hall.js`, `js/heroines.js`, `js/pond.js` | The screens |
| `js/gamedata.js`, `js/assets.js` | Generated by `tools/build_game.py` |

The four founders keep their hand-made choreography from the prototype, which also plays their Dao Blossom petals. Every other heroine and enemy plays the shared effects of her phase, and her petals are patches in the data (`patch` on a petal: set, add or remove an effect, or change the cooldown) that the game applies to the technique or passive.
