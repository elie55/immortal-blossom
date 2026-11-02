# Data model

The game's content lives in `data/` as JSON, one domain per folder. Every record has a typed id, records link to each other by id, and `node tools/validate.mjs` proves that the whole graph holds together: no broken link, no orphan, no item without a source or a use.

```
node tools/validate.mjs                              # check everything
node tools/validate.mjs --report docs/data-report.md # also write the report
```

Run the checker after every change. It exits with an error code when anything is wrong, so it can gate commits or a build.

## Ids and links

- An id is `type:key`, for example `hero:ling_shuang`, `item:qi_gathering_pill`, `stage:v1c1_08`. Keys are lowercase snake_case and never change once used; names can change freely.
- Any string anywhere in a record that has the shape `type:key` with a known type is a link. There is no separate schema for links: the checker finds them all.
- Every file is `{"about": "what this file holds", "records": [ ... ]}`. A record's `id` is the only required field.
- `"draft": true` marks content that is a first pass and needs a designer's review (the 26 roster heroines, the scene scripts, rival sect names, outfit names). Drafts are checked like everything else.

| Prefix | What | Where |
| --- | --- | --- |
| `game:` | The game root; every record must be reachable from it | `game.json` |
| `rules:` `phase:` `path:` `stat:` `realm:` `status:` `sys:` | Combat, growth and gear rules; phases, paths, stats, realms, statuses; game systems with what they spend and produce | `rules/` |
| `hero:` `thread:` `combo:` | Heroines, their Karmic Threads and their Twin Bloom combos | `heroines/` |
| `skill:` | Techniques and passives of heroines and enemies | `skills/` |
| `enemy:` | Enemy templates (stats at level 1, techniques, boss data) | `enemies/` |
| `faction:` `loc:` `npc:` | Factions, places, characters | `world/` |
| `chapter:` `scene:` | Story chapters and scene scripts | `story/` |
| `stage:` | Every fixed battle: Journey, hunts, Valley, shrines, Pagoda, Tower, raids | `stages/` |
| `mode:` `hunt:` `theme:` `insight:` `event:` `camp:` `dao:` `trial:` `raid:` `tower:` `league:` `rival:` `tourn:` | Game modes and their parts | `modes/` |
| `cur:` `item:` `outfit:` | Currencies, materials, gifts, fragments, outfits | `items/` |
| `slot:` `rarity:` `tier:` `set:` `unique:` `art:` | Gear rules and gear | `gear/` |
| `enc:` `array:` | Fortuitous Encounters and Battle Arrays | `battle/` |
| `beast:` | Spirit beasts | `beasts/` |
| `drops:` `recipe:` `shop:` | Drop tables, Alchemy and Forge recipes, shops | `economy/` |
| `bld:` `exped:` | Sect buildings and expeditions | `sect/` |
| `rank:` `checkin:` `pass:` `duty:` `chest:` `ach:` `title:` `pond:` `recruit:` | Sect Rank, check-in, Path of Ascension, duties, Renown, titles, Fate Pond, Sect Recruitment | `progression/` |

## Sources and uses

The checker reads the key a link sits under to know whether the player gains or spends the target:

- **Source** keys: `rewards`, `drops`, `output`, `stock`, `salvage`, `joins`, `pool`, `produces`, `hatches`, `grants` and any key ending in `Rewards` (`firstClearRewards`, `seasonRewards`, `tierRewards` ...). Drop tables count as sources as a whole.
- **Use** keys: `cost`, `inputs`, `price`, `consumes`, `fee` and any key ending in `Cost` or `Costs` (`breakthroughCost`, `upgradeCost`, `refineCosts`).
- Every currency and item needs at least one source and one use. Heroines, outfits, titles, Spirit Artefacts, sets, unique gear and spirit beasts need a source. A record can opt out with `"noSource": true` or `"noSink": true`, which should be rare and deliberate.

## What the checker enforces

1. Files parse, ids are well formed, of a known type and unique.
2. Every link resolves to a record that exists.
3. Every record is reachable from `game:immortal_blossoms` by following links (no orphans, no disconnected islands).
4. Economy: sources and uses as above.
5. Heroines: three techniques in slots S1, S2, S3 and passives at levels 30 and 50; six petals, petal 3 taking the S2 and petal 5 the ultimate to mastery +6; unique gear that points back to her; liked and disliked gifts are gifts; bond outfits at levels 6 and 10. With the full roster: 10 heroines per rarity and a 5★ on every path. Rarity steps: a heroine's power index (the mean of HP, offense and Defense against her path's 4★ `standard` in `rules/paths.json`, where offense is ATK × (1 + crit × (critDmg − 1))) must be 0.92 for 3★, 1.00 for 4★ and 1.08 for 5★, within 0.01.
6. Techniques: every technique's owner lists it (or it is marked `shared` by an enemy family); cooldowns S1 = 1, S2 2 to 4, ultimates 4 to 6; Empower costs 6 or 10; effect verbs and passive triggers come from a fixed vocabulary (top of `tools/validate.mjs`).
7. Karmic Threads: each pair once, 2 to 4 threads per heroine. Twin Blooms: two different heroines, both list the combo, a shared thread ties the same pair, and every 5★ heroine has at least two Twin Blooms, one of them with another 5★.
8. Stages: 1 to 3 waves of at most 4 card slots (a boss takes 2); chapters chain stage after stage, and every unlock chain starts somewhere.
9. Progression map: a stage's realm and gear tier agree; its enemies' levels sit in that realm's band; the gear it drops is of its tier; Heaven-Defying levels sit in the band of the tier they drop.
10. Drop chances are between 0 and 1, rarity odds sum to 1, realm caps rise by 10 to 80, Fate Pond rates sum to 1.
11. Scenes have a location and lines spoken by heroines or characters; every character appears in a scene, shop, place or contest; every enemy fights somewhere.

