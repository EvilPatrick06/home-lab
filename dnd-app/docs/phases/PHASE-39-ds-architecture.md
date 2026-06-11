# PHASE-39 — Dungeon Scholar architecture: App.jsx feature split, route code-splitting, hash router + deep links

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Restructure `dungeon-scholar/` (Vite 8 + React 19, deployed to GitHub Pages) from a single 10,875-line `src/App.jsx` into feature modules with co-locatable tests, lazy-load every screen-level route so the main bundle drops back under the 500 kB chunk warning (currently 543 kB / 144 kB gzip), and replace the `useState('home')` screen switch with URL-hash routing so the browser Back button navigates inside the app instead of exiting it, refreshes keep their screen, and tomes become deep-linkable (`#/tome/<id>`). This consumes audit findings F2 (feature-module split), the 2026-05-05 code-splitting entry, and F4 (browser router + deep links, subsuming L12). Behavior parity everywhere except the two deliberate, audit-requested changes: URLs now carry a `#/…` fragment, and Back/Forward navigate screens.

## Dependencies & cross-phase notes

- **PHASE-17 (ds bug round), PHASE-18 (ds security round), PHASE-19 (ds a11y/UX round) — recommended prerequisites** (per PHASE-INDEX). All three edit `dungeon-scholar/src/App.jsx`; this phase relocates most of that file. Every line number in this plan was captured 2026-06-10 *before* 17–19 executed — **re-run every verification command below before editing; anchor by symbol name, not line.** Specific carry-overs to preserve during the move:
  - 17 rewrites updater bodies inside `checkAchievement`/`updateProgress`/QuizMode `handleAnswer` and sweeps `updateTomeProgress` call sites to functional form — move the *fixed* versions verbatim.
  - 18 adds `src/services/logger.js` usage in App.jsx, an `RlsWarningBanner` render next to the `MergeChooser`, and Oracle endpoint helpers in the ChatMode `send()` — these are import-based and must follow their enclosing code into the new modules.
  - 19 adds `src/components/useDialogA11y.js` + `src/components/AudioInviteBanner.jsx` (deliberately placed there so this phase can move/import them untouched) and aria/tap-target edits across App.jsx screens.
- **PHASE-40 (ds PWA/cloud) depends on this phase.** It touches `dungeon-scholar/vite.config.js` (vite-plugin-pwa), the tome-import `JSON.parse` size cap (L14 — after this phase that code lives in the App shell handlers `handlePasteImport`/`handleImportFile`/`handleShareCodeImport`, which stay in `src/App.jsx`), and Quiz/Flashcard defensive copies (L15 — after this phase those mount sites live in `src/features/study/QuizMode.jsx` and `src/features/study/FlashcardsMode.jsx`). Record the final relocation map in this plan's Completed section so 40's executor can re-anchor.
- **PHASE-41 (ds sealed tomes + full light theme) depends on this phase.** QA16's ~200–400 inline `style={{…}}` sites disperse across `src/features/**` after the split; F3 sealed tomes touches the import flow (App shell handlers + `src/features/library/`). Same relocation-map note applies.
- No dnd-app or bmo files are touched. The dnd-app 4-gate at phase end is expected trivially green.

## Verified findings

All commands were run 2026-06-10 from the repo root against the live tree (worktree `ai-p6-roadmap`, branch master). Baseline established this day: `cd dungeon-scholar && npx vitest run` → **24 test files / 346 tests, all green** (~28 s); `npm run build` succeeds in ~1.1 s (Vite 8 / Rolldown) with one warning: the main chunk exceeds 500 kB.

### F2 — App.jsx is a 10,875-line monolith (audit said 9,278 — corrected; the file grew)

```bash
wc -l dungeon-scholar/src/App.jsx                                   # 10875
grep -n "^const \|^function \|^class \|^export " dungeon-scholar/src/App.jsx   # full symbol map
grep -rn "from './App\|from '../App" dungeon-scholar/src --include="*.jsx" --include="*.js"  # → nothing imports App.jsx except main.jsx
grep -n "import App" dungeon-scholar/src/main.jsx                   # main.jsx:3 — sole importer
```

Layout of the file (line numbers = 2026-06-10 pre-17/18/19; symbols are the stable anchors):

