# `src/game/` — game data + rules engine

Framework-agnostic game **data and pure logic** (no JSX, no React): the content
tables and deterministic rules that drive the run / quiz / lab layer. Components
in [`../features/`](../features/README.md) and hooks read from here; nothing here
imports React. This is distinct from [`../services/`](../services/README.md),
which is app/platform glue (persistence, auth, the SRS/exam engine) rather than
in-world game content.

## Modules

| Module | Responsibility |
|---|---|
| `dungeonMap.js` | Seeded map generation, biomes, boss pools, tiles, decorations (its unit suite is `dungeonMap.test.js`) |
| `difficulty.js` | Difficulty tiers + room/size scaling |
| `items.js` | Item tables + shop-stock selection |
| `quests.js` | Weekly quest pool + date-deterministic quest picking |
| `bestiary.js` | Monster/foe definitions |
| `titles.js` | Player titles + unlock rules |
| `achievements.js` | Achievement definitions + unlock checks |
| `starterDecks.js` | Bundled starter tomes/decks |
| `tome.js` | Tome shape helpers, answer-key normalization, share-code encode/decode |
| `tutorial.js` | Tutorial step content |
| `defaultState.js` | The canonical default player-state shape |

## Placement rule

Pure game content or deterministic rules go here. If a module needs React,
persistence, or network, it is a **service** or a **feature**, not game data.
Co-locate each `*.test.js` next to its module.
