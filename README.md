# Immortal Blossoms

A premium, fully offline, landscape card-battle RPG for Android with a xianxia setting. You rebuild a fallen sect by gathering reborn flower immortals, raise them through the cultivation realms, and win card battles built on the Five Phases. No shop, no stamina wall, no PvP.

**Play it in the browser: [elie55.github.io/immortal-blossom](https://elie55.github.io/immortal-blossom/)** (landscape; on a phone, turn it sideways). The save stays in that browser.

## Documents

- [Game specification](docs/game-specification.md): world, heroines, card combat, cultivation, equipment, game modes, the Sect, summoning, screens, tech and milestones.
- [Research notes](docs/research-notes.md): what SPAM, Epic Seven and other hero collectors do, with sources.
- [Data model](docs/data-model.md): how the game databases in `data/` are organised and linked.
- [Data report](docs/data-report.md): generated counts, the source and use of every item, and the story order.
- [Economy report](docs/economy-report.md): when a simulated player reaches each milestone, and the win model calibrated on the real engine behind the game's difficulty.

## Play the core loop alpha

`game/` is the core loop alpha: Volume 1 of the Journey (five chapters) with Heaven-Defying, gear and the Storage Ring, Demon Hunts, Medicine King Valley, the Five Phases Shrines and the Forge, the Sect, heroine growth (mastery, meridians, Dao Blossom, bonds, tribulations), the Fate Pond and 14 heroines. See [game/README.md](game/README.md).

```
python3 tools/build_game.py            # builds dist/ from game/ and data/
cd dist && python3 -m http.server       # then open http://localhost:8000
```

GitHub Pages serves `main`: the `index.html` at the root (made by `tools/build_game.py`) loads the game from `game/`, so every push to `main` updates the [web version](https://elie55.github.io/immortal-blossom/) within a minute or two.

On Android, install the debug APK from the [android-alpha pre-release](https://github.com/elie55/immortal-blossom/releases/tag/android-alpha); GitHub Actions rebuilds it on every push to `main`.

`prototype/` keeps the original card battle prototype that the game grew from.

## Game data

Every heroine, technique, enemy, stage, item, shop, building and story scene is a JSON record in `data/`, linked to the others by id. The checker proves the whole graph holds together:

```
node tools/validate.mjs
node tools/validate.mjs --report docs/data-report.md
```

It fails on any broken link, any record the game cannot reach from its root, any item with no source or no use, and the game's own rules (realm bands, gear tiers, heroine kits, wave sizes). It needs only Node.js.

The specification is a snapshot of the working document as of November 2, 2026.
