# Dungeon Scholar — Tutorial Overhaul ("The Awakening" v2)

**Date:** 2026-04-30
**Scope:** `dungeon-scholar/src/App.jsx` only. No backend, no schema migration.
**Status:** Design approved; ready for implementation plan.

---

## Problem

Two issues with the current onboarding ("The Awakening", `TUTORIAL_STEPS` in App.jsx ~352).

### 1. Step 6 (`face_trial`) lies to the user

The description reads:

> "Trials of Skill demand hands-on prowess. Complete a single stage of any trial — full completion is not required."

The auto-condition (`lab_step`) checks `labsCompleted + labStepInVault`, where:
- `labsCompleted` increments only on full trial success (`onAnswer(true)` after the last stage),
- `labStepInVault` counts failed lab steps in `mistakeVault`, which **dedupes by `item.id`** at App.jsx:848.

Practical effect: a user who fails Trial A → retries Trial A → fails again still has counter = 1, no new increment. They must either fully complete a trial or fail two *distinct* trials to advance. This produces the reported "took me several" experience.

### 2. Tutorial covers 5 of 11 user-facing features

Today's 8 steps cover: Tome creation, Library inscription, Scrolls, Riddles, Trials, Oracle, Dungeon. They omit:

- Quest Board (`screen === 'quests'`)
- Tome of Failures / mistake vault (`screen === 'vault'`)
- Library tour — multi-tome management, share codes, edit metadata
- Achievements modal
- Levels / Titles modal (XP economy, special titles)
- Manage Your Saga panel — preserve / restore journal, replay tutorial, begin anew

A new player can finish the Awakening without ever discovering these surfaces.

### 3. Bonus: Step 8 (`enter_dungeon`) description mismatch

Auto-condition `dungeon_completed` actually fires on dungeon **start** (`trackDungeonAttempt` in `startRun`), but the description says "Brave one full Dungeon Delve". User has confirmed the *behavior* is correct (advance on entry); the *copy* needs to reflect that.

---

## Goals

- Fix step 6 so a single engaged trial attempt (success or failure) advances the tutorial.
- Fix step 8 copy to match its already-correct entry-based behavior.
- Extend the Awakening from 8 to 14 steps, interleaving 6 new steps at moments where each surface is contextually meaningful.
- Move "The Initiated" title award to the new final step.

## Non-goals

- No engagement-detection plumbing on the new steps. A click on the action button counts as the user having seen the surface; the panel description does the teaching.
- No restructuring of existing screens, modals, or component boundaries. New steps reuse existing UI.
- No changes to vault dedupe logic, achievements logic, XP math beyond the new step rewards, or daily quest pool.
- No second-tier "tour" / tooltip system. (Considered as alternative shape "C" during brainstorming; rejected in favor of one linear extended Awakening.)

---

## The 14-Step Awakening

| # | id | Title | Trigger | XP | Status |
|---|----|----|----|----|----|
| 1 | `welcome` | The Scholar Awakens | Manual *Continue* | 10 | unchanged |
| 2 | `forge_tome` | Behold the Spell of Tome Creation | Action button → opens prompt modal | 25 | unchanged |
| 3 | `inscribe_tome` | Inscribe Thy First Tome | Auto on first tome added | 50 | unchanged |
| 4 | `library_tour` | The Sacred Library | Action button → `setScreen('library')` + advance | 20 | **new** |
| 5 | `study_scroll` | Read a Sacred Scroll | Auto on card review | 30 | unchanged |
| 6 | `solve_riddle` | Solve a Riddle | Auto on quiz answer | 30 | unchanged |
| 7 | `face_trial` | Face a Trial of Skill | Auto on **trial completion (success or failure)** | 30 | **bug fix** |
| 8 | `vault_intro` | The Tome of Failures | Action button → `setScreen('vault')` + advance | 20 | **new** |
| 9 | `consult_oracle` | Consult the Oracle | Auto on oracle message | 30 | unchanged |
| 10 | `quest_board` | The Quest Board | Action button → `setScreen('quests')` + advance | 20 | **new** |
| 11 | `enter_dungeon` | Enter the Dungeon | Auto on dungeon entry (already current behavior) | 100 | **copy fix** |
| 12 | `view_achievements` | The Hall of Glory | Action button → `setShowAchievements(true)` + advance | 20 | **new** |
| 13 | `view_titles_levels` | Of Levels and Titles | Action button → `setShowTitles(true)` + advance | 20 | **new** |
| 14 | `manage_saga` | Preserve Thy Saga | Manual *Complete the Awakening* | 20 + **The Initiated title** | **new (final)** |

