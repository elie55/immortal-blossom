# Card battle prototype

The playable card battle prototype: the four founding Blossoms against two waves of wraiths and the Netherflame Matriarch, with the 23-step Tao Yao tutorial.

- `index.bundled.html` is the published single-file build (open it next to `assets/`).
- `js/` and `css/` hold the source modules recovered from that build, one file per module: core, vfx, data, board, skills, battle, ui, tutorial, main. The bundler stripped the `import`/`export` lines, so each file reads as part of one shared scope.
- `assets/` holds the card art, cut-ins, technique icons and effect sprites as WebP.

The vertical slice in `game/` grows out of this code.
