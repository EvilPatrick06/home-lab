# PHASE-47 — Web-build reactivity & data-correctness bugs

> Authored from the 2026-06-22 WEB-build QA report (Dungeon Table Online, v2.4.77). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Fix three correctness bugs the web QA found: (F1) Bastion mutations (create, treasury deposit) persist but the UI doesn't update until a full reload — a **store/web-shim contract mismatch** where the web `saveEntity` returns the saved entity instead of `{ success: true }`, so every store action's `if (result && !result.success)` guard bails *before* the `set(...)` that re-renders; (F2) a saved character sheet shows AC 6 while the builder showed AC 16 after equipping Chain Mail — the builder preview and the saved-sheet AC are computed by two different code paths that disagree, most likely because starting armor lands in inventory **unequipped**; (F3) the in-game Weather roll table posts `[object Object]` to chat because the roll-table formatter's array branch stringifies an object entry instead of reading its display field. F1 is the highest-impact (it silently affects every web-build store that uses `saveEntity` — characters, campaigns, bastions, custom creatures). PLANNING ONLY.

## Dependencies & cross-phase notes

- **No prerequisite phases.** All findings are dnd-app renderer + the web shim + 5e data.
- **F1 is cross-store.** `saveEntity` (web-api.ts) backs `saveCharacter`, `saveCampaign`, `saveBastion`, `saveCustomCreature`, … Fixing its return shape fixes the reactivity for **all** of them at once; verify each consuming store's success-guard. This likely also explains other "didn't update until reload" symptoms beyond Bastion.
- **F2 relationship to PHASE-02 (stat-mutation correctness) & PHASE-08:** AC computation/equip handling is mechanics-adjacent. This phase reconciles the two AC code paths and the starting-armor equip step; keep edits surgical so any mechanics phase's citations stay findable.
- **F3 is data + formatter.** The fix touches the renderer roll-table formatter (`TablesPanel.tsx`); the underlying Weather table data shape is also noted (a secondary range-weighting bug).

## Verified findings

All verification was against the live tree (worktree `auto/phase-maker`).

### F1 (medium, broad) — Bastion (and other) mutations don't re-render until reload

**Status: confirmed; exact root cause in source; cross-store.**

QA: Create Bastion closed the dialog but the sidebar kept showing "No bastions yet" (a second click created a duplicate; a reload then showed **two**). Treasury Deposit 500 GP left the header/Overview at "0 GP"; a reload showed 500. So the data layer persists; the **reactive store update after a mutation is broken** in the web build.

Root cause — a return-shape contract mismatch between the web shim and the store guard:

- **Desktop contract:** `saveBastion(...) → Promise<{ success: boolean }>` (`src/preload/index.d.ts:175`; the main-process `bastion-storage.ts:37` returns a `StorageResult`).
- **Web shim returns the entity, not `{ success }`.** `src/web/web-api.ts:71-76`:
  ```ts
  async function saveEntity(store, entity): Promise<Dict> {
    const id = (entity.id as string) ?? genId()
    const withId = { ...entity, id }
    await idbSet(store, id, withId)
    return withId            // ← has `id`, but NO `success` field
  }
  // saveBastion: (bastion) => saveEntity('bastions', bastion)   (web-api.ts:127)
  ```
- **The store guard bails before `set()`.** `src/renderer/src/stores/bastion-store/index.ts:40-58` `saveBastion`:
  ```ts
  const result = await window.api.saveBastion(bastion as …)
  if (result && !result.success) {            // result = entity (truthy), result.success = undefined → !undefined = true
    logger.error('Failed to save bastion:', (result as …).error)
    return                                     // ← returns BEFORE the set({ bastions }) below
  }
  const { bastions } = get(); … set({ bastions: updated | [...bastions, bastion] })
  ```
  So in the web build every `saveBastion` logs a spurious "Failed to save bastion: undefined" and returns early; the in-memory `bastions` array never updates → the sidebar/Overview/treasury show stale state until a reload re-runs `loadBastions()` (which reads the persisted entity from IndexedDB — hence the data is "there" after reload). `depositGold` (facility-slice.ts:293-301) and `withdrawGold` (303-311) both route through this `saveBastion`, so deposits show the same staleness; and the create path (CreateBastionModal → `saveBastion`) explains the duplicate-on-retry.

