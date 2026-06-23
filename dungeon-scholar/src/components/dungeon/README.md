# `components/dungeon/` — the Dungeon Delve feature

The delve (the canvas mini-game played inside a tome's run) is implemented as a
self-contained triad:

- **`DungeonExplore.jsx`** — the React component: input handling, the
  `requestAnimationFrame` render loop, run/HUD state, and the
  question/combat flow. Lazy-loaded from `src/App.jsx` (it is the heaviest
  single component, so deferring its load shrinks the initial bundle).
- **`tileRenderer.js`** — pure canvas drawing primitives (`drawTile`,
  `drawPlayer`, `drawChest`, the `*_DRAWERS` sprite tables, `TILE_PX`).
  No React, no game state — given a 2D context and data, it paints.
- **`../../game/dungeonMap.js`** — pure procedural map generation + game data
  (`generateMap`, `makeSeededRng`, `BIOMES`, `ROOMS_BY_DIFFICULTY`,
  `BIOME_BOSS_POOL`, potion/foresight helpers). Imported by both the component
  and `tileRenderer.js`, and reused outside the delve
  (`features/player/usePlayerActions.js`, `features/progression/StableScreen.jsx`).

The split (component ↔ renderer ↔ map-gen) keeps the rendering primitives and
the procedural generation unit-testable in isolation from the React component.
