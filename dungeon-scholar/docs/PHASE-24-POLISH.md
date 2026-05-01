# Phase 24 Polish — Deferred Items

This file tracks polish/deferred work to address in Phase 24 (Polish, Balance & Final Pass). Items are added as earlier phases choose to defer non-essential scope.

## Run history (Phase 10)

- **Sortable columns on the Chronicle of Delves.** Today the run list is hard-coded to date-desc. Add column headers (Date / Difficulty / Boss / Score / Streak / Duration) that toggle sort.
- **Accuracy heatmap by domain/topic.** Currently each `runHistory[].questionLog[]` entry has `prompt` and `type` but no domain tag. Once tomes carry per-question `domain`/`tags` (see prompt-system note below), aggregate accuracy across all runs and render as a grouped heatmap.

## Prompt system (cross-cutting)

- The next iteration of the AI tome-generation prompts (in `src/prompts/`) should require per-question `domain` and `tags` fields. The exam blueprint structure already has a "domain" concept; pass it down to each `quiz` and `lab.steps[]` entry. With this, the Chronicle's accuracy heatmap becomes possible without back-fill on existing tomes.

## Build / structure

- **App.jsx is large.** Bundle warns at >500 KB after minification. Phase 24 should split out the major modes (DungeonRun, BossEncounter, FlashcardsMode, QuizMode, LabMode, ShopScreen, RunHistoryScreen) into `src/components/` files and load via dynamic `import()` to code-split the bundle.

---

When adding a new item, prepend a one-line summary under the relevant section, with enough detail that future-Claude can pick up the work without re-deriving the requirement.
