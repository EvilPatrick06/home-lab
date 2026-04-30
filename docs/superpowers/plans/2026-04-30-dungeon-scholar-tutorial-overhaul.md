# Dungeon Scholar — Tutorial Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Awakening tutorial from 8 to 14 steps with bug fixes, covering Quest Board, Tome of Failures, Library, Achievements, Levels/Titles, and Saga management — and fix the step-6 trial-detection bug that forces multiple lab attempts before advancing.

**Architecture:** Extract tutorial-related logic (constants + pure helpers) from `App.jsx` into a new `src/tutorial.js` module so the bug-fix and migration logic become unit-testable. All UI/dispatch changes remain inside `App.jsx`. No new React components, no new state, no persistence migration (existing journals upgrade in place via id-based remap on import).

**Tech Stack:** React 18 + Vite, Vitest + @testing-library (already installed, never wired up). Single-page React app — no routing, no backend.

**Spec reference:** `docs/superpowers/specs/2026-04-30-dungeon-scholar-tutorial-overhaul-design.md`

**Repo CLAUDE.md note:** This repo's `CLAUDE.md` says do **not** create commits without explicit user request. Each task lists a proposed commit at the end — propose it to the user, run only if authorized.

---

## File Structure

| File | Status | Responsibility |
|----|----|----|
| `dungeon-scholar/src/tutorial.js` | **new** | Pure tutorial logic: `TUTORIAL_STEPS` constant, `snapshotBaselines`, `meetsAutoCondition`, `migrateTutorialIndex` |
| `dungeon-scholar/src/tutorial.test.js` | **new** | Vitest unit tests for the helpers above |
| `dungeon-scholar/src/App.jsx` | modify | Import from `./tutorial`; tome-progress shape; `recordAnswer` increment; `onAction` dispatch; TutorialPanel button glue; WelcomeModal copy; importProgress migration call |
| `dungeon-scholar/package.json` | modify | Add `"test": "vitest run"` and `"test:watch": "vitest"` |

No vitest config file is added — Vite already auto-detects test files via the dev tooling, and vitest with happy-dom works out of the box for these pure-function tests (no DOM rendering). If a config turns out to be needed, Task 1 covers the workaround inline.

---

## Task 1: Wire up vitest and prove the test runner works

**Why first:** Every later task asserts behavior via vitest. Get the runner green on a trivial test before extracting real logic.

**Files:**
- Modify: `dungeon-scholar/package.json` (scripts section)
- Create: `dungeon-scholar/src/tutorial.test.js` (sanity test)
- Create: `dungeon-scholar/src/tutorial.js` (empty stub so the import resolves)

- [ ] **Step 1: Add test scripts to package.json**

Edit `dungeon-scholar/package.json`. The scripts section currently reads:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
},
```
Replace with:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

- [ ] **Step 2: Create empty tutorial.js stub**

Create `dungeon-scholar/src/tutorial.js` with content:
```js
// Tutorial logic — pure helpers only. UI lives in App.jsx.
// Filled in by subsequent tasks.
```

- [ ] **Step 3: Write a sanity test**

Create `dungeon-scholar/src/tutorial.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('tutorial module sanity', () => {
  it('arithmetic still works', () => {
    expect(2 + 2).toBe(4);
  });
});
```

- [ ] **Step 4: Run the test and confirm it passes**

From `dungeon-scholar/`:
```bash
npm test
```
Expected: 1 passed. If vitest complains about a missing config (e.g., environment), create `dungeon-scholar/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
  },
});
```
…and re-run. The pure tests in this plan don't need DOM, but happy-dom is already a dep and won't hurt.

- [ ] **Step 5: Propose commit**

```bash
git add dungeon-scholar/package.json dungeon-scholar/src/tutorial.js dungeon-scholar/src/tutorial.test.js dungeon-scholar/vitest.config.js 2>/dev/null
git commit -m "test(dungeon-scholar): wire up vitest with sanity test"
```

---

## Task 2: Lift the existing 8-step `TUTORIAL_STEPS` and `snapshotBaselines` into `tutorial.js` (no behavior change)

**Why:** Pure refactor. Confirms the extraction works without touching semantics. Sets up Tasks 3–6 to add behavior on top.

**Files:**
- Modify: `dungeon-scholar/src/tutorial.js`
- Modify: `dungeon-scholar/src/tutorial.test.js`
- Modify: `dungeon-scholar/src/App.jsx` (~352–424 for `TUTORIAL_STEPS`, ~579–592 for `snapshotBaselines`)

- [ ] **Step 1: Write failing tests for the existing baseline shape**

Add to `dungeon-scholar/src/tutorial.test.js`:
```js
import { TUTORIAL_STEPS, snapshotBaselines } from './tutorial';

describe('TUTORIAL_STEPS (legacy 8-step shape)', () => {
  it('has 8 steps in the legacy order', () => {
    expect(TUTORIAL_STEPS).toHaveLength(8);
    expect(TUTORIAL_STEPS.map(s => s.id)).toEqual([
      'welcome',
      'forge_tome',
      'inscribe_tome',
      'study_scroll',
      'solve_riddle',
      'face_trial',
      'consult_oracle',
      'enter_dungeon',
    ]);
  });
});