`saveEntity` backs multiple stores (`saveCharacter` web-api.ts:103, `saveCampaign` 118, `saveBastion` 127, `saveCustomCreature` 136), so any store with the same `!result.success` guard has the same web-build staleness.

Verification:

```bash
sed -n '69,76p;103,140p' dnd-app/src/web/web-api.ts
sed -n '40,58p' dnd-app/src/renderer/src/stores/bastion-store/index.ts
sed -n '290,312p' dnd-app/src/renderer/src/stores/bastion-store/facility-slice.ts
grep -n "result.success\|!result.success\|success:" dnd-app/src/renderer/src/stores -r | head
grep -n "saveBastion" dnd-app/src/preload/index.d.ts
```

**Fix (prefer the shim — fixes all stores at once):** make `saveEntity` return a result that satisfies the `{ success: boolean }` contract while still exposing the id, e.g. `return { success: true, id }` (or `{ ...withId, success: true }` if any caller reads the entity back). Audit each consuming store's success-guard so the new shape passes and `set()` runs. Add a test asserting the web `saveBastion`/`saveCharacter` resolve `{ success: true }` and that the store updates in-memory after a save.

### F2 (medium) — saved AC 6 vs builder AC 16 after equipping Chain Mail

**Status: confirmed divergence; two AC code paths; most-likely cause identified (verify at implementation).**

QA built a level-1 Dwarf Fighter, chose the "Chain Mail, Greatsword, Flail, 8 Javelins" starting-equipment option; the builder header showed **AC 16** (Chain Mail base AC), but the saved sheet **and** the character-list card show **AC 6**. AC 6 is neither Chain Mail (16) nor unarmored (10 + Dex).

There are **two AC computations** that must agree but are separate code:

- **Builder preview** uses `stat-calculator-5e.ts` → `calculateArmorClass5e({ armor, dexMod, … })` (stat-calculator-5e.ts:150), surfaced as `stats5e.armorClass` and shown in `CharacterSummaryBar5e.tsx:331` (`const ac = stats5e?.armorClass ?? '--'`). With equipped Chain Mail (`acBonus 16`, `dexCap 0`) this yields 16.
- **Saved sheet / list card** uses `ac-calculator.ts` → `computeDynamicAC(character)` (ac-calculator.ts:10): `const equippedArmor = armor.find(a => a.equipped && a.type === 'armor')`; if found, `ac = equippedArmor.acBonus + cappedDex`; **else** (no equipped armor) it takes the unarmored branch `Math.max(10 + dexMod, …class options)`.

Chain Mail data is `{ name: "Chain Mail", category: "Heavy", ac: "16" }` (`src/renderer/public/data/5e/equipment/armor/heavy/chain-mail.json`), and `ac` is a **string** — relevant if any path parses it loosely.

