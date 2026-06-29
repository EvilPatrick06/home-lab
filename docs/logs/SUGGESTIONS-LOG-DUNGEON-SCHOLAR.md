# dungeon-scholar Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dungeon-scholar domain only.**
>
> Sibling logs:
> - dnd-app suggestions → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dungeon-scholar active bugs / debt → [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dungeon-scholar` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dungeon-scholar behavior → mirrored here AND in the other relevant suggestions log. Cross-tooling rules that touch dungeon-scholar contributors → here (and mirror in another file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-28] Extract logic/content out of the two god-component files (`DungeonExplore.jsx` 2736 lines, `App.jsx` 2085 lines)

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
`src/components/dungeon/DungeonExplore.jsx` (2736 lines) and `src/App.jsx` (2085 lines) are by far the largest source files in the tree (next largest is `tileRenderer.js` at 1576). `DungeonExplore.jsx` mixes three concerns in one file: pure data/logic constants that are exported and unit-tested separately (`BIOMES`, `BIOME_BOSS_POOL`, etc. — imported by `DungeonExplore.test.js`), the canvas render loop, and the React setup/UI. `App.jsx` is the top-level orchestrator holding cross-cutting state (e.g. `shuffledActivities`, modal wiring, routing glue). Both are hard to test in isolation and are the two hotspots for the 59 combined `useExhaustiveDependencies` lint warnings already noted in `ISSUES-LOG-DUNGEON-SCHOLAR.md` (App.jsx 34, DungeonExplore.jsx 25).

**Hypothesis / root cause:** Organic growth — content tables, render code, and component glue accreted in the same module instead of being split as they grew.

**Proposed fix / improvement:**
- [ ] Extract the exported data/logic constants from `DungeonExplore.jsx` into a sibling `dungeonContent.js` (or `dungeonBiomes.js`); point `DungeonExplore.test.js` at that module — which also removes the `.test.js`-tests-a-`.jsx`-component oddity (see the test-extension entry below).
- [ ] Split the canvas render loop into its own helper module, leaving `DungeonExplore.jsx` as the React shell.
- [ ] Carve cohesive slices of `App.jsx` (modal orchestration, activity-shuffle state) into hooks under `src/hooks/` (the codebase already favors this pattern: `useAppModals`, `useAppSurfaces`, `usePlayerState`).

**Related files:** `src/components/dungeon/DungeonExplore.jsx`, `src/components/dungeon/DungeonExplore.test.js`, `src/App.jsx`

**Related entries:** ISSUES-LOG-DUNGEON-SCHOLAR.md [2026-06-28] "244 non-gating biome lint warnings" (the App.jsx / DungeonExplore.jsx exhaustive-deps concentration).

# Low-severity polish / info

### [2026-06-28] Orphaned utility modules `utils/time.js` + `utils/shuffle.js` — unused, and the duplication they were meant to remove still exists

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
`src/utils/time.js` (exports `formatSec`, `formatMs`) and `src/utils/shuffle.js` (exports a generic Fisher-Yates `shuffle`) have **zero importers anywhere in `src/`** (grep for `utils/time`, `utils/shuffle`, `formatSec`, `formatMs`, and `import { shuffle }` all return nothing — including tests). They are dead module files. Note this is NOT caught by the biome `noUnusedImports` warnings already logged: nothing imports the files, so there is no unused-import to flag — biome only sees within-file dead code. Worse, both files were created (their own header comments say so, "S22") to be the *canonical home* that removes duplication, yet the duplication persists:
- m/s formatting is still inlined in `features/study/ExamMode.jsx` (lines 26, 252) and `game/tome.js` (line 124) instead of using `time.js`.
- bespoke shuffles still live in `game/items.js`, `game/dungeonMap.js` (its own local `shuffle`), `game/tome.js` (`shuffleArray`), `game/quests.js`, and `services/examSession.js` (`shuffleInPlace`) instead of using `utils/shuffle.js`.

So the refactor was half-done: the shared helpers were written but never wired in, leaving orphans + ongoing duplication.

**Hypothesis / root cause:** The consolidation commit (tagged "S22") added the shared util files but never completed the call-site migration; the originals were left in place and the new files stranded.

**Proposed fix / improvement:**
- [ ] Decide one direction. Either: (a) finish the consolidation — replace the inline m/s formatters with `time.js` and the bespoke shuffles with `utils/shuffle.js`, and add the missing `time.test.js` / `shuffle.test.js`; or (b) if the per-call-site variants are intentionally different (seeded vs `Math.random`, in-place vs copy), delete the two orphaned files so they stop implying a shared path that isn't used.
- [ ] If keeping `utils/shuffle.js`, reconcile the seeded-RNG signature so `dungeonMap.js`/`quests.js`/`examSession.js` (which need a deterministic `rng`) can actually adopt it.

**Related files:** `src/utils/time.js`, `src/utils/shuffle.js`, `src/features/study/ExamMode.jsx`, `src/game/tome.js`, `src/game/items.js`, `src/game/dungeonMap.js`, `src/game/quests.js`, `src/services/examSession.js`

---

### [2026-06-28] Inconsistent README coverage across `src/` subdirectories

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
Only three `src` subdirectories carry a `README.md` (`src/components/`, `src/components/dungeon/`, `src/services/`). The rest have none — including the most populous and least self-explanatory ones: `src/features/` and its 7 feature folders (11+ screen components across study/progression/library/etc.), `src/game/` (the run/quiz/lab content + rules engine), `src/prompts/` (11 per-vendor Oracle prompt modules), `src/hooks/`, and `src/router/`. A newcomer can learn the `components`/`services` conventions but gets no orientation for the feature-folder layout or the game/prompts content model, which is where most of the domain logic lives.

**Hypothesis / root cause:** READMEs were added ad hoc for the first few directories touched and the practice was never extended as `features/` and `game/` grew.

**Proposed fix / improvement:**
- [ ] Add a short `README.md` to `src/features/` explaining the feature-folder convention (one folder per screen group; co-located hooks/modals), plus one-liners per feature folder.
- [ ] Add a `src/game/README.md` (what the run/quiz/lab content set is, how `starterDecks`/`bestiary`/`items`/`quests` relate) and a `src/prompts/README.md` (the per-vendor prompt + `_META` pattern and how `index.js` aggregates `ORG_PROMPTS`).
- [ ] Alternatively, document all of these in one `src/README.md` architecture map rather than scattering files.

**Related files:** `src/features/`, `src/game/`, `src/prompts/`, `src/hooks/`, `src/router/`

---

### [2026-06-28] Test-file extension convention is inconsistent (`.test.js` testing a `.jsx` component)

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
The repo overwhelmingly co-locates tests as `<name>.test.<ext>` matching the source extension, but `src/components/dungeon/DungeonExplore.test.js` (16 KB) is a `.test.js` whose subject is `DungeonExplore.jsx`, while a second test for the same component uses the expected `.jsx` extension (`DungeonExplore.smoke.test.jsx`). So the same component has one `.test.js` and one `.smoke.test.jsx`. It works because the `.test.js` actually exercises plain logic constants exported from the component file (not JSX rendering), which is itself a smell — those constants want their own module (see the god-component entry above). Two test files with divergent extensions for one component is an avoidable naming inconsistency for anyone grepping `*.test.jsx`.

**Hypothesis / root cause:** `DungeonExplore.test.js` predates the smoke test and was named for the logic it tests; once the logic and the component live in the same `.jsx` file, neither extension is clearly "right".

**Proposed fix / improvement:**
- [ ] Adopt one rule: test file extension matches the module it imports/asserts against. If `DungeonExplore.test.js` keeps testing logic exported from the `.jsx`, either rename it `.test.jsx` for consistency, or (preferred) move those constants to a `.js` content module and have the `.test.js` target that module.
- [ ] Optionally add a one-line convention note to `src/components/README.md`.

**Related files:** `src/components/dungeon/DungeonExplore.test.js`, `src/components/dungeon/DungeonExplore.smoke.test.jsx`

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---


> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