**XP totals:** 425 (previously 305). Net +120 XP over the full Awakening for new players.

### Per-step descriptions (proposed copy)

In-character voice consistent with existing tutorial. Implementer may polish wording; intent shown here.

- **4 `library_tour`** — "Within the Sacred Library thou mayest hold many tomes. Switch betwixt them, share their codes with kin, or inscribe new ones."
  - `actionLabel: 'Visit thy Library'`
- **7 `face_trial` (description rewrite)** — "Trials of Skill demand hands-on prowess. Engage with one trial — finish it or fall trying — to prove thy mettle."
  - (Was: "Complete a single stage of any trial — full completion is not required.")
- **8 `vault_intro`** — "Foes that have bested thee gather in the Tome of Failures, awaiting redemption. Banish them by answering true to clear thy slate."
  - `actionLabel: 'Visit the Vault'`
- **10 `quest_board`** — "Daily quests await on the Quest Board. Complete them as thou dost study to claim experience as bonus reward."
  - `actionLabel: 'Visit the Quest Board'`
- **11 `enter_dungeon` (description rewrite)** — "The grand quest awaits. Step into the Dungeon Delve — five chambers and a dungeon lord lie within. Win or fall, the experience shall steel thee."
  - (Was: "The grand quest awaits. Brave one full Dungeon Delve to claim the Initiated title and complete thy awakening.")
- **12 `view_achievements`** — "The Hall of Glory holds thy achievements — milestones earned through valor, and those yet to claim. Behold thy progress."
  - `actionLabel: 'Open the Hall of Glory'`
- **13 `view_titles_levels`** — "Each XP earned advances thy stature. Reach new levels to unlock titles to wear with pride. Special titles await those who achieve great deeds."
  - `actionLabel: 'View thy Stature'`
- **14 `manage_saga`** — "Thy progress may be preserved or restored via the Manage Your Saga panel below. Save thy journal, share thy tomes, replay this Awakening — all from there. Thou hast walked every hall. Step forth, Initiated."
  - `completionLabel: 'Complete the Awakening'`

---

## Mechanics

### Bug fix: new `labsAttempted` counter

Add a per-tome progress field that increments on every lab `onAnswer` event (success or failure, no dedupe).

**Schema change** (DEFAULT_STATE tome progress shape, ~533):
```js
labsAttempted: 0,  // new field
```

**Increment site** (`recordAnswer`, ~838, after `next` is initialized):
```js
if (item && item._type === 'lab' && prev.activeTomeId) {
  next.library = next.library.map(t =>
    t.id === prev.activeTomeId
      ? { ...t, progress: { ...t.progress, labsAttempted: (t.progress?.labsAttempted || 0) + 1 } }
      : t
  );
}
```

**Baseline snapshot** (`snapshotBaselines`, ~579) — replace `labSteps` field:
```js
labsAttempted: (state.library || []).reduce((s, t) => s + (t.progress?.labsAttempted || 0), 0),
```

**Memo** — replace `totalLabStepsAcrossLib` (~674):
```js
const totalLabsAttemptedAcrossLib = useMemo(
  () => playerState.library.reduce((s, t) => s + (t.progress?.labsAttempted || 0), 0),
  [playerState.library]
);
```

**Auto-condition** (~710):
```js
case 'lab_step':
  met = totalLabsAttemptedAcrossLib > (baseline.labsAttempted || 0);
```

**useEffect deps** — replace `totalLabStepsAcrossLib` with `totalLabsAttemptedAcrossLib`.

The old `labStepInVault` math is removed entirely. Vault dedupe behavior is left untouched (it's correct for vault UX — you don't want the same failed item appearing twice).

### Uniform action-button pattern for new steps

All 6 new action steps reuse the existing `forge_tome` mechanism:
- `autoComplete: false`
- has `actionLabel`
- TutorialPanel button click → `onAction(stepId)` (side effect) → `onAdvance(stepId)`

The existing glue at App.jsx ~4114 currently special-cases `forge_tome`:
```js
onClick={() => {
  if (step.id === 'forge_tome') onAction(step.id);
  onAdvance(step.id);
}}
```

Generalise to: any step with `actionLabel` calls `onAction` first, then `onAdvance`.

The host's `onAction` handler at ~1546–1554 grows new branches:
```js
else if (stepId === 'library_tour')       { setScreen('library'); }
else if (stepId === 'vault_intro')        { setScreen('vault'); }
else if (stepId === 'quest_board')        { setScreen('quests'); }
else if (stepId === 'view_achievements')  { setShowAchievements(true); }
else if (stepId === 'view_titles_levels') { setShowTitles(true); }
```

