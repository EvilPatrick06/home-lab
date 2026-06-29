# PHASE-06 — Mistake-Vault "The Redeemed" unlock fires on an empty vault

> Authored from the 2026-06-28 dungeon-scholar QA report — [`QA-report-2026-06-28.md`](./QA/completed/QA-report-2026-06-28.md) — tested @ deployed `index-Dy2bw_1f.js` / last dungeon-scholar src commit `8a8891fb` · cross-checked `origin/master` `43e4be93`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

The special title **`vaultkeeper` ("The Redeemed" — "Banish all foes from your Tome of Failures")** and the **`vault_clear` achievement ("Redemption" — "Empty your tome of failures", +50 gold)** are meant to reward a player who actually *accumulates* mistakes in a tome's Mistake Vault and then *clears* them. Today they are granted for **merely opening an empty vault** — even with **no tome loaded** and **no mistake ever banished**. Navigating to `#/vault` on a profile with >10 lifetime answers fires "Title Unlocked: The Redeemed" and bumps gold by 50, vacuously, on first visit. This phase gates the unlock so it fires only on a genuine "had foes → banished them all" transition with an active tome, and never for a vault that was never populated.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Self-contained logic fix in one component (`MistakeVault.jsx`) plus, if the persisted-flag approach is chosen, the blank-progress shape in the player store. No shared files with PHASE-03 (light-theme contrast), PHASE-04 (import robustness), or PHASE-05 (interaction/copy).
- **Reward plumbing is correct and out of scope to change.** `checkAchievement` (`src/features/player/usePlayerActions.js:581`) grants `ACHIEVEMENT_GOLD = 50` + the achievement id; `unlockSpecialTitle` (`:594`) grants the title id; both are idempotent (no-op if already owned) and surface their toasts via the central achievements/titles-transition effects (PHASE-17 17C). The bug is **only the trigger condition** in `MistakeVault.jsx`, not the grant machinery — do not touch the reward functions.
- **Definitions are correct and out of scope.** The title def `game/titles.js:25` and the achievement def `game/achievements.js:148` already describe the intended "clear a populated vault" semantics; no copy change is needed there.

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`).

### F1 (medium) — Opening an empty Mistake Vault grants `vault_clear` (+50 gold) and the `vaultkeeper` title, even with no tome and nothing ever banished

**Status: confirmed in source.**

QA repro (signed-in profile with 88/124 lifetime answered, Dark theme, **no tome loaded**):

1. Use a profile with >10 lifetime answered questions.
2. With no tome loaded, navigate to `#/vault`.
3. Observe: "Title Unlocked: The Redeemed" toast; gold 226 → 276 (+50); `playerState.unlockedTitles` now contains `vaultkeeper` and `playerState.achievements` contains `vault_clear`.

Root cause, confirmed in source — `src/features/study/MistakeVault.jsx:16-21`:

```js
const vault = tomeProgress?.mistakeVault || [];

useEffect(() => {
  if (vault.length === 0 && playerState.totalAnswered > 10) {
    checkAchievement('vault_clear');
    unlockSpecialTitle('vaultkeeper');
  }
}, [vault.length]);

if (!courseSet) {            // :23 — early-out runs AFTER the hook above
  return ( /* "No Active Tome" */ );
}
```

Two defects compound:

1. **Hooks run before the early return.** React runs the `useEffect` (`:16`) unconditionally on mount **before** the `if (!courseSet) return` guard at `:23` (Rules of Hooks — every hook runs every render, regardless of later early-outs). So the effect fires even when `courseSet` is null (no tome loaded) — exactly the QA scenario.
2. **"Empty" is treated as "all foes banished."** The guard `vault.length === 0` is **vacuously true** for a vault that was never populated. With `tomeProgress?.mistakeVault` defaulting to `[]`, a fresh or tomeless vault satisfies the condition, so the reward fires on first view rather than on an actual clear. The intended trigger — *had entries, then emptied them* — is never checked; there is no transition detection and no `courseSet` guard inside the effect.

Verification commands (read-only):

