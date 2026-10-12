# Light/Split

A light-routing puzzle: bend, split, and recombine colored light to feed every receptor exactly its color. Three.js, single-file build.

**Play it:** enable GitHub Pages (Settings → Pages → `main` / root), then open `https://pete1450.github.io/Light-Split/`

## The game

- 10×10 board, 10 colors (red · orange · yellow · lime · green · teal · cyan · azure · blue · white)
- Pieces: white/colored emitters, mirror, splitter prism (fans white into 5 spectral beams), combiner prism (mixes beams to the spectral midpoint), 10 color receptors, walls
- Emitters, mirrors, splitters, combiners rotate freely (drag); light recomputes live
- Tap a piece to fix/unfix it (fixed = gold base, locked); the `{ }` button exports the board as level JSON
- 6 levels (`build/levels/*.json`) + Sandbox with unlimited pieces

## Build

```sh
cd build
node test_logic.js   # 44 physics/logic tests
python3 build.py     # validates levels/*.json, writes ../index.html
```

`index.html` is the self-contained game (three.js r147 inlined) — that's the file Pages serves.

## Level format

Levels are JSON in `build/levels/`. Piece: `{"x":0,"y":4,"t":"emit","a":0,"col":"W"}` — `t` is `emit|mirror|split|comb|recv|wall`, `a` is radians (rotatable pieces), `col` is `R|O|Y|L|G|T|C|A|B|W`. A piece with `"fixed": false` starts unlocked.
