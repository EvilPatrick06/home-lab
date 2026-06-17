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

## Structured extraction & repairJson retirement (PHASE-23)

Mechanics can arrive via **two** paths now:

1. **Tag path** (always on): `[STAT_CHANGES]` / `[DM_ACTIONS]` blocks regex-harvested
   from the narration and `repairJson`-repaired (`ai-schemas.ts`).
2. **Structured extraction** (opt-in, `aiDm.structuredExtraction` ∈
   `off`/`fallback`/`always`, Ollama only): a second non-streaming `format`-constrained
   call (`structured-extraction.ts`) extracts a FLAT 12-type schema
   (`damage, heal, temp_hp, add_condition, remove_condition, expend_spell_slot,
   restore_spell_slot, add_item, remove_item, gold, xp, add_exhaustion`) with fields
   `{type, target, value, name, reason}`. `target` resolves against the live snapshot
   (party names → `characterName`; creature labels → `creature_*` + `targetLabel`;
   `''` → acting character; unique-prefix fallback; unknown → dropped). Extracted
   changes map to canonical `StatChange`s, dedupe against tag results, and are
   bound/referent-validated (`game-state-validation.ts`) — constrained decoding
   guarantees SHAPE, not TRUTH. The structured path NEVER calls `repairJson`.

**repairJson retirement criteria** (`getRepairJsonStats()` measures usage): repairJson
is deletable once (a) `structuredExtraction: 'always'` is the default, (b) the narration
prompt no longer instructs tag emission, and (c) the `modified` counter stays at zero
across releases. Until then it serves the tag path only.

## Entity records & lore injection (PHASE-25)

A durable, **DM-correctable** descriptive memory layer (`entity-store.ts`), all of it
opt-in and OFF by default. Three flags live in `userData/campaigns/{id}/ai-context/entities.json`
(engine-owned, toggled over IPC, not on `campaign.aiDm`): `enabled`, `autoExtract`,
`loreMode` (`all` | `triggered`).

**`record_entity` verb** — `{kind: 'npc'|'location'|'item'|'faction', name, summary, keywords?}`.
Registered in `DM_ACTION_SCHEMAS` + the `DmAction` union (so it is NOT silently dropped),
executed fire-and-forget by `executeRecordEntity` → `AI_ENTITY_UPSERT` (source `'ai'`).
The verb is registered unconditionally; records written while `enabled:false` are inert
(never injected, panel hidden) until the flag flips on.

**Upsert / lock semantics** (`EntityStore.upsertEntity`): records resolve case-insensitively
by name → alias → slugified id. Every write bumps `lastSeenAt`/`mentions`. A **DM edit**
(`source:'dm'`) applies all provided fields and sets `locked:true`; thereafter AI/extraction
writes (`'ai'`/`'extraction'`) may ONLY bump `lastSeenAt`/`mentions` — **DM edits are
authoritative, AI writes never overwrite a locked record**. AI writes onto an unlocked record
fill only blank fields and union-merge aliases/keywords (caps 6/8). Per-file 1 MB cap +
400-record cap evict oldest unlocked AI/extraction records first; never `locked`/`dm`.

**Auto-extraction** (`entity-extraction.ts`, `autoExtract`): a fire-and-forget post-turn
call (prefers PHASE-23 `structuredOnce`, else `chatOnce`) drafts ≤6 flat records from the
narration with `source:'extraction'`; dedupe is inherent to upsert; failures log + swallow.

**Injected blocks** (`context-builder.ts`, gated by `enabled`): an `[ENTITY ACTIONS]` verb-doc
block (`prompt-sections/entity-records.ts`) + a bounded, recency-ranked `[ENTITY RECORDS]`
block (`buildEntityContextBlock`), prepended to the memory segment within its 2000-token budget.
With `enabled:false`, neither appears (byte-identical to pre-phase).

**Lore injection** (`lore-injection.ts`): `LoreEntry.keywords?: string[]` (editable in
`LoreManager`). Lore now renders as a labeled `[LORE]` block (the one always-on change;
entry-line format unchanged). With `loreMode:'triggered'`, only **constant** (keyword-less)
entries + entries whose keyword **whole-word, case-insensitively** matches the scan text
(last 4 messages + game-state snapshot) are injected. `loreMode:'all'` (default) = full dump.

