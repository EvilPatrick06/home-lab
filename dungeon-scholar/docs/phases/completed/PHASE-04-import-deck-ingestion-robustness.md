# PHASE-04 — Import & deck-ingestion robustness

> Authored from the 2026-06-24 dungeon-scholar QA reports — [`QA-report-2026-06-24-2.md`](./QA/completed/QA-report-2026-06-24-2.md) (run 2) + [`QA-report-2026-06-24-3.md`](./QA/completed/QA-report-2026-06-24-3.md) (run 3, the content-creation supplement) — tested @ deployed `index-B4qcBDzT.js` / src `9e454930` · `origin/master` `3c89d787`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Close three gaps in how tomes/decks come into the app, so importing never silently produces a broken or partial deck and so the new import surfaces are actually reachable: (F1) the Paste-Tome / JSON import accepts a quiz with **no resolvable answer key** (e.g. `answer: 1` instead of `correctIndex: 1`) — it imports "successfully" but then marks **every** quiz answer wrong, with only a success toast; (F2) the CSV/Quizlet importer's whole-file, tab-priority delimiter detection **silently drops comma rows** whenever any of the first 10 lines contains a tab; and (F3) the two headline new content-creation entry points — **Import Deck (CSV/Quizlet)** and **Author Occlusion Card** — render only in Home's empty/no-tome state, so a returning user who already has a tome loaded (the normal steady state) has **no path** to them. Each is an independently shippable robustness/reachability fix to the import layer.

## Dependencies & cross-phase notes

