# PHASE-23 — Structured outputs: two-call extraction, flat small-model schema, game-state value validation, repairJson retirement path

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Add an opt-in, Ollama-backed **two-call structured extraction** path to the AI DM pipeline: the narration stream stays freeform, and a second non-streaming call with `format: <JSON schema>` (Ollama constrained decoding) extracts the mechanical stat changes from what was just narrated — guaranteed-shape JSON at the decoder level, designed around a **flat, small-model-friendly schema** (single enum + string target + one number, all fields required, temperature 0, schema echoed in the prompt). Extracted values are then **validated against actual game state** (party names, map creature labels, numeric bounds) before they enter the existing approval pipeline, because constrained decoding guarantees shape, not truth. The feature ships as a three-mode setting — `off` (default, byte-identical behavior to today), `fallback` (extraction runs only when the `[STAT_CHANGES]`/`[DM_ACTIONS]` tag parse fails), `always` (extraction runs after every completed response and merges with tag results) — and the phase instruments `repairJson` so its retirement (the end goal once structured extraction is the default) is measurable instead of speculative. PHASE-27 (world-state deltas) and PHASE-29 (model routing) build directly on the module and provider capability this phase creates.

## Dependencies & cross-phase notes

- **Depends on PHASE-03 (provider-stream-reliability)** per PHASE-INDEX — PHASE-03 reworked `ollama-client.ts` / cloud clients (timeouts, `listOllamaModels`, base-URL handling). This phase adds a new non-streaming function to `ollama-client.ts`; build on whatever URL/timeout shape PHASE-03 left.
- **PHASE-01 (ollama-context-window) ran earlier** (numeric order): `ollama-client.ts` now talks to the **native `/api/chat`** endpoint (NDJSON) and sends `keep_alive` + `options: { num_ctx: resolveNumCtx(model, baseUrl) }` from `src/main/ai/ollama-context.ts`. The new structured call MUST reuse those exact mechanisms (same `keep_alive`, same `num_ctx` resolution) — a request with different `num_ctx` counts as a new model configuration and forces a model reload that wipes the KV cache (PHASE-01's F4 stability rule). Verify at execution: `grep -n "api/chat\|keep_alive\|num_ctx" src/main/ai/ollama-client.ts`.
- **PHASE-02 (stat-mutation-correctness) ran earlier**: it hardened `validateStatChanges` usage at the IPC boundary and may have added a spell-slot `pool` field to the `StatChange` union/schemas. The 23A mapper emits canonical `StatChange` objects and re-validates them through `validateStatChanges` — re-check the union shape (`src/main/ai/types.ts:197-273`, `src/main/ai/ai-schemas.ts:326-364`) before writing the mapper.
- **PHASE-08 ran earlier and deleted the dead `ai-stream-handler.ts` / `finalizeAiResponse` pipeline.** The ONLY live completion path is `handleStreamCompletion` in `src/main/ai/ai-service.ts` (terminal block, see Verified findings). Do not search for a second pipeline; there isn't one anymore.
- **PHASE-10 (ai-dm-ui-truth) ran earlier and touched `AiDmCard.tsx` / `AiProviderSetup.tsx`** (wrong-provider prefill, Save gating, dropdown states). The renderer anchors cited below were verified pre-PHASE-10; re-verify them (`grep -n "aiDmConfig\|onChange" src/renderer/src/pages/campaign-detail/AiDmCard.tsx`) before editing.
- **PHASE-11 (prompt-schema-contract) ran earlier** and may have reworded prompt sections. This phase does NOT edit the narration prompt sections — tag instructions stay as-is in all three modes (see Research notes for why).
- **PHASE-27 (world-state-store) depends on this phase**: its flat delta verbs are designed to parse "through whichever extraction path PHASE-23 left in place". Keep the extraction type list an exported, extensible `const` array and the mapper table-driven so PHASE-27 can add verbs without restructuring.
- **PHASE-29 (model-routing) depends on this phase**: it routes the extraction call to a small model (task class `'extraction'`). Therefore: the extraction entry point MUST take the model id as a parameter (no `currentConfig.model` capture inside the module), and `structured-extraction.ts` MUST NOT import `ai-service.ts` (no cycles; PHASE-29 imports it from its router).
- File-collision summary: `ollama-client.ts` (PHASE-01/03 shaped it), `ai-service.ts` (PHASE-01/03/04/06/07/08 all touched it), `ipc-schemas.ts` + `types.ts` + `preload/index.d.ts` + `campaign.ts` + `ai-dm-routing.ts` (PHASE-01B/01E plumbed `contextLength`/`ollamaKvCacheType` through the same chain — mirror that pattern exactly), `AiDmCard.tsx` (PHASE-10). All earlier phases are complete by the time this executes; just re-verify anchors.

## Verified findings

All claims verified 2026-06-10 against the live tree (pre-PHASE-01..22 execution; line numbers will have drifted by execution time — every finding includes a re-verification command).

### F1 — Mechanics are regex-harvested from prose and repaired with `repairJson`; constrained decoding is used nowhere

The AI DM emits mechanics as `[STAT_CHANGES]`/`[DM_ACTIONS]` JSON blocks inside its freeform narration, and the main process regex-extracts and "repairs" them:

- `src/main/ai/stat-mutations.ts:33-69` — `parseStatChangesDetailed` runs `response.matchAll(/\[STAT_CHANGES\]\s*([\s\S]*?)\s*\[\/STAT_CHANGES\]/g)`, passes each block through `repairJson` (`:44`), `JSON.parse`, `StatChangesBlockSchema.safeParse`, then `validateStatChanges`.
- `src/main/ai/dm-actions.ts:492-529` — `parseDmActionsDetailed` does the same for `[DM_ACTIONS]` (repair at `:504`, validation via `validateDmActions`).
- `src/main/ai/ai-schemas.ts:14-53` — `repairJson` strips markdown fences, removes string-aware `//` comments, and removes trailing commas. It cannot fix truncated JSON, single quotes, unquoted keys, or an unclosed tag (a `[STAT_CHANGES]` opener with no closer never matches the regex at all and is **silently ignored** — no error, no log).
- Failed blocks are logged and dropped (`rawJsonError`), never retried — a small local model that emits malformed JSON loses the entire mechanical effect of its turn.

Re-verify:
```bash
grep -n "matchAll\|repairJson" dnd-app/src/main/ai/stat-mutations.ts dnd-app/src/main/ai/dm-actions.ts
sed -n '14,53p' dnd-app/src/main/ai/ai-schemas.ts
grep -rn "format" dnd-app/src/main/ai/ollama-client.ts      # no structured-output usage today
```

### F2 — The live completion path is `handleStreamCompletion` in `ai-service.ts`; the duplicate pipeline is gone (PHASE-08)

- `src/main/ai/ai-service.ts:735` — `handleStreamCompletion(fullText, request, conv, streamId, abortController, onChunk, onDone, onError, fileReadDepth)`; after FILE_READ/WEB_SEARCH recursion, the terminal block at `:863-922` calls `parseStatChanges(cleaned)` / `parseDmActions(cleaned)` (`:872-873`), strips tags for `displayText` (`:879`), persists conversation/memory, then calls `onDone(cleaned, displayText, statChanges, dmActions, ruleCitations)` (`:917`). Its `catch` (`:918-922`) delivers raw text with empty arrays — extraction failures must degrade to tag-parse results, never trip this catch.
- `onDone` flows to the renderer as `AI_STREAM_DONE` with `{ streamId, fullText, statChanges, dmActions, ruleCitations }` (`src/main/ipc/ai-handlers.ts:224`, payload type `AiStreamDone` `src/main/ai/types.ts:46-52`). The renderer approval pipeline (MutationApprovalPanel etc.) consumes that payload — running extraction **before** `onDone` means zero renderer protocol changes.
- The old `ai-response-parser.ts:105 finalizeAiResponse` / `ai-stream-handler.ts` pair was production-dead (only a type import at `ai-service.ts:19`) and is deleted by PHASE-08 (its plan F4/08D). The tag-parse helpers (`parseRuleCitations`, `parseVoiceTags`, `parseRulings`, strips) in `ai-response-parser.ts` remain live.

Re-verify:
```bash
grep -n "handleStreamCompletion\|parseStatChanges(cleaned)\|parseDmActions(cleaned)" dnd-app/src/main/ai/ai-service.ts
grep -rn "finalizeAiResponse" dnd-app/src --include='*.ts' | grep -v test    # expect: nothing (PHASE-08 deleted it)
```

### F3 — The schemas the model is asked to satisfy are far beyond small-model constrained-decoding reliability

- `StatChangeSchema` (`src/main/ai/ai-schemas.ts:326-364`) is a **37-member** discriminated union; many members have 3-5 optional fields.
- `DM_ACTION_SCHEMAS` (`:1276-1394`) maps **117 action types**, several deeply nested (`add_region` carries a nested shape union + action union, `cast_spell` has 16 fields).
- Research consensus (see Research notes): 7-9B models do constrained decoding reliably only on **flat** schemas — one enum discriminator, string target, one numeric field, few/no optionals, all fields required — and deep nesting/many optionals produce field hallucination and premature termination. Feeding the full 37-member union (let alone 117 actions) as a `format` schema would be slower (huge grammar) and less reliable than the flat redesign.
- Consequence (design decision carried into 23A): the extraction schema is a NEW flat shape covering the high-frequency **character/creature mechanics subset**, mapped server-side to canonical `StatChange` objects. DM board actions stay on the tag path in this phase (they are deliberate, explicitly-formatted emissions, not narration-implied mechanics; PHASE-27 extends the extraction verb set for its flat world-state deltas).

Re-verify:
```bash
node -e "
const src=require('fs').readFileSync('dnd-app/src/main/ai/ai-schemas.ts','utf8');
console.log('stat union:', src.match(/StatChangeSchema = z.discriminatedUnion\('type', \[([\s\S]*?)\]\)/)[1].split(',').filter(s=>s.trim()).length);
console.log('dm actions:', src.match(/export const DM_ACTION_SCHEMAS[\s\S]*?= \{([\s\S]*?)\n\}/)[1].split('\n').filter(l=>/:\s*\w+Schema,?$/.test(l.trim())).length);"
# → 37 and 117 on 2026-06-10
```

### F4 — `LLMProvider` has no structured-output capability; Ollama transport detail

- `src/main/ai/llm-provider.ts:21-38` — the interface is exactly `streamChat` / `chatOnce` / `isAvailable` / `listModels`. No provider exposes constrained decoding.
- `src/main/ai/ollama-client.ts` (2026-06-10 state): `ollamaStreamChat` (`:58`) and `ollamaChatOnce` (`:221-243`) POST to `${ollamaBaseUrl}/v1/chat/completions`; `ollamaChatOnce` uses `stream: false` with `AbortSignal.timeout(OLLAMA_PREFILL_TIMEOUT_MS)` (300 s, `llm-provider.ts:99`). **PHASE-01A migrates both to native `/api/chat`** — by execution time the structured call slots into that transport (NDJSON only matters for streaming; `stream:false` returns a single JSON object `{ message: { content }, done: true, prompt_eval_count, eval_count }`).
- Ollama's native `/api/chat` accepts `format` as either the string `"json"` or a full JSON-schema object (verified against https://docs.ollama.com/capabilities/structured-outputs — example body: `{ "model": …, "messages": […], "stream": false, "format": { "type": "object", "properties": …, "required": […] } }`). Structured outputs shipped in Ollama v0.5 (blog, 2024-12-06). The docs explicitly recommend temperature 0 and echoing the schema in the prompt.

Re-verify:
```bash
sed -n '21,38p' dnd-app/src/main/ai/llm-provider.ts
grep -n "chatOnce\|api/chat\|v1/chat" dnd-app/src/main/ai/ollama-client.ts
```

### F5 — Upstream constraints force `stream: false` for the extraction call (audit claims confirmed, one status correction)

- [ollama#14440](https://github.com/ollama/ollama/issues/14440) (confirmed open, affects ≥0.15.6): when **streaming + thinking + structured outputs** combine, schema enforcement silently turns off once `content` deltas begin — the model can emit markdown-fenced JSON instead of schema-valid output. Not reliably reproducible, no workaround besides not streaming.
- [ollama#12557](https://github.com/ollama/ollama/issues/12557): streamed tool-call deltas arrive as one complete chunk + an empty done-chunk, and follow-up content can be dropped. **Correction to the audit text:** the issue is *closed* (not open), but closed-unresolved as of 0.12.3 reports — the documented client-side mitigation is exactly "force `stream:false` when tools/structured output are involved".
- **Correction to the audit text:** the audit attributed Ollama's constrained decoding to "XGrammar". Ollama implements `format` via llama.cpp's grammar-based constrained sampling (GBNF converted from the JSON schema), not XGrammar; the guarantee (decoder-level schema compliance) is the same, the engine name in the audit was wrong. No design impact.
- Consequence: the extraction call is **always `stream: false`**, sets `options: { temperature: 0 }`, and does not pass `think` (passing `think: false` to a non-thinking model errors; with `stream:false` the thinking interaction bug above is moot).

### F6 — No extraction/structured setting exists anywhere in the AI config chain

The full config chain (each link verified; PHASE-01B/01E added `contextLength`/`ollamaKvCacheType` through these exact same links — mirror them):

- Main types: `AiConfig` `src/main/ai/types.ts:5-14` (`provider, model, ollamaUrl, claudeApiKey?, openaiApiKey?, geminiApiKey?, ollamaModel? (deprecated)`).
- Zod boundary: `AiConfigSchema` `src/shared/ipc-schemas.ts:5-13`, parsed in the `AI_CONFIGURE` handler `src/main/ipc/ai-handlers.ts:108-122` (uses `parsed.data`).
- Persistence: `ai-service.ts` `currentConfig` literal `:272-283`, `configure()` `:325-374` (atomic write of `ai-config.json`), `getConfig()` `:376-402`, `initFromSavedConfig()` `:405-411`.
- Preload: `AiConfigData` `src/preload/index.d.ts:137-145`; invoke `src/preload/index.ts:81` (`configure: (config) => ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIGURE, config)`).
- Renderer: `AiDmConfig` `src/renderer/src/types/campaign.ts:63-74`; pushed per-campaign by `configureAiFromCampaign` `src/renderer/src/services/ai-dm-routing.ts:27-48`; edited in `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` (modal state `aiDmConfig` `:16-28`, Save handler assembles `campaign.aiDm` + calls `window.api.ai.configure` `:98-125`) wrapping `src/renderer/src/components/campaign/AiProviderSetup.tsx` (whose `onChange` data is `{enabled, provider, model, ollamaUrl, apiKey}`, `:41-46`).

Re-verify: `grep -rn "structuredExtraction" dnd-app/src` → must be empty before 23D.

### F7 — Game-state inputs for value validation already reach the main process; nothing validates against them at parse time

- `AiChatRequest` (`src/main/ai/types.ts:25-33`) carries `characterIds: string[]`, `activeCreatures?: ActiveCreatureInfo[]` (`{ label, currentHP, maxHP, ac, conditions[], monsterStatBlockId? }`, `:16-23`) and `gameState?: string` — i.e. the party + map-creature label universe is available inside `handleStreamCompletion` via the in-scope `request`.
- Character names resolve main-side via `loadCharacterById` (`src/main/ai/character-context.ts:20-23`, wrapping `loadCharacter` from `../storage/character-storage`).
- Today the only value-vs-state checks are **apply-time** per-character rules in `validateChange` (`src/main/ai/stat-mutations.ts:100+` — positive damage/heal, condition presence, etc.), which run when the renderer later invokes `AI_APPLY_MUTATIONS` for a specific character id. **Nothing** checks at parse time that `characterName` matches any party member, that `targetLabel` matches any map creature, or that values are within sane bounds — schema-valid hallucinations (`"Bob"` damage 99999 against a party of Aria/Korgan) flow straight to the approval UI.
- Zod note (verified empirically by PHASE-02): repo zod is **4.4.3** and `z.number()` already rejects `NaN`/`Infinity`, so numeric *type* garbage is caught — *range* and *referent* garbage is not.

Re-verify:
```bash
sed -n '16,33p' dnd-app/src/main/ai/types.ts
grep -n "validateChange" dnd-app/src/main/ai/stat-mutations.ts
grep -rn "characterName\b.*match\|targetLabel.*match" dnd-app/src/main/ai | grep -v test   # nothing at parse time
```

### F8 — zod 4.4.3 has native `z.toJSONSchema()`; output shape confirmed against the installed package

Verified by running against the installed dependency (not docs):

```bash
cd dnd-app && node -e "
const { z } = require('zod');
const S = z.object({ changes: z.array(z.object({ type: z.enum(['damage','heal']), target: z.string(), value: z.number(), name: z.string(), reason: z.string() })) });
console.log(JSON.stringify(z.toJSONSchema(S)));"
```

Output: draft-2020-12 schema with `type/properties/required` and `additionalProperties: false` — exactly the shape Ollama's `format` accepts (F4). No `zod-to-json-schema` dependency is needed (that package is the zod-v3 era tool; zod 4 ships the converter — https://zod.dev/json-schema). Note `z.enum` → `"enum": [...]`, all object fields land in `required` when non-optional, which is precisely the small-model discipline 23A wants.

### F9 — Cloud providers are out of the extraction path by design (current state)

`claude-client.ts` / `openai-client.ts` / `gemini-client.ts` implement only the F4 interface; none has JSON-mode/tool-use plumbing today. Cloud models are not the failure class this phase targets (the audit's repairJson/validation-reject pain is "small local models"); the capability is therefore optional on the interface (`structuredOnce?`) and implemented for Ollama only. Cloud structured-output support is explicitly out of scope (see Out of scope) — when the active provider lacks the capability, extraction is skipped with a one-line debug log regardless of mode.

Re-verify: `grep -n "response_format\|json_schema\|tool" dnd-app/src/main/ai/openai-client.ts dnd-app/src/main/ai/claude-client.ts dnd-app/src/main/ai/gemini-client.ts` (no structured-output plumbing as of 2026-06-10).

### F10 — `repairJson` has no usage telemetry, so "retire it" is currently unfalsifiable

`repairJson` (`ai-schemas.ts:14-53`) returns a string; call sites (`dm-actions.ts:504`, `stat-mutations.ts:44`) cannot tell whether it changed anything, and no log line distinguishes "block was already valid" from "repair saved the block" from "repair was insufficient". Tests pin its behavior (`ai-schemas.test.ts:15-50`). Retiring it safely requires knowing how often it fires and whether the structured path makes it cold — that instrumentation is 23F.

## Sub-phases

Execution order keeps the tree green: 23A/23B/23C are pure additions (new modules + a new optional provider method), 23D is config plumbing (inert until a mode is set), 23E wires the feature (gated by the default-`off` mode), 23F is instrumentation + docs.

---

### 23A — Flat extraction schema + prompt + mapper (`structured-extraction.ts`)

**Objective:** a pure, cycle-free module that defines the small-model extraction schema, builds the two prompts, parses the structured response, and maps flat results to canonical `StatChange` objects.

**Files:** new `src/main/ai/structured-extraction.ts`, new `src/main/ai/structured-extraction.test.ts`.

**Steps:**

1. Define the flat schema (zod first, JSON schema derived):

   ```ts
   export const EXTRACTION_CHANGE_TYPES = [
     'damage', 'heal', 'temp_hp', 'add_condition', 'remove_condition',
     'expend_spell_slot', 'restore_spell_slot', 'add_item', 'remove_item',
     'gold', 'xp', 'add_exhaustion'
   ] as const   // high-frequency mechanics; exported so PHASE-27 can extend
   
   const ExtractedChangeSchema = z.object({
     type: z.enum(EXTRACTION_CHANGE_TYPES),
     target: z.string(),   // character name or map creature label; '' = the acting character
     value: z.number(),    // amount (damage/heal/gold/xp/slot level/exhaustion levels); 0 when N/A
     name: z.string(),     // condition/item name; '' when N/A
     reason: z.string()
   })
   export const ExtractionResultSchema = z.object({ changes: z.array(ExtractedChangeSchema) })
   export const EXTRACTION_JSON_SCHEMA = z.toJSONSchema(ExtractionResultSchema) as Record<string, unknown>
   ```

   Discipline (from F3/F8 + research): ONE object shape, no unions, no optionals (sentinels `''`/`0` instead), all fields required, `additionalProperties: false` comes free from `z.toJSONSchema`.

2. `buildExtractionPrompts(narration: string, snapshot: GameStateSnapshot): { system: string; user: string }`:
   - `system`: brief role ("You extract D&D 5e mechanical changes from a DM narration; respond ONLY as JSON"), the JSON schema embedded verbatim (`JSON.stringify(EXTRACTION_JSON_SCHEMA)` — schema echo is the documented best practice for small models, F4), per-type one-line semantics (e.g. `expend_spell_slot: value = slot level 1-9`), and the rule "if no mechanical changes occurred, return {\"changes\":[]}".
   - `user`: the **display-stripped** narration text (tags removed — the model must extract from prose, not copy a possibly-broken tag block) + a compact referent list: `Party: <names>` / `Creatures on map: <labels>` from the snapshot. Keep this prompt small (it re-prefills from scratch; see Research notes on KV-cache cost).
   - `GameStateSnapshot` type lives in 23C's module; import the *type* only (no runtime dep) or define it here and have 23C import it — pick one direction, no cycle.
3. `parseExtractionResponse(content: string): { changes: ExtractedChange[] } | null`:
   - Trim; `JSON.parse` directly. On failure, slice `content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)` and retry once (defends against the F5 markdown-fence corner). **Do NOT call `repairJson`** — the structured path must never depend on the module it is retiring.
   - `ExtractionResultSchema.safeParse` the result; on failure return `null` (callers log + fall back).
4. `mapExtractedToStatChanges(extracted, snapshot): { changes: StatChange[]; issues: string[] }`:
   - Resolve `target` against the snapshot: exact case-insensitive match on party character names → `characterName`; exact case-insensitive match on creature labels → creature-prefixed variant (`damage`→`creature_damage`, `heal`→`creature_heal`, `add_condition`→`creature_add_condition`, `remove_condition`→`creature_remove_condition`); unique case-insensitive **prefix** match as a second pass (mirrors the executor prefix fallback); `''` → `characterName: undefined` (downstream treats as acting character); no match → drop with an issue string.
   - Creature-incompatible types with a creature target (e.g. `xp` on a goblin label) → drop with issue.
   - Emit canonical objects per the `StatChange` union (`types.ts:197-273`): e.g. `{ type:'damage', characterName, value, damageType: undefined, reason }`, `{ type:'add_condition', characterName, name, reason }`, `{ type:'expend_spell_slot', characterName, level: value, reason }`, `{ type:'add_exhaustion', characterName, levels: value, reason }`, `{ type:'gold', characterName, value, reason }` etc. Re-validate the mapped array through `validateStatChanges` (import from `./ai-schemas`) so every downstream invariant holds; merge its rejects into `issues`.
5. Module hygiene: imports limited to `zod`, `./ai-schemas`, `./types`, (type-only) the snapshot type — NOT `ai-service`, NOT `ollama-client` (PHASE-29 cycle rule).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/structured-extraction.test.ts`.

**Acceptance:** schema constant matches F8's verified shape (all five fields `required`, `additionalProperties:false`, enum of 12 types); parser handles clean JSON / fenced JSON / garbage→null; mapper resolves party vs creature targets incl. prefix fallback and drops unknowns with issues; no import cycles (`npx madge --circular src/main/ai/structured-extraction.ts` if available, else review imports).

---

### 23B — Ollama `structuredOnce` provider capability

**Objective:** a non-streaming, `format`-constrained chat call on the Ollama provider, reusing PHASE-01's transport (`/api/chat`, `keep_alive`, `num_ctx`).

**Files:** `src/main/ai/llm-provider.ts`, `src/main/ai/ollama-client.ts`, `src/main/ai/ollama-client.test.ts`.

**Steps:**

1. `llm-provider.ts`: extend the interface with an **optional** method (keeps every other provider compiling untouched):

   ```ts
   structuredOnce?(
     systemPrompt: string,
     messages: ChatMessage[],
     model: string,
     jsonSchema: Record<string, unknown>
   ): Promise<string>
   ```

2. `ollama-client.ts`: implement `ollamaStructuredOnce` modeled on the post-PHASE-01 `ollamaChatOnce`:
   - POST `${ollamaBaseUrl}/api/chat`, body `{ model, messages: apiMessages, stream: false, format: jsonSchema, keep_alive: <PHASE-01 constant>, options: { num_ctx: <PHASE-01 resolveNumCtx(model, ollamaBaseUrl)>, temperature: 0 } }` (F4/F5; if PHASE-01's final body-builder is a shared helper, reuse it and add `format` + the temperature override).
   - `stream: false` is non-negotiable (F5 upstream issues). Do not pass `think`.
   - Timeout: `AbortSignal.timeout(OLLAMA_PREFILL_TIMEOUT_MS)` (same 300 s ceiling as `ollamaChatOnce`; the extraction prompt is small so it normally returns in seconds, but a cold CPU prefill must not be killed early).
   - Errors via the existing `ollamaHttpError(status, body, model)`; return `data.message?.content ?? ''` (native response shape) — adapt to whatever response-extraction PHASE-01A landed.
   - Register on the provider object: `ollamaProvider.structuredOnce = ollamaStructuredOnce`.
3. Tests (`ollama-client.test.ts`, mocked `fetch`): asserts URL `/api/chat`; body has `stream:false`, `format` deep-equal to the passed schema, `options.temperature === 0`, `options.num_ctx` present, `keep_alive` present; returns content; non-OK → throws with the 404 pull-hint preserved; cloud providers still have `structuredOnce === undefined` (assert on one of them via the provider registry or direct import).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/ollama-client.test.ts`.

**Acceptance:** capability callable with any JSON schema; request shape verified by tests; no change to `streamChat`/`chatOnce` behavior; interface change compiles with zero edits to claude/openai/gemini clients.

---

### 23C — Game-state snapshot + value validation + dedupe (`game-state-validation.ts`)

**Objective:** the "constrained decoding guarantees shape, not truth" layer — pure functions that build a referent snapshot and validate/clamp/dedupe `StatChange` arrays against it.

**Files:** new `src/main/ai/game-state-validation.ts`, new `src/main/ai/game-state-validation.test.ts`.

**Steps:**

1. ```ts
   export interface GameStateSnapshot {
     partyNames: string[]        // resolved character names for request.characterIds
     creatureLabels: string[]    // request.activeCreatures?.map(c => c.label) ?? []
   }
   export async function buildGameStateSnapshot(request: AiChatRequest): Promise<GameStateSnapshot>
   ```
   `buildGameStateSnapshot` resolves names via `loadCharacterById` (`character-context.ts:20`, F7); tolerate load failures (skip id, keep going).
2. `validateAgainstGameState(changes: StatChange[], snapshot: GameStateSnapshot): { valid: StatChange[]; rejected: Array<{ change: StatChange; reason: string }> }` — rules:
   - **Referents:** `characterName` set but matching no party name (case-insensitive exact, then unique prefix) → reject `unknown character`; `targetLabel` matching no creature label (same matching) → reject `unknown creature`. Unset `characterName` passes (acting-character semantics).
   - **Bounds (clamp-free, reject-only; rejection text names the bound):** `damage`/`heal`/`creature_damage`/`creature_heal` value ∈ [1, 1000]; `temp_hp` ∈ [0, 1000]; `gold` |value| ≤ 100000; `xp` ∈ [0, 100000]; `expend_spell_slot`/`restore_spell_slot`/`creature_*_spell_slot` level ∈ [1, 9] (+ `count` ∈ [1, 4] when present); `add_exhaustion` levels ∈ [1, 6]; `set_ability_score` value ∈ [1, 30]; `hit_dice` |value| ≤ 20. Non-integer where integers are expected (slot level, exhaustion levels, count) → reject.
   - Types not listed pass through untouched (this layer must never block exotic-but-legal tag-path changes).
3. `dedupeStatChanges(base: StatChange[], incoming: StatChange[]): StatChange[]` — returns `incoming` minus entries already present in `base`; identity key = stable JSON of the change with key-sorted fields and `reason` omitted (the model rephrases reasons; the mechanics are the duplicate). Case-insensitive on `characterName`/`targetLabel`/`name`.
4. Keep the module pure (imports: `./types`, `./character-context`; no `ai-service`).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/game-state-validation.test.ts`.

**Acceptance:** every rule above has a passing test (valid case + reject case); dedupe drops an extraction echo of a tag-path change; snapshot builder tolerates a failing character load.

---

### 23D — Config plumbing + opt-in UI (default `off`)

**Objective:** `structuredExtraction: 'off' | 'fallback' | 'always'` through the full F6 chain, defaulting to `off` everywhere (absent = `off`), with a small Ollama-only select in the AI DM settings modal.

**Files:** `src/main/ai/types.ts`, `src/shared/ipc-schemas.ts`, `src/main/ai/ai-service.ts`, `src/preload/index.d.ts`, `src/renderer/src/types/campaign.ts`, `src/renderer/src/services/ai-dm-routing.ts`, `src/renderer/src/pages/campaign-detail/AiDmCard.tsx`, `src/renderer/src/pages/campaign-detail/AiDmCard.test.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. Shared type: `export type StructuredExtractionMode = 'off' | 'fallback' | 'always'` in `src/main/ai/types.ts`; `AiConfig += structuredExtraction?: StructuredExtractionMode` (`types.ts:5-14`).
2. `ipc-schemas.ts` `AiConfigSchema += structuredExtraction: z.enum(['off','fallback','always']).optional()` (`:5-13`).
3. `ai-service.ts`: add the field to the `currentConfig` literal type + default object (`:272-283`, default `undefined` ≡ off), `configure()` assignment + persisted JSON (`:339-373`), `getConfig()` read (`saved.structuredExtraction as StructuredExtractionMode | undefined`, `:376-402`); export `function getStructuredExtractionMode(): StructuredExtractionMode { return currentConfig.structuredExtraction ?? 'off' }` for 23E and tests. (`initFromSavedConfig` needs no extra call — the mode is read from `currentConfig` at use time, unlike PHASE-01's module-level setters.)
4. Preload: `AiConfigData += structuredExtraction?: string` (`index.d.ts:137-145`; the invoke at `index.ts:81` passes the object through untouched — no edit needed there).
5. Renderer: `AiDmConfig += structuredExtraction?: 'off' | 'fallback' | 'always'` (`campaign.ts:63-74`); `configureAiFromCampaign` passes `structuredExtraction: aiDm.structuredExtraction` (`ai-dm-routing.ts:34-41`).
6. `AiDmCard.tsx`: add `structuredExtraction` to the modal state (`:16-28`, seeded from `campaign.aiDm?.structuredExtraction ?? 'off'` in `openConfigure`, `'off'` in `openEnable`); render a labeled `<select>` **below** `<AiProviderSetup>` (`:84-93`), visible only when `aiDmConfig.provider === 'ollama'`, options Off / On parse failure / Every response; include the field in the Save handler's `aiDm` object and `window.api.ai.configure` payload (`:100-119`). Do NOT thread it through `AiProviderSetup`'s `onChange` (its data shape `:41-46` stays untouched — less churn against PHASE-10's edits).
7. i18n: keys under `pages.aiDmCard.structuredExtraction*` (label, help line "Extracts game mechanics with a second schema-constrained model call (local Ollama only)", option labels) in **both** `en.json` and `es.json`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/renderer/src/pages/campaign-detail/AiDmCard.test.tsx`.

**Acceptance:** `AI_CONFIGURE` round-trips the mode (configure → getConfig); absent field ≡ `'off'`; select renders only for Ollama provider, persists into the saved campaign and the configure payload; both locales have the keys; with the field unset nothing about existing flows changes.

---

### 23E — Two-call wiring in `handleStreamCompletion`

**Objective:** run the extraction call at the right moments, merge + validate, keep every failure degrading to today's behavior.

**Files:** `src/main/ai/ai-service.ts`, `src/main/ai/structured-extraction.ts` (orchestrator entry point), `src/main/ai/ai-service.test.ts`, `src/main/ai/structured-extraction.test.ts`.

**Steps:**

1. In `structured-extraction.ts`, add the orchestrator (provider passed in — no cycle, PHASE-29 routes by swapping these arguments):

   ```ts
   export async function runStructuredExtraction(
     provider: Pick<LLMProvider, 'structuredOnce'>,
     model: string,
     narrationDisplayText: string,
     snapshot: GameStateSnapshot
   ): Promise<{ changes: StatChange[]; issues: string[] } | null>
   ```
   Skip (return `null`, debug log) when `provider.structuredOnce` is undefined. Build prompts (23A), call `structuredOnce`, parse, map. Any throw → caught, `logToFile('WARN', '[AI Extraction] …')`, return `null`.
2. In `ai-service.ts` `handleStreamCompletion`'s terminal block (`:863-922`), after `parseStatChanges`/`parseDmActions` (`:872-873`) and after `displayText` is computed (`:879`), insert (before `conv.addMessage`/`onDone`):
   - `const mode = getStructuredExtractionMode()`; if `'off'` → skip everything (zero new awaits on the default path).
   - Detect tag-parse failure for `'fallback'`: re-run the detailed parsers once (`parseStatChangesDetailed`/`parseDmActionsDetailed` — replace the `:872-873` calls so detailed results are computed exactly once and `.changes`/`.actions` reused) and treat as failed when either `rawJsonError` is set, OR a parser returned ≥1 issue with 0 valid items, OR an **orphan opener** exists (`/\[STAT_CHANGES\]/.test(cleaned)` with no closed block — F1's silent case; add tiny helpers `hasOrphanStatChangesTag`/`hasOrphanDmActionsTag` to the respective parser modules with unit tests).
   - When extraction should run (`'always'`, or `'fallback'` + failure): `const snapshot = await buildGameStateSnapshot(request)`; `const extracted = await runStructuredExtraction(getActiveProvider(), <model resolved for this stream>, displayText, snapshot)`. Reuse the model id already resolved at `startChat` (`:652` `resolveOllamaModel`) — thread it into `handleStreamCompletion` as a parameter rather than re-resolving.
   - Merge: `statChanges = [...tagChanges, ...dedupeStatChanges(tagChanges, extracted.changes)]`, then `const { valid, rejected } = validateAgainstGameState(statChanges, snapshot)`; `statChanges = valid`; log each rejection (`[AI Extraction] rejected: <reason>`). Game-state validation runs on the merged set **only when extraction mode ≠ off** (off = byte-identical legacy behavior).
   - `dmActions` are untouched by extraction in this phase (F3 decision).
   - Wrap the entire insertion in its own `try/catch` that logs and falls back to the tag-parse results — it must never reach the outer `:918` catch (which would discard tag results and deliver raw text).
3. Latency note (document in code comment): in `always`/triggered-`fallback` the second call delays `AI_STREAM_DONE` by the extraction round-trip; narration chunks have already streamed to the renderer, so the user-visible cost is the mutation-approval prompt arriving a few seconds later. Acceptable and inherent to the two-call design; the mode is opt-in.
4. Tests:
   - `ai-service.test.ts`: mode `off` → provider `structuredOnce` never called; mode `always` → called once per completion, merged+deduped results delivered through `onDone`; mode `fallback` + well-formed tags → not called; mode `fallback` + malformed `[STAT_CHANGES]` (and separately: orphan opener) → called, extraction results delivered; extraction throwing → tag results delivered unchanged; validation rejection (unknown name from extraction) → that change absent from `onDone` payload. Follow the file's existing module-mock pattern for providers.
   - `structured-extraction.test.ts`: orchestrator skip-when-no-capability; error→null.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/ai-service.test.ts src/main/ai/structured-extraction.test.ts src/main/ai/stat-mutations.test.ts src/main/ai/dm-actions.test.ts`.

**Acceptance:** all four mode behaviors test-verified; default (`off`) path has zero new awaits/calls (assert `structuredOnce` mock uncalled); no change to the `AI_STREAM_DONE` payload shape; orphan-opener helpers covered.

---

### 23F — `repairJson` retirement instrumentation + contract docs

**Objective:** make repairJson usage measurable and write down the retirement criteria; no behavior change.

**Files:** `src/main/ai/ai-schemas.ts`, `src/main/ai/ai-schemas.test.ts`, `src/main/ai/dm-actions.ts`, `src/main/ai/stat-mutations.ts`, `src/main/ai/AI_ACTION_CONTRACT.md`.

**Steps:**

1. `ai-schemas.ts`: add `export function repairJsonDetailed(raw: string): { repaired: string; modified: boolean }` (compute once; `repairJson` becomes a thin wrapper returning `.repaired` so the existing tests at `ai-schemas.test.ts:15-50` and any external callers stay valid). Add a module-level counter `let repairCount = 0` + `export function getRepairJsonStats(): { invocations: number; modified: number }` (incremented inside `repairJsonDetailed`; exported for tests and future PHASE-14-style surfacing).
2. `dm-actions.ts:504` / `stat-mutations.ts:44`: switch to `repairJsonDetailed`; when `modified === true`, `logToFile('INFO', '[AI Schema] repairJson modified a [DM_ACTIONS]|[STAT_CHANGES] block')` — the measurable signal that the tag path still needs repair.
3. Retirement criteria — add a doc comment above `repairJsonDetailed` AND a short section in `AI_ACTION_CONTRACT.md` ("Structured extraction & repairJson retirement"): repairJson is deletable when (a) `structuredExtraction: 'always'` is the default, (b) the narration prompt no longer instructs tag emission (future work, see plan PHASE-23 Out of scope), and (c) the modified-counter stays at zero across releases. Until then it serves the tag path only; the structured path never calls it (23A rule).
4. `ai-schemas.test.ts`: `repairJsonDetailed` reports `modified:false` on valid JSON, `true` on fenced/trailing-comma input; `getRepairJsonStats` counts; existing `repairJson` suite untouched and green.
5. `AI_ACTION_CONTRACT.md` also gains a paragraph documenting the extraction flat schema (12 types, field semantics, `target` resolution rules) so prompt/contract readers know mechanics can arrive via either path.

**Cheap checks:** `npx vitest run src/main/ai/ai-schemas.test.ts src/main/ai/dm-actions.test.ts src/main/ai/stat-mutations.test.ts`.

**Acceptance:** zero behavioral diff (wrapper preserves `repairJson` signature); modified-flag logging in both call sites; retirement criteria written in both places.

---

## Research notes

- **Ollama structured outputs (the core mechanism).** Native `/api/chat` accepts `format` as `"json"` or a JSON-schema object; schema-constrained decoding lands at the sampler level (llama.cpp grammar built from the schema — the audit's "XGrammar" attribution was wrong, corrected in F5; the compliance guarantee is the same). Official guidance: `stream:false` examples only, temperature 0, echo the schema in the prompt, define schemas via zod and serialize. Ollama Cloud does not support structured outputs (irrelevant here — local only). Sources: https://docs.ollama.com/capabilities/structured-outputs , https://ollama.com/blog/structured-outputs (feature announcement, 2024-12-06).
- **Why `stream: false` is mandatory for the extraction call.** Schema enforcement silently disables when streaming combines with thinking output (open bug, observed on 0.15.6): https://github.com/ollama/ollama/issues/14440 . Streamed structured/tool deltas can also drop follow-up content (closed-unresolved; documented mitigation is exactly "force stream:false"): https://github.com/ollama/ollama/issues/12557 .
- **Why a flat 12-type schema instead of the real 37-member union.** 7-9B-class models are reliable under constrained decoding only with simple schemas — flat object, enum discriminator, few/no optionals, all-required fields, temperature 0, schema echoed in the prompt; deep nesting and many optionals produce field hallucination, premature termination, and "correct JSON then trailing commentary". gpt-oss-style models are notably weak here; qwen3-class models comply well. Mitigations adopted: sentinel-valued required fields, server-side mapping to the rich union, post-parse game-state validation, and a brace-slice fallback parse. Sources: https://www.glukhov.org/post/2025/10/ollama-gpt-oss-structured-output-issues/ , https://www.glukhov.org/llm-performance/ollama/llm-structured-output-with-ollama-in-python-and-go/ , https://techsy.io/en/blog/llm-structured-outputs-guide , https://docs.ollama.com/capabilities/structured-outputs .
- **Two-call hybrid over single-call constrained narration.** Forcing the whole DM turn through a schema kills prose quality (constrained decoding degrades narrative register, and a narration+mechanics mega-schema violates the flat-schema rule). The working pattern in LLM-GM projects: freeform narration, then "emit the mechanics for what you just narrated" as a separate constrained call — equivalently the "LLM emits deltas, engine owns truth" engine pattern PHASE-27 completes. Sources: https://ollama.com/blog/structured-outputs , https://neo4j.com/blog/developer/agentic-memory-multi-user-dungeon/ , https://github.com/Maximilian-Winter/VirtualGameMaster .
- **Why the narration prompt keeps its tag instructions in ALL modes (this phase).** Removing `[STAT_CHANGES]`/`[DM_ACTIONS]` instructions when `always` is active would (a) fork the system prompt by config — `assembleSystemPrompt` (`prompt-assembler.ts:25-62`) and five prompt-section files would need a parallel variant, (b) regress DM board actions, which extraction does not cover in this phase, and (c) interact with PHASE-11's freshly-landed contract wording. Tag emission + extraction merge with dedupe is strictly safer; prompt slimming becomes worthwhile only at retirement time (23F criteria b). Log the slimming idea to `docs/SUGGESTIONS-LOG-DNDAPP.md` during execution (rule 12).
- **KV-cache interaction (PHASE-01 synergy/caveat).** The extraction request has a different prefix than the narration conversation, so on a single-slot Ollama (`OLLAMA_NUM_PARALLEL=1`) it can evict the narration prefix cache, forcing the *next* narration turn to re-prefill. Mitigations: extraction prompt kept deliberately tiny (narration text + name lists, not the campaign context), identical `num_ctx`/`keep_alive` so no model reload, and the feature is opt-in. With multiple parallel slots the runner places requests by best prefix match and both caches can coexist. Sources: https://jonathanding.github.io/llm-learning/en/articles/ollama-kv-cache-scheduling/ , https://docs.ollama.com/faq .
- **zod 4 native JSON-schema export.** `z.toJSONSchema(schema)` (zod ≥4, repo has 4.4.3) emits draft-2020-12 with `required` + `additionalProperties:false`; no `zod-to-json-schema` dependency needed. Verified against the installed package (F8). Source: https://zod.dev/json-schema .
- **Alternatives considered.** (1) OpenAI-compat `response_format: json_schema` against Ollama's `/v1` endpoint — rejected: PHASE-01 moved transport to native `/api/chat`, and native `format` is the documented first-class path (PHASE-29's llama-server flavor will use `response_format`, noted in its plan). (2) Retry-with-`format` only re-asking the model to fix its own broken block — rejected: re-sending the broken block teaches the model to copy it; extracting from the narration prose is more robust and identical machinery serves both `fallback` and `always`. (3) Covering DM actions in the extraction schema now — rejected per F3 (117 actions, deep nesting); PHASE-27 extends the verb list with deliberately flat verbs instead.

## Test plan

- **23A** `structured-extraction.test.ts` — JSON-schema shape (12-type enum, all fields required, `additionalProperties:false`); prompt builder embeds schema + referent lists + empty-result instruction; parser: clean / fenced / trailing-garbage / unparseable→null; mapper: party-name damage → `damage`+`characterName`, creature-label damage → `creature_damage`+`targetLabel`, case-insensitive + unique-prefix resolution, unknown target dropped with issue, creature-incompatible type dropped, slot-level/exhaustion field mapping, output passes `validateStatChanges`.
- **23B** `ollama-client.test.ts` — request URL/body assertions (`stream:false`, `format`, `temperature:0`, `num_ctx`, `keep_alive`), content extraction, HTTP-error mapping, capability absent on cloud providers.
- **23C** `game-state-validation.test.ts` — every bounds rule (accept + reject), referent matching, pass-through of unlisted types, dedupe identity (reason ignored, case-insensitive), snapshot builder with a failing character load.
- **23D** `AiDmCard.test.tsx` — select hidden for cloud provider, shown for Ollama, default `off`, chosen mode lands in `saveCampaign` payload + `window.api.ai.configure` call. (Plus an `ipc-schemas` assertion — accepts the three values, rejects others — colocated wherever `AiConfigSchema` tests live, else inside `ai-service.test.ts`.)
- **23E** `ai-service.test.ts` — the four mode behaviors, failure degradation, validation filtering, orphan-opener triggers; `dm-actions.test.ts`/`stat-mutations.test.ts` — orphan-opener helper units.
- **23F** `ai-schemas.test.ts` — `repairJsonDetailed` modified-flag + stats counter; legacy `repairJson` suite unchanged.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `npm run lint` + `npx tsc --noEmit -p tsconfig.web.json` + `npx tsc --noEmit -p tsconfig.node.json` + full `npx vitest run`. No Pi code is touched — no pytest leg.

## Acceptance criteria

1. With `structuredExtraction` unset/`off` (the default), runtime behavior is byte-identical to pre-phase: no extraction call, no game-state validation pass, no new awaits in `handleStreamCompletion`, `AI_STREAM_DONE` payload unchanged (test-asserted).
2. With `fallback`, a malformed or orphan-opener `[STAT_CHANGES]` block triggers exactly one `structuredOnce` call whose validated results reach `onDone`; well-formed tags trigger nothing.
3. With `always`, every completed response triggers one extraction call; results merge with tag results without duplicates; the merged set passes game-state validation before delivery.
4. The extraction request is provably (test-asserted) `stream:false`, `format`=flat schema, `temperature:0`, with PHASE-01's `num_ctx`/`keep_alive` intact; the structured path never invokes `repairJson`.
5. Schema-valid hallucinations — unknown character, unknown creature label, out-of-bounds value — are rejected main-side with logged reasons and never reach the renderer approval UI (when mode ≠ off).
6. Cloud providers compile untouched; with a cloud provider active, any mode setting results in a skipped extraction (logged), not an error.
7. The mode round-trips through campaign save → `AI_CONFIGURE` → `ai-config.json` → `getConfig`, and the UI select is Ollama-gated with keys in both locales.
8. `repairJsonDetailed`/`getRepairJsonStats` land with both call sites logging modification events; retirement criteria documented in `ai-schemas.ts` and `AI_ACTION_CONTRACT.md`.
9. End-of-phase 4-gate green; one commit; plan moved to `completed/`.

## Out of scope

- **DM board-action extraction** (the 117-action space) — tag path remains their only channel this phase; PHASE-27 adds its flat world-state delta verbs to the extraction type list (**PHASE-27**).
- **Routing the extraction call to a different/smaller model** and the llama-server `response_format` flavor — **PHASE-29** (this phase keeps the call on the active model, parameterized for 29).
- **Cloud-provider structured outputs** (OpenAI `response_format`, Claude tool-forcing, Gemini `responseSchema`) — deliberately unbuilt (F9); revisit only if cloud tag-parse failures ever materialize (log to `docs/SUGGESTIONS-LOG-DNDAPP.md` if observed).
- **Actually deleting `repairJson` / removing tag instructions from the narration prompt** — gated on the 23F retirement criteria; a future cleanup, not this phase.
- **Surfacing extraction/validation/repair stats in UI** — context-inspector/observability is **PHASE-14** territory (already executed for its own scope; extending it with these counters is a logged suggestion, not phase work).
- **`num_ctx`/`keep_alive`/options stability machinery** — owned and shipped by **PHASE-01**; this phase only consumes it.
- **Entity/lore extraction calls** (NPCs, locations, items into memory) — **PHASE-25**.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