**Exported builders** (stable for downstream phases): `buildEntityContextBlock`, `buildLoreBlock`,
`selectLore`, `buildScanText`, `slugifyId`, `matchesKey`. Consumed by PHASE-27 (shared slug),
PHASE-31 (Q&A blocks), PHASE-37 (`keywords` field).

**Deliberately NOT adopted** (future work, no phase owns them): SillyTavern regex keys,
secondary-key AND/NOT logic, recursion, probability/sticky/cooldown timers, inclusion groups.

## Scene boundaries (PHASE-26)

Opt-in per-campaign (`ai-context/scene-memory.json`, default off). When ON, the conversation
manager runs in **scene mode**: it never summarizes on the request path; instead a completed
scene is summarized ONCE at a narrative boundary, off-path, into a layered memory ladder
(scene → session → campaign). With the flag OFF (default), behavior is byte-identical to the
old message-count `maybeSummarize` compaction.

**Boundaries are ENGINE-driven — there is no AI-emitted scene verb** (a model-declared
`end_scene` is PHASE-28 director territory; do NOT add one to the action contract). A scene
ends on:
- a parsed `switch_map` / `long_rest` / `short_rest` / `end_initiative` DM action (the
  `handleStreamCompletion` boundary check, fire-and-forget — never delays `onDone`);
- a renderer-truth map change (`AI_SYNC_WORLD_STATE`'s `currentScene` differs — label = the
  scene just left);
- the `/scene end [label]` DM command;
- an overflow backstop (the history budget dropped messages → `'scene continues'`).

**Invariants:** every new summary keeps `coversUpTo === -1` (summaries cover a pruned prefix;
`this.messages` is the un-summarized tail — PHASE-32 relies on this). Tiers consolidate
EXISTING summaries, never raw chat. The injected `[CAMPAIGN MEMORY]` block is bounded by
`SUMMARY_BLOCK_BUDGET` and replaces the flat `[Previous conversation summary: …]` prefix in
scene mode. Lore-relabel aside, the only always-on change vs pre-phase is in scene mode.

## World-state deltas (PHASE-27)

The **engine owns world truth**; the LLM emits small flat deltas that `world-state-store.ts`
clamps/resolves/applies. Opt-in per campaign (`world-store.json`, `enabled` default false). Five
verbs (registered in `DM_ACTION_SCHEMAS` + the `DmAction` union; executors in `effect-actions.ts`
call `AI_WORLD_DELTA` via `WorldDeltaSchema`, and surface engine REJECTIONS as a DM-only chat note):

- `discover_location` — `{name, type?, description?, connectsTo?, exitLabel?}`
- `move_party` — `{locationName}` (auto-stubs an unknown destination + links it from the previous
  location; marks it visited — lenient resolution beats dead-ending small-model misspellings)
- `link_locations` — `{fromName, toName, label?}` (bidirectional, idempotent)
- `set_npc_opinion` — `{npcName, characterName, delta? | score?, summary?}` (per-NPC-per-PC; `score`
  absolute wins over `delta` relative; clamped to ±100; auto-creates the NPC record)
- `record_fact` — `{text, tags?}` (case-insensitive dedupe; FIFO past 200)

**Engine-validation semantics:** ids are `slugifyId(name)` (shared with `npcMemoryFromAttitude`);
mutators resolve names case-insensitively, never throw on rejection (return `{applied, detail}`).
**The store is authoritative — AI output that contradicts the injected `[WORLD STATE]` block is a
model error, not a state change.** When enabled, the context carries `[WORLD STATE ACTIONS]` verb
docs + a bounded `[WORLD STATE]` slice (party location + exits + NPCs-here + opinions + facts)
inside the existing 2000-token memory budget; disabled (default) ⇒ byte-identical to pre-phase.
The legacy memory-manager read-modify-write paths were also serialized through `mutate()` (27B);
the duplicate renderer world-sync writer was deleted (27C, single `AI_SYNC_WORLD_STATE` writer).
