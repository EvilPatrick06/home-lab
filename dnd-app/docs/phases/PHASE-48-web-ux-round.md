# PHASE-48 — Web-build UX round

> Authored from the 2026-06-22 WEB-build QA report (Dungeon Table Online, v2.4.77). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Close the four UX gaps the web QA found (none data-destructive at the storage layer, all hurt usability): (F1) leaving the character builder mid-build discards the draft with no "unsaved changes" confirmation; (F2) the builder Spells tab freezes the renderer ~30s when switching to level 10 + opening the full Wizard spell list (non-virtualized long checkbox list); (F3) rebinding a key to an already-used key gave the QA no conflict warning / swap-or-cancel and silently reverted — **but a conflict+swap system already exists in the live tree**, so this is a verify-and-close-the-gap task, not build-from-scratch; (F4) the Create Bastion dialog dead-ends a new user (Create stays disabled with no inline "create a character first" guidance when no characters exist). A small related observation: the default keybindings JSON has a duplicate binding (`c`). PLANNING ONLY.

## Dependencies & cross-phase notes

- **No prerequisite phases.** All findings are dnd-app renderer (+ one data file).
- **F3 is verify-first.** The keybinding conflict/swap machinery (`keyboard-shortcuts.ts` `hasConflict`, SettingsPage rebind handler + swap UI) already exists — reproduce the QA case against the live build before writing new code (it may be already fixed, or the gap is narrow). Follows the PHASE-17 "ALREADY FIXED / verify-against-live-tree" precedent.
- **F2 (virtualization)** is a feature-ish change but executed like any other sub-phase (INSTRUCTIONS rule 10: feature phases are not special). The 4-gate is the available verification; the 30s freeze itself needs a running app to confirm post-fix — implement per plan, gate, move on.
- **Relationship to PHASE-47:** F4's Create-Bastion modal is the same modal whose owner-gating PHASE-47 F1 touches indirectly (the reactivity fix). Keep the empty-state CTA additive.

## Verified findings

All verification was against the live tree (worktree `auto/phase-maker`).

### F1 (medium) — leaving the builder mid-build silently discards the draft (no confirmation)

**Status: confirmed; the existing `draftPrompt` is unrelated.**

QA: after building a level-10 Wizard (class, background, species, ability scores, skills, 5 cantrips, 6 prepared spells) but before saving, clicking "← Back" returned to Your Characters and **silently discarded the entire draft** — no "discard unsaved changes?" prompt, list still empty. Easy to lose substantial work on a mis-click.

`CreateCharacterPage.tsx` has a `draftPrompt` state (line 24) but it is **not** an unsaved-changes guard on builder exit — it is set true only at `phase === 'system-select' && !id && resolvedSystem === 'dnd5e'` (lines 44, 57), i.e. the resume-an-existing-draft prompt shown at the system-select step (discard button at line 124). The in-builder "← Back" button (rendered by the builder component, not this page) has no dirty-state guard. So a substantially-built, unsaved character is discarded on Back with no confirmation.

Verification:

```bash
grep -n "draftPrompt\|phase ===\|discard\|navigate(\|Back" dnd-app/src/renderer/src/pages/CreateCharacterPage.tsx
grep -rn "← Back\|onBack\|Back\b" dnd-app/src/renderer/src/components/builder -l
```

**Fix:** add an unsaved-changes guard on builder exit/navigation-away — track a `dirty` flag in the builder store (set on any field change after the initial hydrate, cleared on save), and on "← Back" (and any route-away) show a confirm dialog ("You have unsaved changes — discard?") when `dirty`. Alternatively (or additionally) autosave a draft so Back never loses work. Reuse the existing `ConfirmDialog` and the `discard` i18n string where possible.

### F2 (low/perf) — builder Spells tab freezes ~30s at level 10 (non-virtualized list)

**Status: confirmed by inspection; the spell lists are rendered with plain `.map`, not virtualized.**

QA: setting Level to 10 (Wizard) and opening the **Spells** tab (full Wizard list — cantrips + 31 first-level + higher levels, all checkboxes) froze the renderer long enough that a CDP screenshot call timed out at 30s; it recovered after a few seconds. The likely cause is synchronous render of a large unvirtualized checkbox list on the level-10 recompute.

The builder spell UI maps spells directly: `SpellPicker5e.tsx:68` `spellLevels.map((level) => …)` → `:83` `spells.map((spell) => …)`; `SpellSummary5e.tsx:126,133` `grouped.map(...)` → `spells.map(...)`; `SpellsTab5e.tsx:260,303` `.map(...)`. None use a virtualization primitive (`grep -n "react-window\|FixedSizeList\|virtuali"` in `components/builder/5e/*pell*` → no hits). At level 10 the rendered checkbox count is large enough to jank the main thread on the recompute.

Verification:

```bash
grep -n "\.map(" dnd-app/src/renderer/src/components/builder/5e/SpellPicker5e.tsx dnd-app/src/renderer/src/components/builder/5e/SpellSummary5e.tsx dnd-app/src/renderer/src/components/builder/5e/SpellsTab5e.tsx
grep -rn "react-window\|FixedSizeList\|virtuali" dnd-app/src/renderer/src/components/builder/5e
```

**Fix:** virtualize the long spell list (e.g. `react-window` `FixedSizeList`, if already a dependency — else memoize aggressively first) and/or defer/debounce the per-level spell recompute so the level-change doesn't synchronously re-render the whole list. Memoize the per-level spell computation (`useMemo` keyed on class+level) so toggling a checkbox doesn't recompute the full set. Confirm with React DevTools profiling that the level-10 → Spells tab interaction no longer blocks the main thread for seconds. (Note: the prior desktop QA "level-10 caps stuck at 3/4" High bug does **not** reproduce in web v2.4.77 — caps scale correctly; this is purely the render-perf issue.)

### F3 (low) — rebind to an in-use key: no conflict warning, silent revert (VERIFY — machinery exists)

**Status: needs reproduction against the live build — a full conflict+swap system already exists; the QA-observed gap may be partial or already fixed.**

QA: rebinding "Toggle Journal" to a free key ("Y") worked, but rebinding it to **"T"** (already "Open Dice Roller (Throw)") produced no conflict prompt and Toggle Journal reverted to default "J".

The live tree **does** implement conflict detection + a swap/cancel flow:

- `src/renderer/src/services/keyboard-shortcuts.ts:78-95` `hasConflict(action, combo)` scans `getEffectiveShortcuts()` (DEFAULT_SHORTCUTS merged with custom) and returns `{ conflicting, conflictAction, conflictDescription }`.
- `SettingsPage.tsx:160-181` rebind handler: on `result.conflicting` it `setConflict(...)` + `setPendingCombo(combo)` and renders a conflict modal (`SettingsPage.tsx:264-267`, `keyConflict` message) with a `handleSwap` (lines 177-192) that reassigns the conflicting action's binding and swaps.
- Both actions are in the same default set: `src/renderer/public/data/ui/keyboard-shortcuts.json` — `{ "key": "j", "action": "toggle-journal" }` (line 16) and `{ "key": "t", "action": "open-dice", "description": "Open Dice Roller (Throw)" }` (line 20). So `hasConflict("toggle-journal", {key:"t"})` *should* return conflicting and the swap modal *should* appear.

So either the QA tested a build before this landed, or there's a narrow residual gap (e.g. the conflict modal appeared but the automated harness didn't confirm the swap, so on dismissal the binding reverted; or the capture handler's single-letter handling; or cancel reverts to *default* rather than keeping the prior binding). **The phase's job is to reproduce the exact QA steps against the live build and either mark it FIXED (no work) with the verification, or fix the precise residual gap.**

Verification:

```bash
sed -n '78,96p' dnd-app/src/renderer/src/services/keyboard-shortcuts.ts
sed -n '150,200p;258,275p' dnd-app/src/renderer/src/pages/SettingsPage.tsx
grep -n "toggle-journal\|open-dice\|\"key\": \"t\"\|\"key\": \"j\"" dnd-app/src/renderer/public/data/ui/keyboard-shortcuts.json
```

**Fix (if a gap remains):** ensure the conflict modal is presented for the exact "T"/Open-Dice case with clear swap/cancel; ensure **cancel keeps the prior binding** (not a revert to default); ensure the conflict scan covers the full set of bound keys (if any action lives outside DEFAULT_SHORTCUTS, unify the registries so cross-registry collisions are detected). If reproduction shows it already works, record FIXED with the steps.

### F4 (info/UX) — Create Bastion dialog dead-ends a new user (no characters)

**Status: confirmed.** The Create Bastion dialog requires both a name and an Owner character: `src/renderer/src/pages/bastion/CreateBastionModal.tsx:26` `if (!newName.trim() || !newOwnerId) return`, and the Create button is `disabled={!newName.trim() || !newOwnerId}` (line 73). With no saved characters the Owner dropdown (lines 51-56, `characters.map(...)`) has only the placeholder, so Create stays disabled with **no inline guidance** to go create a character first. (Per the 2024 DMG a bastion belongs to a PC, so requiring an owner is correct — this is a discoverability nit, not a bug.)

Verification:

```bash
sed -n '20,80p' dnd-app/src/renderer/src/pages/bastion/CreateBastionModal.tsx
```

**Fix:** when `characters.length === 0`, render an empty-state hint/CTA in the dialog ("You need a character first — Create one") that links to the character builder, instead of only a disabled Create button.

### F5 (info, related) — duplicate default keybinding (`c`)