1. **Imports** (1–35): `usePlayerState`, `sessionResume`, supabase/auth, audio, services (`pets/spells/devotion/weakDomain/examPace/examPrediction/srs/forgettingCurve`), `lucide-react` (~70 icons, one import at line 23), plus two existing lazies — `const ExamMode = React.lazy(...)` (line 18) and `const DungeonExplore = React.lazy(...)` (line 22).
2. **Module-scope game data + pure helpers** (41–1320): `TITLES` 41, `DAILY_QUEST_POOL` 62, `getCounterValue` 202, `pickDailyQuests` 256, `WEEKLY_QUEST_POOL` 268, `pickWeeklyQuests` 368, `currentWeekStartStr` 379, `STORY_CHAINS` 390, `SPECIAL_TITLES` 469, `ITEM_CATEGORIES` 490, `ITEMS` 502, `BESTIARY_ENTRIES` 576, `RECIPES` 708, `findItem` 718, `DIFFICULTIES` 725, `DIFFICULTY_ORDER` 784, `BOSS_TYPES` 790, `BOSS_ORDER` 855, `rollBoss` 857, `isDifficultyUnlocked` 862, `sanctumCount` 882, `sanctumAtCap` 890, `pickShopStock` 895, `ACHIEVEMENTS` 909, `xpForLevel` 983, `getTitle` 985, `generateTomeId` 993, `encodeTomeShareCode` 998, `decodeTomeShareCode` 1009, `COUNTER_ACTIONS` 1025, `formatStoryAction` 1037, `class ErrorBoundary` 1049, `useEscapeKey` 1107, `shuffleArray` 1117, `normalizeTomeData` 1129, `blankTomeProgress` 1138, `summarizeRunHistory` 1179, `formatDuration` 1191, `DEFAULT_STATE` 1200 (plain object literal — no references to other module constants; verified by reading 1200–1320).
3. **`export default function DungeonScholarApp()`** (1321–3701, ~2,380 lines): UI state (1328–1375), effects (OAuth consume 1380, audio arm, theme apply, domainFilter/reviewMode clearing 1424-ish, welcome modal, tutorial-surface tracking 1613–1623), derived state (`activeTome` 1636, `courseSet` 1642, `tomeProgress` 1643), **~60 handler closures** (1461–2924: tutorial 1461–1514, `showNotif` 1668, `updateProgress` 1706, `updateTomeProgress` 1753, `updateCardProgress` 1770, `setTomeExamDate` 1789, `awardXP` 1802, `awardGold` 1810, `purchaseItem` 1817, equip/unequip item/pet/spell/potion 1893–2110, `claimDailyReward` 1963, `ascend` 2003, `recordBestiary` 2111, `recordSpellCast` 2126, `recordHarvest` 2129, `craftRecipe` 2134, `giveItem` 2161, `consumeItem` 2175, `checkAchievement` 2194, `unlockSpecialTitle` 2209, `recordAnswer` 2228, `removeFromVault` 2356, `trackDungeonAttempt` 2418, `trackModeUseDaily` 2446, quest status memos + claims 2454–2712, `trackModeUse` 2713, tome library CRUD 2736–2851, import handlers 2852–2911, reset 2912–2921), and the **render shell** (2926–3700: background layers, header, `<main id="main-content">` at 3244, the screen switch at 3342–3633, global modals + tutorial panel 3633–3695, `ErrorBoundary` close 3695).
4. **31 more top-level components** (3702–10875), none exported: `OrnatePanel` 3702, `LibraryScreen` 3732, `CollapsibleGroup` 4124, `HomeScreen` 4154, `AudioPanel` 4601, `ThemePanel` 4681, `BLOOM_PALETTE` 4724, `DifficultyStars` 4733, `BloomBadge` 4744, `FilteredModeBanner` 4756, `ModeCard` 4779, `FlashcardsMode` 4829, `QuizMode` 5105, `LabMode` 5671, `ChatMode` 6035, `MistakeVault` 6531, `RunHistoryScreen` 6597, `DomainStudyScreen` 6964, `RecordTile` 7801, `ShopScreen` 7815, `InventoryScreen` 8071, `BestiaryScreen` 8442, `StableScreen` 8589, `SpellbookContent` 8752, `SpellbookScreen` 8869, `CalendarScreen` 8918, `AscensionScreen` 9083, `CraftingScreen` 9250, `QuestCard` 9415, `QuestSection` 9511, `StoryStepCard` 9562, `StoryChainView` 9690, `QuestBoard` 9788, `WelcomeModal` 9905, `TutorialPanel` 9953, `SHARE_LARGE_THRESHOLD` 10052, `downloadTomeJson` 10054, `ShareTomeModal` 10069, `ImportCodeModal` 10202, `MetadataEditModal` 10276, `ResetConfirmModal` 10476, `ConfirmModal` 10555, `PasteTomeModal` 10633, `AchievementsModal` 10720, `TitlesModal` 10794.

Nothing outside `main.jsx` imports `App.jsx`, so every move is internal — no external API to preserve. Existing component files already live in `src/components/` (12 files incl. `ExamMode.jsx`, `DungeonExplore.jsx`); services with colocated tests in `src/services/` (15 modules); hooks in `src/hooks/`.

### Code-splitting — main chunk is 543 kB raw / 144 kB gzip (audit said 387 kB/104 kB — corrected; it grew with the file)

```bash
cd dungeon-scholar && npm run build      # ~1.1 s
# 2026-06-10 output (JS chunks):
#   rolldown-runtime  0.56 kB │ gzip   0.36 kB
#   vendor-icons     21.03 kB │ gzip   8.06 kB
#   ExamMode         29.56 kB │ gzip   8.05 kB
#   DungeonExplore   88.26 kB │ gzip  26.10 kB
#   vendor-react    182.16 kB │ gzip  57.34 kB
#   katex           257.77 kB │ gzip  77.34 kB   (lazy — see below)
#   index           543.49 kB │ gzip 144.17 kB   ← exceeds the 500 kB warning
grep -n "manualChunks" dungeon-scholar/vite.config.js   # function form (Vite 8/Rolldown requires it)
git -C dungeon-scholar check-ignore dist && echo ignored # dist/ is gitignored
```