```bash
sed -n '14,31p'  dungeon-scholar/src/features/study/MistakeVault.jsx     # effect (:16-21) sits above the !courseSet early-out (:23)
sed -n '581,600p' dungeon-scholar/src/features/player/usePlayerActions.js # checkAchievement (+50 gold) + unlockSpecialTitle (idempotent grants)
grep -n "vault_clear"  dungeon-scholar/src/game/achievements.js          # :148 "Redemption — Empty your tome of failures"
grep -n "vaultkeeper"  dungeon-scholar/src/game/titles.js                # :25  "The Redeemed — Banish all foes from your Tome of Failures"
```

**Suggested action (the report's):** gate the unlock on having actually had mistakes that were then cleared (track a per-tome `vaultEverHadEntries` / `banishedCount > 0`), require an active `courseSet`, and only run the effect when a tome is loaded.

## Sub-phases

> dungeon-scholar checks (run from `dungeon-scholar/`): single test `npx vitest run src/features/study/MistakeVault.test.jsx` during sub-phase work; CI (`dungeon-scholar-ci.yml`) runs the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate on push.

### 06A — Gate the "Redeemed" unlock behind a real banish-all transition

**Objective:** the `vault_clear` achievement and `vaultkeeper` title unlock **only** when a player with an active tome empties a vault that **actually held at least one foe** — never on first view of an empty/never-populated vault, and never with no tome loaded.

**Files:** `dungeon-scholar/src/features/study/MistakeVault.jsx` (`:16-21` effect). If the persisted-flag approach (below) is chosen, also the blank-tome-progress factory used by the player store (`blankTomeProgress()` in `src/features/player/usePlayerActions.js` — add a `vaultEverHadEntries` / `banishedCount` field) and any progress-normalization that backfills legacy saves.

**Steps:**

1. **Keep the hook unconditional** (Rules of Hooks) but move all of its work behind an in-effect guard: `if (!courseSet) return;` as the first line inside the effect, so a tomeless `#/vault` visit can never grant anything.
2. **Detect a genuine "had foes → none left" transition,** not a bare `length === 0`. Pick **one** of:
   - **(preferred, survives remount/tome-switch) Persisted per-tome counter.** Add `banishedCount` (or `vaultEverHadEntries: boolean`) to the active tome's progress; increment/set it wherever a vault entry is removed/cleared (the `onRemove` path that this screen calls, and any answer-correct path that pulls an item out of the vault). Unlock only when `vault.length === 0 && banishedCount > 0` (i.e. the player cleared at least one foe and the vault is now empty) **and** `courseSet` is present. This is robust to reloads and to leaving/returning to the screen.
   - **(lighter, in-session only) Previous-length ref.** Track the prior vault length in a `useRef`; unlock only when `prevLenRef.current > 0 && vault.length === 0` (a real empty-out observed while mounted), resetting the ref when the active tome id changes so a switch between tomes can't be read as a clear. Acceptable if the persisted approach is judged too invasive, but note it won't fire if the final banish happened in a prior session — which is the safe direction (no spurious grant).
3. **Keep the `totalAnswered > 10` floor** only as a secondary sanity gate if desired; it must no longer be the *primary* trigger. The primary trigger is the banish-all transition with an active tome.
4. Confirm the grants stay idempotent (they already are — `checkAchievement`/`unlockSpecialTitle` no-op when owned), so a legitimately-earned title is never re-toasted on subsequent empty-vault views.

**Acceptance:**
- Navigating to `#/vault` with **no tome loaded** grants nothing (no `vault_clear`, no `vaultkeeper`, no gold change).
- Opening a tome whose vault was **never populated** grants nothing.
- Accumulating ≥1 mistake in a tome's vault and then clearing the last one **does** grant `vault_clear` (+50 gold) and `vaultkeeper` exactly once.
- Re-visiting the now-empty vault does **not** re-grant or re-toast.
- `npm run build` clean; the new/updated `MistakeVault` test green.

### 06B — Test the gate

**Objective:** lock the corrected behavior with a unit test so it can't regress.

**Files:** `dungeon-scholar/src/features/study/MistakeVault.test.jsx` (new or extended).

**Steps:**

1. Render `MistakeVault` with `courseSet = null` and `playerState.totalAnswered = 88`; assert `checkAchievement`/`unlockSpecialTitle` were **not** called.
2. Render with a `courseSet` present but `tomeProgress.mistakeVault = []` and no prior entries; assert no grant.
3. Render with a populated vault, then drive the `onRemove` path until empty; assert `checkAchievement('vault_clear')` and `unlockSpecialTitle('vaultkeeper')` are each called exactly once.
4. Re-render empty after the grant; assert no second call.

**Acceptance:** all four assertions pass via `npx vitest run src/features/study/MistakeVault.test.jsx`; CI green.

## Research notes

- The grant functions are pure idempotent updaters (PHASE-17 17C): `checkAchievement` adds the id + `ACHIEVEMENT_GOLD` (50) only if absent; `unlockSpecialTitle` adds the title id only if absent. So the *user-visible* damage of the bug is a one-time spurious +50 gold and a falsely-unlocked title — but it cheapens a meta-progression reward and mis-signals to the player. The fix is purely the trigger predicate.
- This is a textbook "effect fires before the early-return guard" bug: the `if (!courseSet) return` at `:23` reads like it protects the effect, but hooks always run first. The robust fix puts the `courseSet` check **inside** the effect, not above it in JSX order.
- Prefer the persisted `banishedCount`/`vaultEverHadEntries` approach if the vault-removal call sites are easy to instrument — it is the only variant that correctly handles the player who banishes their last foe, reloads, and returns. The ref variant is a safe fallback that errs toward *not* granting.

## Test plan

- Per sub-phase: `npx vitest run src/features/study/MistakeVault.test.jsx`.
- At phase end: `npm run lint:fix` (per PHASE-02's biome caveat — hand-format the touched file rather than running a repo-wide autofix), then push and let CI run the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate.
- Runtime / next-deploy verification (not CI-gated): on the live deploy, open `#/vault` with no tome (no toast/gold change); populate a vault, clear it, confirm the single legitimate unlock; revisit and confirm no re-grant.

## Acceptance criteria

- The `vault_clear` achievement and `vaultkeeper` title unlock **only** on a real "had ≥1 foe → vault now empty" transition with an active tome.
- No grant on a tomeless `#/vault` visit or on a never-populated vault.
- The legitimate unlock still fires (once) when a populated vault is genuinely cleared.
- `dungeon-scholar-ci.yml` green (full `npm run test` + `npm run build`).

## Out of scope

- The reward machinery (`checkAchievement` / `unlockSpecialTitle` / `ACHIEVEMENT_GOLD`) and the title/achievement definitions — all correct; only the trigger condition changes.
- Reconciling any gold already spuriously granted to existing profiles (a one-time data artifact, not worth a migration) — note it but do not write a save-fixup.
- Any other special-title unlock conditions (`flawless`, `speedrunner`, etc.) — out of scope unless the same effect-before-guard pattern is found there during 06A (if so, log it per INSTRUCTIONS rule 12, don't inline-fix).

## Completed (2026-06-29)

- **06A** `src/features/study/MistakeVault.jsx`: rewrote the unlock effect. The `!courseSet` guard now runs INSIDE the effect (first line) so a tomeless `#/vault` visit grants nothing (the early-return in JSX ran after the hook — Rules of Hooks). Replaced the vacuous `vault.length === 0` trigger with a genuine had-foes→all-banished transition: a per-tome `everHadEntriesRef` is set true while `vault.length > 0` and the reward (`checkAchievement('vault_clear')` + `unlockSpecialTitle('vaultkeeper')`) fires only when the vault then reaches empty with that flag set and an active tome; `lastTomeRef` resets the flag on active-tome change so a tome switch can't read as a clear. Kept `totalAnswered > 10` as a secondary sanity gate. Chose the **in-session ref** variant (plan's safe fallback) over a persisted `banishedCount` to keep the fix self-contained in one component and avoid instrumenting every vault-removal call site; trade-off (noted): a vault emptied entirely in a prior session won't retro-grant — the safe direction (no spurious grants). Reward/grant machinery and title/achievement defs untouched (already correct + idempotent).
- **06B** new `src/features/study/MistakeVault.test.jsx` (4 tests): no grant with `courseSet=null`; no grant on a never-populated vault; exactly one grant (`vault_clear` + `vaultkeeper`) when a populated vault is cleared (populated→empty rerender); no re-grant on a subsequent empty render.
- **Verification:** `npx vitest run src/features/study/MistakeVault.test.jsx` green (4); `npm run lint` exits 0 (0 errors). Full `npm run test` + build gated by CI on push.