## Main record shapes

- **hero**: `name, cn, title, rarity, phase, path, flower, faction, zodiac, birthday, base{hp, atk, def, crit, critDmg}, skills[S1, S2, S3], passives[p30, p50], petals[6], unique, gifts{likes, dislikes}, bondRewards, profile, quotes, art`. Stats are level 1; `rules:growth` scales them. Ids and art keys use her Chinese name (`hero:wei_zi`, `card_wei_zi`), never her flower.
- **skill**: `owner | shared, slot, name, cooldown, start, target, effects[{do, ...}], text, empower{cost, effects, text}, mastery[]`; passives use `trigger` instead of a cooldown.
- **enemy**: `name, family, faction, phase, profile, base, skills[]`, plus `boss, wide, qiShield, script, character` (the npc a boss is) where relevant. Phase `day` means the Valley's day phase, `shrine` the shrine's phase, `mirror` the heroine on trial.
- **stage**: `name, mode, kind, location, realm, tier, unlock{clear | realm}, waves[[{enemy, level, phase?}]], missions[3], drops, firstClearRewards`, plus `chapter, scenes{before, after}, beat, guests, giver, shop, heavenDefying{levelOffset, tier, drops, power}` for Journey stages. An optional `power` (and `heavenDefying.power`) multiplies the Health and Attack of the stage's enemies, on top of its class's multiplier.
- **Enemy power** (`rules:growth`): an enemy's Health, Attack and Defense grow like a heroine's (+8% a level, +10% a realm); Health and Attack are then multiplied by `enemyPowerBase`, by 1 + `enemyGearPar` per realm (the gear players wear by then), by the stage class's `stageMultiplier` (classes: `story battle`, `story boss`, `hd battle`, `hd boss`, `hunt <name>`, `valley`, `shrine`) and by the stage's own `power`. The balance pass set these from the economy simulation (`docs/economy-report.md`).
- **drops**: `entries[{item | cur | gear{tier, set | sets, slot, rarityOdds} | drops, qty[min, max], chance | weight}]`, optional `rolls`.
- **recipe**: `station (bld), inputs[], output, hours`. **shop**: `keeper (npc), location, refresh, stock[{item | cur | insight, qty, price[], limit}]`.
- **scene**: `name, location, cast[], lines[{speaker?, expression?, text}]`; a line without a speaker is narration.

## The save (game/js/state.js)

The game keeps one JSON save (schema 4) in IndexedDB, with localStorage as a fallback and a checksum; Settings exports and imports it as a code. Older saves are upgraded on load.

- **Wallet:** `cur{}` and `items{}` by id. **Heroines:** `heroes{hid: {level, exp, bt, petals, bond, mastery{skill id: level}, meridians{lung|liver|kidney|heart|spleen|ren_du: nodes}, renDu, eq{position: piece id}}}`, where `bond` counts bond points (the level comes from `rules:growth.bondLevels`), `renDu` is the technique the Ren and Du vessels upgrade, and the ten positions are `weapon, helmet, body, gloves, pants, boots, ring1, ring2, pendant, artefact`. `day{key, tea, taps}` holds today's tea (one heroine a day) and lobby-tap points.
- **Storage Ring:** `gear{seq, pieces{id: piece}, recent[], auto{}, view{sort, dir, filter}}`. A piece is `{id, kind: 'gear', slot, rarity, tier, set, main{stat, form, roll}, subs[{stat, form, rolls[]}], plus, engraved, lock, hero, pos, got, new}`; a Spirit Artefact is `{id, kind: 'art', slot: 'slot:artefact', art, rarity, plus, ...}`. Rolls are shares of the best value (0 to 1); values come from `rules:gear` and the tier, so a reforged piece keeps its rolls. `recent` keeps the last 30 salvaged pieces with what they returned.
- **Progress:** `stages{id: {clear, missions[3], clears}}`, `chapterRewards`, `pond{pulls, pity, fatePoints, guided}`, `flags`, `settings`, `log`.
- **Sect:** `sect{levels{bld id: level}, caves{hid: since}, garden{since, carry{id: fraction}}, alchemy{alchemist, jobs[{recipe, count, start, end}]}, missions{exped id: {heroes[], start, end}}}`; times are epoch milliseconds, and everything is worked out from them when the game resumes. `duties{day, week, daily{duty id: n}, weekly{}, claimed{daily[], weekly[]}}` and `shops{week, bought{"shop id#row": n}}` reset when the day or the week (from Monday) turns.

## Adding content

- New stage: give it a realm and tier from the progression map, waves of existing enemies inside the realm's level band, a drop table of the same tier, an unlock, and link it from its mode (or chapter).
- New item: add it, then give it at least one source (a drop table, reward, shop, recipe output or system) and one use (a cost, recipe input, shop price or system).
- New heroine: follow `heroines/founders.json`; add her five skills, her unique gear, its fragment and forge recipe, two bond outfits, 2 to 4 Karmic Threads and any Twin Blooms (`heroines/combos.json`); add her to the Fate Pond pool (and Sect Recruitment if 3★ or 4★). Give petals 1, 2, 4 and 6 a `patch` so the game plays them: `{"match": {...}, "set": {...}}` changes the matching effects, `{"add": effect}` appends one, `{"remove": {...}}` drops the matching ones, `{"cooldown": n}` sets the cooldown; `skill` names another technique or passive than the petal's `modifies`. Mastery steps are read from the technique's `mastery` strings ("+10% damage and healing", "+10% effect chance", "Cooldown -1", "Iron Body lasts 3 turns").
- Then run the checker; it names anything left unconnected.