**Most likely root cause:** the starting-equipment Chain Mail is placed in inventory **unequipped** on save, so `computeDynamicAC` finds no equipped armor and falls to the unarmored branch — `10 + dexMod`. For the saved value to read 6, `dexMod` would be −4 (i.e. `abilityModifier(2)`), which points at a Dex/ability-score read problem on the saved character (the saved `abilityScores.dexterity` not matching what the builder previewed), OR the `acBonus`/string-`ac` shape being mishandled so the equipped path produces 6. The exact "6" must be pinned at implementation by reproducing the build → save → inspect the saved character JSON (`abilityScores`, the armor entry's `equipped`/`acBonus`/`type`). Either way the defect is the **divergence**: the builder preview (`calculateArmorClass5e`) and the saved-sheet calc (`computeDynamicAC`) disagree, and starting armor's equipped state isn't consistent between them.

Verification:

```bash
cat dnd-app/src/renderer/src/utils/ac-calculator.ts
sed -n '150,200p' dnd-app/src/renderer/src/services/character/stat-calculator-5e.ts
sed -n '1,10p' dnd-app/src/renderer/public/data/5e/equipment/armor/heavy/chain-mail.json
grep -n "armorClass\|stats5e" dnd-app/src/renderer/src/components/builder/5e/CharacterSummaryBar5e.tsx
grep -rn "equipped" dnd-app/src/renderer/src/stores/level-up dnd-app/src/renderer/src/stores/use-character-store.ts | head
```

**Fix:**

1. Reconcile the two AC paths so the builder preview and the saved sheet always agree — ideally the sheet/list call the **same** calculator the builder uses (`calculateArmorClass5e`), or `computeDynamicAC` and `calculateArmorClass5e` are unified behind one function that both consume. Note the existing comment on `computeDynamicAC` ("Mirrors the logic in CombatStatsBar") — there are at least three copies of this logic; collapse them.
2. Ensure starting/selected armor is **equipped (or counted) consistently** when a character is saved from the builder, so `computeDynamicAC`'s `equipped` filter sees the Chain Mail. If starting equipment is intentionally unequipped, the saved AC must still match the builder's displayed value (don't show 16 in the builder and 6 on the sheet).
3. Guard the string-`ac` shape (parse `ac: "16"` to a number where the armor entry is built) so no path silently coerces it.

**Acceptance:** build a level-1 Dwarf Fighter with the Chain Mail option → save → the sheet AND the list card show the **same** AC as the builder header (16 with Chain Mail equipped); a unit test pins `computeDynamicAC`/`calculateArmorClass5e` agreement for an equipped-heavy-armor character; no NaN/`[object]`/string-AC leakage.

### F3 (medium) — Weather roll table outputs "[object Object]"

**Status: confirmed; exact root cause + a secondary correctness bug.**

QA: in-game Tables → Weather → Roll posts `"[weather] 1d5 = 2 — [object Object]"`, while other tables format correctly (NPC Traits → "…7 — Great at solving puzzles"). Root cause in `src/renderer/src/components/game/sidebar/TablesPanel.tsx`:

- The table normalizer (TablesPanel.tsx:33-58) classifies a bare JSON **array** as `type: 'array'`. The `weather` table in `src/renderer/public/data/5e/encounters/random-tables.json:330-356` is a 5-element array of **objects** (`{ d20Min, d20Max, condition }`), so it is typed `'array'`.
- The array branch of `rollOnTable` (TablesPanel.tsx:84-92) does:
  ```ts
  const arrayData = table.data as string[]      // ← wrong: entries are objects
  const roll = cryptoRollDie(arrayData.length)  // 1d5
  result = arrayData[roll - 1]                  // an OBJECT
  rollInfo = `1d${arrayData.length} = ${roll}`  // "1d5 = 2"
  ```
  then the chat line (TablesPanel.tsx:142) `…— ${result}` coerces the object → `[object Object]`. (The `diceTable` and `nested` branches do `String(matchedEntry[...])` / `String(subTable[...])`, which is why NPC Traits works.)

**Secondary bug:** the Weather entries are a **d20-range** table (`d20Min`/`d20Max`, ranges 1-14, 15-17, 18, 19-20, 20), but because it's a bare array (not `{ entries: [...] }`) the normalizer rolls 1d5 by **count**, ignoring the weighting — each of the 5 rows is equally likely instead of the intended d20 distribution.

Verification:

```bash
sed -n '33,58p;73,145p' dnd-app/src/renderer/src/components/game/sidebar/TablesPanel.tsx
sed -n '330,356p' dnd-app/src/renderer/public/data/5e/encounters/random-tables.json
```

**Fix:**

1. **In-scope (display):** in the array branch, if `arrayData[roll-1]` is an object, extract a display field (e.g. the first non-range key — `condition` for Weather, mirroring the diceTable branch's "first key that isn't `roll`") and `String(...)` it; if it's a string, use it as-is. This makes Weather show its condition text instead of `[object Object]` while leaving plain-string array tables unchanged.
2. **Related correctness (recommended):** teach the normalizer to recognize a min/max-keyed object array (`d20Min`/`d20Max`, `d100Min`/… ) as a range table and roll on the range (respecting the weighting), so Weather rolls 1d20 across its ranges rather than 1d5 by count. If this is larger than the display fix, land (1) and log (2) per `docs/LOG-INSTRUCTIONS.md` (`docs/ISSUES-LOG-DNDAPP.md`).

**Acceptance:** rolling Weather posts the condition text (e.g. "Normal for the season"), never `[object Object]`; existing string-array and diceTable/nested tables are unchanged; a unit test covers an object-array table and a string-array table.

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` on the changed surface + the affected vitest file. CI runs the full gate on push. Tests already exist for several targets (`use-bastion-store.test.ts`, `ac-calculator.test.ts`, `SpellsTab5e.test.tsx`) — extend them.

### 47A — Web `saveEntity` honors the `{ success }` contract (F1)

**Objective:** web-build store mutations re-render immediately, across all `saveEntity`-backed stores.

**Files:** `dnd-app/src/web/web-api.ts`; verify guards in `dnd-app/src/renderer/src/stores/bastion-store/index.ts`, `…/stores/use-character-store.ts`, `…/stores/use-campaign-store*`, and any store reading `result.success`; tests under `…/stores/*.test.ts`.

**Steps:**

1. Change `saveEntity` (web-api.ts:71-76) to return `{ success: true, id }` (or `{ ...withId, success: true }` if a caller needs the entity), so `if (result && !result.success)` passes and the store's `set(...)` runs.
2. Audit every consuming store's success-guard for the new shape; fix any that read other fields (e.g. an `error` on failure — preserve a failure path by returning `{ success: false, error }` from `saveEntity`'s catch if any).
3. Tests: web `saveBastion`/`saveCharacter` resolve `{ success: true }`; after `saveBastion`, the store's `bastions` array contains the new/updated entity without a reload; a deposit updates `treasury` in-memory.

**Acceptance:** vitest green; `tsc` clean; in the web build, create/deposit/withdraw reflect immediately (no reload); no spurious "Failed to save … undefined" logs; desktop path unchanged.

### 47B — Reconcile builder vs saved-sheet AC + starting-armor equip (F2)

**Objective:** the saved sheet/list AC always equals the builder preview.

**Files:** `dnd-app/src/renderer/src/utils/ac-calculator.ts`, `dnd-app/src/renderer/src/services/character/stat-calculator-5e.ts`, the builder save / starting-equipment handling (`…/stores/use-character-store.ts` / builder equipment), `ac-calculator.test.ts`.

**Steps:**

1. Reproduce: build the Dwarf Fighter + Chain Mail option, save, inspect the saved character JSON (`abilityScores.dexterity`, the armor entry's `equipped`/`type`/`acBonus`) to pin the exact "6".
2. Unify the AC computation: have the sheet/list call the same calculator as the builder (or extract one shared function); remove the duplicated logic (`computeDynamicAC` "mirrors CombatStatsBar" — collapse).
3. Ensure starting/selected armor is equipped/counted consistently on save; parse the string `ac` to a number where the armor entry is constructed.
4. Test: an equipped-Chain-Mail character yields AC 16 from both paths; an unarmored character yields `10 + dexMod` from both; no string/NaN leakage.

**Acceptance:** builder header AC === saved sheet AC === list-card AC for the Chain Mail Fighter (and a couple of other armor cases); unit test pins agreement; `tsc` clean.

### 47C — Roll-table formatter handles object array entries (F3)

**Objective:** Weather (and any object-array table) shows its text, not `[object Object]`.

**Files:** `dnd-app/src/renderer/src/components/game/sidebar/TablesPanel.tsx`; a vitest for the formatter; (optional) `random-tables.json` is data — leave shape, fix the formatter.

**Steps:**

1. In the array branch (TablesPanel.tsx:84-92), if the rolled entry is an object, pick a display field (first key that isn't a range key like `d20Min`/`d20Max`/`d100Min`/`d100Max`/`roll`) and `String(...)` it; strings pass through unchanged.
2. (Recommended) Extend the normalizer to detect min/max-keyed object arrays as range tables and roll on the range with weighting; if larger, land step 1 and log the range-weighting bug per `docs/ISSUES-LOG-DNDAPP.md`.
3. Test: an object-array table (Weather-shaped) posts the `condition` text; a string-array table is unchanged; a diceTable/nested table is unchanged.

**Acceptance:** Weather roll posts the condition string, never `[object Object]`; other tables unaffected; vitest green.

## Completed

- 47A — DONE (2026-06-23) (`src/web/web-api.ts`, `src/web/web-save-contract.test.ts`) — web `saveEntity` now returns `{ ...withId, success: true }` instead of the bare entity, satisfying the desktop `{ success }` StorageResult contract. This fixes bastion-store's `if (result && !result.success)` guard (which was bailing before `set()` → stale sidebar/treasury until reload + duplicate-on-retry). Verified the persisted record is NOT polluted with `success` (it's return-only) and character-store (which already guarded `'success' in result`) is unaffected. New test: saveBastion/saveCharacter/saveCampaign/saveCustomCreature all resolve `{ success:true }` with the id still exposed.
- 47B — DONE (2026-06-23) (`src/renderer/src/utils/ac-calculator.ts`, `components/sheet/5e/CombatStatsBar5e.tsx`, `services/io/import-dnd-beyond/inventory.ts`, `services/io/import-foundry.ts`, `utils/ac-calculator.test.ts`) — **root cause re-diagnosed (the plan's "unequipped armor" hypothesis was wrong):** the armor IS equipped; the two readers `computeDynamicAC` + `CombatStatsBar5e` computed `acBonus + dex` (treating `acBonus` as the full AC), but the builder + canonical `calculateArmorClass5e` use the **bonus-over-10** convention (`build-from-equipment-5e` stores `baseAC - 10`; the calculator does `10 + acBonus`). So an equipped Chain Mail (acBonus 6) rendered 6 on the sheet/list vs 16 in the builder. Fix: added the missing base `10` to both readers (canonical convention) AND aligned the two importers (D&D Beyond `def.armorClass`, Foundry `armor.value`) to store `baseAC - 10` for body armor (shields keep their flat bonus) so imported characters don't regress under the corrected reader. Updated the AC test inputs to bonus values + added an explicit QA-scenario regression (Chain Mail acBonus 6 → AC 16). 51 AC tests green.
- 47C — DONE (2026-06-23) (`components/game/sidebar/table-entry-format.ts` + `.test.ts`, `TablesPanel.tsx`) — extracted `formatTableEntry()`: a rolled object entry (e.g. Weather `{ d20Min, d20Max, condition }`) now renders its first non-range display field instead of `[object Object]`; plain-string array tables and the diceTable/nested branches are unchanged. The secondary d20-range-weighting bug (Weather rolled 1d5 by count, not weighted by range) is logged to `docs/ISSUES-LOG-DNDAPP.md` per the plan's "land (1), log (2)" allowance. New test: object-array → condition text, string-array unchanged, range-only object → fallback, null/number handled.

_Implemented 2026-06-23 from WEB-QA-report-2026-06-22._
