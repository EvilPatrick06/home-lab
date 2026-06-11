# PHASE-02 — Stat-mutation correctness

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the AI DM's character stat-mutation pipeline (`dnd-app/src/main/ai/stat-mutations.ts` and its IPC/renderer edges) correct against the **v4 character schema** that has been live since `CURRENT_SCHEMA_VERSION` was flipped to 4. Today `add_condition` throws a TypeError on every current character (killing the whole mutation batch silently), `remove_condition`/`reduce_exhaustion` always reject, `set_equipped` is dead for weapons/armor, the AI never sees a character's conditions in its context, unvalidated numeric payloads can persist `hp.current = null`, a long rest silently fails to clear temporary HP (and restores only half the hit dice, a 2014-rules leftover), and a multiclass Warlock's Pact Magic slots alias into the regular slot pool on every rest. This phase fixes all of it with a v4-aware condition layer, hard numeric validation at both the IPC boundary and the apply step, an honest long-rest pipeline, and explicit pool targeting for spell slots.

## Dependencies & cross-phase notes

- **No prerequisite phases** (index row 02: depends on “—”; phases 1–19 are intentionally independent).
- **PHASE-04 (ai-store approval hygiene)** owns `MutationApprovalPanel.tsx` `changeLabel()` and `use-ai-dm-store.ts` queue hygiene. This phase adds one new internal `StatChange` member (`clear_temp_hp`) that is **not** emitted by the AI and never enters the approval queue, and one optional field (`pool`) on the spell-slot changes. Do not touch `MutationApprovalPanel.tsx` here; PHASE-04 will pick up labels for `pool`-tagged slots if desired.
- **PHASE-08 (executor batch correctness)** deletes dead duplicate executors in `creature-actions.ts:106-458`. This phase reads (does not modify) the **live** rest executors in the same file at `creature-actions.ts:582-685` — no collision, but be aware both phases cite that file.
- **PHASE-11 (prompt-schema contract)** edits `src/main/ai/prompt-sections/*.ts`. This phase adds the `pool` field documentation to `character-rules.ts:71-72`; PHASE-11 executes later and rebases on it.
- **PHASE-12 (i18n wording sweep)** — this phase adds two renderer i18n keys (en + es); keep naming consistent with `notify.aiDmStore.*`.
- **PHASE-30 (combat automation)** builds on mutation plumbing; nothing here blocks it.
- Files also touched by other phases for OTHER reasons: `use-game-effects.ts` (PHASE-05 listener lifecycle, PHASE-04 approval). This phase only changes the `applyStatChangesDirectly` result handling inside it (lines around 77-79).

## Verified findings

All claims below were re-verified against the live tree on 2026-06-10. Line numbers cited are from that verification; re-run the commands to re-confirm before editing (INSTRUCTIONS.md rule 3).

### F1 — `add_condition` always throws for v4 characters; `remove_condition`/`reduce_exhaustion` always reject; the whole batch dies silently (bug/critical)

**The v4 schema strips inline `conditions` from every persisted character.**

- `src/main/storage/migrations.ts:9` — `export const CURRENT_SCHEMA_VERSION = 4`. `MIGRATIONS[4]` (`migrations.ts:29-34`) calls `migrateCharacter5eToRefs` for `gameSystem === 'dnd5e'`.
- `src/shared/migrations/v4-character-refs.ts:119-129` derives `conditionRefs` (`{instanceId, ref:{entryType:'conditions', entryId: <lowercased, spaces→hyphens slug>}}`, **no overrides**) and `:192-200` deletes the inline v3 arrays — `delete out.conditions` is line 200.
- `src/main/storage/character-storage.ts:221` — `loadCharacter` runs `migrateData(parsed)` on every load, so any pre-v4 file is stripped at read time; already-v4 files were stripped at save time by the renderer (`use-character-store.ts:205-263` rebuilds via `migrateCharacter5eFromV3ToV4`, which delegates to the same shared core — `src/renderer/src/types/character-5e-migration.ts:15-17`).
- Therefore in `stat-mutations.ts`, `char.conditions` is `undefined` for effectively all characters.

**Consequences in `src/main/ai/stat-mutations.ts`:**

- `validateChange` `add_condition` (`:108-113`) reads `char.conditions || []` → passes (no duplicate found); `applyChange` (`:249-258`) then does `const conditions = char.conditions!` followed by `conditions.push(...)` → **TypeError on undefined**.
- The throw escapes `applyMutations`' loop (`:503-511` has no try/catch), unwinds **before** the `saveCharacter` at `:513-516`, so every already-applied change in the same batch is discarded.
- The throw is swallowed by the IPC wrapper: `src/main/ipc/_safe.ts:22-35` (`safeHandler` catches, logs, returns `{success:false, error}`); the renderer caller ignores the result entirely — `src/renderer/src/hooks/use-game-effects.ts:77-79` (`window.api.ai.applyMutations(charId, changes)` fire-and-forget inside `applyStatChangesDirectly`, which starts at `:37`). Fully silent for the user.
- `remove_condition` validation (`:114-119`) and `reduce_exhaustion` validation (`:196-199`) read the same stripped array → always reject (“Does not have condition”, “No exhaustion to reduce”).
- The Phase 28d comment at `:84-88` claims `CURRENT_SCHEMA_VERSION === 3` and that the v4 migration is “dormant until v3.0.0” — **stale**; it is 4 and active (`migrations.ts:3-9` documents the flip).
- `applyLongRestMutations`' exhaustion probe (`:594-599`) also reads `char.conditions` → the PHB-2024 “long rest reduces Exhaustion by 1” change is never generated.

**Verification commands (re-run before editing):**

```bash
grep -n "CURRENT_SCHEMA_VERSION = " dnd-app/src/main/storage/migrations.ts          # = 4
grep -n "delete out.conditions" dnd-app/src/shared/migrations/v4-character-refs.ts  # :200
sed -n '108,119p;249,261p;196,199p;594,599p' dnd-app/src/main/ai/stat-mutations.ts
sed -n '84,88p' dnd-app/src/main/ai/stat-mutations.ts                               # stale comment
grep -n "applyMutations(charId, changes)" dnd-app/src/renderer/src/hooks/use-game-effects.ts  # :78, no await/result use
```

**Corrections / blast radius beyond the original report (all verified):**