**Status: observation.** `keyboard-shortcuts.json` binds `c` twice: `{ "key": "c", "action": "focus-chat" }` (line 15) and a second `{ "key": "c", … }` (line 30). Two actions on the same default key is a latent conflict (whichever the handler matches first wins). Worth a one-line data fix (reassign one) as part of the keybinding sub-phase, or log per `docs/ISSUES-LOG-DNDAPP.md`.

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` on the changed surface + the affected vitest file (`SpellsTab5e.test.tsx`, `CreateBastionModal.test.tsx` exist). CI runs the full gate on push. Runtime-only effects (the 30s freeze, the conflict modal) are verified by the 4-gate + the implementer's repro; do not stop for "needs a running app".

### 48A — Unsaved-changes guard on builder exit (F1)

**Objective:** leaving the builder with unsaved work prompts before discarding.

**Files:** the builder store (dirty flag), the builder component's "← Back"/navigation handler, `dnd-app/src/renderer/src/pages/CreateCharacterPage.tsx`, reuse `ConfirmDialog`; a test.

**Steps:**

1. Track a `dirty` flag in the builder store: set on the first field change after hydrate, clear on save/load.
2. On "← Back" / route-away while `dirty`, show a confirm dialog (discard / keep editing); only navigate on confirm. (Optionally autosave a draft as a belt-and-suspenders.)
3. Test: a dirty builder shows the confirm on Back and does not navigate on cancel; a clean/just-saved builder navigates immediately.

**Acceptance:** vitest green; `tsc` clean; a substantially-built unsaved character is no longer lost on a single Back click; saved/clean exits are unprompted.

### 48B — Virtualize / debounce the builder Spells list (F2)

**Objective:** level-10 → Spells tab no longer blocks the main thread for seconds.

**Files:** `dnd-app/src/renderer/src/components/builder/5e/SpellPicker5e.tsx`, `SpellsTab5e.tsx`, `SpellSummary5e.tsx`; `SpellsTab5e.test.tsx`.

**Steps:**

1. Virtualize the long spell checkbox list (prefer `react-window` if present; otherwise add it, or memoize + windowed rendering manually).
2. Memoize the per-level spell computation (`useMemo` keyed on class ids + level) so a checkbox toggle doesn't recompute/re-render the whole set; debounce the level-change recompute if needed.
3. Test what the 4-gate can: the Spells tab renders the expected spells at level 10 (correctness preserved) and the memoization keys are stable; profile the freeze manually post-merge.

**Acceptance:** vitest green; `tsc` clean; the level-10 Spells interaction renders without the seconds-long freeze (implementer-verified with the running build); spell-selection correctness unchanged.

### 48C — Verify/close the keybinding conflict gap + fix the duplicate default (F3 + F5)

**Objective:** rebinding to an in-use key always shows a conflict/swap (or keeps the prior binding on cancel); no duplicate default key.

**Files:** `dnd-app/src/renderer/src/services/keyboard-shortcuts.ts`, `dnd-app/src/renderer/src/pages/SettingsPage.tsx`, `dnd-app/src/renderer/public/data/ui/keyboard-shortcuts.json`; tests for `hasConflict`.

**Steps:**

1. Reproduce the QA steps (rebind Toggle Journal → "T") against the live build. If the swap modal appears correctly, record FIXED here with the verification and limit work to F5.
2. If a gap remains: ensure the conflict modal presents for the case, cancel keeps the **prior** binding (not default), and the conflict scan covers all bound keys (unify registries if an action lives outside DEFAULT_SHORTCUTS).
3. F5: reassign one of the two `c` defaults (line 15 vs line 30) so no default key is bound twice; add/adjust a test that no two DEFAULT_SHORTCUTS share an identical key+modifier combo.

**Acceptance:** rebinding to an in-use key shows a clear conflict/swap and never silently reverts; cancel preserves the prior binding; `keyboard-shortcuts.json` has no duplicate key+modifier; `hasConflict` test covers the Toggle-Journal→T case.

### 48D — Create Bastion empty-state CTA (F4)

**Objective:** a new user with no characters gets guidance instead of a dead-end.

**Files:** `dnd-app/src/renderer/src/pages/bastion/CreateBastionModal.tsx`; `CreateBastionModal.test.tsx`.

**Steps:**

1. When `characters.length === 0`, render an empty-state hint/CTA ("Create a character first") that navigates to the character builder, in place of (or above) the disabled Owner dropdown + Create button.
2. Keep the owner requirement (DMG-correct) when characters exist.
3. Test: with zero characters the CTA renders; with characters the normal owner-select + enabled Create renders.

**Acceptance:** vitest green; `tsc` clean; the empty-character case shows actionable guidance; the normal case is unchanged.

## Completed

_None yet — planning authored 2026-06-23 from WEB-QA-report-2026-06-22._
