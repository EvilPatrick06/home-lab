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

### [2026-06-22] Pin one Node version for the whole monorepo (.nvmrc / engines) instead of repeating `node-version: 22`

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`node-version: 22` is hardcoded in 7 places across 5 workflows (`dnd-app-ci`, `security-audit`, `dnd-app-validate-5e`, `release` ×3, `deploy`). There is no root `.nvmrc`, no `engines.node` field in any package.json (`dnd-app` / `dungeon-scholar` / `oracle-worker`), and no Volta pin. Local contributors can build on any Node, and bumping the toolchain means hand-editing every workflow.

**Proposed fix / improvement:**
- [ ] Add a root `.nvmrc` (e.g. `22`).
- [ ] Add a matching `engines.node` to each project package.json.
- [ ] Switch workflows to `node-version-file: .nvmrc` so the version lives in one place.

**Related files:** `.github/workflows/*.yml`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] No PR-time CI gate for dungeon-scholar or oracle-worker

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`dnd-app` has a dedicated CI gate (lint + forbidden-patterns + tsc + tests + build smoke + circular + audit). `dungeon-scholar` runs `npm run test` ONLY as a precondition of the Pages deploy (`deploy.yml`, push to main) — there is no `pull_request`-triggered test/build gate, so a PR merges green and only fails later at deploy time. `oracle-worker` has a `test` script but zero workflows reference it, so its tests never run in CI.

**Proposed fix / improvement:**
- [ ] Add `dungeon-scholar-ci.yml` (path-filtered test + build on push + PR).
- [ ] Add `oracle-worker-ci.yml` (npm ci + test).
- [ ] Optionally factor the shared setup-node / npm-ci steps into a composite action reused by all JS-project workflows.

