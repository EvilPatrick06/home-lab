# AI DM Action Contract

A `[DM_ACTIONS]` action is defined in **four** places that must stay in sync. CI
tests (`ai-schemas.test.ts` → "DM action schema ↔ executor contract" and "DM action
schema ↔ DmAction union contract") fail the build if #1/#2/#4 drift, so adding or
removing an action is all-or-nothing.

| # | Place | File | Role |
|---|-------|------|------|
| 1 | **Schema** | `ai-schemas.ts` → `DM_ACTION_SCHEMAS` | Validates the action's shape (zod). Gate before anything runs. |
| 2 | **Executor** | `renderer/src/services/game-action-executor.ts` | The `case '<action>':` that actually performs it. |
| 3 | **Prompt** | `prompt-sections/dm-actions-schema.ts` | Tells the model the action exists + its fields. |
| 4 | **Union** | `dm-actions.ts` → `DmAction` | The main-process compile-time discriminated-union variant. |

## Adding a new DM action

1. Add a `z.object({ action: z.literal('<name>'), … })` schema and register it in
   `DM_ACTION_SCHEMAS` (#1).
2. Add a `case '<name>':` to the executor switch (#2).
3. Document it in the prompt section (#3) so the model will emit it.
4. Add a `{ action: '<name>'; … }` variant to the `DmAction` union (#4).
5. The contract tests enforce #1 ↔ #2 ↔ #4 automatically; keep #3 accurate by hand.

If a field is mutually-exclusive-or-required (e.g. `place_creature` needs
`creatureName` **or** `creatureId`), encode it with `.refine(...)` in the schema so
the executor never receives an un-runnable action.

## Not part of this contract

`[ACTION:…]` inline tags (`renderer/src/services/ai-renderer-actions.ts`) are a
**separate**, renderer-UI-only mechanism (roll requests, overlays). They are NOT
validated against `DM_ACTION_SCHEMAS` and intentionally do not appear in the
executor switch.