Already-proven infra this phase extends:
- `React.lazy` + `React.Suspense`: `App.jsx:18` (`ExamMode`), `App.jsx:22` (`DungeonExplore`), Suspense wrappers at `App.jsx:3516` (dungeon route) and `App.jsx:3614` (practiceExam route).
- KaTeX is **already** dynamically imported (`src/components/RichContent.jsx:22–28`, `import('katex')` + css) — the 257 kB katex chunk does not load until a math node renders; a hidden sentinel `<RichContent text="$x$">` in the App shell (`App.jsx:2949` area, comment "Phase 43c: hidden KaTeX sentinel") warms it. Do not break the sentinel when moving the shell render.
- `vite.config.js` `manualChunks(id)` isolates `vendor-react` and `vendor-icons`; Rolldown also offers `build.rolldownOptions.output.codeSplitting` (the build warning suggests it) — not required here; route-level `React.lazy` is sufficient and simpler.
- The three `tome-*.json` files at the package root are **not** bundled (no import/fetch of them in `src/` — verified by PHASE-18's research as well).

### F4 — routing is a `useState` screen enum; Back exits the app; nothing is deep-linkable (confirmed)

```bash
grep -n "const \[screen, setScreen\]" dungeon-scholar/src/App.jsx     # 1328
sed -n '1328,1342p' dungeon-scholar/src/App.jsx                       # session-resume initializer
grep -c "setScreen" dungeon-scholar/src/App.jsx                       # 89 references
grep -n "screen === '" dungeon-scholar/src/App.jsx | sed "s/.*'\([a-zA-Z]*\)'.*/\1/" | sort -u  # 20 screens
grep -rn "pushState\|popstate\|hashchange\|location.hash" dungeon-scholar/src/App.jsx  # → nothing (no history integration)
ls dungeon-scholar/public 2>/dev/null || echo "no public dir"         # no public dir → no 404.html
```

Facts:
- `screen` initializes via session resume (`App.jsx:1328–1342`): an unexpired Trial-of-Hours exam (`loadSession(SESSION_KIND.EXAM)` with `deadlineMs > Date.now()`) forces `'practiceExam'`; else an in-progress quiz (`index > 0`) → `'quiz'`; else flashcards → `'flashcards'`; else `'home'`. `services/sessionResume.js` stores under `localStorage` keys `ds:session:{quiz,flashcards,exam}` (sessionResume.js:8–13).
- The 20 screen values: `home, library, quests, inventory, shop, crafting, bestiary, stable, spellbook, calendar, ascension, history, domainStudy, dungeon, flashcards, quiz, lab, chat, practiceExam, vault`. Render switch at `App.jsx:3342–3633`; six routes additionally gate on `courseSet`: `dungeon` (3515), `flashcards` (3556), `quiz` (3574), `lab` (3593), `chat` (3605), `practiceExam` (3613) — with no active tome these render nothing (blank main area under the header).
- Browser Back/Forward never moves between screens (no history entries are created) — Back leaves the site, and a hand-typed path under the Pages origin 404s (no SPA fallback file exists). This is L12, subsumed by F4.
- **GitHub Pages base path varies by deployment**: `vite.config.js:11` `const BASE = process.env.VITE_BASE || '/dungeon-scholar/'`; the owner's deploy sets `VITE_BASE=/home-lab/` in `.github/workflows/deploy.yml`. Any router must be base-path agnostic → hash routing (the fragment is never sent to the server, so Pages always serves `index.html` and no `404.html` hack is needed).
- **OAuth is hash-compatible**: `services/supabase.js:43–55` `consumeOAuthCallback()` reads `?code` from `url.searchParams` (the query precedes the fragment), strips `code`/`state`, and `history.replaceState`s `url.toString()` — which preserves any `#/…` fragment. `signInWithOAuth` redirects to `window.location.origin + import.meta.env.BASE_URL` (supabase.js:29), i.e. the post-OAuth landing has no fragment → home. No change needed.
- **Tome identity**: `playerState.activeTomeId` (persisted in player state; default `null`, `App.jsx:1224`), resolved at `App.jsx:1636–1642` (`activeTome` memo → `courseSet = activeTome?.data`). `switchActiveTome(tomeId)` at `App.jsx:2786`. Tome ids come from `generateTomeId()` (`App.jsx:993`): `tome_<epoch>_<base36>` — URL-safe (`[A-Za-z0-9_]`).
- Screen-coupled effects to preserve: `domainFilter` cleared when leaving quiz/flashcards + `reviewMode` cleared when leaving flashcards (`App.jsx:1424–1432` area, effect keyed on `screen`); tutorial visit tracking compares `tutorialOpenedSurface` against `screen` (`App.jsx:1613–1623`); the TutorialPanel `onAction` handler calls `setScreen` for library/vault/quests tours (`App.jsx:3666+`).
- `main.jsx` wraps the app in `<React.StrictMode>` (main.jsx:7) — mount effects run twice in dev; router init and deep-link consumption must be idempotent.
- dungeon-scholar has **no lint config** (no eslint/biome file; verified `ls -a`) — its gates are vitest + `npm run build`.

## Sub-phases

Run in order; after each sub-phase the tree must build (`npm run build`, ~1 s) and the targeted tests must pass. All paths below are under `dungeon-scholar/` unless noted. Convention: screen-level components get **default exports** (React.lazy requires a default; see Research notes); shared primitives/data use **named exports**. Every move is verbatim — carry comments, `// Phase NN` annotations, and any 17/18/19 fixes along unchanged.

### 39A — Extract module-scope game data + pure helpers into `src/game/`

**Objective:** move lines ~41–1320 of App.jsx (constants + pure functions, zero React) into importable modules, with first-ever unit tests for the pure helpers.

**Files (new):** `src/game/titles.js`, `src/game/quests.js`, `src/game/items.js`, `src/game/bestiary.js`, `src/game/difficulty.js`, `src/game/achievements.js`, `src/game/tome.js`, `src/game/defaultState.js`, plus `src/game/tome.test.js`, `src/game/quests.test.js`, `src/game/titles.test.js`. **Edit:** `src/App.jsx`.

**Steps:**
1. `src/game/titles.js`: export `TITLES`, `SPECIAL_TITLES`, `xpForLevel`, `getTitle`.
2. `src/game/quests.js`: export `DAILY_QUEST_POOL`, `WEEKLY_QUEST_POOL`, `STORY_CHAINS`, `getCounterValue`, `pickDailyQuests`, `pickWeeklyQuests`, `currentWeekStartStr`, `COUNTER_ACTIONS`, `formatStoryAction`.
3. `src/game/items.js`: export `ITEM_CATEGORIES`, `ITEMS`, `RECIPES`, `findItem`, `sanctumCount`, `sanctumAtCap`, `pickShopStock`.
4. `src/game/bestiary.js`: export `BESTIARY_ENTRIES`.
5. `src/game/difficulty.js`: export `DIFFICULTIES`, `DIFFICULTY_ORDER`, `BOSS_TYPES`, `BOSS_ORDER`, `rollBoss`, `isDifficultyUnlocked`.
6. `src/game/achievements.js`: export `ACHIEVEMENTS`.
7. `src/game/tome.js`: export `generateTomeId`, `encodeTomeShareCode`, `decodeTomeShareCode`, `normalizeTomeData`, `blankTomeProgress`, `summarizeRunHistory`, `formatDuration`, `shuffleArray`.
8. `src/game/defaultState.js`: export `DEFAULT_STATE` (self-contained object literal — confirm no helper references before moving; if 17 added any, import them).
9. Move `class ErrorBoundary` → `src/components/ErrorBoundary.jsx` (default export) and `useEscapeKey` → `src/hooks/useEscapeKey.js` (named export). If PHASE-19 already centralized `useEscapeKey`, import its version instead of duplicating.
10. Replace the moved blocks in App.jsx with imports. Cross-check each moved symbol's intra-file dependencies (e.g. `pickShopStock` uses `ITEMS`; `formatStoryAction` uses `COUNTER_ACTIONS`) — keep each dependency in the same module or import across `src/game/` files explicitly.
11. Tests: `tome.test.js` — `encodeTomeShareCode`/`decodeTomeShareCode` round-trip + malformed-input null path, `normalizeTomeData` shape, `formatDuration` formatting, `generateTomeId` charset `^tome_[a-z0-9_]+$/i`; `quests.test.js` — `pickDailyQuests(dateStr)` is deterministic for a fixed date, returns n unique entries from the pool; `titles.test.js` — `xpForLevel` monotonicity, `getTitle` level banding + special-title override.

**Cheap checks:** `npx vitest run src/game` and `npm run build`.
**Acceptance:** App.jsx no longer defines any of the moved symbols (`grep -n "^const TITLES\|^const ITEMS\|^const ACHIEVEMENTS\|^const DEFAULT_STATE" src/App.jsx` → empty); build green; new tests green; existing 346 tests untouched (do not run the full suite — rule 5).

### 39B — Extract shared UI primitives + tutorial components

**Objective:** move presentation-only components with no App-state coupling.

**Files (new):** `src/components/ui/OrnatePanel.jsx`, `ui/CollapsibleGroup.jsx`, `ui/ModeCard.jsx`, `ui/badges.jsx` (`BLOOM_PALETTE`, `DifficultyStars`, `BloomBadge`), `ui/FilteredModeBanner.jsx`, `ui/RecordTile.jsx`, `ui/ConfirmModal.jsx`, `ui/ResetConfirmModal.jsx`, `ui/AchievementsModal.jsx`, `ui/TitlesModal.jsx`; `src/features/tutorial/WelcomeModal.jsx`, `src/features/tutorial/TutorialPanel.jsx`. **Edit:** `src/App.jsx`.

**Steps:** verbatim moves; named exports for `ui/` primitives, default exports for the two tutorial components. Each file imports its own lucide icons and (where used) `useEscapeKey`/`playSfx`. `AchievementsModal`/`TitlesModal` import `ACHIEVEMENTS`/`TITLES`+`SPECIAL_TITLES` from `src/game/`. Update App.jsx imports; prune now-unused icons from App.jsx's lucide import line.

**Cheap checks:** `npm run build`; `npx vitest run src/tutorial.test.js` (tutorial step ids ↔ `onAction` contract lives there).
**Acceptance:** App.jsx defines none of the moved components; build green.

### 39C — Extract the library feature

**Objective:** `src/features/library/` owns the tome-shelf screen and tome modals.

**Files (new):** `src/features/library/LibraryScreen.jsx` (default export), `library/ShareTomeModal.jsx` (also exports `downloadTomeJson`, `SHARE_LARGE_THRESHOLD`), `library/ImportCodeModal.jsx`, `library/MetadataEditModal.jsx`, `library/PasteTomeModal.jsx`. **Edit:** `src/App.jsx`.

**Steps:** verbatim moves; these consume `encodeTomeShareCode`/`decodeTomeShareCode` from `src/game/tome.js` and `RichContent` (MetadataEditModal preview). Modal renders in the App shell keep their existing prop wiring (`App.jsx:3645–3653` area).

**Cheap checks:** `npm run build`.
**Acceptance:** moved; build green; share/import modal props unchanged (diff shows only import + deletion in App.jsx).

### 39D — Extract progression + quests screens

**Objective:** one file per remaining non-study screen.

**Files (new):** `src/features/progression/ShopScreen.jsx`, `InventoryScreen.jsx`, `CraftingScreen.jsx`, `BestiaryScreen.jsx`, `StableScreen.jsx`, `SpellbookScreen.jsx` (contains `SpellbookContent`), `CalendarScreen.jsx`, `AscensionScreen.jsx`, `RunHistoryScreen.jsx`; `src/features/quests/QuestBoard.jsx` (contains `QuestCard`, `QuestSection`, `StoryStepCard`, `StoryChainView`). All default exports for the screen component; helpers stay private or named. **Edit:** `src/App.jsx`.

**Steps:** verbatim moves. Import needs per file: Shop → `ITEMS`/`ITEM_CATEGORIES`/`pickShopStock`/`sanctumAtCap`/`findItem`; Inventory → `findItem`; Crafting → `RECIPES`/`findItem`; Bestiary → `BESTIARY_ENTRIES`; Stable → `services/pets.js` (already a service); Spellbook → `services/spells.js`; Calendar → `services/devotion.js`; Ascension/RunHistory → `src/game/` helpers as referenced (`summarizeRunHistory`, `formatDuration`); QuestBoard → `formatStoryAction`/`COUNTER_ACTIONS` if referenced.

**Cheap checks:** `npm run build`.
**Acceptance:** App.jsx top-level component count shrinks accordingly; build green.

### 39E — Extract study + home features

**Objective:** the five inline study modes plus vault/domain-study and the home screen move out; App.jsx keeps only `DungeonScholarApp`.

**Files (new):** `src/features/study/FlashcardsMode.jsx`, `study/QuizMode.jsx`, `study/LabMode.jsx`, `study/ChatMode.jsx`, `study/MistakeVault.jsx`, `study/DomainStudyScreen.jsx`; `src/features/home/HomeScreen.jsx`, `home/AudioPanel.jsx`, `home/ThemePanel.jsx`. **Edit:** `src/App.jsx`.

**Steps:** verbatim moves (largest single sub-phase, ~3,000 lines). These import: `services/srs.js`, `services/oracleGrader.js`, `services/sessionResume.js`, `services/weakDomain.js`, `services/examPace.js`, `services/examPrediction.js`, `services/forgettingCurve.js`, `src/game/` (badges via `ui/badges.jsx`, `shuffleArray`, difficulty data), `RichContent`, audio helpers. ChatMode carries PHASE-18's Oracle endpoint helpers if landed. HomeScreen stays **statically imported** in App.jsx (it is the initial screen — lazy-loading it would add a spinner to first paint).

**Cheap checks:** `npm run build`; `npx vitest run src/services/srs.test.js src/services/examSession.test.js` (closest coverage of moved-call surfaces).
**Acceptance:** `grep -c "^function \|^const [A-Z]" src/App.jsx` shows only `DungeonScholarApp` remains as a component definition (data/UI all imported); build green.

### 39F — Lift player actions into `src/features/player/usePlayerActions.js`

**Objective:** the ~1,400 lines of handler closures (App.jsx 1461–2924 region: progression, economy, equipment, quests, tome CRUD, achievements, answer recording) move into one custom hook so the App shell drops to orchestration size. This is the "lift playerState into a store/context" half of F2, done as a hook to keep every component's props byte-identical (zero behavior risk); a context provider is deliberately deferred (see Out of scope).

**Files (new):** `src/features/player/usePlayerActions.js`, `src/features/player/usePlayerActions.test.jsx`. **Edit:** `src/App.jsx`.

**Steps:**
1. Signature: `usePlayerActions({ playerState, setPlayerState, showNotif, user })` → returns an object with every handler and derived memo currently defined in the 1461–2924 region **except** UI-state handlers that touch App-local state (`fileInputRef`, modal setters, `setScreen`, tutorial state): keep `handleImportFile`, `handlePasteImport`, `handleShareCodeImport`, `resetProgress`/`confirmReset`, and the tutorial handlers (`advanceTutorial`, `skipTutorial`, `startTutorial`, `toggleTutorialPanel`) in App.jsx — they wire into refs/modals/navigation. Everything pure-player moves: `updateProgress`, `updateTomeProgress`, `updateCardProgress`, `setTomeExamDate`, `awardXP`, `awardGold`, `purchaseItem`, `equipItem`, `unequipSlot`, `equipPet`, `unequipPet`, `awardPetXp`, `claimDailyReward`, `ascend` (+ `canAscend`, `ASCENSION_LEVEL_REQ`), `equipSpell`, `unequipSpell`, `equipPotion`, `unequipPotion`, `recordBestiary`, `recordSpellCast`, `recordHarvest`, `craftRecipe`, `giveItem`, `consumeItem`, `checkAchievement`, `unlockSpecialTitle`, `recordAnswer`, `removeFromVault`, `trackDungeonAttempt`, `trackModeUseDaily`, `trackModeUse`, `dailyQuestStatus`, `claimQuest`, `claimAllQuests`, `weeklyQuestStatus`, `claimWeeklyQuest`, `claimAllWeeklyQuests`, `storyChainStatus`, `claimableStoryStepCount`, `claimStoryStep`, `claimableQuestCount`, `addTomeToLibrary`, `switchActiveTome`, `deleteTome`, `renameTome`, `duplicateTome`, `updateTomeMetadata`, and the cross-library memos (`totalCardsAcrossLib` etc.).
2. Move verbatim, preserving declaration order (later closures call earlier ones). The hook imports `src/game/*` data it needs.
3. In App.jsx: `const actions = usePlayerActions({ playerState, setPlayerState, showNotif, user });` then destructure the full list so every existing JSX prop reference keeps its current identifier.
4. Test (`usePlayerActions.test.jsx`, renderHook from `@testing-library/react`): `awardXP` raises xp/totalXp; `purchaseItem` deducts gold and adds inventory (and rejects when gold is insufficient); `addTomeToLibrary` + `switchActiveTome` set `activeTomeId`; `claimDailyReward` same-day double-claim is rejected. Use a harness component owning `useState(DEFAULT_STATE)` and a spy `showNotif`.

**Cheap checks:** `npx vitest run src/features/player` and `npm run build`.
**Acceptance:** App.jsx ≤ ~1,500 lines; hook tests green; build green.

### 39G — Hash router: `useHashRoute` + deep-linkable tomes (F4)

**Objective:** back/forward navigation, refresh-keeps-screen, and `#/tome/<id>` deep links — zero new dependencies.

**Files (new):** `src/router/useHashRoute.js`, `src/router/useHashRoute.test.jsx`. **Edit:** `src/App.jsx`.

**Route scheme** (hash fragment only — never sent to the server, so GitHub Pages always serves `index.html` regardless of base path; no `404.html` needed):
- `#/<screen>` for each of the 20 screen values; `''`, `'#'`, `'#/'` ≡ `#/home`.
- `#/tome/<tomeId>` and `#/tome/<tomeId>/<screen>` — deep link: switch the active tome, then show `<screen>` (default `home`). The tome segment is consumed and the URL is canonicalized to `#/<screen>` via `replaceState` (tome identity persists in `playerState.activeTomeId`, so the URL does not need to carry it afterward).
- Unknown screen names or malformed routes → `home` (replace, plus a notification).

**Steps:**
1. `src/router/useHashRoute.js` exports:
   - `SCREENS` — frozen array of the 20 valid names (single source of truth; copy from the render switch).
   - `parseHash(hash)` → `{ screen, tomeId }` (pure; `decodeURIComponent` the tome segment; invalid → `{ screen: null, tomeId: null }`).
   - `formatHash(screen)` → `'#/' + screen`.
   - `useHashRoute(computeInitialScreen)` → `[screen, setScreen, pendingTomeId, clearPendingTome]`:
     - Lazy init: parse `window.location.hash`. If it yields a valid screen → use it (deep-link wins) and stash any `tomeId` as `pendingTomeId`. Else call `computeInitialScreen()` and `history.replaceState(null, '', formatHash(initial))` (replace, not push — Back from the landing screen must leave the site, not cycle through a phantom blank entry).
     - **Exam precedence:** before honoring the hash, if `computeInitialScreen` reports a live exam (see step 3), force `practiceExam` via `replaceState` — this preserves today's reload behavior where an unexpired Trial of Hours always resumes (`App.jsx:1328–1342`).
     - Subscribe to `window.addEventListener('hashchange', …)`: parse the new hash; valid → `setState`; invalid → `replaceState` home. Cleanup on unmount.
     - `setScreen(name)`: no-op when `name === current`; otherwise `window.location.hash = formatHash(name)` (assignment pushes a history entry and fires `hashchange`, which syncs state — single code path for programmatic and Back/Forward navigation).
     - StrictMode-safe: the initializer is pure-read + `replaceState` (idempotent); the listener is added/removed symmetrically.
2. In App.jsx, replace the `useState` block at the `const [screen, setScreen]` anchor with:
   ```js
   const [screen, setScreen, pendingTomeId, clearPendingTome] = useHashRoute(computeInitialScreen);
   ```
   where `computeInitialScreen` is the existing exam/quiz/flashcards/home resume logic extracted to a module-level function (it only reads `loadSession`). All ~89 `setScreen(...)` call sites and the screen-keyed effects (domainFilter/reviewMode clearing, tutorial-surface tracking) are untouched — the tuple keeps the same `[screen, setScreen]` shape.
3. Deep-link consumption effect in App.jsx:
   ```js
   useEffect(() => {
     if (!pendingTomeId) return;
     const found = playerState.library.some((t) => t.id === pendingTomeId);
     if (found) switchActiveTome(pendingTomeId);
     else showNotif('That tome is not in your library.', 'error');
     clearPendingTome(); // also canonicalizes the URL to #/<screen> via replaceState
   }, [pendingTomeId]);
   ```
   Idempotent under StrictMode double-invoke (`switchActiveTome` to the same id is a no-op state write; the second run sees `pendingTomeId === null`).
4. Guard effect for the six courseSet-gated screens (today they render a blank main area; with deep links this becomes reachable by URL): if `screen` ∈ {`dungeon`,`flashcards`,`quiz`,`lab`,`chat`,`practiceExam`} and `courseSet == null`, `setScreen('home')` (replace semantics: call the hook's exposed replace path or plain `setScreen` — document choice in code) + `showNotif('Choose a tome first.', 'info')`.
5. `useHashRoute.test.jsx`: unit tests for `parseHash`/`formatHash` (all 20 screens, tome forms, encoded ids, junk); hook tests via `renderHook` — initial empty hash → `computeInitialScreen` result + canonical hash; preset `window.location.hash = '#/shop'` → `'shop'`; navigation: `setScreen('quiz')` updates hash; simulated Back: set hash + `window.dispatchEvent(new Event('hashchange'))` → state follows (dispatch the event manually — do not rely on happy-dom auto-firing it; the handler is idempotent if the environment also auto-fires); invalid hash → home; `#/tome/abc` → `pendingTomeId === 'abc'`. Reset `window.location.hash = ''` in `beforeEach`.

**Cheap checks:** `npx vitest run src/router` and `npm run build`.
**Acceptance:** all router tests green; `grep -n "useState(() => {" src/App.jsx` no longer matches the screen initializer; manual contract (documented, exercised by tests): Back from `#/shop` after navigating home→shop returns to `#/home`.

### 39H — Route-level code splitting + bundle verification + docs

**Objective:** lazy-load every screen except home; kill the >500 kB warning; document the new layout.

**Files:** edit `src/App.jsx`, `README.md` (architecture section), `docs/PHASE-24-POLISH.md` (close the deferred-polish entry). No vite.config.js change expected (keep `manualChunks` as-is; add nothing unless acceptance fails — see Research notes).

**Steps:**
1. In App.jsx convert the screen-level imports added in 39C–39E to lazies, mirroring the existing pattern at the `ExamMode`/`DungeonExplore` anchors:
   ```js
   const ShopScreen = React.lazy(() => import('./features/progression/ShopScreen.jsx'));
   ```
   Lazy list: `LibraryScreen`, `QuestBoard`, `ShopScreen`, `InventoryScreen`, `CraftingScreen`, `BestiaryScreen`, `StableScreen`, `SpellbookScreen`, `CalendarScreen`, `AscensionScreen`, `RunHistoryScreen`, `DomainStudyScreen`, `FlashcardsMode`, `QuizMode`, `LabMode`, `ChatMode`, `MistakeVault` (+ existing `ExamMode`, `DungeonExplore`). Keep static: `HomeScreen`, `AudioPanel`/`ThemePanel` (rendered by HomeScreen), all modals, `OrnatePanel`/badges (shared by many chunks — Rolldown hoists them into a shared chunk automatically), `ErrorBoundary`, `RichContent` (sentinel must run at first paint).
2. Wrap the whole screen switch inside `<main>` in **one** `React.Suspense` whose fallback reuses the existing dungeon-route fallback markup (`App.jsx:3516` anchor) — replacing the two route-local Suspense wrappers. Modals/tutorial panel stay outside it.
3. `npm run build`; record every JS chunk size in the Completed section. If any chunk still exceeds 500 kB, group small feature chunks via a `manualChunks` addition (e.g. all `features/progression/` → `'features-progression'`) rather than suppressing the warning.
4. README.md: add a short "Source layout" section (`src/game` data, `src/features/<area>` screens, `src/components/ui` primitives, `src/router`, services/hooks unchanged) and one line on hash-based URLs (`#/shop`, `#/tome/<id>` deep links).
5. `docs/PHASE-24-POLISH.md`: update the "App.jsx is large" entry — mode-by-mode splitting now shipped (cite this phase).

**Cheap checks:** `npm run build` + chunk-size eyeball; `npx vitest run src/router src/game src/features/player`.
**Acceptance:** build emits **no** chunk-size warning; main `index-*.js` ≤ 380 kB raw (baseline 543.49 kB — record actual); first-paint chunk set is `rolldown-runtime + vendor-react + vendor-icons + index` (+ katex only after the sentinel resolves); navigating to any screen loads exactly one new feature chunk (verify via `dist/assets` listing + import graph).

## Research notes

- **Hash routing over `404.html` redirect for GitHub Pages.** Pages has no SPA rewrite support; the two community answers are hash routing or a `404.html` that re-encodes the path and redirects back (rafgraph's spa-github-pages). The 404 hack still serves a real 404 first (SEO + error-banner caveats) and needs the base path baked in — fragile here because the base differs per fork (`/home-lab/` vs `/dungeon-scholar/`, vite.config.js:5–11). The fragment is never sent to the server, so hash routing works on any base with zero extra files. Sources: [GitHub community discussion #64096](https://github.com/orgs/community/discussions/64096), [rafgraph/spa-github-pages](https://github.com/rafgraph/spa-github-pages), [Handling 404 in SPA on GitHub Pages](https://dev.to/lico/handling-404-error-in-spa-deployed-on-github-pages-246p), [React Router HashRouter reference](https://reactrouter.com/api/declarative-routers/HashRouter).
- **Hand-rolled `useHashRoute` instead of a router library.** The audit suggested `wouter` (v3.9.0, 2.1 kB gzip, `useHashLocation` from `wouter/use-hash-location`, React 18/19) or raw `history.pushState`. wouter would still need a `setScreen` adapter to keep the 89 call sites and the screen-keyed effects untouched, its hash add-on has had state-sync bug reports ([wouter #417](https://github.com/molefrog/wouter/issues/417)), and the app has exactly one routing dimension (a flat 20-value screen enum) plus one optional param — no nested matching to justify a dependency. A ~80-line hook with pure `parseHash`/`formatHash` is fully unit-testable and keeps the dependency list at five. wouter remains the documented fallback if requirements grow (nested routes, `<Link>` components). Sources: [molefrog/wouter](https://github.com/molefrog/wouter), [wouter issue #417](https://github.com/molefrog/wouter/issues/417).
- **`React.lazy` requires default exports**, hence the default-export convention for screen components; the `.then((m) => ({ default: m.Named }))` adapter exists but is noise at this scale. Lazy components must be declared at module scope (not inside render) and wrapped in `Suspense`. Sources: [react.dev lazy reference](https://react.dev/reference/react/lazy), [facebook/react #14603](https://github.com/facebook/react/issues/14603), [legacy code-splitting guide](https://legacy.reactjs.org/docs/code-splitting.html).
- **Feature-folder structure + one-way imports.** Standard practice: shared primitives (`components/ui`, `hooks`, `game`) flow *into* features; features flow into the app shell; never the reverse. Incremental extraction (data → leaves → screens → state) keeps each step shippable. Sources: [Robin Wieruch — React folder structure](https://www.robinwieruch.de/react-folder-structure/), [Max Rozen — folder structure guidelines](https://maxrozen.com/guidelines-improve-react-app-folder-structure).
- **Vite 8 / Rolldown chunking.** `manualChunks` must be the function form (already so, vite.config.js:24–29). Rolldown's `output.codeSplitting` (`groups`/`minSize`/`maxSize`) is the newer knob the build warning advertises, but route-level dynamic imports are the precise fix for an oversized entry; `codeSplitting` is only a fallback if many tiny feature chunks become a problem. Caveat from its docs: manual grouping can reorder side effects — irrelevant here since feature modules are side-effect-free components. Source: [rolldown.rs codeSplitting reference](https://rolldown.rs/reference/OutputOptions.codeSplitting).
- **happy-dom + hashchange.** Vitest runs in happy-dom (vite.config.js test block), which is faster than jsdom but lacks some APIs; router tests therefore dispatch `new Event('hashchange')` explicitly instead of trusting the environment to auto-fire it on `location.hash` writes, and the handler is written idempotent so a double fire (manual + auto) is harmless. Sources: [Vitest test environments](https://vitest.dev/guide/environment), [happy-dom](https://www.npmjs.com/package/happy-dom).
- **User-visible changes are the deliverable, not a risk to gate:** URL fragments and in-app Back are exactly what F4 requests (L12 fix); no feature flag. Everything else in the phase is a pure refactor with byte-identical props and behavior parity, enforced by the acceptance checks.

## Test plan

- **39A:** new `src/game/tome.test.js`, `src/game/quests.test.js`, `src/game/titles.test.js` (pure-helper coverage that did not exist while these lived in App.jsx).
- **39F:** new `src/features/player/usePlayerActions.test.jsx` (renderHook harness: XP award, purchase + insufficient-gold reject, tome add/switch, daily-reward double-claim reject).
- **39G:** new `src/router/useHashRoute.test.jsx` (parse/format table tests; init/deep-link/back/invalid-hash/tome-pending hook tests).
- Existing suites (24 files / 346 tests baseline, including `tutorial.test.js`'s step-id ↔ `onAction` contract and all `src/services/*.test.js`) must stay green — they pin the moved code's behavior.
- **End of phase (rule 5):** the standard dnd-app 4-gate from `dnd-app/` (`npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run`) — expected trivially green since no dnd-app file is touched — **plus** the dungeon-scholar gates: `cd dungeon-scholar && npx vitest run` (full suite) and `npm run build` (integration breakage that unit tests cannot catch). No Pi code → no pytest.

## Acceptance criteria

1. `wc -l dungeon-scholar/src/App.jsx` ≤ 1,500 (from 10,875); the only component defined in it is `DungeonScholarApp`.
2. New modules exist and are imported: `src/game/*` (8 data/helper modules), `src/features/{home,library,study,progression,quests,player,tutorial}/`, `src/components/ui/`, `src/router/useHashRoute.js`, `src/components/ErrorBoundary.jsx`, `src/hooks/useEscapeKey.js`.
3. `cd dungeon-scholar && npm run build` emits no chunk-size warning; main `index-*.js` ≤ 380 kB raw (record actual sizes in Completed); per-screen feature chunks load on navigation only.
4. Hash routing live: every screen has a `#/<screen>` URL; refresh restores the screen; Back/Forward move between visited screens; `#/tome/<id>` (and `#/tome/<id>/<screen>`) switches the active tome with a not-found notification fallback; invalid hashes land home; the six courseSet-gated screens redirect home with a notification when no tome is active; an unexpired exam session still forces `practiceExam` on load.
5. Behavior parity preserved (pinned by tests + the moved code being verbatim): session resume, tutorial `onAction` navigation, domainFilter/reviewMode clearing on navigation, OAuth `?code` consumption, KaTeX sentinel warm-up, StrictMode double-mount safety.
6. Full dungeon-scholar vitest green (346 baseline + new tests), dnd-app 4-gate green, no new runtime dependency in `dungeon-scholar/package.json`.
7. README source-layout section and `docs/PHASE-24-POLISH.md` entry updated; relocation map for PHASE-40/41 recorded in Completed.

## Out of scope

- PWA/service worker, manifest, offline tome caching (F6) — **PHASE-40**, which also owns L14 (import size cap), L15 (defensive prop copies), L18 (cloudSync conflict tests), L8 (AudioContext close), and F5 (encrypted notes).
- Sealed/proctored tomes (F3), full light theme (QA16), Phase-30 QA coverage gaps — **PHASE-41**.
- A `PlayerContext` provider / converting screens from props to context — deliberately deferred; this phase ships the hook extraction with byte-identical props. A context layer is a natural PHASE-40/41 follow-on if their features need it.
- Bug/a11y/security fixes inside the moved code — **PHASE-17/18/19** (land before this phase; their fixes are carried verbatim, never reworked here).
- `DungeonExplore.jsx` / `ExamMode.jsx` internal refactors — already separate, already lazy; untouched.
- dnd-app and bmo domains entirely.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — per-sub-phase DONE lines with file:line citations, final chunk-size table, and the PHASE-40/41 relocation map.)