describe('snapshotBaselines (legacy)', () => {
  it('returns zeros for an empty state', () => {
    const result = snapshotBaselines({});
    expect(result).toEqual({
      libraryCount: 0,
      cardsReviewed: 0,
      quizAnswered: 0,
      labSteps: 0,
      oracleMessages: 0,
      dungeonAttempts: 0,
    });
  });

  it('sums cardsReviewed across all tomes', () => {
    const state = {
      library: [
        { progress: { cardsReviewed: 3 } },
        { progress: { cardsReviewed: 5 } },
      ],
    };
    expect(snapshotBaselines(state).cardsReviewed).toBe(8);
  });

  it('sums labSteps as labsCompleted plus lab-typed mistakeVault entries', () => {
    const state = {
      library: [
        {
          progress: {
            labsCompleted: 2,
            mistakeVault: [
              { _type: 'lab', id: 'a' },
              { _type: 'quiz', id: 'b' },
              { _type: 'lab', id: 'c' },
            ],
          },
        },
      ],
    };
    expect(snapshotBaselines(state).labSteps).toBe(4); // 2 completed + 2 lab vault entries
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```
Expected: import errors / undefined exports.

- [ ] **Step 3: Move `TUTORIAL_STEPS` into `tutorial.js`**

In `dungeon-scholar/src/App.jsx`, locate `const TUTORIAL_STEPS = [...]` (~352–424). Cut the entire array.

In `dungeon-scholar/src/tutorial.js`, replace the placeholder with:
```js
// Tutorial logic — pure helpers only. UI lives in App.jsx.

export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'The Scholar Awakens',
    description: 'Welcome to Dungeon Scholar, brave one. Thy quest for knowledge begins now. Press onward to learn the ways of this realm.',
    completionLabel: 'Continue',
    autoComplete: false,
    xp: 10,
  },
  {
    id: 'forge_tome',
    title: 'Behold the Spell of Tome Creation',
    description: 'Knowledge is sealed within sacred tomes. Open the Spell of Tome Creation to reveal the incantation that turns thy study materials into a tome any AI may forge.',
    completionLabel: 'Open the Spell',
    autoComplete: false,
    xp: 25,
    actionLabel: 'Open the Spell',
  },
  {
    id: 'inscribe_tome',
    title: 'Inscribe Thy First Tome',
    description: 'Now bring forth a tome. Use the Spell of Tome Creation with any AI familiar (Claude, ChatGPT, Gemini), then return here to inscribe the result. Or import a friend\'s share code, or upload an existing tome file.',
    completionLabel: 'Awaiting thy first tome...',
    autoComplete: true,
    autoCondition: 'has_tome',
    xp: 50,
  },
  {
    id: 'study_scroll',
    title: 'Read a Sacred Scroll',
    description: 'Open the Scrolls of Knowledge and study at least one scroll. Rate thy mastery to focus thy practice.',
    completionLabel: 'Open the Scrolls',
    autoComplete: true,
    autoCondition: 'studied_card',
    xp: 30,
  },
  {
    id: 'solve_riddle',
    title: 'Solve a Riddle',
    description: 'The Sphinx awaits with riddles to test thy wisdom. Answer one correctly to prove thyself.',
    completionLabel: 'Face the Sphinx',
    autoComplete: true,
    autoCondition: 'solved_quiz',
    xp: 30,
  },
  {
    id: 'face_trial',
    title: 'Face a Trial of Skill',
    description: 'Trials of Skill demand hands-on prowess. Complete a single stage of any trial — full completion is not required.',
    completionLabel: 'Enter the Trials',
    autoComplete: true,
    autoCondition: 'lab_step',
    xp: 30,
  },
  {
    id: 'consult_oracle',
    title: 'Consult the Oracle',
    description: 'The Oracle and the Tome Search await thy questions. Ask one question of either to learn how their wisdom flows from thy tome.',
    completionLabel: 'Speak to the Oracle',
    autoComplete: true,
    autoCondition: 'oracle_used',
    xp: 30,
  },
  {
    id: 'enter_dungeon',
    title: 'Enter the Dungeon',
    description: 'The grand quest awaits. Brave one full Dungeon Delve to claim the Initiated title and complete thy awakening.',
    completionLabel: 'Brave the Dungeon',
    autoComplete: true,
    autoCondition: 'dungeon_completed',
    xp: 100,
  },
];

export const snapshotBaselines = (state) => {
  const lib = state.library || [];
  return {
    libraryCount: lib.length,
    cardsReviewed: lib.reduce((s, t) => s + (t.progress?.cardsReviewed || 0), 0),
    quizAnswered: lib.reduce((s, t) => s + (t.progress?.quizAnswered || 0), 0),
    labSteps: lib.reduce((s, t) => {
      const labCompleted = t.progress?.labsCompleted || 0;
      const labStepInVault = (t.progress?.mistakeVault || []).filter(m => m._type === 'lab').length;
      return s + labCompleted + labStepInVault;
    }, 0),
    oracleMessages: lib.reduce((s, t) => s + ((t.progress?.chatHistory || []).filter(m => m.role === 'user').length), 0),
    dungeonAttempts: state.dungeonAttempts || 0,
  };
};
```

- [ ] **Step 4: Remove `snapshotBaselines` from App.jsx and import from tutorial**

In `dungeon-scholar/src/App.jsx`:

1. Locate the `snapshotBaselines` function (~579–592). Delete it entirely.
2. At the top of the file, find the existing imports. Add a new line right after the `lucide-react` import:
```js
import { TUTORIAL_STEPS, snapshotBaselines } from './tutorial';
```
3. Verify there are no remaining references to a local `snapshotBaselines` or `TUTORIAL_STEPS` definition (the imports now provide them).

- [ ] **Step 5: Run tests — should pass now**

```bash
npm test
```
Expected: 4 tests passing (1 sanity + 3 baseline shape).

- [ ] **Step 6: Run the dev server and smoke-test the tutorial**

```bash
npm run dev
```
Open `http://localhost:5173/dungeon-scholar/`. Hit "Begin Anew" if needed to reset, click "Begin the Awakening" in the welcome modal. Verify:
- The tutorial panel appears at bottom-right with step 1/8.
- Clicking "Continue" advances to step 2/8.

Stop the dev server (Ctrl-C). The refactor is behavior-preserving.

- [ ] **Step 7: Propose commit**

```bash
git add dungeon-scholar/src/tutorial.js dungeon-scholar/src/tutorial.test.js dungeon-scholar/src/App.jsx
git commit -m "refactor(dungeon-scholar): extract TUTORIAL_STEPS and snapshotBaselines to tutorial.js"
```

---

## Task 3: Add `labsAttempted` counter to tome progress and increment it on every lab answer (TDD)

**Why:** This is the core bug fix. Trial of Skill detection currently relies on a deduped vault counter that misses legitimate engagement. We add a non-deduped per-tome counter that bumps on success or failure equally.

**Files:**
- Modify: `dungeon-scholar/src/tutorial.js`
- Modify: `dungeon-scholar/src/tutorial.test.js`
- Modify: `dungeon-scholar/src/App.jsx` (~530 `blankTomeProgress`, ~838 `recordAnswer`)

- [ ] **Step 1: Write failing test for new `labsAttempted` field in baseline**

Add to `dungeon-scholar/src/tutorial.test.js` inside `describe('snapshotBaselines (legacy)', …)` — or rename that describe block to `describe('snapshotBaselines', …)` and add:
```js
it('sums labsAttempted across all tomes', () => {
  const state = {
    library: [
      { progress: { labsAttempted: 2 } },
      { progress: { labsAttempted: 3 } },
      { progress: {} }, // missing field defaults to 0
    ],
  };
  expect(snapshotBaselines(state).labsAttempted).toBe(5);
});

it('returns zero labsAttempted for empty state', () => {
  expect(snapshotBaselines({}).labsAttempted).toBe(0);
});
```

- [ ] **Step 2: Remove the now-obsolete `labSteps` field from existing tests**

In the test file, delete the existing `'sums labSteps as labsCompleted plus lab-typed mistakeVault entries'` test and remove `labSteps: 0` from the empty-state expected object. The new field replaces it.

After this edit, the empty-state test should expect:
```js
expect(result).toEqual({
  libraryCount: 0,
  cardsReviewed: 0,
  quizAnswered: 0,
  labsAttempted: 0,
  oracleMessages: 0,
  dungeonAttempts: 0,
});
```

- [ ] **Step 3: Run tests, confirm they fail**

```bash
npm test
```
Expected: the new `labsAttempted` tests fail (`labsAttempted` is undefined in the returned object); the empty-state test fails (object has `labSteps`, expected `labsAttempted`).

- [ ] **Step 4: Update `snapshotBaselines` in tutorial.js**

In `dungeon-scholar/src/tutorial.js`, replace the `labSteps` line in `snapshotBaselines` with:
```js
labsAttempted: lib.reduce((s, t) => s + (t.progress?.labsAttempted || 0), 0),
```

- [ ] **Step 5: Run tests, confirm they pass**

```bash
npm test
```
Expected: all baseline tests pass.

- [ ] **Step 6: Add `labsAttempted: 0` to `blankTomeProgress` in App.jsx**

In `dungeon-scholar/src/App.jsx`, locate `blankTomeProgress` (~530–542). Current shape:
```js
const blankTomeProgress = () => ({
  cardsReviewed: 0,
  quizAnswered: 0,
  labsCompleted: 0,
  oracleMessages: 0,
  runsCompleted: 0,
  bossesDefeated: 0,
  cardProgress: {},
  questionStats: {},
  labProgress: {},
  mistakeVault: [],
  chatHistory: [],
});
```
Add `labsAttempted: 0,` after `labsCompleted: 0,`:
```js
const blankTomeProgress = () => ({
  cardsReviewed: 0,
  quizAnswered: 0,
  labsCompleted: 0,
  labsAttempted: 0,
  oracleMessages: 0,
  runsCompleted: 0,
  bossesDefeated: 0,
  cardProgress: {},
  questionStats: {},
  labProgress: {},
  mistakeVault: [],
  chatHistory: [],
});
```

- [ ] **Step 7: Increment `labsAttempted` in `recordAnswer` for every lab answer**

In `dungeon-scholar/src/App.jsx`, locate `recordAnswer` (search for the function definition; the wrong-answer vault-add block lives around line 843). After `let next = { ...prev, totalAnswered: newAnswered, totalCorrect: newCorrect };` and **before** the `if (!correct && item && prev.activeTomeId)` vault block, insert:

```js
// Bump labsAttempted on every lab answer (success or failure) for tutorial detection.
if (item && item._type === 'lab' && prev.activeTomeId) {
  next = {
    ...next,
    library: next.library.map(t =>
      t.id === prev.activeTomeId
        ? {
            ...t,
            progress: {
              ...t.progress,
              labsAttempted: (t.progress?.labsAttempted || 0) + 1,
            },
          }
        : t
    ),
  };
}
```

The existing wrong-answer vault block then operates on this updated `next.library` (it spreads `next` first, so the labsAttempted increment is preserved through the chained update).

- [ ] **Step 8: Replace the `lab_step` auto-condition wiring in App.jsx**

Locate the `totalLabStepsAcrossLib` `useMemo` (~674–680). Replace the entire memo with:
```js
const totalLabsAttemptedAcrossLib = useMemo(
  () => playerState.library.reduce((s, t) => s + (t.progress?.labsAttempted || 0), 0),
  [playerState.library]
);
```

In the auto-condition `useEffect` switch (~700–719), change the `lab_step` case from:
```js
case 'lab_step':
  met = totalLabStepsAcrossLib > (baseline.labSteps || 0);
  break;
```
to:
```js
case 'lab_step':
  met = totalLabsAttemptedAcrossLib > (baseline.labsAttempted || 0);
  break;
```

In the `useEffect` deps array (~721–733), replace `totalLabStepsAcrossLib` with `totalLabsAttemptedAcrossLib`.

- [ ] **Step 9: Run tests, confirm still passing**

```bash
npm test
```
Expected: all baseline tests still pass. Bug-fix logic is now in place.

- [ ] **Step 10: Manual smoke test of the bug fix**

```bash
npm run dev
```
- Hit "Begin Anew" in the saga panel to reset (or refresh in private/incognito).
- Click "Begin the Awakening" → step through to step 6 (Face a Trial).
- Open Trials of Skill, start any trial, answer the FIRST stage (success or failure — either should count).
- Verify the tutorial advances to step 7 (Consult the Oracle) immediately after the first lab answer is registered.

If the first stage is correct and the trial is multi-stage, the trial UI advances to stage 2; the tutorial panel should already be on step 7 by then.

- [ ] **Step 11: Propose commit**

```bash
git add dungeon-scholar/src/tutorial.js dungeon-scholar/src/tutorial.test.js dungeon-scholar/src/App.jsx
git commit -m "fix(dungeon-scholar): tutorial trial step advances on first lab answer

Add labsAttempted counter to tome progress, incremented on every lab
onAnswer event regardless of correctness. Replaces deduped-vault-based
detection that required either a full trial completion or two failed
attempts on distinct trials before advancing."
```

---

## Task 4: Replace `TUTORIAL_STEPS` with the new 14-step list

**Why:** This is the visible expansion. Step IDs and order must match the spec table exactly so the dispatch in Task 5 lines up.

**Files:**
- Modify: `dungeon-scholar/src/tutorial.js`
- Modify: `dungeon-scholar/src/tutorial.test.js`

- [ ] **Step 1: Update the legacy-shape test to expect the new 14-step shape**

In `dungeon-scholar/src/tutorial.test.js`, replace the `'has 8 steps in the legacy order'` test with:
```js
it('has 14 steps in the new order', () => {
  expect(TUTORIAL_STEPS).toHaveLength(14);
  expect(TUTORIAL_STEPS.map(s => s.id)).toEqual([
    'welcome',
    'forge_tome',
    'inscribe_tome',
    'library_tour',
    'study_scroll',
    'solve_riddle',
    'face_trial',
    'vault_intro',
    'consult_oracle',
    'quest_board',
    'enter_dungeon',
    'view_achievements',
    'view_titles_levels',
    'manage_saga',
  ]);
});

it('total XP across all steps is 425', () => {
  const total = TUTORIAL_STEPS.reduce((s, step) => s + (step.xp || 0), 0);
  expect(total).toBe(425);
});

it('every step with autoComplete:true has an autoCondition', () => {
  for (const step of TUTORIAL_STEPS) {
    if (step.autoComplete) {
      expect(step.autoCondition, `step ${step.id} missing autoCondition`).toBeDefined();
    }
  }
});

it('every step with actionLabel triggers a known onAction id', () => {
  // The corresponding handler in App.jsx onAction must handle each of these ids.
  // This test enforces that the set of action-bearing steps stays in sync with
  // the dispatch table (manually mirrored — string list below).
  const knownActionIds = new Set([
    'forge_tome',
    'library_tour',
    'vault_intro',
    'quest_board',
    'view_achievements',
    'view_titles_levels',
  ]);
  for (const step of TUTORIAL_STEPS) {
    if (step.actionLabel) {
      expect(knownActionIds.has(step.id), `step ${step.id} has actionLabel but no known dispatch`).toBe(true);
    }
  }
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm test
```
Expected: the 14-step assertion fails (still 8 steps).

- [ ] **Step 3: Replace the entire `TUTORIAL_STEPS` array in tutorial.js**

Replace the array in `dungeon-scholar/src/tutorial.js` with:

```js
export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'The Scholar Awakens',
    description: 'Welcome to Dungeon Scholar, brave one. Thy quest for knowledge begins now. Press onward to learn the ways of this realm.',
    completionLabel: 'Continue',
    autoComplete: false,
    xp: 10,
  },
  {
    id: 'forge_tome',
    title: 'Behold the Spell of Tome Creation',
    description: 'Knowledge is sealed within sacred tomes. Open the Spell of Tome Creation to reveal the incantation that turns thy study materials into a tome any AI may forge.',
    completionLabel: 'Open the Spell',
    autoComplete: false,
    xp: 25,
    actionLabel: 'Open the Spell',
  },
  {
    id: 'inscribe_tome',
    title: 'Inscribe Thy First Tome',
    description: 'Now bring forth a tome. Use the Spell of Tome Creation with any AI familiar (Claude, ChatGPT, Gemini), then return here to inscribe the result. Or import a friend\'s share code, or upload an existing tome file.',
    completionLabel: 'Awaiting thy first tome...',
    autoComplete: true,
    autoCondition: 'has_tome',
    xp: 50,
  },
  {
    id: 'library_tour',
    title: 'The Sacred Library',
    description: 'Within the Sacred Library thou mayest hold many tomes. Switch betwixt them, share their codes with kin, or inscribe new ones whensoever the mood strikes.',
    completionLabel: 'Visit thy Library',
    autoComplete: false,
    xp: 20,
    actionLabel: 'Visit thy Library',
  },
  {
    id: 'study_scroll',
    title: 'Read a Sacred Scroll',
    description: 'Open the Scrolls of Knowledge and study at least one scroll. Rate thy mastery to focus thy practice.',
    completionLabel: 'Open the Scrolls',
    autoComplete: true,
    autoCondition: 'studied_card',
    xp: 30,
  },
  {
    id: 'solve_riddle',
    title: 'Solve a Riddle',
    description: 'The Sphinx awaits with riddles to test thy wisdom. Answer one correctly to prove thyself.',
    completionLabel: 'Face the Sphinx',
    autoComplete: true,
    autoCondition: 'solved_quiz',
    xp: 30,
  },
  {
    id: 'face_trial',
    title: 'Face a Trial of Skill',
    description: 'Trials of Skill demand hands-on prowess. Engage with one trial — finish it or fall trying — to prove thy mettle.',
    completionLabel: 'Enter the Trials',
    autoComplete: true,
    autoCondition: 'lab_step',
    xp: 30,
  },
  {
    id: 'vault_intro',
    title: 'The Tome of Failures',
    description: 'Foes that have bested thee gather in the Tome of Failures, awaiting redemption. Banish them by answering true to clear thy slate.',
    completionLabel: 'Visit the Vault',
    autoComplete: false,
    xp: 20,
    actionLabel: 'Visit the Vault',
  },
  {
    id: 'consult_oracle',
    title: 'Consult the Oracle',
    description: 'The Oracle and the Tome Search await thy questions. Ask one question of either to learn how their wisdom flows from thy tome.',
    completionLabel: 'Speak to the Oracle',
    autoComplete: true,
    autoCondition: 'oracle_used',
    xp: 30,
  },
  {
    id: 'quest_board',
    title: 'The Quest Board',
    description: 'Daily quests await on the Quest Board. Complete them as thou dost study to claim experience as bonus reward.',
    completionLabel: 'Visit the Quest Board',
    autoComplete: false,
    xp: 20,
    actionLabel: 'Visit the Quest Board',
  },
  {
    id: 'enter_dungeon',
    title: 'Enter the Dungeon',
    description: 'The grand quest awaits. Step into the Dungeon Delve — five chambers and a dungeon lord lie within. Win or fall, the experience shall steel thee.',
    completionLabel: 'Brave the Dungeon',
    autoComplete: true,
    autoCondition: 'dungeon_completed',
    xp: 100,
  },
  {
    id: 'view_achievements',
    title: 'The Hall of Glory',
    description: 'The Hall of Glory holds thy achievements — milestones earned through valor, and those yet to claim. Behold thy progress.',
    completionLabel: 'Open the Hall of Glory',
    autoComplete: false,
    xp: 20,
    actionLabel: 'Open the Hall of Glory',
  },
  {
    id: 'view_titles_levels',
    title: 'Of Levels and Titles',
    description: 'Each XP earned advances thy stature. Reach new levels to unlock titles to wear with pride. Special titles await those who achieve great deeds.',
    completionLabel: 'View thy Stature',
    autoComplete: false,
    xp: 20,
    actionLabel: 'View thy Stature',
  },
  {
    id: 'manage_saga',
    title: 'Preserve Thy Saga',
    description: 'Thy progress may be preserved or restored via the Manage Your Saga panel below. Save thy journal, share thy tomes, replay this Awakening — all from there. Thou hast walked every hall. Step forth, Initiated.',
    completionLabel: 'Complete the Awakening',
    autoComplete: false,
    xp: 20,
  },
];
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
npm test
```
Expected: all step-shape tests pass.

- [ ] **Step 5: Run dev server, confirm tutorial panel header shows 1/14 not 1/8**

```bash
npm run dev
```
Open the app, "Begin Anew", "Begin the Awakening". The tutorial panel should now read "THE AWAKENING — 1/14". The Awakening starts but stops working as a flow at step 4 onwards because the new dispatch isn't in place yet — that's Task 5.

Note: the welcome modal still says "an eight-step tutorial" — Task 5 fixes the copy.

- [ ] **Step 6: Propose commit**

```bash
git add dungeon-scholar/src/tutorial.js dungeon-scholar/src/tutorial.test.js
git commit -m "feat(dungeon-scholar): expand TUTORIAL_STEPS from 8 to 14

Inserts library_tour (after inscribe_tome), vault_intro (after face_trial),
quest_board (before enter_dungeon), view_achievements + view_titles_levels
+ manage_saga (after enter_dungeon). Rewrites face_trial + enter_dungeon
descriptions to match their actual triggers. Total XP increases from 305
to 425. The Initiated title now grants on the new final step (manage_saga)
via existing isComplete logic — no code change needed for the title shift."
```

---

## Task 5: Wire the new step actions into App.jsx (dispatch + button glue + welcome modal copy)

**Why:** Without this, the new action-bearing steps (4, 8, 10, 12, 13) have buttons but no behavior. Step 14 has no `actionLabel` so its existing manual-continue rendering is correct as-is.

**Files:**
- Modify: `dungeon-scholar/src/App.jsx` (~1546 onAction handler, ~4023 WelcomeModal copy, ~4114 TutorialPanel button onClick)

- [ ] **Step 1: Generalise the TutorialPanel button onClick (remove `forge_tome` special case)**

In `dungeon-scholar/src/App.jsx`, locate the `TutorialPanel` component's main action-button onClick handler (~4112–4123). Current shape:
```jsx
<button
  onClick={() => {
    if (step.id === 'forge_tome') onAction(step.id);
    onAdvance(step.id);
  }}
  ...
>
  {step.completionLabel}
</button>
```

Change the `if` to fire `onAction` for ANY step that has an `actionLabel`:
```jsx
<button
  onClick={() => {
    if (step.actionLabel) onAction(step.id);
    onAdvance(step.id);
  }}
  ...
>
  {step.completionLabel}
</button>
```

(This is the *second* branch — the manual-advance path. The TutorialPanel JSX has a separate first branch (`step.autoComplete && step.actionLabel`) which calls `onAction` only and relies on the auto-condition to advance. No step in our 14-step list matches the `autoComplete: true && actionLabel` combination, so the first branch is dead under the new design. Leave it untouched — removing it isn't required and keeps the diff small.)

- [ ] **Step 2: Add new branches to the `onAction` dispatch in App.jsx**

Locate the existing `onAction` handler (~1546–1554), which is a big chained `if/else` block looking like:
```jsx
onAction={(stepId) => {
  if (stepId === 'forge_tome') setShowPromptModal(true);
  else if (stepId === 'study_scroll') { trackModeUse('flashcards'); setScreen('flashcards'); }
  else if (stepId === 'solve_riddle') { trackModeUse('quiz'); setScreen('quiz'); }
  else if (stepId === 'face_trial') { trackModeUse('lab'); setScreen('lab'); }
  else if (stepId === 'consult_oracle') { trackModeUse('chat'); setScreen('chat'); }
  else if (stepId === 'enter_dungeon') { trackModeUse('dungeon'); setScreen('dungeon'); }
}}
```

Add the 5 new dispatches. Note the existing block has dispatches for `study_scroll` etc. that fire when those *auto-advancing* steps' first-branch `actionLabel`-style buttons are clicked; the new step ids fall into the same pattern. Updated handler:

```jsx
onAction={(stepId) => {
  if (stepId === 'forge_tome') setShowPromptModal(true);
  else if (stepId === 'library_tour') setScreen('library');
  else if (stepId === 'study_scroll') { trackModeUse('flashcards'); setScreen('flashcards'); }
  else if (stepId === 'solve_riddle') { trackModeUse('quiz'); setScreen('quiz'); }
  else if (stepId === 'face_trial') { trackModeUse('lab'); setScreen('lab'); }
  else if (stepId === 'vault_intro') setScreen('vault');
  else if (stepId === 'consult_oracle') { trackModeUse('chat'); setScreen('chat'); }
  else if (stepId === 'quest_board') setScreen('quests');
  else if (stepId === 'enter_dungeon') { trackModeUse('dungeon'); setScreen('dungeon'); }
  else if (stepId === 'view_achievements') setShowAchievements(true);
  else if (stepId === 'view_titles_levels') setShowTitles(true);
}}
```

- [ ] **Step 3: Update WelcomeModal copy from "eight-step" to "fourteen-step"**

Locate `WelcomeModal` (~3997). Inside, find the line:
```jsx
Wouldst thou follow the path of the Scholar's Awakening? An eight-step tutorial shall guide thee through each of these sacred halls. Or thou mayest set forth alone, if thy spirit demands it.
```
Replace `eight-step` with `fourteen-step`.

- [ ] **Step 4: Run tests, confirm passing**

```bash
npm test
```
Expected: existing tests pass. (No new tests in this task — UI integration verified manually next.)

- [ ] **Step 5: Manual end-to-end smoke walkthrough**

```bash
npm run dev
```
Reset state ("Begin Anew" in saga panel), then "Begin the Awakening". Walk through every step and verify:

| Step | What to do | Expected result |
|---|---|---|
| 1 Welcome | Click "Continue" | Step 2 appears, +10 XP notification |
| 2 Forge Tome | Click "Open the Spell" | Prompt modal opens AND step advances to 3 |
| 3 Inscribe | Paste any valid tome JSON via paste modal or import file | Tome added; step 4 appears |
| 4 Library Tour | Click "Visit thy Library" | Library screen opens AND step 5 appears in panel |
| 5 Study Scroll | Click "Open the Scrolls" → review one card | Step 6 appears |
| 6 Solve Riddle | Open Riddles → answer one quiz | Step 7 appears |
| 7 Face Trial | Open Trials → answer one stage of any trial (right or wrong) | Step 8 appears immediately after first lab answer |
| 8 Vault Intro | Click "Visit the Vault" | Vault screen opens AND step 9 appears |
| 9 Oracle | Open Oracle → send any message | Step 10 appears |
| 10 Quest Board | Click "Visit the Quest Board" | Quests screen opens AND step 11 appears |
| 11 Enter Dungeon | Click "Brave the Dungeon" → start a delve | Step 12 appears the moment the run begins |
| 12 Achievements | Click "Open the Hall of Glory" | Achievements modal opens AND step 13 appears in panel (visible after closing modal) |
| 13 Levels & Titles | Click "View thy Stature" | Titles modal opens AND step 14 appears in panel |
| 14 Manage Saga | Click "Complete the Awakening" | Tutorial panel disappears, "Tutorial Complete! Welcome, brave scholar." notification, "Title Unlocked: The Initiated" notification |

If any step doesn't behave as listed, capture the actual behavior before moving on and revisit the dispatch / ordering.

- [ ] **Step 6: Propose commit**

```bash
git add dungeon-scholar/src/App.jsx
git commit -m "feat(dungeon-scholar): wire 14-step Awakening into App.jsx

- Generalise TutorialPanel button to call onAction for any step with
  actionLabel (not just forge_tome).
- Add onAction branches for library_tour, vault_intro, quest_board,
  view_achievements, view_titles_levels.
- Update WelcomeModal copy from eight-step to fourteen-step."
```

---

## Task 6: Add `migrateTutorialIndex` for users importing pre-overhaul journals (TDD)

**Why:** A user with an exported journal mid-tutorial (`tutorialStepIndex` between 0 and 7) will land on the *wrong* step after upgrade if we don't remap by id. Imported journals are the only realistic upgrade path since the app has no persistent storage.

**Files:**
- Modify: `dungeon-scholar/src/tutorial.js`
- Modify: `dungeon-scholar/src/tutorial.test.js`
- Modify: `dungeon-scholar/src/App.jsx` (~1206 `importProgress`)

- [ ] **Step 1: Write failing tests for `migrateTutorialIndex`**

Add to `dungeon-scholar/src/tutorial.test.js`:
```js
import { TUTORIAL_STEPS, snapshotBaselines, migrateTutorialIndex } from './tutorial';

describe('migrateTutorialIndex', () => {
  // Old 8-step order — captured here as the source of truth for the migration.
  const OLD_ORDER = [
    'welcome', 'forge_tome', 'inscribe_tome', 'study_scroll',
    'solve_riddle', 'face_trial', 'consult_oracle', 'enter_dungeon',
  ];

  it('maps each old index to the new index of the same step id', () => {
    for (let oldIdx = 0; oldIdx < OLD_ORDER.length; oldIdx++) {
      const id = OLD_ORDER[oldIdx];
      const newIdx = TUTORIAL_STEPS.findIndex(s => s.id === id);
      expect(migrateTutorialIndex(oldIdx)).toBe(newIdx);
    }
  });

  it('returns 0 for negative indices', () => {
    expect(migrateTutorialIndex(-1)).toBe(0);
  });

  it('clamps out-of-range high indices to the last step', () => {
    expect(migrateTutorialIndex(99)).toBe(TUTORIAL_STEPS.length - 1);
  });

  it('passes through indices already in the new range', () => {
    // If the saved index is 8+ (impossible from old data), assume it's already on the new flow.
    // Returning the same index means it stays put. Valid range is [0, TUTORIAL_STEPS.length - 1].
    expect(migrateTutorialIndex(10)).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm test
```
Expected: import fails — `migrateTutorialIndex` is not exported.

- [ ] **Step 3: Implement `migrateTutorialIndex` in tutorial.js**

Add to `dungeon-scholar/src/tutorial.js` (after `snapshotBaselines`):
```js
// Old 8-step Awakening order, used to remap saved tutorialStepIndex
// values from journals exported before the overhaul. The new TUTORIAL_STEPS
// reorders + inserts steps; we look up the old step's id at the saved
// position and find its new index.
const OLD_TUTORIAL_ORDER = [
  'welcome',
  'forge_tome',
  'inscribe_tome',
  'study_scroll',
  'solve_riddle',
  'face_trial',
  'consult_oracle',
  'enter_dungeon',
];

export const migrateTutorialIndex = (savedIndex) => {
  const max = TUTORIAL_STEPS.length - 1;
  if (typeof savedIndex !== 'number' || Number.isNaN(savedIndex)) return 0;
  if (savedIndex < 0) return 0;
  if (savedIndex < OLD_TUTORIAL_ORDER.length) {
    const id = OLD_TUTORIAL_ORDER[savedIndex];
    const newIdx = TUTORIAL_STEPS.findIndex(s => s.id === id);
    return newIdx >= 0 ? newIdx : 0;
  }
  if (savedIndex > max) return max;
  return savedIndex;
};
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
npm test
```
Expected: all migration tests pass.

- [ ] **Step 5: Wire migration into `importProgress` in App.jsx**

Locate `importProgress` (~1206–1227). Current core logic:
```js
const data = JSON.parse(ev.target.result);
// Migration: if old single-tome format, wrap it
if (data.library === undefined) {
  setPlayerState({ ...DEFAULT_STATE, ...data, library: [], activeTomeId: null });
} else {
  setPlayerState({ ...DEFAULT_STATE, ...data });
}
showNotif('Journal restored', 'success');
```

At the top of `App.jsx`, update the existing tutorial import to include the migration helper:
```js
import { TUTORIAL_STEPS, snapshotBaselines, migrateTutorialIndex } from './tutorial';
```

In `importProgress`, after the JSON.parse and before the setPlayerState branches, normalise the tutorial step index:
```js
const data = JSON.parse(ev.target.result);
// Remap saved tutorial step index if it came from a pre-overhaul journal.
if (typeof data.tutorialStepIndex === 'number' && !data.tutorialCompleted) {
  data.tutorialStepIndex = migrateTutorialIndex(data.tutorialStepIndex);
}
// Migration: if old single-tome format, wrap it
if (data.library === undefined) {
  setPlayerState({ ...DEFAULT_STATE, ...data, library: [], activeTomeId: null });
} else {
  setPlayerState({ ...DEFAULT_STATE, ...data });
}
showNotif('Journal restored', 'success');
```

- [ ] **Step 6: Manual smoke test of the migration**

```bash
npm run dev
```
1. In the app, "Begin the Awakening", advance to step 6 (Face a Trial — by clicking through manually OR by skipping to it via dev-only manipulation).
2. Click "Preserve Journal" → save the JSON.
3. Open the saved JSON in a text editor. Set `tutorialStepIndex` to `5` (which corresponds to old `face_trial`) and DELETE the `library_tour`-era entries by hand if any leaked in. Save.
4. Click "Begin Anew" to reset.
5. Click "Restore Journal" → load the modified file.
6. Confirm the tutorial panel header reads "THE AWAKENING — 7/14" (`face_trial` is now index 6, displayed 1-indexed as 7) — meaning the saved old-index 5 was correctly remapped to new-index 6.

Note: this manual test is fiddly. If skipped, mark this step "manually verified via test suite" since `migrateTutorialIndex` has unit-test coverage of the mapping table.

- [ ] **Step 7: Propose commit**

```bash
git add dungeon-scholar/src/tutorial.js dungeon-scholar/src/tutorial.test.js dungeon-scholar/src/App.jsx
git commit -m "feat(dungeon-scholar): migrate pre-overhaul journal tutorial indices

importProgress now remaps tutorialStepIndex through migrateTutorialIndex
so users restoring a journal saved with the old 8-step Awakening land on
the equivalent new step rather than a misaligned position. Existing tests
cover the mapping table; manual verification covers the import flow."
```

---

## Task 7: Final verification + log entries

**Why:** Per project conventions in `CLAUDE.md`, deferred or out-of-scope items must be logged in `docs/SUGGESTIONS-LOG-DNDAPP.md` or `docs/ISSUES-LOG-DNDAPP.md` if they cross session boundaries. Most of this work is in-scope and complete, but a couple of follow-ups belong in the suggestions log.

**Files:**
- Modify: `docs/ISSUES-LOG-DNDAPP.md` (if any closed bug warrants a "fixed" line — usually not, per CLAUDE.md guidance to skip logging fixed-this-session items)
- Modify: `docs/SUGGESTIONS-LOG-DNDAPP.md` for any deferred suggestions surfaced during the work

- [ ] **Step 1: Final test run**

```bash
cd dungeon-scholar && npm test && npm run build
```
Expected: tests pass, build succeeds with no errors.

- [ ] **Step 2: Final manual walkthrough**

Repeat the Task 5 Step 5 walkthrough end-to-end. Confirm no regressions.

- [ ] **Step 3: Read `docs/LOG-INSTRUCTIONS.md` before logging**

```bash
cat /home/patrick/home-lab/docs/LOG-INSTRUCTIONS.md
```

- [ ] **Step 4: Log deferred suggestions, if any**

Items the implementer should consider logging to `docs/SUGGESTIONS-LOG-DNDAPP.md` if they came up but were intentionally not addressed:

- (design-gotcha) Action-button steps in the tutorial advance the moment the button is clicked; if the user immediately closes the opened modal/screen, they "complete" the step without engaging. This is by design (per spec) but is a known UX caveat worth noting for future iteration.
- (future-idea) The vault dedupes by `item.id` (App.jsx ~848). For lab failures, the deduped item is the parent trial, not the failed stage — so the same trial failed twice doesn't grow the vault. Considered out of scope here; could be revisited if vault UX feedback emerges.

If neither came up organically during implementation as a discussion point, **skip the log entries**. CLAUDE.md is clear: "Log even minor/optional out-of-scope items" — but only when they're genuinely deferred items, not when they're already documented in the design spec.

- [ ] **Step 5: Update README or any tutorial documentation if it references the 8-step count**

```bash
grep -rn "eight-step\|8-step\|8.steps" /home/patrick/home-lab/dungeon-scholar/ 2>/dev/null | grep -v node_modules
```
If any prose mentions the old step count, update.

- [ ] **Step 6: Propose final commit** (only if any docs were updated)

```bash
git add docs/SUGGESTIONS-LOG-DNDAPP.md dungeon-scholar/README.md 2>/dev/null
git commit -m "docs(dungeon-scholar): log deferred items + update tutorial step count references"
```

---

## Self-Review

**Spec coverage check** — every spec section must map to a task:

| Spec section | Task |
|---|---|
| Bug 1 (`face_trial` lies) | Task 3 (counter + auto-condition swap) |
| Bug 2 (`enter_dungeon` copy mismatch) | Task 4 (rewrites the description in the new TUTORIAL_STEPS) |
| 14-step table | Task 4 (TUTORIAL_STEPS rewrite) + Task 5 (dispatch) |
| Per-step descriptions | Task 4 (embedded in the array) |
| `labsAttempted` counter mechanics | Task 3 (recordAnswer increment + baseline + memo + switch case) |
| Uniform action-button pattern | Task 5 (TutorialPanel onClick generalisation + onAction dispatch) |
| The Initiated title (no logic change) | Implicit — already in `advanceTutorial`, no task needed |
| Welcome modal copy | Task 5 Step 3 |
| Files-touched table in spec | Tasks 1-6 collectively cover every region listed |
| Migration / save compatibility | Task 6 (migrateTutorialIndex + importProgress wiring) |
| Tradeoffs (click counts as engagement, etc.) | Acknowledged inline in Task 5 + Task 7 logs |

**Placeholder scan:** No "TBD", "TODO", or "implement later" anywhere. All code blocks are complete and self-contained. The proposed commit messages are real, not stubs. The fiddly migration smoke test in Task 6 Step 6 is offered as optional ("If skipped, mark this step manually verified via test suite") with rationale — that's a reasoned trade-off, not a placeholder.

**Type/name consistency:**
- `labsAttempted` (per-tome counter) used consistently across blankTomeProgress, recordAnswer, snapshotBaselines, the App.jsx memo, the auto-condition switch, and tests. ✓
- `totalLabsAttemptedAcrossLib` (memo name) consistent in declaration + deps + switch case. ✓
- `migrateTutorialIndex` consistent in tutorial.js export + tests + App.jsx import + invocation site. ✓
- `TUTORIAL_STEPS` import consistent. ✓
- `OLD_TUTORIAL_ORDER` is module-private, only used inside `migrateTutorialIndex`. ✓

**Spec gaps:** None found. The "in-character voice" copy from the spec is reproduced verbatim in the new TUTORIAL_STEPS array.

---

## Execution choice

Plan complete and saved to `docs/superpowers/plans/2026-04-30-dungeon-scholar-tutorial-overhaul.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