**Related files:** `.github/workflows/deploy.yml`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] Local pre-commit hook gates only dnd-app; `.githooks/` dir is now orphaned

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`.husky/pre-commit` does `cd dnd-app` then runs biome + tsc on that project only. Commits touching `dungeon-scholar`, `oracle-worker`, or repo-root tooling get no local lint/typecheck/test pre-flight (dungeon-scholar`s first gate is the deploy workflow; oracle-worker has none). Separately, `.githooks/pre-commit` is now redundant — its gitleaks shim was folded into `.husky/` per that hook`s own comment, yet the old dir remains and can confuse anyone setting `core.hooksPath`.

**Proposed fix / improvement:**
- [ ] Make the hook detect which project(s) have staged changes and run each one`s lint/typecheck (at minimum add dungeon-scholar test/build).
- [ ] Delete the orphaned `.githooks/` directory once `.husky` is confirmed authoritative.

**Related entries:** `ISSUES-LOG-DNDAPP.md` [2026-06-16] pre-commit `--staged` no-op (distinct dnd-app-only bug).
**Related files:** `.husky/pre-commit`, `.githooks/pre-commit`

### [2026-06-22] Four hand-maintained agent-instruction files will drift (AGENTS / CLAUDE / GEMINI / copilot)

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
The repo carries four overlapping AI-assistant guides — `AGENTS.md` (12.8K), `CLAUDE.md` (11.3K), `GEMINI.md` (5.2K), `.github/copilot-instructions.md` (4.6K) — each maintained by hand. They cover much of the same ground (repo layout, conventions, logging rules) and will drift out of sync as the repo evolves.

**Proposed fix / improvement:**
- [ ] Designate one canonical source (e.g. `AGENTS.md`); generate or symlink the others from it, or add a sync check that flags when shared sections diverge.
- [ ] At minimum, have each file link to the canonical one for shared sections instead of duplicating them.

**Related files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

> **2026-06-10 — Backlog consolidated.** All previously-open entries (F2–F6,
> code-splitting, QA16 full light theme, QA-Bestiary badges, the L1–L18 polish
> set, and the Phase 30 QA coverage-gap list) became the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dungeon-scholar ideas below as they appear.

### [2026-06-22] Manual local save export / import (offline backup file) — UI promises it but it doesn't exist

- **Category:** portability
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
The only ways to preserve progress today are (a) browser `localStorage` (lost on clear-data / device switch) and (b) optional Supabase cloud sync (requires a configured deployment + GitHub sign-in). There is no way to export the player save to a portable file and re-import it. Tomes can be exported/shared (`ShareTomeModal` → `downloadTomeJson`, blob + `URL.createObjectURL`), but the *player save* (`STORAGE_KEY = "dungeon-scholar:save:v1"`, handled in `services/persistence.js`) cannot. Notably the app already *tells* the user to do this — `App.jsx:546` shows "...sign in for cloud backup, or **export thy journal**." on a quota/save failure — but no "export journal" action exists anywhere (`AccountPanel.jsx` only offers sign-out / delete-cloud / delete-account / reset; no Blob download of the save outside the tome path). So the error copy points at a feature that was never built.

**Hypothesis / root cause:** cloud sync was built as the cross-device story and the local-file fallback was described in copy but never implemented; private-mode / quota-exceeded / sync-disabled users have no recovery path.

**Proposed fix / improvement:**
- [ ] Add "Export journal" (download the `persistence` payload as `dungeon-scholar-save-<date>.json`) and "Import journal" (validate schema_ver, merge or replace) to `AccountPanel` (and ideally the home/settings surface so it works with cloud sync entirely unconfigured).
- [ ] Reuse the existing Blob + `URL.createObjectURL` + `a.click()` machinery from `ShareTomeModal`.
- [ ] Run the import through the same `MergeChooser` flow the cloud merge uses, so a re-import can merge rather than clobber.

**Related files:** `src/services/persistence.js`, `src/components/AccountPanel.jsx`, `src/App.jsx` (line ~546 notif), `src/features/library/ShareTomeModal.jsx` (download pattern), `src/components/MergeChooser.jsx`

---

### [2026-06-22] Practice exam lacks flag-for-review + a question navigator grid

- **Category:** UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
`ExamMode` (Phase 26e) is explicitly modeled on real cert exams ("mimics the real cert exam", timed, can't pause). Real proctored engines (Pearson VUE / PSI) universally provide two things this mode does not: (1) a **flag/mark-for-review** toggle per question, and (2) a **question navigator** (a grid of all question numbers showing answered / unanswered / flagged, with click-to-jump). The current exam is one-question-at-a-time with only prev/next navigation — no flag state exists anywhere in `ExamMode.jsx` or `services/examSession.js`, and there's no end-of-exam "you flagged N / left M blank — jump back?" review step before final submit. For a 90-question timed exam this makes triage (skip-and-return-to-the-hard-ones) tedious and trains a worse exam strategy than the real test rewards.

**Proposed fix / improvement:**
- [ ] Add per-question `flagged` state to the exam session (persist it alongside answers in `examSession`/`sessionResume` so a refresh keeps flags).
- [ ] Add a navigator grid (answered / blank / flagged color-coding) with click-to-jump, themed as a "trial map".
- [ ] Add a pre-submit review gate listing unanswered + flagged questions with one-click jump-back.
- [ ] Keep it keyboard-accessible (there's already a hotkey layer in `ExamMode`, e.g. the `t`/answer keys).

**Related files:** `src/components/ExamMode.jsx`, `src/services/examSession.js`, `src/services/sessionResume.js`

---

### [2026-06-22] Read-aloud (text-to-speech) for flashcards / questions — accessibility + hands-free study

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
There is no text-to-speech anywhere in the app — `grep` for `speechSynthesis` / `SpeechSynthesisUtterance` across `src/` returns nothing. A read-aloud button on flashcards and quiz/exam question text would help (a) low-vision / dyslexic learners, (b) hands-free / eyes-free review (commuting, walking), and (c) general retention via dual-channel encoding. The browser `Web Speech API` (`speechSynthesis`) is free, offline-capable, and needs no new dependency — fitting the offline-first PWA story. It would need to coexist with the existing audio engine (`audio/sound.js`) so SFX/BGM ducks while speaking, and respect a per-mode toggle. RichContent (code/Mermaid) should be skipped or summarized rather than read verbatim.

**Proposed fix / improvement:**
- [ ] Add a small "read aloud" control to flashcard front/back, quiz prompts, and exam questions using `window.speechSynthesis`.
- [ ] Strip/skip code fences + Mermaid before speaking (reuse `services/richContent.js` parsing).
- [ ] Duck BGM/SFX while an utterance is active; expose a settings toggle + voice/rate picker in `AudioPanel`.

**Related files:** `src/features/study/FlashcardsMode.jsx`, `src/features/study/QuizMode.jsx`, `src/components/ExamMode.jsx`, `src/audio/sound.js`, `src/features/home/AudioPanel.jsx`, `src/services/richContent.js`

---

### [2026-06-22] In-app tome authoring / editor (the only path today is hand-writing JSON)

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
Creating new study content requires hand-authoring the tome JSON by hand — `PromptModal.jsx` even surfaces a "ⓘ View tome JSON schema (for hand-authoring)" link, which is the entire content-creation UX. There's no in-app editor to add/edit flashcards, quiz items, or labs, even though the app already has `MetadataEditModal` for editing a tome's title/domain. A guided editor (add card, add MCQ with options + correctIndex + explanation, add lab steps) writing the same normalized shape `normalizeTomeData` already accepts would dramatically lower the barrier to user-generated decks and let users fix typos in imported tomes without round-tripping through a text editor. It pairs naturally with the AI prompt templates in `src/prompts/` (generate-then-edit).

**Proposed fix / improvement:**
- [ ] Extend the metadata-edit surface into a full per-section CRUD editor (flashcards / quiz / labs) that emits the schema `normalizeTomeData` validates.
- [ ] Add inline validation (correctIndex in range, non-empty options, unique ids).
- [ ] Optional: "generate draft from prompt" hook into `src/prompts/` then drop the result into the editor for review.

**Related files:** `src/features/library/MetadataEditModal.jsx`, `src/components/PromptModal.jsx`, `src/game/tome.js` (`normalizeTomeData`), `src/prompts/`

---

### [2026-06-22] Bundle more starter tomes — 11 provider prompt sets but only 3 shipped decks

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
The repo ships only three tomes (`tome-security-plus-sy0-701.json`, `tome-aws-clf-c02.json`, `tome-ccst-cybersecurity.json`), yet `src/prompts/` carries provider-specific generation templates for eleven vendors (aws, cisco, cmmc, comptia, eccouncil, giac, google, isaca, isc2, microsoft, generic). New users with no content land on a near-empty deck picker for most certs the app clearly intends to support. A handful of additional vetted starter tomes (e.g. Network+, CompTIA A+ — both referenced in the README's "first session" copy but not actually bundled — and one each for the AWS/Azure/Google/Cisco tracks the prompts target) would make the app useful out-of-the-box for far more learners and showcase the rich-content (Mermaid/code/lab) features. A lightweight in-app "deck catalog / starter-pack" picker that imports a bundled tome on demand would keep the initial bundle small while improving first-run value.

**Proposed fix / improvement:**
- [ ] Author/vet a few more starter tomes covering the cert tracks the `src/prompts/` templates already target (and the Network+/A+ the README names).
- [ ] Add a "starter decks" catalog to the deck picker / Library that imports a bundled tome on click (lazy-fetched so the initial PWA payload stays lean).

**Related files:** `tome-*.json`, `src/prompts/`, `src/features/library/LibraryScreen.jsx`, `README.md` (first-session copy references Network+/A+)

---

---

# Low-severity polish / info

### [2026-06-22] `ExamMode.jsx` is a study mode stranded in `src/components/` while every sibling mode lives in `src/features/study/`

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/components/ExamMode.jsx` (846 lines / 44 KB) is a full study-mode screen, but it is the only one not co-located with its peers under `src/features/study/`. Every other mode — `QuizMode.jsx`, `ChatMode.jsx`, `LabMode.jsx`, `FlashcardsMode.jsx`, `DomainStudyScreen.jsx`, `MistakeVault.jsx` — lives in `src/features/study/`. `ExamMode` is lazy-loaded from the wrong place (`App.jsx:24`: `React.lazy(() => import("./components/ExamMode.jsx"))`) and sits in the flat `components/` grab-bag alongside app chrome (`SignInButton`, `ProfileChip`, `SyncStatusDot`, `ErrorBoundary`). This breaks the PHASE-39 feature-folder convention and makes the study-mode set harder to find as a unit. (Related: it is also the only study mode with no co-located test file — that test gap travels with the move.)

**Hypothesis / root cause:** `ExamMode` (Phase 26e) was added after the `features/study/` split and dropped into `components/` rather than beside its siblings.

**Proposed fix / improvement:**
- [ ] Move `src/components/ExamMode.jsx` → `src/features/study/ExamMode.jsx`; update the `App.jsx` lazy-import path and the relative imports (e.g. `./useDialogA11y.js` → `../../components/useDialogA11y.js` or the new hooks home below).
- [ ] Add a co-located `ExamMode.test.jsx` while the file is being touched.

**Related files:** `src/components/ExamMode.jsx`, `src/features/study/` (QuizMode/ChatMode/LabMode/FlashcardsMode/DomainStudyScreen/MistakeVault), `src/App.jsx` (line ~24 lazy import)

### [2026-06-22] `useDialogA11y` is a repo-wide shared hook but lives in `src/components/` instead of `src/hooks/`

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/components/useDialogA11y.js` is a generic, cross-cutting React hook (focus-trap / escape-to-close dialog a11y) imported by ~18 files spanning every feature area — `App.jsx`, `components/` (PromptModal, MergeChooser, ExamMode, TomeNotes, AccountPanel), `components/ui/` (ConfirmModal, ResetConfirmModal, AchievementsModal, TitlesModal) and `features/` (tutorial/WelcomeModal, study/ChatMode, progression/ShopScreen, library/MetadataEditModal+ImportCodeModal+ShareTomeModal+PasteTomeModal). Yet it sits inside `src/components/` even though the repo has a dedicated `src/hooks/` directory (`useAuth.js`, `usePlayerState.js`). A reusable hook used by non-component code paths is misfiled under `components/`, and the long `../../components/useDialogA11y.js` relative imports from deep feature folders are a smell pointing at the wrong home.

**Hypothesis / root cause:** The hook was created next to the first dialog component that needed it and never relocated when `src/hooks/` was established.

**Proposed fix / improvement:**
- [ ] Move `src/components/useDialogA11y.js` (+ `useDialogA11y.test.jsx`) → `src/hooks/useDialogA11y.js`; update the ~18 import paths.
- [ ] Consider colocating `features/player/usePlayerActions.js` and `router/useHashRoute.js` decisions consciously (feature-local hooks can stay), but truly cross-cutting hooks should live in `src/hooks/`.

**Related files:** `src/components/useDialogA11y.js`, `src/components/useDialogA11y.test.jsx`, `src/hooks/` (useAuth.js, usePlayerState.js), and the ~18 importers across `components/`, `components/ui/`, and `features/`

### [2026-06-22] `ImportCodeModal` and `PasteTomeModal` are near-identical twin modals — consolidate into one parameterized modal

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/features/library/ImportCodeModal.jsx` (79 lines) and `src/features/library/PasteTomeModal.jsx` (92 lines) are structurally the same component: identical `useState(text)` + `useState(error)`, identical `handleSubmit` shape (trim-guard → `onSubmit(text)` returns success → close-or-set-error), identical `useDialogA11y({ onClose })` wiring, and the same full-screen dialog markup. They differ only in cosmetic details — icon (`Hash`/`Copy`+`Scroll`), color theme (purple vs amber CSS vars), `aria-label`, placeholder, and the two error strings. This is copy-paste duplication: a fix to the dialog scaffolding (focus order, error styling, escape handling) must be made twice and can drift.

**Hypothesis / root cause:** The second paste/import flow was cloned from the first instead of generalized.

**Proposed fix / improvement:**
- [ ] Extract one `PasteSubmitModal` (props: `title`/`ariaLabel`, `icon`, `theme`, `placeholder`, `emptyError`, `failError`, `onSubmit`) and render the two existing modals as thin configured instances (or just two call-sites).
- [ ] Keep the themed color variants as a `theme` prop so the visual distinction is preserved.

**Related files:** `src/features/library/ImportCodeModal.jsx`, `src/features/library/PasteTomeModal.jsx`

### [2026-06-22] Reusable modals are split between `src/components/ui/` and the flat `src/components/` with no clear rule

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
Generic, reusable modal components are inconsistently placed. `src/components/ui/` holds `ConfirmModal.jsx`, `ResetConfirmModal.jsx`, `AchievementsModal.jsx`, and `TitlesModal.jsx`, but other equally-generic modals sit one level up in the flat `src/components/` root — `PromptModal.jsx`, `MergeChooser.jsx` — next to genuinely app-specific chrome (`AccountPanel`, `SignInButton`, `ProfileChip`, `SyncStatusDot`, `ErrorBoundary`, the two banner components) and feature components (`ExamMode`, `TomeNotes`, `RichContent`). There is no documented rule for what belongs in `ui/` vs the root, so `components/` reads as a grab-bag and a contributor cannot predict where a new modal should go. (Feature-specific modals correctly living under their feature folder — e.g. `features/library/*Modal.jsx` — are fine and out of scope here.)

**Hypothesis / root cause:** `components/ui/` was introduced (PHASE-39) as a primitives home but existing root-level modals were never migrated, and no convention was written down.

**Proposed fix / improvement:**
- [ ] Decide and document the rule (e.g. "generic, app-agnostic presentational modals/primitives → `components/ui/`; app-stateful chrome → `components/`; feature-specific → that feature folder") in `docs/DESIGN-CONSTRAINTS.md` or a short `src/components/README.md`.
- [ ] Move the generic root modals (`PromptModal`, `MergeChooser`) into `components/ui/` to match `ConfirmModal`/`ResetConfirmModal`, updating imports.

**Related files:** `src/components/ui/` (ConfirmModal, ResetConfirmModal, AchievementsModal, TitlesModal), `src/components/PromptModal.jsx`, `src/components/MergeChooser.jsx`, `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`


### [2026-06-22] Dead exported functions: `closeAudio`, `clearAllSessions`, `generateStarterMap` are tested but never called in production

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
Three exported functions have unit tests but zero production call sites (grep across all non-test `src/` returns only their own definition):
- `closeAudio` (`src/audio/sound.js:352`) — an AudioContext teardown helper that is never wired into any unmount/cleanup path; only `sound.test.js` references it.
- `clearAllSessions` (`src/services/sessionResume.js:49`) — only `sessionResume.test.js` references it; nothing in the app ever bulk-clears resume sessions.
- `generateStarterMap` (`src/components/DungeonExplore.jsx:703`) — a thin wrapper that just calls `generateMap({ difficulty: "apprentice", biome: "halls", ...opts })`; production code (`DungeonExplore.jsx:2736`, the `useMemo`) calls `generateMap` directly, so the wrapper is unused except by `DungeonExplore.test.js`. (Note: the [2026-06-22] DungeonExplore God-file entry lists `generateStarterMap` among "pure exports already imported outside the component" — that is inaccurate; it is imported only by its own test.)

These add test surface and export weight for code no feature depends on. Either wire them up (e.g. call `closeAudio` on teardown if that was the intent) or remove the function + its test.

**Hypothesis / root cause:** Helpers written speculatively or left behind after the call site was refactored away (e.g. `generateMap` superseded the starter-map wrapper); the tests kept them green so the deadness went unnoticed.

**Proposed fix / improvement:**
- [ ] Confirm none are intended public API, then `git rm` each function and its test block (or wire `closeAudio` into the real teardown path if that was the original intent).

**Related files:** `src/audio/sound.js`, `src/audio/sound.test.js`, `src/services/sessionResume.js`, `src/services/sessionResume.test.js`, `src/components/DungeonExplore.jsx`, `src/components/DungeonExplore.test.js`

### [2026-06-22] No shared `src/utils/` module — date, shuffle, and duration helpers are duplicated across files

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
There is no shared utilities module anywhere under `src/` (no `utils/`, `lib/`, `helpers/`, or `common/`), so small generic helpers are re-implemented in place:
- **Local `YYYY-MM-DD` formatter — verbatim duplicate.** `services/devotion.js:24` exports `todayDateStr` with body `` `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` ``. `game/quests.js:337` re-inlines the exact same expression inside its week-start helper instead of importing `todayDateStr`; the identical line also appears in `usePlayerActions.test.jsx:133`.
- **Fisher-Yates shuffle — 4 implementations.** `game/tome.js:39` `shuffleArray` (unseeded, `Math.random`), `components/DungeonExplore.jsx:456` `shuffle(arr, rng)` (seeded), `services/examSession.js:23` `shuffleInPlace(arr, rng)` (seeded, mutates), and an inline sin-seeded Fisher-Yates in `game/items.js:132` (`pickShopStock`). One `shuffle(arr, rng = Math.random)` (+ an in-place variant) would cover all four.
- **Duration `m`/`s` formatting — scattered inline.** `components/ExamMode.jsx` repeats `Math.floor(s / 60)` + `padStart(2, "0")` / `Xm Ys` at lines 35, 239, 361, 631, 735; `game/tome.js:121` has its own `Xm Ys`; `components/AccountPanel.jsx:13` a "min ago" variant.

None of this is broken, but the verbatim date duplication and the four-way shuffle are exactly the drift a small shared util prevents (a bug fixed in one copy is missed in the others).

**Hypothesis / root cause:** App grew from a single-file prototype; PHASE-39 split it into `game/`, `services/`, `components/`, `features/` but never introduced a neutral `utils/` home, so each module kept its own copy of generic helpers.

**Proposed fix / improvement:**
- [ ] Add `src/utils/` (e.g. `date.js`, `shuffle.js`, `time.js`) and migrate the duplicates to single implementations.
- [ ] At minimum, have `game/quests.js` import `todayDateStr` from `services/devotion.js` rather than re-inlining it (or move `todayDateStr` into the new `utils/date.js` and re-export).

**Related files:** `src/services/devotion.js`, `src/game/quests.js`, `src/game/tome.js`, `src/components/DungeonExplore.jsx`, `src/services/examSession.js`, `src/game/items.js`, `src/components/ExamMode.jsx`, `src/components/AccountPanel.jsx`

### [2026-06-22] `src/tutorial.js` is game-state logic stranded at `src/` root instead of `src/game/`

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/tutorial.js` (+ `src/tutorial.test.js`) holds pure game/state logic — `TUTORIAL_STEPS`, `migrateTutorialIndex`, `snapshotBaselines`, `OLD_TUTORIAL_ORDER` — and is imported as domain logic (`services/persistence.js:1` imports `migrateTutorialIndex`). Every sibling of that kind lives under `src/game/` (`defaultState.js`, `difficulty.js`, `tome.js`, `quests.js`, `titles.js`, `achievements.js`, …), yet `tutorial.js` sits loose at the `src/` root next to `App.jsx`/`main.jsx`/`index.css`. This is inconsistent with the PHASE-39 layering and slightly confusing given there is also a `src/features/tutorial/` dir (UI: `TutorialPanel.jsx`, `WelcomeModal.jsx`) — the data/logic half and the UI half are split across two unrelated locations. (Minor related nit: `src/theme.test.js` is a root-level static guard with no `theme.js` source — fine, but its placement/name reads as an orphan.)

**Hypothesis / root cause:** `tutorial.js` predates the `src/game/` convention and was never moved when the layering was introduced.

**Proposed fix / improvement:**
- [ ] Move `src/tutorial.js` + `src/tutorial.test.js` to `src/game/tutorial.js` (or co-locate the logic under `src/features/tutorial/`) and update the `persistence.js` import path.
- [ ] Optionally rename `src/theme.test.js` to signal it is a CSS/theme static guard (e.g. `src/theme.guard.test.js`).

**Related files:** `src/tutorial.js`, `src/tutorial.test.js`, `src/services/persistence.js`, `src/features/tutorial/`, `src/theme.test.js`

### [2026-06-22] Three unreferenced root-level tome JSON files (~700 KB) committed as dead artifacts

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`dungeon-scholar/tome-aws-clf-c02.json` (~202 KB), `tome-ccst-cybersecurity.json` (~182 KB), and `tome-security-plus-sy0-701.json` (~313 KB) sit at the repo root, are tracked in git, but are referenced NOWHERE — no import, fetch, build glob, HTML, or doc points at them (grep across `src`, `public`, `index.html`, `vite.config.js`, `*.md` returns nothing). They are not in `public/` so they are not even served by the dev server or bundled. Git history shows they arrived via the GitHub web UI (Add files via upload, commit ce0d660e, Apr 30) and have not been touched since. They appear to be sample/seed exam content that predates the current Oracle/prompt-driven tome system and now just bloats the repo root and clones.

**Hypothesis / root cause:** Leftover manual upload of sample decks from an early iteration; the app moved to generating/importing tomes at runtime and these static files were never removed.

**Proposed fix / improvement:**
- [ ] Confirm with the owner that no external workflow consumes them.
- [ ] If genuinely unused, `git rm` all three (history preserves them); otherwise move into a clearly-named `samples/` or `fixtures/` dir and document their purpose.

**Related files:** `dungeon-scholar/tome-aws-clf-c02.json`, `dungeon-scholar/tome-ccst-cybersecurity.json`, `dungeon-scholar/tome-security-plus-sy0-701.json`

### [2026-06-22] No linter/formatter config in dungeon-scholar (sibling dnd-app has biome)

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`dungeon-scholar/` has no ESLint, Prettier, Biome, or `.editorconfig`, and `package.json` exposes no `lint`/`format` script (only `dev`/`build`/`preview`/`test`/`test:watch`). The sibling project `dnd-app/` in the same monorepo ships a `biome.json`. This is a consistency/structure gap: dungeon-scholar relies entirely on convention with no automated style or correctness gate, so formatting drift and easy-to-catch issues (unused vars/imports, accidental globals) can accumulate unchecked across the ~24 K lines of source.

**Hypothesis / root cause:** dungeon-scholar started as a single-file prototype (the former 11 K-line App.jsx) and a linter was never retrofitted as it grew.

**Proposed fix / improvement:**
- [ ] Add Biome (mirror `dnd-app/biome.json`) or ESLint+Prettier to dungeon-scholar.
- [ ] Add a `lint` script to `package.json` and wire it into CI alongside `test`.

**Related files:** `dungeon-scholar/package.json`, `dnd-app/biome.json` (reference config)

### [2026-06-22] DungeonExplore.jsx is a 4,536-line God-file mixing canvas rendering, map-gen, and the React component

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/components/DungeonExplore.jsx` is 4,536 lines — by far the largest source file (next is App.jsx at 1,665). It bundles three distinct concerns under one `components/` file: (1) ~60 pure canvas tile/sprite drawing functions (`drawWall`, `drawFloor`, `drawNightshade`, … starting ~line 714), (2) pure procedural map-generation + game data (`generateMap`, `generateStarterMap`, `makeSeededRng`, `BIOMES`, `ROOMS_BY_DIFFICULTY`, `BIOME_BOSS_POOL`, etc.), and (3) the actual React component, which only begins at line 2617 — meaning ~57% of a file living under `components/` is non-component logic. The pure exports are already imported outside the component (`features/player/usePlayerActions.js`, `features/progression/StableScreen.jsx`), so they are effectively a misplaced module. This is inconsistent with the PHASE-39 architecture split that moved data/helpers into `src/game/` and primitives into `src/components/ui/`; DungeonExplore was left as an un-split monolith.

**Hypothesis / root cause:** PHASE-39 split App.jsx but did not touch DungeonExplore, so its map-gen + canvas helpers never migrated to `src/game/` / a dedicated rendering module.

**Proposed fix / improvement:**
- [ ] Extract map-gen + game-data exports into `src/game/dungeonMap.js` (consistent with PHASE-39's `src/game/`).
- [ ] Extract the ~60 canvas `draw*` functions into `src/components/dungeon/tileRenderer.js` (or similar).
- [ ] Leave `DungeonExplore.jsx` as the React component only; re-point the existing `DungeonExplore.test.js` imports.

**Related files:** `dungeon-scholar/src/components/DungeonExplore.jsx`, `dungeon-scholar/src/components/DungeonExplore.test.js`, `dungeon-scholar/src/features/player/usePlayerActions.js`, `dungeon-scholar/src/features/progression/StableScreen.jsx`

### [2026-06-22] docs/PHASE-24-POLISH.md is fully completed (all items struck through) — stale tracking doc

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`dungeon-scholar/docs/PHASE-24-POLISH.md` is a deferred-work tracker whose every line item is now struck through (`~~…~~`) and annotated Done / Resolved in PHASE-39 / Done in Phase 24. It tracks no remaining open work. It lingers as a stale doc that a future contributor must read in full to discover it is empty of actionable content. Either archive it (the resolved-items pattern used by the SUGGESTIONS/ISSUES logs) or delete it, since its closing instruction (prepend a one-line summary…) suggests it was meant to be a living backlog that has since been fully drained.

**Hypothesis / root cause:** Phase-24 polish backlog was completed but the tracking file was never archived/removed afterward.

**Proposed fix / improvement:**
- [ ] Delete `docs/PHASE-24-POLISH.md`, or move its completed record into the dungeon-scholar resolved log / a phases/completed archive for history.

**Related files:** `dungeon-scholar/docs/PHASE-24-POLISH.md`

---

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