1. **`add_exhaustion` “works” but writes an invisible stray field.** `applyChange` (`:414-425`) creates `char.conditions = []` when missing and pushes an inline condition with `value`. That persists a v3 field on a v4 record that **no renderer reader consumes** — `getEffectiveConditions` (`src/renderer/src/services/character/effective-character-5e.ts:169-177`) hydrates only `conditionRefs`. The exhaustion never appears on the sheet, and the next renderer condition edit (which rebuilds from `getEffectiveConditions` + sets `conditionRefs: undefined`, `use-character-store.ts:205-263`) erases it.
2. **`set_equipped` is dead for weapons and armor.** Validation (`:202-208`) and apply (`:426-435`) iterate `char.equipment` / `char.armor` / `char.weapons`; `armor`/`weapons` are v4-stripped (`v4-character-refs.ts:196-197`), so only inline `equipment` items can be toggled — a weapon/armor toggle is rejected “No item named …”. v4 equipped state lives in `state.weaponEquipped`/`state.armorEquipped` keyed by `instanceId` (`src/shared/types/character-5e.ts:35-41`), and weapon/armor refs **always carry the full inline object as `ref.overrides`** (BUG-2 fix, `v4-character-refs.ts:92-109`), so names are recoverable main-side without the library.
3. **The AI never sees character conditions.** `src/main/ai/character-context.ts:42` (abbreviated block) and `:236-248` (full sheet block) read `char.conditions` — always empty for v4. The AI cannot know what to `remove_condition` or when to expire a duration. (Same file also reads stripped `knownSpells`/`preparedSpellIds` `:137-144`, `armor` `:168-177`, `weapons` `:179-184`, `feats` `:225-228` — that context-fidelity gap is **out of scope** here; log it, see 02F.)
4. **Condition `value`/`duration` have no v4 home — by explicit 15c.5 decision, now reversed by this phase.** `use-character-store.ts:250-251` (“condition `value` (e.g. exhaustion level) has no v4 home; the value is dropped on the shim”), `rest-service-5e.ts:248-250` and `:404-405` (renderer long-rest exhaustion reduction dropped), and the pinned test `rest-service-5e.test.ts:194-206` (“does not report exhaustion level from v4 conditions”). Also: `hydrate` (`effective-character-5e.ts:22-46`) **drops** any ref with neither a library entry nor overrides — and since condition refs carry no overrides and the library `conditions` bucket is not guaranteed to contain every slug, custom/AI-added conditions can vanish on hydration. Carrying `{name, value, duration, …}` as ref `overrides` (this phase's fix) makes persistence robust regardless of library content, because `hydrate`'s orphan branch (`:36-39`) hydrates from overrides alone.

### F2 — `AI_APPLY_MUTATIONS` accepts unvalidated changes; `damage` without a numeric value persists `hp.current = null` (bug/high)

- `src/main/ipc/ai-handlers.ts:259-271` — the handler signature is `async (_event, characterId: string, changes: StatChange[])`; **no zod parse** of `changes` (contrast `AI_CONFIGURE` at `:104-110` which parses with `AiConfigSchema`). The preload forwards `changes: unknown[]` (`src/preload/index.ts:92-93`).
- `validateChange` numeric gates rely on NaN-poisoned comparisons: `damage`/`heal` `change.value <= 0` (`:102-105`) — `undefined <= 0` is `false`, so a value-less damage **passes**; `temp_hp` `change.value < 0` (`:106-107`) passes; `gold` (`:142-147`) `current + undefined < 0` is `false` → passes; `xp` (`:148-149`) passes; `hit_dice` (`:167-175`) `NaN < 0`/`NaN > max` both false → passes; `set_ability_score` (`:187-192`) `NaN < 1`/`NaN > 30` both false → **passes the range check**.
- Apply then poisons state: `hp.current = Math.max(0, hp.current - undefined)` → `NaN` (`:224-233`); `hp.temporary = Math.max(hp.temporary, undefined)` → `NaN` when temp > 0 (`:244-247`); `treasure[denom] = Math.max(0, x + undefined)` → `NaN` (`:308-313`); `char.xp = x + undefined` → `NaN` (`:314-317`). `JSON.stringify` serializes `NaN` as `null`, so `character-storage.ts:105` persists `hp.current: null` to disk.
- The AI-text parse path is **already protected**: `[STAT_CHANGES]` blocks go through `validateStatChanges` (`src/main/ai/ai-schemas.ts:1412-1434`) whose `StatChangeSchema` members use `z.number()` (e.g. `DamageSchema` `:71-76`), and the repo's zod is **4.4.3**, where `z.number()` rejects `NaN`, `Infinity`, and `undefined` (verified empirically — see command below). The exposure is exactly the IPC boundary (renderer bugs, future callers, compromised renderer) plus main-internal generators.

```bash
node -e "const c={type:'damage',reason:'x'}; console.log('passes validate:', !(c.value <= 0)); console.log(JSON.stringify({current: 30 - c.value}))"
# → passes validate: true ; {"current":null}
node -e "const z=require('dnd-app/node_modules/zod'); console.log(require('dnd-app/node_modules/zod/package.json').version, z.z.number().safeParse(NaN).success, z.z.number().safeParse(Infinity).success)"
# → 4.4.3 false false
sed -n '259,271p' dnd-app/src/main/ipc/ai-handlers.ts   # no schema parse
```

### F3 — Long rest: temp-HP clear silently lost; hit-dice restore uses the 2014 half rule; exhaustion step dead (bug/high)

- `src/main/ai/stat-mutations.ts:544-548` — `applyLongRestMutations` zeroes `hp.temporary` by **direct mutation outside the changes pipeline**. `:601-603` returns early when `changes.length === 0`, and the save gate at `:618-621` runs only when `applied.length > 0` — so a character at full HP/slots/resources with temp HP keeps it after a long rest (the in-memory clear is discarded, never saved), and even when other changes force a save, the clear is **never reported** in `MutationResult.applied`.
- 2024 rules require the clear: “Temporary Hit Points last until they're depleted or you finish a Long Rest” (sources in Research notes).
- **Correction (found during verification):** both long-rest implementations restore only **half** total hit dice while claiming PHB 2024 — `stat-mutations.ts:582-592` (`Math.max(1, Math.floor(totalMax / 2))`) and the renderer `src/renderer/src/services/character/rest-service-5e.ts:362-371` (same formula, comment “PHB 2024: restore up to half”). The 2024 Long Rest restores **all** spent Hit Point Dice (“You regain all lost Hit Points and all spent Hit Point Dice” — free-rules glossary; the half rule is 2014). Fix both for parity.
- Exhaustion step (`:594-599`) is dead per F1 (reads stripped `conditions`); the renderer `applyLongRest` hardcodes `exhaustionReduced = false` (`rest-service-5e.ts:404-405`).

```bash
sed -n '544,548p;582,592p;594,603p;618,621p' dnd-app/src/main/ai/stat-mutations.ts
sed -n '362,371p;404,405p' dnd-app/src/renderer/src/services/character/rest-service-5e.ts
```

### F4 — `findSlotRecord` prefers regular slots over Pact Magic at the same level; multiclass Warlock short rest restores the wrong pool (bug/medium)

- `src/main/ai/stat-mutations.ts:91-97` — `findSlotRecord(char, level)` returns the **regular** record whenever `spellSlotLevels[level]` exists, only falling back to `pactMagicSlotLevels[level]`. Slots are addressed by level alone end-to-end: the TS union (`src/main/ai/types.ts:205-206`), the zod schemas (`ai-schemas.ts:114-125`), and the prompt docs (`prompt-sections/character-rules.ts:71-72`) have no pool field.
- `applyShortRestMutations` (`:639-648`) generates `restore_spell_slot` changes from the **pact** pool's deficits, but `applyChange` `restore_spell_slot` (`:281-285`) resolves through `findSlotRecord` → for e.g. Warlock 5 / Wizard 5 (both pools have level 3), the short rest **tops up regular slots** (not a short-rest resource) and leaves pact slots spent.
- `applyLongRestMutations` aliases the same way (`:551-559` regular loop + `:561-570` pact loop both emit pool-less changes; both resolve to the regular record, the second capping at max — pact stays spent **even after a long rest**).
- The AI can never deliberately expend/restore a pact slot when a regular slot exists at that level (`validateChange` `:123-132` resolves identically). 2024 rules keep Pact Magic a separate pool with separate recovery (sources in Research notes).
- Both pools survive v4 untouched: `spellSlotLevels` / `pactMagicSlotLevels` are canonical fields (`src/shared/types/character-5e.ts:82-83`) — this bug is independent of the v4 strip.

```bash
sed -n '91,97p;123,132p;276,285p;551,570p;639,648p' dnd-app/src/main/ai/stat-mutations.ts
grep -n "pool" dnd-app/src/main/ai/types.ts dnd-app/src/main/ai/ai-schemas.ts   # no hits today
```

### F5 — Current state of the surfaces this phase builds on (for the executor)

- `StatChange` TS union: `src/main/ai/types.ts:197-280` (exhaustive guards exist in `applyChange` `stat-mutations.ts:479-484` and `describeChange` `:769-774` — adding a union member without arms breaks `tsc`, which is desired).
- Zod union: `ai-schemas.ts:326` (`StatChangeSchema = z.discriminatedUnion('type', [...])`), member schemas `:71-283`; `validateStatChanges` `:1412-1434`; `StatChangesBlockSchema` `:366`.
- Prompt contract: `prompt-sections/character-rules.ts:44-111` (the `[STAT_CHANGES]` doc; `:71-72` the slot lines), plus an exported legacy `StatChangeEvent` interface `:125-159` used only by `character-rules.test.ts`. Tests pin the documented type lists at `character-rules.test.ts:81-104,150-200`.
- Existing unit tests: `src/main/ai/stat-mutations.test.ts` (mocks `loadCharacter`/`saveCharacter`; `applyMutations` suite from `:347` uses a v3-shaped `makeCharacter()` with inline `conditions: []` — these fixtures pin pre-v4 behavior and must gain v4-shaped variants).
- Condition write path, renderer: `use-character-store.ts` `addCondition` `:205-227`, `removeCondition` `:229-242`, `updateConditionValue` `:244-263` — all rebuild inline `conditions` then re-derive refs via the shim. Sheet UI renders `cond.value` steppers and the exhaustion penalty box (`components/sheet/5e/ConditionsSection5e.tsx:95-142`) — currently dead because `getEffectiveConditions` returns only `{name, type, isCustom}`.
- AI long/short rest entry points: IPC `AI_LONG_REST`/`AI_SHORT_REST` (`ai-handlers.ts:273-281`), invoked fire-and-forget from the live DM-action executors `executeShortRest`/`executeLongRest` (`src/renderer/src/services/game-actions/creature-actions.ts:609,673`; wired in `game-action-executor.ts:462-465`).
- i18n: keys live in `src/renderer/src/i18n/locales/en.json` + `es.json` (e.g. `notify.aiDmStore.mutationUnknownCharacter` at en.json:5078); after adding keys run `npm run i18n:gen-keys` to regenerate `src/renderer/src/i18n/generated-keys.ts`.

## Sub-phases

> Per INSTRUCTIONS.md rule 5: cheap targeted checks only during sub-phases (`npx tsc --noEmit -p tsconfig.web.json` / `tsconfig.node.json` on the changed surface + the single affected test file); the full 4-gate runs once at phase end. One commit per phase.

### 02A — Condition `overrides` in the shared v4 migration + renderer hydration pass-through

**Objective:** give condition instances a lossless v4 home (`ref.overrides` carrying `name`, `type`, `isCustom`, `value?`, `duration?`) so condition metadata survives migration, hydration, and renderer round-trips — the foundation every later sub-phase reads/writes.

**Files:**
- `src/shared/migrations/v4-character-refs.ts`
- `src/renderer/src/services/character/effective-character-5e.ts`
- `src/renderer/src/types/character-5e-migration.test.ts`
- `src/main/storage/migrations.test.ts`
- `src/renderer/src/services/character/rest-service-5e.test.ts`

**Steps:**
1. In `migrateCharacter5eToRefs` (`v4-character-refs.ts:119-129`), build each condition ref with overrides:
   `instanceRef('conditions', slug, { name: String(c.name ?? ''), type: c.type ?? 'condition', isCustom: c.isCustom ?? false, ...(c.value !== undefined ? { value: c.value } : {}), ...(c.duration !== undefined ? { duration: c.duration } : {}) })`
   where `slug` is the existing lowercase/`\s+`→`-` transform. Keep the `conditionRefs === undefined && conditions.length > 0` idempotency guard unchanged.
2. In `getEffectiveConditions` (`effective-character-5e.ts:169-177`), widen the hydrated cast to include `type?`, `isCustom?`, `value?`, `duration?` and return them: `{ name: c.name, type: c.type ?? 'condition', isCustom: c.isCustom ?? false, ...(c.value !== undefined ? { value: c.value } : {}), ...(c.duration !== undefined ? { duration: c.duration } : {}) }` (matches `ActiveCondition`, `src/shared/types/character-common.ts:115-122`). `hydrate`'s overrides-priority merge means a library entry's prose stays but the instance's `name`/`value`/`duration` win; orphan conditions (no library entry) now survive via the overrides branch (`:36-39`).
3. Delete/replace the stale “value is dropped on the shim” comment at `use-character-store.ts:250-251` (the mechanism it documents is gone; `updateConditionValue` now actually persists — no logic change needed there, the shim carries it).
4. Update tests: extend `character-5e-migration.test.ts` (conditions case around `:59`) to assert overrides carry name/value/duration and that a custom condition round-trips; in `rest-service-5e.test.ts:194-206`, invert the pinned “value dropped” test — it must now report `exhaustionReduction: true` and `currentExhaustionLevel: 2` for the existing fixture (the fixture already puts `value: 2` in overrides, which until now was ignored). `migrations.test.ts` only asserts field removal (`:24`) — confirm it still passes; add an overrides assertion for a migrated dnd5e character with conditions.

**Checks:** `npx tsc --noEmit -p tsconfig.web.json` and `npx vitest run src/renderer/src/types/character-5e-migration.test.ts src/main/storage/migrations.test.ts src/renderer/src/services/character/rest-service-5e.test.ts`.

**Acceptance:** migration emits condition overrides; `getEffectiveConditions` surfaces `value`/`duration`; a custom (non-library) condition survives a save→load→hydrate cycle; updated tests green; no other test file touched yet fails type-check.

### 02B — Main-process v4 condition helpers; fix `add_condition`/`remove_condition`/`reduce_exhaustion`/`add_exhaustion`/`set_equipped`; AI context shows conditions

**Objective:** stat mutations read and write `conditionRefs` (+ `state.weaponEquipped`/`state.armorEquipped` for `set_equipped`) instead of the stripped v3 arrays; the AI's character context regains a conditions line.

**Files:**
- `src/main/ai/character-conditions.ts` (new)
- `src/main/ai/character-conditions.test.ts` (new)
- `src/main/ai/stat-mutations.ts`
- `src/main/ai/character-context.ts`
- `src/main/ai/stat-mutations.test.ts`
- `src/main/ai/character-context.test.ts`

**Steps:**
1. Create `src/main/ai/character-conditions.ts` — pure helpers over `Character5eV3` (no I/O, no Electron imports so vitest runs it plainly):
   - `conditionSlug(name: string): string` — lowercase, `\s+`→`-` (must byte-match the migration's transform).
   - `titleCaseSlug(slug: string): string` — display fallback (mirror `character-context.ts:13-15`).
   - `listConditions(char): ActiveCondition[]` — map `char.conditionRefs ?? []` to `{name: overrides.name ?? titleCaseSlug(entryId), type, isCustom, value?, duration?}`, then **fold in** any legacy inline `char.conditions` entries whose slug is not already present (self-heal for records polluted by the old `add_exhaustion`).
   - `hasCondition(char, name): boolean` (slug compare).
   - `addConditionInstance(char, {name, value?, duration?}): void` — normalize the inline-legacy field first (migrate any inline `conditions` into refs, then `delete (char as Record<string, unknown>).conditions`), then push `{instanceId: crypto.randomUUID(), ref: {entryType: 'conditions', entryId: conditionSlug(name), overrides: {name: titleCaseSlug(conditionSlug(name)), type: 'condition', isCustom: false, ...value/duration}}}`.
   - `removeConditionInstance(char, name): boolean` — filter `conditionRefs` by slug (also drop matching legacy inline entries); return whether anything was removed.
   - `getConditionValue(char, name): number | undefined` / `setConditionValue(char, name, value): void` — read/write `ref.overrides.value`; `setConditionValue(..., 0)` removes the instance. Treat a present exhaustion ref with no `value` as level 1.
2. Rewrite the condition arms in `stat-mutations.ts` on those helpers:
   - `validateChange` `add_condition` (`:108-113`) → duplicate check via `hasCondition`; `remove_condition` (`:114-119`) → `!hasCondition`; `reduce_exhaustion` (`:196-199`) → `!hasCondition(char, 'exhaustion')`.
   - `applyChange` `add_condition` (`:249-258`) → `addConditionInstance(char, {name: change.name, ...(change.duration !== undefined ? {duration: change.duration} : {})})` (no non-null assertion anywhere); `remove_condition` (`:259-262`) → `removeConditionInstance`; `reduce_exhaustion` (`:402-413`) → `const v = getConditionValue(char,'exhaustion') ?? 1; setConditionValue(char,'exhaustion', v - 1)`; `add_exhaustion` (`:414-425`) → `setConditionValue(char,'exhaustion', Math.min(6, (getConditionValue(char,'exhaustion') ?? (hasCondition(char,'exhaustion') ? 1 : 0)) + change.levels))` creating the instance when absent.
   - `set_equipped` (`validateChange :202-208`, `applyChange :426-435`): keep the inline `equipment` toggle; additionally match `char.weaponRefs`/`char.armorRefs` by `ref.overrides?.name` (case-insensitive; fall back to `entryId` slug compare) and toggle `char.state.weaponEquipped[instanceId]` / `char.state.armorEquipped[instanceId]` (create `state`/maps as needed). Validation passes when ANY of equipment/weaponRefs/armorRefs (or legacy inline arrays, kept as a final fallback) matches.
   - Replace the stale Phase 28d comment block (`:84-88`) with a short accurate note: persisted characters are v4 (`CURRENT_SCHEMA_VERSION = 4`); conditions/equipped state go through the v4 helpers; remaining inline reads (`equipment`, `treasure`, `classResources`, `hitDice`, `skills`, `proficiencies`, `features`, slot pools) are canonical v4 fields.
3. `character-context.ts`: replace both stripped-field condition reads — abbreviated (`:40-48`) and full (`:236-248`) — with `listConditions(...)`, preserving the existing `value`/`duration` formatting. Do **not** touch the other v3 reads in that file (weapons/armor/spells/feats) — they are logged in 02F.
4. Tests:
   - `character-conditions.test.ts` (new): slug round-trip, add/remove/has on a v4 character, legacy-inline fold + self-heal, exhaustion value get/set/remove-at-0, value-less exhaustion treated as level 1.
   - `stat-mutations.test.ts`: add a `makeV4Character()` fixture (NO inline `conditions`/`weapons`/`armor`; with `conditionRefs`, `weaponRefs`+`state.weaponEquipped`, `armorRefs`); regression tests: `add_condition` on a v4 character applies (no throw) and the batch's other changes persist; `remove_condition` works against a ref added via overrides; `reduce_exhaustion` decrements/removes; `add_exhaustion` then `reduce_exhaustion` round-trips without ever writing an inline `conditions` field (`expect(char.conditions).toBeUndefined()`); `set_equipped` toggles a weapon via `state.weaponEquipped`.
   - `character-context.test.ts`: conditions line renders from `conditionRefs` (with value + duration), in both abbreviated and full formats.

**Checks:** `npx tsc --noEmit -p tsconfig.node.json` + `npx vitest run src/main/ai/character-conditions.test.ts src/main/ai/stat-mutations.test.ts src/main/ai/character-context.test.ts`.

**Acceptance:** every condition-touching mutation applies and persists against a v4 character; no mutation writes the inline `conditions` field; `set_equipped` toggles weapons/armor via `state`; AI context lists conditions again; all listed tests green.

### 02C — Numeric validation: harden `validateChange` + zod-validate the `AI_APPLY_MUTATIONS` boundary

**Objective:** no payload — from the renderer, the AI, or an internal generator — can persist `NaN`/`null`/`Infinity` into character numerics.

**Files:**
- `src/main/ai/stat-mutations.ts`
- `src/main/ipc/ai-handlers.ts`
- `src/main/ai/stat-mutations.test.ts`

**Steps:**
1. `validateChange` guards (reject with a precise reason; `Number.isFinite` implies non-NaN/non-Infinity/defined):
   - `damage`/`heal`: `!Number.isFinite(change.value) || change.value <= 0`.
   - `temp_hp`: `!Number.isFinite(change.value) || change.value < 0`.
   - `gold`: `!Number.isFinite(change.value)`.
   - `xp`: `!Number.isFinite(change.value) || change.value <= 0`.
   - `hit_dice`: `!Number.isInteger(change.value)` (then the existing range checks).
   - `expend_spell_slot`/`restore_spell_slot`: `!Number.isInteger(change.level) || change.level < 1 || change.level > 9`; `restore` `count` when present: integer ≥ 1.
   - `add_item`/`remove_item` `quantity` when present: integer ≥ 1.
   - `use_class_resource`/`restore_class_resource` `amount` when present: integer ≥ 1.
   - `set_ability_score`: `!Number.isInteger(change.value)` before the 1–30 range check (NaN currently passes both range comparisons).
   - `add_exhaustion`: `!Number.isInteger(change.levels) || change.levels <= 0`.
   - `add_condition` `duration` when a number: integer ≥ 1.
2. `ai-handlers.ts` `AI_APPLY_MUTATIONS` (`:259-271`): validate **before** logging/applying. Reject non-string/non-UUID `characterId` (`isValidUUID` from `src/shared/utils/uuid`, already imported by character-storage) with an empty `MutationResult`-shaped reply; run `validateStatChanges(changes)` (import from `../ai/ai-schemas`) — schema-invalid entries become `rejected` entries (`reason: 'schema: ' + issue.errors.join('; ')`, the raw input cast to `StatChange` with a `// boundary:` comment per repo convention); only `valid` entries flow to the describe/log loop and `aiService.applyMutations`; merge the schema rejects into the returned `MutationResult.rejected`. Cap the array (e.g. reject batches > 100 outright) as cheap DoS hygiene.
3. Tests (`stat-mutations.test.ts` + a handler-level case if an ai-handlers test harness exists — if not, cover via `validateStatChanges` + `applyMutations` directly): value-less damage is rejected (not applied, hp untouched); `Infinity` heal rejected; `level: 2.5` slot rejected; `set_ability_score` with `NaN` rejected; valid changes in the same batch still apply.

**Checks:** `npx tsc --noEmit -p tsconfig.node.json` + `npx vitest run src/main/ai/stat-mutations.test.ts`.

**Acceptance:** the F2 repro (damage with no value) returns a `rejected` entry and leaves `hp.current` numeric; mixed batches apply the valid subset; no `NaN` can reach `saveCharacter` through any switch arm listed above.

### 02D — Pact Magic pool targeting for spell slots

**Objective:** spell-slot changes can address the regular and Pact Magic pools distinctly; rest generators target the right pool; sensible pool inference when the AI omits it.

**Files:**
- `src/main/ai/types.ts`
- `src/main/ai/ai-schemas.ts`
- `src/main/ai/stat-mutations.ts`
- `src/main/ai/prompt-sections/character-rules.ts`
- `src/main/ai/prompt-sections/character-rules.test.ts`
- `src/main/ai/stat-mutations.test.ts`
- `src/main/ai/ai-schemas.test.ts`

**Steps:**
1. `types.ts:205-206`: add `pool?: 'regular' | 'pact'` to `expend_spell_slot` and `restore_spell_slot`.
2. `ai-schemas.ts`: add `pool: z.enum(['regular', 'pact']).optional()` to `ExpendSpellSlotSchema` (`:114-118`) and `RestoreSpellSlotSchema` (`:120-125`).
3. `stat-mutations.ts`: replace `findSlotRecord` (`:91-97`) with a pool- and intent-aware resolver used by BOTH validation and apply (they must agree):
   ```ts
   function resolveSlotRecord(char, level, pool: 'regular' | 'pact' | undefined, intent: 'expend' | 'restore')
   ```
   - `pool` given → that pool's record or `null`.
   - `pool` omitted, `intent: 'expend'` → first pool (regular, then pact) whose record exists with `current > 0`; if neither has remaining, return regular ?? pact (so the “No remaining …” error still cites a real record).
   - `pool` omitted, `intent: 'restore'` → first pool (regular, then pact) whose record exists with `current < max`; else regular ?? pact.
   Update `validateChange :123-132` and `applyChange :276-285` to call it with `change.pool` and the right intent. Error strings gain the pool when given (e.g. ``No pact spell slots at level ${level}``).
4. Rest generators pass pools explicitly: `applyShortRestMutations` pact loop (`:639-648`) → `pool: 'pact'`; `applyLongRestMutations` regular loop (`:551-559`) → `pool: 'regular'`, pact loop (`:561-570`) → `pool: 'pact'`.
5. `describeChange` (`:709-712`): append a pact marker when `pool === 'pact'` — `Spell slot (level 3, pact) expended (…)` — leaving pool-less output byte-identical so existing tests stand.
6. Prompt doc `character-rules.ts:71-72`: document `pool?` on both lines — e.g. `**expend_spell_slot**: {characterName, level, pool?, reason} — use a spell slot. pool: 'pact' for Warlock Pact Magic, 'regular' for standard slots; omit if the character has only one pool.` Add `pool?: 'regular' | 'pact'` to the legacy `StatChangeEvent` interface (`:125-159`) only if its test forces it; otherwise leave that interface alone.
7. Tests: multiclass fixture (`spellSlotLevels: {3: {current: 0, max: 2}}`, `pactMagicSlotLevels: {3: {current: 0, max: 2}}`) — short rest restores ONLY pact at level 3; long rest restores both pools fully; explicit `pool:'pact'` expend decrements pact while regular is untouched; pool-less expend with regular empty falls through to pact; `ai-schemas.test.ts` accepts/round-trips `pool` and rejects `pool: 'psionic'`; `character-rules.test.ts` keeps its type-list assertions green (the `**expend_spell_slot**` literals still match).

**Checks:** `npx tsc --noEmit -p tsconfig.node.json` + `npx vitest run src/main/ai/stat-mutations.test.ts src/main/ai/ai-schemas.test.ts src/main/ai/prompt-sections/character-rules.test.ts`.

**Acceptance:** the F4 repro (Warlock 5/Wizard 5 short rest) restores pact level-3 slots and leaves regular untouched; long rest fills both pools; the AI can target either pool; omitting `pool` never produces the cross-pool aliasing.

### 02E — Long-rest correctness: reported temp-HP clear, 2024 all-hit-dice restore, live exhaustion step; renderer parity

**Objective:** the long rest pipeline reports and persists everything it does, and matches PHB 2024 in both the main-process AI path and the renderer sheet path.

**Files:**
- `src/main/ai/types.ts`
- `src/main/ai/stat-mutations.ts`
- `src/renderer/src/services/character/rest-service-5e.ts`
- `src/main/ai/stat-mutations.test.ts`
- `src/renderer/src/services/character/rest-service-5e.test.ts`

**Steps:**
1. `types.ts`: add an **internal** union member `| { type: 'clear_temp_hp'; characterName?: string; reason: string }`. Deliberately NOT added to `StatChangeSchema` or the prompt — the AI cannot emit it (zod filters it on the parse path), and the renderer never sends it; it exists so the long-rest clear flows through validate→apply→`applied[]`→save like every other change. Record this decision as a comment beside the member.
2. `stat-mutations.ts`: add arms forced by the exhaustiveness guards — `validateChange`: `case 'clear_temp_hp': return null`; `applyChange`: `char.hitPoints.temporary = 0`; `describeChange`: `` `Temporary HP cleared (${change.reason})` ``; leave `isNegativeChange` false (no change needed — it is an `||` chain).
3. `applyLongRestMutations`: replace the direct mutation at `:544-548` with `if (hp.temporary > 0) changes.push({ type: 'clear_temp_hp', reason: 'long rest' })`. The existing `changes.length === 0` early-return and `applied.length > 0` save gate now behave correctly without modification.
4. Hit dice, main (`:582-592`): restore ALL spent dice — `const canRestore = totalMax - totalCurrent; if (canRestore > 0) changes.push({type:'hit_dice', value: canRestore, reason:'long rest'})`; update the comment to cite the 2024 rule.
5. Exhaustion, main (`:594-599`): probe via `hasCondition(char, 'exhaustion')` (02B helper) so the `reduce_exhaustion` change actually generates.
6. Renderer parity in `rest-service-5e.ts`:
   - Hit dice (`:362-371`): same all-spent-dice restore (`hdToRestore = totalMax - currentTotal`); fix the comment.
   - Exhaustion (`:404-405` + the result assembly): reinstate the reduction — read `getEffectiveConditions(character)` for `Exhaustion`; when present, level `value ?? 1`; new level − 1; rebuild the output character's conditions via the established store pattern (inline `conditions` array with the updated/removed exhaustion + `conditionRefs: undefined`, re-derived by the shim at the save site — `applyLongRest` returns a character that callers pass through `migrateCharacter5eFromV3ToV4`-based save paths; follow the exact mechanism used by `use-character-store.updateConditionValue :244-263`). Set `exhaustionReduced` accordingly. `getLongRestPreview` (`:311-329`) needs no change — 02A already made its value read live.
   - Leave the Ranger Tireless note (`:248-250`) and innate-uses note as-is (log in 02F).
7. Tests: main — full-HP/full-slot character with `temporary: 8` long-rests → `applied` contains `clear_temp_hp`, `saveCharacter` called, `hp.temporary === 0`; spent-hit-dice character regains ALL dice; exhaustion level 3 (v4 ref) → `reduce_exhaustion` in `applied`, value 2 after. Renderer — update the half-dice expectations in `rest-service-5e.test.ts`; add exhaustion-reduction apply test (level 2 → 1; level 1 → removed; flag true).

**Checks:** `npx tsc --noEmit -p tsconfig.node.json` + `npx tsc --noEmit -p tsconfig.web.json` + `npx vitest run src/main/ai/stat-mutations.test.ts src/renderer/src/services/character/rest-service-5e.test.ts`.

**Acceptance:** an otherwise-untouched character loses temp HP on AI long rest and the clear appears in `MutationResult.applied`; both rest implementations restore all hit dice; exhaustion drops by 1 on long rest in both paths.

### 02F — Renderer feedback for rejected/failed mutations + out-of-scope logging

**Objective:** the silent-failure edge (F1/F2's delivery half) gets a minimal, honest surface: when the main process rejects or errors a mutation batch, the DM sees it.

**Files:**
- `src/renderer/src/hooks/use-game-effects.ts`
- `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`
- `src/renderer/src/i18n/generated-keys.ts` (regenerated)
- `docs/ISSUES-LOG-DNDAPP.md` (rule-12 entries, see step 3)

**Steps:**
1. In `applyStatChangesDirectly` (`use-game-effects.ts:77-79`), consume the promise: `window.api.ai.applyMutations(charId, changes).then((result) => { ... }).catch(...)`. Handle both reply shapes: a `safeHandler` error envelope (`success === false` → `pushDmAlert('warning', t('notify.aiDmStore.mutationApplyFailed', { reason }))`) and a `MutationResult` with `rejected.length > 0` (→ one `pushDmAlert('warning', t('notify.aiDmStore.mutationRejected', { count, reasons }))` summarizing up to ~3 reasons). `pushDmAlert` is already imported/used in this file (see `:63`). Keep it alert-tray-only — no chat post (chat-side feedback policy belongs to PHASE-04's approval work).
2. Add `notify.aiDmStore.mutationApplyFailed` + `notify.aiDmStore.mutationRejected` to `en.json` and `es.json` (mirror placement next to `mutationUnknownCharacter`, en.json:5078); run `npm run i18n:gen-keys`.
3. Log out-of-scope discoveries from this phase's verification to `docs/ISSUES-LOG-DNDAPP.md` per `docs/LOG-INSTRUCTIONS.md` (rule 12), dated, with file:line cites:
   - `character-context.ts` still reads v4-stripped `knownSpells`/`preparedSpellIds` (`:137-144`), `armor` (`:168-177`), `weapons` (`:179-184`), `feats` (`:225-228`) — the AI's full character sheet is missing weapons/armor/prepared spells/feats for all v4 characters (weapons/armor recoverable from ref overrides; spells need name resolution).
   - `rest-service-5e.ts` dropped features pending a v4 home, now partially unblocked by 02A: Ranger Tireless exhaustion reduction (`:248-250`), innate-spell-use restoration (comment near `:408`).
   - Renderer rest executors call `window.api.ai.longRest/shortRest` fire-and-forget with `.catch(() => {})` (`creature-actions.ts:609,673`) — rejected rest mutations are invisible; consider routing through the same alert surface.
4. Quick self-review of the full phase diff for stray debug output and comment accuracy.

**Checks:** `npx tsc --noEmit -p tsconfig.web.json` + `npx vitest run src/renderer/src/hooks` (only if a colocated test exists for the touched hook — otherwise the type-check suffices; the behavior is covered by the end-of-phase gate).

**Acceptance:** a rejected batch produces exactly one DM alert with the reason(s); a thrown handler produces an alert; both locales have the keys; the issues log gained the three entries.

### End of phase

Run the full 4-gate from `dnd-app/` (rule 5): `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run`. Green → single commit (`fix(ai-dm): phase 02 — stat-mutation correctness vs v4 schema` with sub-phase body), single push, move this plan to `completed/` (rule 8). No release (rule 6).

## Research notes

- **Temporary HP / Long Rest (2024):** “Temporary Hit Points last until they're depleted or you finish a Long Rest”; they can't be added together — on a new grant you choose to keep the higher (the existing `Math.max` in `applyChange temp_hp` is a faithful auto-resolution; do not change it). Sources: [Roll20 D&D 2024 Compendium — Damage and Healing](https://roll20.net/compendium/dnd5e/Rules:Damage%20and%20Healing?expansion=32231), [D&D Beyond — Playing the Game (2024 Basic Rules)](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game).
- **Long Rest restores ALL spent Hit Point Dice in 2024** (2014 restored half — the rule both code paths still implement under a mislabeled “PHB 2024” comment): “You regain all lost Hit Points and all spent Hit Point Dice… If you have the Exhaustion condition, its level decreases by 1.” Sources: [D&D Beyond — 2024 Free Rules Glossary (Long Rest)](https://www.dndbeyond.com/sources/dnd/free-rules/rules-glossary), [RPGBOT — 2014→2024 transition guide](https://rpgbot.net/dnd-2024-5e-transition-guide-and-change-log-everything-thats-different-in-the-new-players-handbook/), [D&D Beyond forum — Long Rest not resetting ALL hit dice on 2024 character](https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/208810-long-rest-not-resetting-all-hit-dice-on-2024).
- **Pact Magic stays a separate pool when multiclassing in 2024**, recovered on Short or Long Rest, while Spellcasting slots recover on Long Rest only — so a level-addressed slot model that aliases the pools is wrong for any multiclass Warlock; pool must be addressable. Sources: [RPGBOT transition guide](https://rpgbot.net/dnd-2024-5e-transition-guide-and-change-log-everything-thats-different-in-the-new-players-handbook/), [Roll20 — Warlock (D&D 2024)](https://roll20.net/compendium/dnd5e/Classes:Warlock?expansion=33335).
- **Electron IPC inputs must be validated in the main process** — any web frame can in principle reach `ipcMain`, so handler-side validation (not just preload typing) is the security boundary; this repo already has the pattern (`AiConfigSchema` parse in `AI_CONFIGURE`, `withSchema`/`withArgsSchema` helpers in `src/main/ipc/_safe.ts:48-93`) — `AI_APPLY_MUTATIONS` simply never adopted it. Sources: [Electron — Security tutorial (validate IPC, check senders)](https://www.electronjs.org/docs/latest/tutorial/security), [Electron — IPC tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc).
- **zod 4 `z.number()` rejects `NaN`, `Infinity`, and `undefined`** (verified locally against the repo's zod 4.4.3), so routing the IPC payload through the existing `StatChangeSchema` closes the NaN injection without new schema code; the added `Number.isFinite`/`Number.isInteger` guards in `validateChange` are defense-in-depth for main-internal generators and future callers. Source: [Zod — Numbers API](https://zod.dev/api?id=numbers).
- **Why ref `overrides` (not a new `state.conditionValues` map) for condition metadata:** the renderer store rebuilds `conditionRefs` from scratch on every condition edit (`use-character-store.ts:220-226` sets `conditionRefs: undefined` and re-derives via the shim), so instanceId-keyed side-state would be orphaned on each edit; overrides ride inside the ref itself, survive the rebuild, and reuse the already-shipped hydrate orphan/merge semantics (`effective-character-5e.ts:22-46`) that weapons/armor have used since BUG-2. No new persistence surface, no migration of a migration.
- **Alternative considered and rejected:** keeping main-process mutations writing inline v3 `conditions` and teaching the renderer to read both shapes — rejected because it perpetuates the dual-shape drift that caused F1, and the renderer write path would still erase the inline field on its next edit.

## Test plan

- **02A:** `src/renderer/src/types/character-5e-migration.test.ts` (overrides derivation, custom-condition survival), `src/main/storage/migrations.test.ts` (v3→v4 with conditions), `src/renderer/src/services/character/rest-service-5e.test.ts` (pinned value-drop test inverted).
- **02B:** new `src/main/ai/character-conditions.test.ts`; `src/main/ai/stat-mutations.test.ts` (v4 fixture suite: add/remove/reduce/add_exhaustion/set_equipped, batch-survival regression); `src/main/ai/character-context.test.ts` (conditions lines).
- **02C:** `stat-mutations.test.ts` (NaN/Infinity/non-integer rejections, mixed-batch partial apply); boundary behavior covered through `validateStatChanges` + handler logic.
- **02D:** `stat-mutations.test.ts` (multiclass pool fixtures), `src/main/ai/ai-schemas.test.ts` (`pool` accept/reject), `src/main/ai/prompt-sections/character-rules.test.ts` (doc literals stay pinned).
- **02E:** `stat-mutations.test.ts` (clear_temp_hp reporting + save, all-hit-dice, exhaustion step), `rest-service-5e.test.ts` (renderer hit-dice + exhaustion reduction).
- **02F:** type-check + end-of-phase gate (alert-surface logic is thin glue; no new test file unless a colocated hook test already exists).
- **End-of-phase 4-gate:** `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run` — all from `dnd-app/`. No Pi code touched → no pytest.

## Acceptance criteria

1. On a freshly-migrated v4 character, a `[STAT_CHANGES]` batch containing `add_condition` applies fully: the condition lands in `conditionRefs` (with overrides), other changes in the batch persist, and no TypeError reaches `safeHandler`.
2. `remove_condition` / `reduce_exhaustion` succeed against conditions the AI (or the sheet) added; `add_exhaustion`→sheet→`reduce_exhaustion` round-trips with the level visible in `ConditionsSection5e` and never writes an inline `conditions` field.
3. `set_equipped` toggles weapons and armor via `state.weaponEquipped`/`state.armorEquipped` and still toggles inline `equipment` items.
4. The AI character context (full + abbreviated) lists active conditions with value/duration.
5. `AI_APPLY_MUTATIONS` schema-validates its payload; a value-less `damage` yields a `rejected` entry and character HP stays numeric; no switch arm can persist `NaN`.
6. AI long rest on a full-HP character with temp HP clears the temp HP, persists it, and reports `clear_temp_hp` in `applied`; both rest implementations restore all spent hit dice; long rest reduces exhaustion by 1 in both paths.
7. Multiclass Warlock short rest restores only Pact Magic slots; long rest fills both pools; `pool` is documented in the prompt and enforced by zod.
8. Rejected/failed mutation batches surface one DM alert (both locales).
9. Full 4-gate green; one commit; plan moved to `completed/`; the three rule-12 log entries exist in `docs/ISSUES-LOG-DNDAPP.md`.

## Out of scope

- `MutationApprovalPanel` labels for the 12 unlabeled change types, approval queue reset/cross-campaign hygiene, second-response overwrite — **PHASE-04**.
- Creature mutation silent failures / prefix fallback / `activeMap` guard (`use-game-effects.ts:84-96`, `creature-mutations.ts`) — **PHASE-08**.
- Executor pre-batch snapshot staleness and the dead duplicate executors in `creature-actions.ts:106-458` — **PHASE-08**.
- Prompt-contract corrections beyond the `pool` doc line ([DM_ACTIONS]/[STAT_CHANGES] trio, bold contradiction, travel pace) — **PHASE-11**.
- Hardcoded-string/i18n sweeps beyond the two new keys — **PHASE-12**.
- Token breakdown/truncation observability — **PHASE-14**.
- `character-context.ts` v4 hydration for weapons/armor/spells/feats (AI context fidelity, not mutation correctness) — logged to `docs/ISSUES-LOG-DNDAPP.md` in 02F; no owning phase yet.
- Ranger Tireless / innate-spell-use reinstatement in the renderer rest service — logged in 02F.

## Completed

- **02F (2026-06-11):** Renderer feedback + logging. `use-game-effects.ts applyStatChangesDirectly` now consumes the `applyMutations` promise — a `safeHandler` error envelope or a `MutationResult` with rejects raises one `pushDmAlert('warning', …)` (alert-tray only; up to 3 reasons). New i18n keys `notify.aiDmStore.mutationApplyFailed`/`mutationRejected` in en+es; `generated-keys.ts` regenerated (6035 keys). Logged 3 out-of-scope findings to `docs/ISSUES-LOG-DNDAPP.md` (AI context missing v4 weapons/armor/spells/feats; Ranger Tireless + innate-use reinstatement now-unblocked; rest executors swallow rejects). End-of-phase 4-gate green: lint, tsc web+node, 7314 vitest.
- **02E (2026-06-11):** Long-rest correctness. New INTERNAL `clear_temp_hp` union member (types.ts; NOT in zod/prompt — AI can't emit it); validate/apply/describe arms added. `applyLongRestMutations` clears temp HP via a `clear_temp_hp` change (was a discard-able direct mutation) so it's reported in `applied[]` + saved; hit-dice restore changed half→ALL spent (PHB 2024); exhaustion probe via `hasCondition`. Renderer `rest-service-5e.ts applyLongRest`: all-spent hit-dice restore; exhaustion reduction reinstated (reads `getEffectiveConditions`, rebuilds inline conditions + clears conditionRefs for the save-shim). Tests: main clear_temp_hp-reported/all-hit-dice/exhaustion-step; renderer all-hit-dice + exhaustion 3→2 + level-1→removed. tsc web+node clean; 100 + 29 tests green.
- **02D (2026-06-11):** Pact Magic pool targeting. `findSlotRecord`→`resolveSlotRecord(char, level, pool, intent)` (explicit pool, else intent-aware first-actionable, never aliases); both validate + apply slot arms call it. `pool?: 'regular'|'pact'` added to `types.ts` expend/restore unions + zod `ExpendSpellSlotSchema`/`RestoreSpellSlotSchema` (`z.enum`). Rest generators pass pools explicitly (short-rest pact, long-rest regular+pact loops). `describeChange` appends ", pact" marker. Prompt doc (`character-rules.ts`) documents `pool?`. Tests: multiclass short-rest restores only pact, explicit-pool expend, long-rest fills both, zod pool accept/reject. 97 + 80 tests green; tsc node clean.
- **02C (2026-06-11):** Numeric hardening. `validateChange` now guards damage/heal/temp_hp/gold/xp (`Number.isFinite`), hit_dice/set_ability_score/add_exhaustion/spell-slot-level/item-qty/resource-amount/condition-duration (`Number.isInteger` + range) — reworded messages. `AI_APPLY_MUTATIONS` (`ai-handlers.ts:259`) now rejects non-UUID characterId, caps batches >100, runs `validateStatChanges` (zod) on the payload, applies only valid entries, and merges schema-rejects into the returned `MutationResult.rejected`. Tests: value-less damage rejected (HP stays numeric), Infinity-heal/2.5-slot/NaN-ability rejected with the valid sibling still applied; updated 3 reworded-message assertions. tsc node clean; 95 tests green.
- **02B (2026-06-11):** New `src/main/ai/character-conditions.ts` — pure v4 helpers (`conditionSlug`/`titleCaseSlug`/`listConditions`/`hasCondition`/`addConditionInstance`/`removeConditionInstance`/`getConditionValue`/`setConditionValue`) over conditionRefs+overrides, with legacy-inline fold + self-heal (always drops the dead inline field). `stat-mutations.ts`: rewrote `add_condition`/`remove_condition`/`reduce_exhaustion`/`add_exhaustion` validate+apply arms on the helpers (no more `char.conditions!` TypeError — F1 fixed); long-rest exhaustion probe uses `hasCondition`; `set_equipped` now matches `weaponRefs`/`armorRefs` by overrides-name/slug and toggles `state.weaponEquipped`/`armorEquipped` (new `matchEquippableRefs` helper), inline fallback kept; stale Phase-28d comment replaced. `character-context.ts` abbreviated + full condition reads → `listConditions`. New `character-conditions.test.ts` (12 cases); updated 4 existing stat-mutations tests to v4; added F1 batch-survival + set_equipped-via-state regressions. tsc node clean; 93 + 38 tests green.
- **02A (2026-06-11):** Condition `overrides` home for v4. `v4-character-refs.ts:119-137` now builds each condition ref with `overrides:{name,type,isCustom,value?,duration?}` (slug transform unchanged, idempotency guard kept). `effective-character-5e.ts getEffectiveConditions` widened to read `value`/`duration`/`type`/`isCustom` back from the hydrated overrides (survives the orphan branch when the library lacks the slug). Stale "value dropped in 15c.5" comment replaced in `use-character-store.ts:250` (`updateConditionValue` now persists value via the shim→overrides round-trip). Tests: inverted the pinned `rest-service-5e.test.ts` exhaustion test (now asserts `exhaustionReduction:true`, level 2), added a migration-overrides + custom-condition-round-trip test to `character-5e-migration.test.ts`. tsc web clean; 53 tests green across the 4 files.