- **No prerequisite phases.** All three are self-contained import-path work.
- **Shared seam:** all inbound tome paths funnel through `normalizeTomeData` (`src/game/tome.js:48`) → `addTomeToLibrary`. F1's validation/normalization belongs here so every path (Paste JSON, share code, CSV/Quizlet via `deckImport.js`, bundled starter decks) benefits, not just the Paste modal.
- **F2 lives entirely in `src/services/deckImport.js`** (the CSV/TSV/Quizlet converter that produces a canonical tome and then calls `normalizeTomeData`). F1's quiz validation, added in `tome.js`, will also run over CSV-imported decks — keep them composable (CSV decks have no quiz today, so F1 must no-op cleanly on a quiz-less tome).
- **F3 is pure wiring** between `HomeScreen.jsx` (where the buttons live), `LibraryScreen.jsx` (where they should also live), and the handlers in `App.jsx` — no new import logic.
- **Quiz scoring itself is correct** (QA verified): `QuizMode.jsx` grades MCQ on `idx === q.correctIndex` (`:258`) and T/F on `q.correctAnswer` (`:263`). F1 is an import-validation gap, **not** a scoring bug — do not change the grading.

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`).

### F1 (medium) — Paste/JSON import accepts a quiz with no usable answer key → silently all-wrong quiz, only a success toast

**Status: confirmed in source.**

QA repro:

1. Library → Paste Tome Text → paste `{"metadata":{"title":"X"},"quiz":[{"question":"…","options":["a","b","c","d"],"answer":1}]}` → Inscribe → success toast.
2. Open Quiz, pick the option `answer:1` points to → graded **wrong**.
3. Re-import the same deck with `correctIndex:1` → the same answer is graded **correct**. (QA verified both directions.)

Root cause, confirmed in source:

- `normalizeTomeData` (`src/game/tome.js:48-55`) **only** maps `lab.stages → lab.steps`. It does **no** quiz-item validation or answer-key normalization: `if (!data || !Array.isArray(data.labs)) return data;` then maps labs and returns. A quiz item carrying `answer`/`correct`/`correctAnswer`-as-index instead of `correctIndex` passes through untouched.
- `QuizMode.jsx:258` grades MCQ as `idx === s.q.correctIndex`. With `correctIndex === undefined`, **no** option index can equal it → every MCQ answer is wrong. T/F at `:263` grades `s.q.correctAnswer === true/false` — a missing/wrong-typed field is likewise unanswerable-correctly.
- The Paste path (`src/features/library/PasteTomeModal.jsx`) reports success on a parse-able JSON envelope `{metadata, flashcards, quiz, labs}` regardless of whether the quiz is gradeable, so the user gets a success toast + correct scroll/riddle counts for a deck that can never be answered correctly.

Verification commands (read-only):

```bash
sed -n '45,55p' dungeon-scholar/src/game/tome.js                       # normalizeTomeData: only stages->steps
sed -n '255,266p' dungeon-scholar/src/features/study/QuizMode.jsx       # grading on correctIndex / correctAnswer
grep -n 'correctIndex\|correctAnswer\|answer\b\|normalizeTomeData' dungeon-scholar/src/features/library/PasteTomeModal.jsx
```

**Suggested action (the report's):** in the normalize step, validate quiz items and normalize common synonyms (`answer`, `correct`, `correctAnswer` as index/text) to the canonical `correctIndex`/`correctAnswer`; warn on (or refuse) items with no resolvable correct answer instead of importing a deck that can never be answered correctly.

### F2 (low) — CSV/Quizlet import: whole-file tab-priority delimiter detection silently drops comma rows when any line contains a tab

**Status: confirmed in source.**

QA repro:

1. Empty library → Home → Import Deck (CSV/Quizlet).
2. Paste three rows where the first two are comma-separated and the last is tab-separated (`What is 2+2?,Four` / `Capital of France,Paris` / `mitochondria⇥powerhouse of the cell`).
3. Convert & Inscribe → toast "Imported 1 card from Quizlet/TSV"; only the tab row imported — the two comma rows were silently dropped.

Root cause, confirmed in source:

- `detectDelimiter(text)` (`src/services/deckImport.js:35-37`) chooses the delimiter for the **entire** file: `const sample = String(text).split(/\r?\n/).slice(0, 10).join('\n'); return sample.includes('\t') ? '\t' : ',';`. Any tab in the first 10 lines forces whole-file TSV mode.
- `parseDelimited` in tab mode (`deckImport.js:46-48`) does a plain `line.split('\t')` per line, then `.filter(row => row.some(c => c.trim() !== ''))`. A comma row has no tab → it becomes a single-field row → it has no "back"/definition → it is filtered/skipped downstream. So mixed content (or a legitimate CSV with a stray tab inside a definition in the first 10 lines) drops most rows.
- The only feedback is the low count in the success toast; nothing warns that N rows were unparseable. (Pure-CSV and pure-TSV both import correctly — this affects mixed/embedded-tab content only.)

Verification commands (read-only):

```bash
sed -n '35,55p' dungeon-scholar/src/services/deckImport.js   # detectDelimiter (whole-file, tab-priority) + tab-mode split
grep -n 'detectDelimiter\|parseDelimited\|Imported' dungeon-scholar/src/services/deckImport.js
grep -rn 'Imported .* from\|cards from' dungeon-scholar/src/features/library/ImportDeckModal.jsx
```

**Suggested action (the report's):** detect the delimiter **per row** (or count comma vs tab occurrences and pick the dominant), and surface a "skipped N unparseable rows" notice on import so a partial parse is never silent.

### F3 (medium) — The new CSV/Quizlet import and Occlusion authoring are unreachable once a tome is active

**Status: confirmed in source.**

QA: the two new content-creation entry points are rendered only in Home's *empty / no-tome-open* state. They are **not** in the Library ("The Grand Library") toolbar (which exposes only Forge, Paste Tome Text, Import Share Code, Inscribe a Tome), and the app has **no affordance to deselect the active tome** (`activeTomeId` only becomes null via `defaultState` or deleting every tome). So a returning user with a tome loaded — the normal steady state — has no path to the CSV/Quizlet importer or the occlusion author short of deleting all their tomes. These are headline new features (commits 9b5d93a6, 0070472f) most users will never find.

Root cause, confirmed in source:

- `HomeScreen.jsx` receives `onImportDeck` / `onAuthorOcclusion` (`:53-54`) and renders the two buttons in its empty-state add-tome group (`:145` "Import Deck (CSV/Quizlet)", `:155` "Author Occlusion Card"). This group is shown only in the no-tome state.
- `LibraryScreen.jsx` only accepts/wires `onPaste` / `onImportCode` (`:40-41`) and renders Forge / Paste / Import Share Code / Inscribe in its toolbar (~`:205-235`). It never receives or renders `onImportDeck` / `onAuthorOcclusion`.
- In `App.jsx`, the handlers exist (`onImportDeck={() => openModal('importDeck')}`, `onAuthorOcclusion={() => openModal('occlusionAuthor')}`) but are passed **only** to `HomeScreen` (`:1097-1098`); the `LibraryScreen` render (`:1188-1189`) gets only `onPaste`/`onImportCode`. The `ImportDeckModal` and `OcclusionAuthor` modals are already imported (`App.jsx:176,178`) and wired to `openModal` — only the entry points are missing from Library.

Verification commands (read-only):

```bash
grep -n 'onImportDeck\|onAuthorOcclusion\|onPaste\|onImportCode' dungeon-scholar/src/features/home/HomeScreen.jsx
grep -n 'onImportDeck\|onAuthorOcclusion\|onPaste\|onImportCode\|Inscribe\|Forge' dungeon-scholar/src/features/library/LibraryScreen.jsx
grep -n "openModal('importDeck')\|openModal('occlusionAuthor')\|<HomeScreen\|<LibraryScreen" dungeon-scholar/src/App.jsx
```

**Suggested action (the report's):** add "Import Deck (CSV/Quizlet)" and "Author Occlusion Card" to the Library add-tome toolbar (pass `onImportDeck`/`onAuthorOcclusion` into `LibraryScreen`), and/or provide a single "+ Add tome" menu containing all six import methods so every importer is reachable regardless of active-tome state.

## Sub-phases

> dungeon-scholar checks (run from `dungeon-scholar/`): single test `npx vitest run src/.../that.test.jsx` during sub-phase work; CI (`dungeon-scholar-ci.yml`) runs the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate on push. Logic changes (F1, F2) get unit tests; the F3 wiring leans on a render test + the build.

### 04A — Validate + normalize quiz answer keys at import (F1)

**Objective:** an imported quiz item with a resolvable-but-non-canonical answer key is normalized to `correctIndex`/`correctAnswer`; an item with no resolvable answer is flagged (warned/refused), never imported as a silently-all-wrong deck.

**Files:** `dungeon-scholar/src/game/tome.js` (extend `normalizeTomeData` + add `tome.test.js` cases if absent), `dungeon-scholar/src/features/library/PasteTomeModal.jsx` (surface the warning).

**Steps:**

1. In `normalizeTomeData`, after the existing `labs` mapping, add a `quiz` pass that, per item: if `correctIndex` is missing but a synonym resolves to a valid option index (`answer`/`correct`/`correctIndex` as a number, or as text matching one of `options`), set the canonical `correctIndex`; for T/F items normalize `answer`/`correct`/`correctAnswer` (boolean or "true"/"false" string) to `correctAnswer`. Keep it **idempotent** and a **no-op on quiz-less tomes** (CSV decks) and on already-canonical items.
2. Detect **unresolvable** items (MCQ with no derivable `correctIndex` in `[0, options.length)`, T/F with no boolean `correctAnswer`). Decide the policy and implement it consistently: either drop them and report a count, or keep the deck but return/attach a structured warning (e.g. `normalizeTomeData` returns `{ data, warnings }`, or a sibling `validateTome(data)` helper the modal calls). Prefer **warn + still import the gradeable items** over a hard refuse, but never import an item that can't be graded as if it were fine.
3. In `PasteTomeModal.jsx`, surface the warning when present — e.g. "Imported, but N quiz item(s) had no answer key and were skipped" — instead of a bare success toast.
4. Unit-test in `tome.test.js`: `answer:1` → `correctIndex:1`; text answer matching an option → its index; T/F synonyms → `correctAnswer`; an unresolvable item → flagged/dropped (not silently kept); a quiz-less tome and an already-canonical quiz → unchanged (idempotent).

**Acceptance:** new/extended `tome.test.js` green; a deck that previously graded all-wrong now grades correctly (or is reported as skipped); the grading code in `QuizMode.jsx` is unchanged; quiz-less (CSV) tomes pass through untouched; `npm run build` clean.

### 04B — Per-row (or dominant) delimiter detection + skipped-row notice (F2)

**Objective:** a mixed comma/tab deck imports all parseable rows; a partial parse is never silent.

**Files:** `dungeon-scholar/src/services/deckImport.js` (`detectDelimiter`, `parseDelimited`, + `deckImport.test.js`), `dungeon-scholar/src/features/library/ImportDeckModal.jsx` (surface the skipped count).

**Steps:**

1. Replace the whole-file, tab-priority `detectDelimiter` with either per-row detection (choose `\t` vs `,` per line by which yields ≥2 non-empty fields) or a dominant-delimiter count over the sample (compare total tab vs comma occurrences and pick the majority). Keep pure-CSV (quote-aware) and pure-TSV behaviour identical to today.
2. Track and return a count of rows that produced no usable term/back pair (unparseable/skipped), separate from successfully imported cards.
3. In `ImportDeckModal.jsx`, when skipped > 0, show "Imported N cards (M rows skipped — check the delimiter/format)" rather than only the success count.
4. Unit-test in `deckImport.test.js`: the QA's mixed 3-row case imports all 3 (or reports the skips); pure-CSV and pure-TSV are unchanged; a CSV with a stray tab in an early definition still parses its comma rows; the skipped count is correct.

**Acceptance:** extended `deckImport.test.js` green; the mixed-delimiter case no longer silently drops comma rows; pure-CSV/pure-TSV regression-free; a partial parse surfaces a skipped-row notice; `npm run build` clean.

### 04C — Make the CSV/Quizlet + Occlusion importers reachable from Library (F3)

**Objective:** all six import methods are reachable regardless of whether a tome is active.

**Files:** `dungeon-scholar/src/App.jsx` (`:1188-1189` LibraryScreen render), `dungeon-scholar/src/features/library/LibraryScreen.jsx` (accept + render the two new entry points).

**Steps:**

1. Pass `onImportDeck` / `onAuthorOcclusion` into `LibraryScreen` from `App.jsx` (reuse the existing `() => openModal('importDeck')` / `openModal('occlusionAuthor')` handlers already wired to `HomeScreen`).
2. In `LibraryScreen.jsx`, accept the two new props and render "Import Deck (CSV/Quizlet)" + "Author Occlusion Card" buttons in the add-tome toolbar alongside Forge / Paste / Import Share Code / Inscribe, matching the existing button styling and icons (`FileUp` / `ImagePlus`, as Home uses).
3. (Optional, cleaner) consolidate all six methods behind a single "+ Add tome" menu shared by Home + Library so the set stays in sync in one place; if deferred, note it as a follow-up.
4. Render test: with a tome active, the Library toolbar exposes Import-Deck + Author-Occlusion entry points (and clicking them opens the right modal).

**Acceptance:** with an active tome, both new importers are reachable from Library; the modals open via the existing handlers; Home's empty-state buttons still work; `npm run build` clean; render test green.

## Research notes

- The synonym set most common in AI-generated decks is `answer`/`correct`/`correctAnswer` carrying either a 0-based index, a 1-based index, or the answer **text**. Normalize defensively: a numeric synonym out of `[0, options.length)` is itself a signal the deck is 1-based or broken — resolve 1-based only if the 0-based value is out of range and the 1-based value is in range, else flag it. Keep this logic in `tome.js` with tests, not in the UI.
- `detectDelimiter` returning per-row keeps Quizlet's unquoted-TSV and RFC-4180-ish CSV both working; the failure mode today is only the whole-file decision. A dominant-count heuristic is simpler and usually sufficient; per-row is the most robust. Either is acceptable as long as the mixed case stops dropping rows silently.
- F3 is the highest user-visible value for the least code — the features already exist and are fully wired; only the Library entry points are missing.

## Test plan

- Per sub-phase: `npx vitest run src/game/tome.test.js` (04A), `npx vitest run src/services/deckImport.test.js` (04B), a `LibraryScreen` render test (04C).
- At phase end: `npm run lint:fix` (per PHASE-02's biome caveat — hand-format touched files rather than a repo-wide autofix), then push and let CI (`dungeon-scholar-ci.yml`) run the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate.
- Runtime / next-deploy verification (not CI-gated): paste a deck with `answer:`-style keys → it grades correctly or warns (F1); import a mixed comma/tab deck → all rows import or a skip notice shows (F2); with a tome active, open the Library and confirm Import-Deck + Author-Occlusion are present and functional (F3).

## Acceptance criteria

- An imported quiz with non-canonical-but-resolvable answer keys grades correctly; an unresolvable item is flagged, never silently imported as all-wrong (F1).
- A mixed comma/tab deck imports all parseable rows; any skipped rows are reported (F2).
- All six import methods are reachable regardless of active-tome state (F3).
- `QuizMode` grading logic is unchanged; quiz-less (CSV) tomes are unaffected by the normalize pass.
- `dungeon-scholar-ci.yml` green (full `npm run test` + `npm run build`).

## Out of scope

- `.apkg` (Anki) import — explicitly deferred in `deckImport.js`'s header (needs a sql.js/WASM reader; a separate bundle-size decision).
- Adding an explicit "close/deselect active tome" affordance — F3 is satisfied by making the importers reachable from Library; a general "unload tome" UX is its own design call (the report raised it as the underlying cause, but the targeted fix is the Library entry points).
- The full image-occlusion authoring flow (upload + mask drawing) the QA could not drive in automation — its reachability is fixed here (04C); its end-to-end authoring correctness is a separate verification, and the render path is unit-tested per the run-3 report.

## Completed (2026-06-29)

- **04A (F1)** `src/game/tome.js`: added `toBool`/`resolveCorrectIndex`/`resolveQuizItem` helpers + exported `normalizeQuiz` and `quizImportReport`. `normalizeTomeData` now also normalizes the quiz array (independently of labs — previously it returned early on labs-less tomes), resolving `answer`/`correct`/`correctAnswer` synonyms (0-based, 1-based fallback, option-text, or A–Z letter) to canonical `correctIndex`, and true/false synonyms to a boolean `correctAnswer`; ungradeable items are dropped rather than imported as silently-all-wrong. Idempotent; no-op on quiz-less (CSV) tomes. Plan listed `PasteTomeModal.jsx` for the warning, but that modal is a thin `PasteSubmitModal` config — the real import seam is `App.jsx handlePasteImport` (toast lives there), so the warning was surfaced there: "Tome inscribed: … — N quiz item(s) had no answer key and were skipped" via `quizImportReport`. `QuizMode` grading unchanged. Tests: `tome.test.js` +7 cases.
- **04B (F2)** `src/services/deckImport.js`: `detectDelimiter` now picks the DOMINANT delimiter (tab vs comma count) instead of whole-file tab-priority; added `rescueMixedRows` so any row that parsed to <2 non-empty fields under the dominant delimiter is re-split by the other delimiter (fixes silent dropping of comma rows in a tab-containing deck and vice-versa). `deckTextToTome` now tracks + returns `skipped`; `App.jsx handleDeckImport` surfaces "(N rows skipped — check the delimiter/format)". Pure-CSV/pure-TSV behaviour preserved. Tests: `deckImport.test.js` +4 cases (mixed deck imports all 3 rows; stray-tab; skipped count; CSV/TSV regression).
- **04C (F3)** `src/features/library/LibraryScreen.jsx`: accept `onImportDeck`/`onAuthorOcclusion` props and render "Import Deck (CSV / Quizlet)" (`FileUp`) + "Author Occlusion Card" (`ImagePlus`) buttons in the add-tome toolbar (always visible in Library, so reachable with an active tome). `App.jsx` already passed these props to `LibraryScreen` (code had drifted ahead of the plan's pre-state — App side already wired; only the component render was missing). Single "+ Add tome" menu consolidation deferred as an optional follow-up (noted). Test: `LibraryScreen.test.jsx` +1 render test (buttons present with active tome + fire handlers).
- **Verification:** `npx vitest run` green — tome.test.js + deckImport.test.js (30 tests) and LibraryScreen.test.jsx (3 tests). Biome check clean on touched files (formatting auto-fixed; remaining warnings pre-existing). Full `npm run test` + build gated by CI on push.
