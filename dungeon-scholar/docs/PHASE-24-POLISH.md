# Phase 24 Polish — Deferred Items

This file tracks polish/deferred work to address in Phase 24 (Polish, Balance & Final Pass). Items are added as earlier phases choose to defer non-essential scope.

## Run history (Phase 10)

- ~~**Sortable columns on the Chronicle of Delves.**~~ — Done. `RunHistoryScreen` now has a header bar with toggle-sort buttons for Date / Difficulty / Boss / Score / Streak / Duration. Default remains date-desc; clicking the active key flips direction, switching keys defaults to desc.
- ~~**Accuracy heatmap by domain/topic.**~~ — Done. Aggregates `runHistory[].questionLog[]` entries by `domain` across the active tome's runs and renders a colored grid (red <50%, amber 50–74%, emerald 75–89%, gold 90+%). Older tomes without per-question domain tags fall under "Uncategorized" with a footnote prompting users to regenerate.

## Prompt system (cross-cutting)

- ~~**Per-question `domain` and `tags` fields.**~~ — Done. `src/prompts/_shared.js` now requires a top-level `domain` on every quiz item and lab; lab steps may override. New `=== DOMAIN TAGGING ===` section in the schema documents the requirement and explains the heatmap dependency. New unit test in `_shared.test.js` enforces the schema text.

## Build / structure

- ~~**App.jsx is large.**~~ — Resolved in **PHASE-39** (`dnd-app/docs/phases/completed/PHASE-39-ds-architecture.md`). The 11k-line monolith was split into `src/game/` (data + helpers), `src/features/<area>/` (one folder per screen area), `src/components/ui/` (primitives), and `src/router/` (hash routing); player-state mutators moved into the `usePlayerActions` hook. Every screen except Home is now `React.lazy`-loaded as its own chunk behind one `Suspense` boundary — the earlier `vendor-react`/`vendor-icons` `manualChunks` split stays. Net: main app chunk **543 KB → 376 KB**, no chunk-size warning. (The deferred `[2026-05-05] Code-split the major study modes` suggestion is now done.)
- ~~**Delete the legacy `DungeonRun` and `BossEncounter` components in `src/App.jsx`.**~~ — Done in Phase 24. Removed `DungeonRun`, `BossEncounter`, `RunQuestionReview`, `ModifierToggle`, and `ChallengeRenderer` (~1290 lines). `BOSS_TYPES` and `DIFFICULTIES` were kept because `RunHistoryScreen` still consumes them.

---

When adding a new item, prepend a one-line summary under the relevant section, with enough detail that future-Claude can pick up the work without re-deriving the requirement.