Step 14 (`manage_saga`) has **no** `actionLabel` — it behaves like step 1 (`welcome`): manual continue button, no side effect.

### "The Initiated" title — no logic change

`advanceTutorial` already awards the `initiated` title when `isComplete` is reached. Extending `TUTORIAL_STEPS` from 8 to 14 entries naturally moves the award to step 14 without code changes to the title-grant logic.

### Welcome modal copy

App.jsx ~4023 — replace "an eight-step tutorial" with "a fourteen-step tutorial".

---

## Files touched

Single-file change: `dungeon-scholar/src/App.jsx`.

| Region | Approx. line | Change |
|----|----|----|
| `TUTORIAL_STEPS` array | 352–424 | Rewrite — 6 new entries inserted, copy updates on steps 7 & 11 |
| Tome progress default | ~533 | Add `labsAttempted: 0` |
| `snapshotBaselines` | ~579 | Replace `labSteps` → `labsAttempted` |
| `recordAnswer` | ~838 | Increment `labsAttempted` on lab answers |
| Auto-condition `lab_step` case | ~710 | Use new memo + baseline field |
| `totalLabStepsAcrossLib` memo | ~674 | Rename + simplify to `totalLabsAttemptedAcrossLib` |
| useEffect deps | ~721 | Update memo name |
| `onAction` dispatch | ~1546–1554 | 5 new branches |
| TutorialPanel action-button onClick | ~4114 | Generalise from `forge_tome` special-case to any step with `actionLabel` |
| `WelcomeModal` copy | ~4023 | "eight-step" → "fourteen-step" |

No new components, no new top-level state, no schema/storage migration.

---

## Migration / save compatibility

- Existing players mid-tutorial (`tutorialStarted: true`, `tutorialCompleted: false`): keep their `tutorialStepIndex`. Steps 1–7 in the new flow are identical in id and meaning to old steps 1–6 plus a new step 4 (`library_tour`). **An old player parked on step 4 (`study_scroll`) will be remapped by index to step 4 (`library_tour`), which is the wrong step.** Options:
  - **(a)** On load, detect the old 8-step shape (e.g., flag a one-time migration when index < 8 and `library_tour` step exists in TUTORIAL_STEPS) and remap to the matching new index.
  - **(b)** Reset mid-tutorial players to step 1.
  - **(c)** Mark mid-tutorial players as completed (skip them past it).

  Recommendation: **(a)** with a simple id-based remap — for any saved `tutorialStepIndex`, look up the old step id from a hardcoded list and find the new index for that id. This is ~8 lines and preserves the user's progress.

- Existing players who finished (`tutorialCompleted: true`): no impact. They've already received "The Initiated". They can hit "Replay Tutorial" in the saga panel to see the new flow.

- Existing tomes without `labsAttempted` field: `(t.progress?.labsAttempted || 0)` defaults to 0 everywhere. No data migration needed.

- `tutorialBaselines` saved with the old `labSteps` field: harmless. The new code reads `baseline.labsAttempted` (defaulting to 0), so existing players resuming the lab step might trigger early advancement. Acceptable: they'd advance the moment they answer one lab step, which is the new desired behavior anyway.

---

## Tradeoffs (acknowledged)

- **Click counts as engagement.** Action-button steps don't verify the user actually looked at the modal/screen they opened. The panel description does the teaching — if the user closes the modal instantly, they still got the prose. We chose this over engagement-detection plumbing for simplicity and because forcing dwell time on a tutorial is hostile UX.
- **14 steps is long.** Roughly twice today's flow. The skip button on every step lets users bail early. The XP economy (+120 over the run) is small enough not to distort early progression.
- **No new screens or surfaces.** Some features (Levels/Titles, Saga management) are passive — the tutorial step amounts to "look at this thing." We accept the slight weakness of those steps in exchange for not building new explainer UI.
- **`labsAttempted` is per-tome, not global.** Matches the existing pattern (`labsCompleted`, `cardsReviewed`, etc. all per-tome). No cross-library aggregation needed beyond the existing `useMemo` reduction pattern.

---

## Out of scope

- Vault dedupe redesign (e.g., counting attempts vs. unique items). Tutorial fix doesn't need it.
- Tooltip / first-time-discovery overlays for features not in the Awakening (none remain after this change).
- A "skip remaining steps" mid-tutorial option separate from the existing per-step Skip button.
- Quest Board / Vault / Library tutorials going *deeper* than introduction (e.g., walking through claiming a quest, banishing a vault foe, sharing a tome by code). Each new step is "open this surface, read the panel description" — no scripted multi-action sub-flows.
