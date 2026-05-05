# Phase 24 Polish — Deferred Items

This file tracks polish/deferred work to address in Phase 24 (Polish, Balance & Final Pass). Items are added as earlier phases choose to defer non-essential scope.

## Run history (Phase 10)

- ~~**Sortable columns on the Chronicle of Delves.**~~ — Done. `RunHistoryScreen` now has a header bar with toggle-sort buttons for Date / Difficulty / Boss / Score / Streak / Duration. Default remains date-desc; clicking the active key flips direction, switching keys defaults to desc.
- ~~**Accuracy heatmap by domain/topic.**~~ — Done. Aggregates `runHistory[].questionLog[]` entries by `domain` across the active tome's runs and renders a colored grid (red <50%, amber 50–74%, emerald 75–89%, gold 90+%). Older tomes without per-question domain tags fall under "Uncategorized" with a footnote prompting users to regenerate.

## Prompt system (cross-cutting)

- ~~**Per-question `domain` and `tags` fields.**~~ — Done. `src/prompts/_shared.js` now requires a top-level `domain` on every quiz item and lab; lab steps may override. New `=== DOMAIN TAGGING ===` section in the schema documents the requirement and explains the heatmap dependency. New unit test in `_shared.test.js` enforces the schema text.

## Build / structure

- ~~**App.jsx is large.**~~ — Mitigated. Vite `manualChunks` now isolates `vendor-react` (134 KB) and `vendor-icons` (28 KB) from the app bundle. `DungeonExplore` is lazy-loaded via `React.lazy` + `Suspense` (77 KB chunk that defers until the player enters a delve). Net: main app chunk dropped 624 KB → 386 KB and the chunk-size warning is gone. Further mode-by-mode splitting (FlashcardsMode/QuizMode/LabMode/ShopScreen/RunHistoryScreen) can come later if the main bundle re-grows.
- ~~**Delete the legacy `DungeonRun` and `BossEncounter` components in `src/App.jsx`.**~~ — Done in Phase 24. Removed `DungeonRun`, `BossEncounter`, `RunQuestionReview`, `ModifierToggle`, and `ChallengeRenderer` (~1290 lines). `BOSS_TYPES` and `DIFFICULTIES` were kept because `RunHistoryScreen` still consumes them.

---

When adding a new item, prepend a one-line summary under the relevant section, with enough detail that future-Claude can pick up the work without re-deriving the requirement.
