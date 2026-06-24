# dnd-app design constraints (do not "fix" these)

Canonical copy of design gotchas + standing observations that used to live in `docs/SUGGESTIONS-LOG-DNDAPP.md`. **Read this before refactors** that touch the prod CSP, the renderer fog-of-war system, or app routing. Mirrors the BMO equivalent at `bmo/docs/DESIGN-CONSTRAINTS.md`.

## CSP "blocks the use of eval" DevTools issue on map load is a harmless Pixi probe — do NOT add `'unsafe-eval'`

The prod CSP (`src/main/index.ts`) sets `script-src 'self' plugin:` with no `'unsafe-eval'` (dev adds it; prod doesn't). On first map render PixiJS v8 runs a feature-detection probe (`unsafeEvalSupported()` in `pixi.js/lib/utils/browser/unsafeEval`) that calls `eval`, which CSP blocks — surfacing one DevTools - Issues entry in prod builds. This is expected and harmless: Pixi detects the block and falls back to its eval-free path (`pixi.js/unsafe-eval`), and the map renders fine. **Do not "fix" it by adding `'unsafe-eval'` to the prod `script-src`** — that materially weakens CSP for zero functional gain. _(QA-2026-06-19 task 16.)_

## Manual fog has no "disable" affordance — `Reveal All` does not turn fog off

`hideFog` flips `fogOfWar.enabled = true` (the chokepoint for "Hide All" + the fog-hide brush); new maps default to `enabled: false` and `drawFogOfWar` bails when disabled. There is no symmetric "Disable Fog" control — `Reveal All` reveals every cell but does NOT set `enabled = false`, so once fog is on the only way to fully clear it is to reveal the whole grid. A Fog-tab toggle that surfaces/clears `fogOfWar.enabled` is the intended future improvement; until then this is a **known limitation, not a bug**. _(QA-2026-06-19 task 8.)_

## `/calendar` route (real-world session scheduler) is orphaned by design

`CalendarPage` (route `/calendar`) is a real-world session scheduler, distinct from the in-game fantasy calendar (campaign wizard + in-game DM modal). Nothing in the app navigates to `/calendar` and the main menu has no Calendar item, so it is reachable only by typing the URL. Wiring it into the menu is a product decision (the page has no backend scheduling wiring), so it is **intentionally left orphaned**; the QA spec (`docs/phases/QA/INSTRUCTIONS.md` §4.1/§4.3b) is reconciled to note this state. _(QA-2026-06-19 task 18.)_

## Cross-cutting / repo-wide tests live in `src/renderer/src/test/`, not co-located

Tests are co-located next to the module they cover ~everywhere. The one deliberate
exception is `src/renderer/src/test/codebase-integrity.test.ts` — a meta test that
asserts properties of the codebase as a whole (IPC-channel count, the 5e JSON data
set parses, chat-command registry shape) rather than one module, so it has no single
module to sit beside. Such cross-cutting checks belong in `src/renderer/src/test/`.
Do **not** “fix” this by forcing it back next to an arbitrary module, and do not add a
stray `__tests__/` directory — add new repo-wide checks here instead. _(dnd-resolver 2026-06-24.)_

_Relocated from `docs/SUGGESTIONS-LOG-DNDAPP.md` on 2026-06-22._
