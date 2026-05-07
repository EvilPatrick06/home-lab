// Saga repair (backfill) for state mutated by historical bugs.
//
// One-shot migrations gated on `backfillVer`. Each backfill step bumps
// the flag so a subsequent reload doesn't repeat the work. Pure functions
// — call `applyBackfills(state)` from the hydrate path and use the
// returned state.

export const CURRENT_BACKFILL_VER = 1;

// Backfill v1: dungeon `recordAnswer` was called with a single object
// argument (`{ id, type, correct }`) while the App-side signature is
// `(correct, item)`. The object was always truthy, so dungeon answers:
//   - silently inflated `totalCorrect` (every dungeon answer counted as
//     correct, regardless of the actual outcome)
//   - never wrote to `mistakeVault` (gated on `item` being defined)
//
// `runHistory[].questionLog[].correct` was always populated correctly
// (the bug was upstream in `recordAnswer`, not in the per-question log).
// So we can derive the real correct count from questionLog and adjust
// `totalCorrect` downward, plus repopulate the missing dungeon entries
// in each tome's mistakeVault.
//
// Gold inflation is acknowledged but NOT backfilled — it may have been
// spent or carried into trades, and a downward adjustment risks
// confusion. Only counters and the vault are repaired.

export function backfillDungeonAnswers(state) {
  if (!state) return state;
  const library = Array.isArray(state.library) ? state.library : [];
  let dungeonTotal = 0;
  let dungeonCorrect = 0;
  let libraryChanged = false;
  const newLibrary = library.map((tome) => {
    const runs = (tome.progress && tome.progress.runHistory) || [];
    const tomeAdditions = [];
    runs.forEach((run) => {
      const log = (run && run.questionLog) || [];
      log.forEach((entry) => {
        dungeonTotal += 1;
        if (entry && entry.correct) dungeonCorrect += 1;
        // Missing-vault repair: any wrong dungeon answer that isn't
        // already in the tome's vault gets added.
        if (entry && entry.correct === false && entry.id) {
          tomeAdditions.push({
            id: entry.id,
            question: entry.prompt,
            type: entry.type,
            domain: entry.domain,
            tags: entry.tags,
            addedAt: Date.now(),
          });
        }
      });
    });
    if (tomeAdditions.length === 0) return tome;
    const existingVault = (tome.progress && tome.progress.mistakeVault) || [];
    const seen = new Set(existingVault.map((m) => m.id));
    const dedupedAdditions = tomeAdditions.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    if (dedupedAdditions.length === 0) return tome;
    libraryChanged = true;
    return {
      ...tome,
      progress: {
        ...(tome.progress || {}),
        mistakeVault: [...existingVault, ...dedupedAdditions],
      },
    };
  });

  // The inflation in totalCorrect equals (D_total - D_correct) — every
  // wrong dungeon answer was counted as correct. Only adjust if there
  // was an actual inflation AND the user has a totalCorrect to subtract
  // from — never *introduce* the field on states that lack it.
  const inflation = Math.max(0, dungeonTotal - dungeonCorrect);
  const hasCounter = typeof state.totalCorrect === 'number';
  if (!libraryChanged && (!hasCounter || inflation === 0)) return state;
  const next = libraryChanged ? { ...state, library: newLibrary } : { ...state };
  if (hasCounter && inflation > 0) {
    next.totalCorrect = Math.max(0, state.totalCorrect - inflation);
  }
  return next;
}

// Apply every backfill <= CURRENT_BACKFILL_VER that hasn't run yet.
// Idempotent: re-running with the same state is a no-op once the flag
// is at CURRENT_BACKFILL_VER.
export function applyBackfills(state) {
  if (!state) return state;
  const cur = typeof state.backfillVer === 'number' ? state.backfillVer : 0;
  let next = state;
  if (cur < 1) next = backfillDungeonAnswers(next);
  if (cur < CURRENT_BACKFILL_VER) {
    next = { ...next, backfillVer: CURRENT_BACKFILL_VER };
  }
  return next;
}
