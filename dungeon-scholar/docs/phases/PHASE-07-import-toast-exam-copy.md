# PHASE-07 — Import post-toast consistency + provenance-aware "too few riddles" copy

> Authored from the 2026-06-28 dungeon-scholar QA report — [`QA-report-2026-06-28.md`](./QA/completed/QA-report-2026-06-28.md) — tested @ deployed `index-Dy2bw_1f.js` / last dungeon-scholar src commit `8a8891fb` · cross-checked `origin/master` `43e4be93`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Two low-severity copy/UX warts from the 2026-06-28 pass, bundled because both are small wording/feedback fixes in the study/import surface and neither depends on the other. **F1:** the two library import entry points ("Import Deck (CSV / Quizlet)" and "Paste Tome Text") give **inconsistent — and, when a tome is already active, mutually contradictory — post-import toasts**, so a user who imports a deck can be told both "Imported N cards into a new tome" and "switch from the Library when ready" at once, and is left unsure whether the new tome is active. **F2:** the Practice-Exam "too few riddles" gate tells **every** under-filled tome to "Regenerate the tome with the updated prompt to populate the deck" — meaningless for a CSV-imported, pasted, or starter deck that was never AI-forged and has no prompt. This phase makes the post-import feedback consistent and activation-accurate, and makes the exam gate's copy fit how the tome was actually created.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Self-contained copy/feedback work in `App.jsx` (import handlers), `usePlayerActions.js` (the shared `addTomeToLibrary` toast), and `ExamMode.jsx` (one string). No shared files with PHASE-03/04/05/06.
- **Relationship to PHASE-04 (import ingestion robustness).** PHASE-04 bundles import *parsing/reachability* gaps (delimiter detection, answer-key validation, the importers being unreachable once a tome is active). This phase is strictly the **post-import user feedback** (toasts) and one **exam-gate string** — no overlap with PHASE-04's parsing logic. If PHASE-04 ships first and changes the importer entry points, re-confirm the toast call sites still exist before 07A; they are in `App.jsx`, not the importer modals.
- **The activation rule itself is correct and out of scope to change.** Per Phase 30c QA #6, `addTomeToLibrary` deliberately auto-activates a freshly added tome **only when there is no active tome** (`shouldActivate = !prev.activeTomeId`, `usePlayerActions.js:1145` / `:1190`), so an import never kicks the user out of an in-progress tome. This phase does **not** change that behaviour — it only makes the *messaging* about it consistent and accurate.

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`).

### F1 (low, UX) — Import entry points give inconsistent / contradictory post-import toasts (report's "CSV activates, paste doesn't" root cause corrected)

**Status: confirmed in source — with a corrected root cause.**

QA repro:

1. With tome A active, use **Import Deck (CSV / Quizlet)** → toast "Imported 8 cards into a new tome"; QA read the new tome as active.
2. With tome A active, use **Paste Tome Text** → toast "Tome added: '…' — switch from the Library when ready"; A stays active.

**The report's hypothesis is incorrect and is corrected here.** The report supposed "the deck-import handler calls the activate/switch action after `addTomeToLibrary`; the paste-JSON handler only adds." In source, **both** paths route through the **same** `addTomeToLibrary` and share the **same** activation rule — neither calls any extra switch/activate:

- `handleDeckImport` (`src/App.jsx:916-929`): `deckTextToTome(text)` → `addTomeToLibrary(res.tome)` → `showNotif('Imported N cards into a new tome', 'success')` (`:928`). **No activate call.**
- `handlePasteImport` (`src/App.jsx`, the JSON paste path): `addTomeToLibrary(data)` → `showNotif('Tome inscribed: <title>', 'success')` (`:906`). **No activate call.**
- `addTomeToLibrary` (`src/features/player/usePlayerActions.js:1121`): auto-activates **only** when `!prev.activeTomeId` (`shouldActivate`, `:1145` plain / `:1190` sealed) — identical for every caller. When a tome **is** already active it additionally fires, after a 100 ms defer, `showNotif('Tome added: "<title>" — switch from the Library when ready.', 'info')` (`:1161` sealed / `:1208` plain).

So the **observed** "CSV activated, paste didn't" was a test-state artifact (the CSV deck was almost certainly imported while **no** tome was active → it auto-activated; the paste was done with A active → it didn't). The activation behaviour is already consistent. The **genuine, reproducible** defects are in the *messaging*:

1. **Two toasts fire per import when a tome is already active, and they conflict.** CSV path → "**Imported N cards into a new tome**" (success) **+** "…switch from the Library when ready" (info). The success line's phrase "**into a new tome**" reads as "it's ready / you're in it," directly contradicting the info line that says it is **not** active — so a user who pastes/imports and immediately opens a study mode may study the **old** tome (the exact harm the report describes).
2. **The per-handler success toasts are inconsistent across entry points and none reflect activation state.** "Imported N cards into a new tome" (CSV) vs "Tome inscribed: X" (paste, `:906`) vs "Occlusion tome inscribed: X" (`handleOcclusionCreate`, `:935`) — three different phrasings, none of which tells the user whether the tome became active.

Verification commands (read-only):

```bash
sed -n '900,936p'   dungeon-scholar/src/App.jsx                          # handlePasteImport (:906) + handleDeckImport (:916-929) + handleOcclusionCreate (:935)
sed -n '1140,1212p' dungeon-scholar/src/features/player/usePlayerActions.js # shouldActivate rule (:1145/:1190) + the "switch from the Library" info toast (:1161/:1208)
grep -n "into a new tome\|Tome inscribed\|switch from the Library" dungeon-scholar/src/App.jsx dungeon-scholar/src/features/player/usePlayerActions.js
```

**Suggested action:** make the post-import feedback **one** consistent, activation-accurate message across all import paths, instead of a per-handler success toast plus the separate "switch" info toast. Either (a) have `addTomeToLibrary` own the single post-add toast for **both** branches — "Now studying: <title>" when it auto-activated (no active tome before), or "Tome added: <title> — switch from the Library when ready" when it didn't — and reduce each handler to error-only toasts; or (b) if the handlers keep their own success toast, drop the misleading "into a new tome" wording and have every path append the same activation clause so the success + info lines never contradict.

### F2 (low, UX/copy) — Practice-exam "too few riddles" message tells hand-authored / imported decks to "Regenerate the tome with the updated prompt"

**Status: confirmed in source.**

QA repro:

1. Load any deck with fewer than the required riddles (e.g. the "Getting Started" starter deck, 2 riddles).
2. Open Practice Exam → the gate reads: "This tome has only 2 riddles — too few for a practice exam. **Regenerate the tome with the updated prompt to populate the deck.**"

For a CSV-imported, pasted, or starter deck — **none** AI-generated, **none** with a "prompt" — "Regenerate the tome with the updated prompt" is meaningless and points the user at the AI "Forge with Magic" flow, which does not apply to their tome.

Root cause, confirmed in source — `src/features/study/ExamMode.jsx:333-334`:

```jsx
{quizPool.length < 5 ? (
  <div … >
    This tome has only {quizPool.length} riddle{quizPool.length === 1 ? '' : 's'} — too few for a practice
    exam. Regenerate the tome with the updated prompt to populate the deck.
  </div>
) : ( … )}
```

The copy assumes the AI "Forge with Magic" creation path is the only source of riddles; it does not branch on how the tome was actually created.

Verification commands (read-only):

```bash
sed -n '326,340p' dungeon-scholar/src/features/study/ExamMode.jsx        # the <5-riddle gate + the "updated prompt" copy
grep -n "Regenerate the tome" dungeon-scholar/src/features/study/ExamMode.jsx
grep -n "subject: 'Imported'\|author: 'Imported deck'" dungeon-scholar/src/services/deckImport.js  # provenance markers an imported tome carries
```

**Suggested action:** make the message provenance-aware, or use creation-agnostic wording. Simplest: a generic line such as "This tome needs more riddles for a practice exam — add more riddles or import a larger deck." Only mention regenerating for AI-forged tomes, and only if provenance is determinable (imported decks set `metadata.subject = 'Imported'` / `metadata.author = 'Imported deck'` in `services/deckImport.js`).

## Sub-phases

> dungeon-scholar checks (run from `dungeon-scholar/`): single test `npx vitest run src/.../that.test.jsx` during sub-phase work; CI (`dungeon-scholar-ci.yml`) runs the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate on push. These are copy/feedback changes with no behaviour change to the activation logic — the build + a careful read are the main gates; add a small string/assertion test where tractable.

### 07A — One consistent, activation-accurate post-import toast (F1)

**Objective:** every import entry point gives the same, non-contradictory feedback, and the message tells the user whether the new tome is now active.

**Files:** `dungeon-scholar/src/features/player/usePlayerActions.js` (the `addTomeToLibrary` toast at `:1161`/`:1208` and the `shouldActivate` it already computes), `dungeon-scholar/src/App.jsx` (`handleDeckImport` `:928`, `handlePasteImport` `:906`, `handleOcclusionCreate` `:935`).

**Steps:**

1. Centralize the post-add toast in `addTomeToLibrary` so it fires **once** for both the activated and not-activated cases, derived from the `shouldActivate` it already computes:
   - activated (no active tome before) → e.g. `"Now studying: <title>"` (success);
   - not activated (a tome was already active) → the existing `"Tome added: <title> — switch from the Library when ready."` (info).
   Apply the same to the sealed branch (`:1161`) and the plain branch (`:1208`).
2. Reduce the per-handler success toasts to **error-only** (keep the existing error toasts: parse failures, empty-tome rejection, size-cap). Remove the contradictory "Imported N cards into a new tome" (`App.jsx:928`), "Tome inscribed: X" (`:906`), and "Occlusion tome inscribed: X" (`:935`) success lines — or, if a per-format success detail is desired (e.g. the "N cards" count), fold the count into the single centralized toast rather than emitting a second toast. **Do not** leave both a per-handler success toast and the centralized one firing for the same import.
3. Do **not** change the activation rule itself (`shouldActivate = !prev.activeTomeId`) — only the messaging.
4. Confirm the StrictMode-safe defer (the 100 ms `setTimeout` + the 17C "derive toast from render state" pattern) is preserved so the toast can't double-fire.

**Acceptance:** importing via CSV/Quizlet, JSON paste, and occlusion-author all produce **one** post-import toast with consistent wording; with a tome already active, no import shows a "ready"-implying success line alongside the "switch from the Library" notice; the new tome's active/inactive state is correctly stated; `npm run build` clean.

### 07B — Provenance-aware (or generic) "too few riddles" exam copy (F2)

**Objective:** the exam gate's message fits how the tome was created and never tells a non-AI deck to "regenerate with the updated prompt."

**Files:** `dungeon-scholar/src/features/study/ExamMode.jsx:333-334`.

**Steps:**

1. Replace the hardcoded "Regenerate the tome with the updated prompt to populate the deck." with creation-agnostic wording, e.g. "Add more riddles to this tome — or import a larger deck — to run a practice exam." Keep the leading "This tome has only N riddle(s) — too few for a practice exam." count sentence.
2. (Optional, only if cheap) If tome provenance is readily available on `courseSet.metadata` (imported decks carry `subject: 'Imported'` / `author: 'Imported deck'`; AI-forged tomes carry their own marker), branch the suggestion: mention "Forge with Magic / regenerate" **only** for AI-forged tomes, and the "add riddles / import a larger deck" path otherwise. If provenance is not cleanly determinable, ship the generic wording from step 1 — do not invent a provenance flag for this copy fix.
3. Keep the `< 5` threshold unchanged (it is the existing exam-minimum gate, not part of this finding).

**Acceptance:** the "too few riddles" gate no longer references regenerating with a prompt for non-AI decks; the starter "Getting Started" 2-riddle deck shows actionable, creation-appropriate guidance; `npm run build` clean.

## Research notes

- The activation behaviour is intentionally "activate only when no tome is active" (Phase 30c QA #6: a surprise activation would eject the user from an in-progress tome). The 2026-06-28 finding is **not** a request to change that — it is that the *copy* around it is inconsistent and, in the active-tome case, self-contradictory. The corrected root cause (both paths share one activation rule) is important so the executer fixes the messaging rather than "aligning" two activation paths that are already aligned.
- `addTomeToLibrary` already computes `shouldActivate` and already owns the "not activated" info toast — so centralizing the toast there (07A option a) is a small, low-risk change that removes the duplicate/contradictory handler toasts without touching state logic.
- The exam gate at `ExamMode.jsx:333` is plain JSX copy with no provenance branching today; the generic wording (07B step 1) is the safe minimum, with the provenance branch as an optional nicety only if `metadata` already distinguishes AI-forged vs imported tomes.

## Test plan

- Per sub-phase: a string/assertion test where tractable (e.g. assert the exam gate text for a small deck no longer contains "updated prompt"; assert a single toast call per import path). `npx vitest run` the affected test.
- At phase end: `npm run lint:fix` (per PHASE-02's biome caveat — hand-format the touched files rather than running a repo-wide autofix), then push and let CI run the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate.
- Runtime / next-deploy verification (not CI-gated): on the live deploy, import via CSV and via paste with a tome already active — confirm one consistent, non-contradictory toast each; open Practice Exam on the 2-riddle starter deck — confirm the new copy.

## Acceptance criteria

- All import entry points (CSV/Quizlet, JSON paste, occlusion author) emit **one** consistent post-import toast that correctly states whether the new tome became active; no contradictory success+info pair (F1).
- The activation rule (`shouldActivate = !prev.activeTomeId`) is unchanged.
- The Practice-Exam "too few riddles" gate uses creation-appropriate wording and never tells a non-AI deck to "regenerate with the updated prompt" (F2).
- `dungeon-scholar-ci.yml` green (full `npm run test` + `npm run build`).

## Out of scope

- The import **parsing / reachability** gaps (delimiter detection, answer-key validation, importers unreachable once a tome is active) — those are PHASE-04.
- Changing **when** an imported tome auto-activates — the existing rule is intentional (Phase 30c QA #6); only the messaging changes.
- The `< 5` practice-exam riddle threshold itself — unchanged; this finding is only the gate's copy.
- Any broader toast/notification system redesign — out of scope; this is a targeted consistency fix on the import paths.
