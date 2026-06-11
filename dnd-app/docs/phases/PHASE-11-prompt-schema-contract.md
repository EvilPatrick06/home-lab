# PHASE-11 — Prompt ↔ schema contract: action docs, union gaps, mode collapse, prompt truth, actor context, vision honesty

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the AI DM's system prompt and its machine contracts tell the truth and agree with each other. Today the prompt documents three `[STAT_CHANGES]` types under `[DM_ACTIONS]` (so a model that follows the docs gets its actions silently dropped), two fully-working DM actions are missing from the hand-written `DmAction` union, the modular "token-saving" GameMode machinery has two unreachable modes and zero savings, the prompt simultaneously forbids and mandates `**bold**` in output, the travel-pace rules mix 2014 and 2024 PHB wording across prompt and UI, the emotion vocabulary the prompt requests is not pinned anywhere testable, the per-actor full/abbreviated character-context split is dead at both ends (no caller passes `actingCharacterId` and the zod schema strips it anyway), the AI's character context is missing weapons/armor/spells/feats/magic-item names for every v4 character, and "AI Vision" captures and base64-encodes a screenshot it never sends while telling the model an image was provided. This phase fixes every one of those contract breaks: corrected prompt docs, a union-completeness CI gate, a collapsed (prefix-cache-stable) prompt assembler, 2024-accurate travel pace in prompt + UI, exported emotion-vocabulary constants, end-to-end `actingCharacterId` wiring, v4-aware character-context hydration, and an honest text-only map analysis with the dead capture IPC removed.

## Dependencies & cross-phase notes

PHASE-11 has no hard dependency in PHASE-INDEX.md, but it executes after phases 01–10 in numeric order, and several of those touch the same files. **Re-verify every line number cited below before editing (INSTRUCTIONS.md rule 3); the citations were taken 2026-06-10, before phases 01–10 landed.**

- **PHASE-01 (ollama-context-window)** — edits `src/main/ai/conversation-manager.ts`, `context-builder.ts`, and adds `getStaticSystemPromptTokens()` to `src/main/ai/token-budget.ts` which calls `assembleSystemPrompt('general')`. Sub-phase 11B removes the `GameMode` parameter; update that token-budget call site to the zero-arg form. PHASE-01 also established (verified by execution) that `assembleSystemPrompt('combat') === assembleSystemPrompt('general')` byte-for-byte and treats the static rules base as a **stable cacheable prefix** — 11B's collapse preserves that property by design; do NOT "implement mode detection" instead (it would invalidate the Ollama prefix cache on every mode flip).
- **PHASE-02 (stat-mutation-correctness)** — its 02B rewrites the condition reads in `src/main/ai/character-context.ts` (abbreviated formatter and the `Active Conditions` block of the full formatter) to read `conditionRefs`, and adds cases to `character-context.test.ts`. Sub-phase 11G touches the SAME file for weapons/armor/spells/feats/magic-items but must NOT touch the condition reads. PHASE-02 also adds a `pool` field doc line to `prompt-sections/character-rules.ts` (~line 71-72 area) — 11A's edits to that file land around it; rebase.
- **PHASE-06 (scene-prep-pipeline)** — owns the `restreamConversation` empty-context-block bug in `ai-service.ts:654-663`. 11B's mode collapse makes the assembler output mode-independent, which shrinks (but does not fix) that bug's blast radius; do not fix the restream there.
- **PHASE-08 (executor-batch-correctness)** — owns `src/renderer/src/services/game-action-executor.ts` changes. 11A's new contract test only READS that file (regex over `case '...'`), same as the existing gate; no edit conflict.
- **PHASE-12 (i18n-wording-sweep)** — owns the broad `es.json` AI-DM translation-consistency sweep. 11D must edit `en.json` + `es.json` `travelPaceModal` keys together (the `locale-parity.test.ts` gate enforces identical key sets); PHASE-12 executes later and rebases on the new keys.
- **PHASE-21 (discord-voice-quality)** — explicitly coordinates with this phase on `src/main/ai/prompt-sections/voice-narration.ts`: **PHASE-11 owns the VTT↔Pi emotion *vocabulary contract* (what mood words the prompt asks for); PHASE-21 owns the Pi side** (its 21D adds an alias table in `bmo/pi/services/voice_personality.py` accepting `angry/fearful/menacing/neutral`, making the phases order-independent) and its 21C appends a `[SPEAKER:Name]` line to `voice-narration.ts`. 11E therefore restructures the file into exported constants but does NOT add a SPEAKER tag and does NOT touch any Pi file.
- **PHASE-23 (structured-outputs)** — will later move `[DM_ACTIONS]`/`[STAT_CHANGES]` extraction to decoder-constrained JSON. The doc/union corrections here remain the source of truth for that schema derivation.
- **PHASE-14 (ai-observability)** — consumes `getLastTokenBreakdown()`/truncation flags; 11G adds context lines but does not change the breakdown structure.

## Verified findings

All citations confirmed against the live tree on 2026-06-10. Each block lists re-runnable verification commands (run from the repo root).

### F1 — Prompt documents `set_ability_score`/`grant_feature`/`revoke_feature` as `[DM_ACTIONS]`; they are `[STAT_CHANGES]` types and get silently dropped (bug/high)

- `src/main/ai/prompt-sections/dm-actions-schema.ts:237-240` — inside the `[DM_ACTIONS]` Action Reference, an `**Ability Scores & Features:**` block documents:
  ```
  - `set_ability_score`: {characterName, ability, value, reason}
  - `grant_feature`: {characterName, name, description?, reason}
  - `revoke_feature`: {characterName, name, reason}
  ```
- These three are NOT in `DM_ACTION_SCHEMAS` (`src/main/ai/ai-schemas.ts:1276-1394` — full key list verified; no `set_ability_score`/`grant_feature`/`revoke_feature`). A model emitting them as documented hits `validateDmAction` (`ai-schemas.ts:1440-1469`) → `Unknown action type: <name>` (`:1465`) → in `parseDmActionsDetailed` (`dm-actions.ts:498-533`) the issue is logged as a WARN (`:514-518`) and the action is dropped. Nothing surfaces to the user.
- They ARE `[STAT_CHANGES]` types: `SetAbilityScoreSchema`/`GrantFeatureSchema`/`RevokeFeatureSchema` at `ai-schemas.ts:187-205`, registered in the `StatChangeSchema` discriminated union at `ai-schemas.ts:326+` (members `SetAbilityScoreSchema`, `GrantFeatureSchema`, `RevokeFeatureSchema` confirmed in the union list), applied by `stat-mutations.ts` (`validateChange` cases at `:187-194`, `applyChange` at `:361-396`).
- Correct `[STAT_CHANGES]` documentation already exists in `src/main/ai/prompt-sections/character-rules.ts:94-96` — but it sits under the `### Creature Mutations` heading (`:82`). **Correction/expansion vs the audit:** the misfiled set is wider than the trio — `set_equipped` (`:97`), `set_proficiency` (`:98`), `set_skill_proficiency` (`:99`), and `set_save_proficiency` (`:100`) are also character-targeted changes listed under "Creature Mutations". The whole block `:94-100` needs a correct heading, not just the trio.

Verification:
```bash
sed -n '236,241p' dnd-app/src/main/ai/prompt-sections/dm-actions-schema.ts
grep -n "set_ability_score\|grant_feature\|revoke_feature" dnd-app/src/main/ai/ai-schemas.ts dnd-app/src/main/ai/prompt-sections/character-rules.ts
grep -n "### Creature Mutations" dnd-app/src/main/ai/prompt-sections/character-rules.ts   # :82 — trio + 4 more sit below it
grep -n "Unknown action type" dnd-app/src/main/ai/ai-schemas.ts                            # :1465
sed -n '505,525p' dnd-app/src/main/ai/dm-actions.ts                                        # WARN-only drop path
```

### F2 — `light_source`/`extinguish_source` missing from the hand-written `DmAction` union (debt/medium)

- Both actions are schema-validated (`LightSourceSchema`/`ExtinguishSourceSchema` at `ai-schemas.ts:1258-1270`; registered at `:1392-1393`), prompted (`prompt-sections/dm-actions-schema.ts:135-136`), and executed (`src/renderer/src/services/game-action-executor.ts:378` `case 'light_source':` etc., implemented in `game-actions/visibility-actions.ts`).
- The MAIN-process `DmAction` discriminated union (`src/main/ai/dm-actions.ts:9-475`, 122 variants verified by extraction) does NOT contain either action. The `allValid.push(...(valid as DmAction[]))` cast at `dm-actions.ts:520` hides the gap; any exhaustiveness check over `DmAction` silently misses them.
- The existing CI contract gate (`ai-schemas.test.ts:722-744`, "DM action schema ↔ executor contract") checks `DM_ACTION_SCHEMAS` keys ↔ renderer executor `case` labels only — the union is unchecked (documented in `src/main/ai/AI_ACTION_CONTRACT.md`, which lists three sync points but not the union).
- **Clarification vs the audit:** the renderer has its own loose `DmAction` (`src/renderer/src/services/game-actions/types.ts:5-8` — `{ action: string; [key: string]: unknown }`), which is why `visibility-actions.test.ts:180` compiles `{ action: 'light_source', ... }` today. The gap is main-side only.

Verification:
```bash
grep -n "light_source\|extinguish_source" dnd-app/src/main/ai/dm-actions.ts        # no hits = union gap
grep -n "light_source: LightSourceSchema" dnd-app/src/main/ai/ai-schemas.ts        # :1392
grep -n "case 'light_source'" dnd-app/src/renderer/src/services/game-action-executor.ts
sed -n '1258,1270p' dnd-app/src/main/ai/ai-schemas.ts                              # exact field shapes
awk '/^export type DmAction =/,/^export interface DmActionParseResult/' dnd-app/src/main/ai/dm-actions.ts | grep -c "action: '"
```

### F3 — GameMode `'exploration'`/`'social'` are unreachable; both reachable modes produce a byte-identical prompt (stub/medium)

- `src/main/ai/prompt-assembler.ts:15` — `export type GameMode = 'combat' | 'exploration' | 'social' | 'general'`; `assembleSystemPrompt` (`:25-63`) switches on mode.
- The ONLY production caller is `conversation-manager.ts:92-93`: `const gameMode: GameMode = hasCombat ? 'combat' : 'general'` (where `hasCombat = contextBlock?.includes('Initiative:')`). `'exploration'` and `'social'` are dead.
- The `'combat'` branch pushes `CHARACTER + COMBAT + EXPLORATION + SOCIAL` (comments at `:32-36` explain why combat keeps everything) and `'general'` pushes the same four in the same order — so **`assembleSystemPrompt('combat') === assembleSystemPrompt('general')` byte-for-byte** (independently verified by execution in PHASE-01's F2/F5). The modular token-saving design delivers zero savings; the only combat-conditional content is `COMBAT_TACTICS_PROMPT`, appended separately by `conversation-manager.ts:96`.
- `GameMode` is fully main-internal: importers are `conversation-manager.ts:4` and `prompt-assembler.test.ts` only (no renderer/shared usage). The stale comments "Included when gameMode is 'exploration' or 'general'" live at `prompt-sections/exploration-rules.ts:3` and `social-rules.ts:3`.
- Decision: **collapse** (remove the mode machinery, keep one static assembly). Implementing detection instead would break the byte-stable prefix PHASE-01 relies on for Ollama prefix caching.

Verification:
```bash
grep -rn "assembleSystemPrompt\|GameMode" dnd-app/src/main --include='*.ts' | grep -v test
sed -n '25,63p' dnd-app/src/main/ai/prompt-assembler.ts
sed -n '92,96p' dnd-app/src/main/ai/conversation-manager.ts
```

### F4 — System prompt contradicts itself on bold (wording/medium)

- Three rules forbid emitting bold: `prompt-sections/narrative-rules.ts:10` ("NEVER use markdown headers (##), bold (**), bullet points…"), `:19` ("NEVER use structural formatting (headers, bullets, bold) EXCEPT inside [STAT_CHANGES] and [DM_ACTIONS] JSON blocks"), `:94` ("Write narration in pure flowing prose — no markdown headers, bold, bullets, or blockquotes").
- Two rules mandate bold output: `narrative-rules.ts:82` — `Use the explicit format: "Please make a **[Ability] ([Skill])** check"` — and `social-rules.ts:19` — `Ask the player: "Please make a **[Ability] ([Skill])** check"`.
- Consequence is cosmetic (the chat renderer does NOT parse markdown — `ChatPanel.tsx:4-5` explicitly forbids introducing HTML/markdown rendering — so `**` shows as literal asterisks), but contradictory formatting instructions measurably degrade small-model instruction following (see Research notes). No test pins either string (`grep -rn '\[Ability\]' dnd-app/src --include='*.test.ts'` → no hits).

Verification:
```bash
grep -n "bold\|\*\*\[Ability\]" dnd-app/src/main/ai/prompt-sections/narrative-rules.ts dnd-app/src/main/ai/prompt-sections/social-rules.ts
```

### F5 — Travel pace: prompt uses 2014 wording under a 2024 header; the UI mixes 2024 lines with 2014 leftovers (wording/low — CORRECTED)

- Prompt (`prompt-sections/exploration-rules.ts:10-12`, under the `## Exploration & Travel (DMG 2024)` header at `:7`): Fast = "-5 penalty to passive Perception. Cannot use Stealth."; Normal = no effect listed; Slow = "Can use Stealth." — that is pure **2014 PHB** wording.
- **Correction vs the audit** (which said the UI uses 2024 wording): the UI is a 2014/2024 hybrid. `TravelPaceModal.tsx:10-47` `PACES[].effects` and the mirrored i18n strings (`src/renderer/src/i18n/locales/en.json:3018-3031`, same keys in `es.json:3018-3031`) have Fast = `"-5 to passive Perception"` (2014 leftover) + `"Disadvantage on Perception, Survival, and Stealth checks"` (2024-ish), Normal = `"Disadvantage on Stealth checks"` (2024 ✓), Slow = `"Advantage on Perception and Survival checks"` (2024 ✓) + `"Can use Stealth"` (2014 leftover). The component renders effect lines via `t('game.travelPaceModal.paces.<pace>.effect<i>')` (`TravelPaceModal.tsx:104-110`), with the inline `effects` array driving only the line COUNT.
- The actual 2024 PHB wording (verified against the official Free Rules, see Research notes): Fast — "Disadvantage on a traveler's Wisdom (Perception or Survival) and Dexterity (Stealth) checks"; Normal — "Disadvantage on Dexterity (Stealth) checks"; Slow — "Advantage on Wisdom (Perception or Survival) checks". The 2024 rules have NO passive-Perception penalty and NO "can/cannot use Stealth" gating. Distances (400/300/200 ft per minute, 4/3/2 mph, 30/24/18 mi/day) are identical in both editions and already correct in both prompt and UI.
- i18n guardrails that constrain the fix: `locale-parity.test.ts` requires en/es identical key sets; `generated-keys.test.ts` requires `generated-keys.ts` to match `en.json` (regen via `npm run i18n:gen-keys`); `key-check` vitest fails on referenced-but-missing keys. `TravelPaceModal.test.tsx` is import-only (1 trivial test, no string pins).

Verification:
```bash
sed -n '7,13p' dnd-app/src/main/ai/prompt-sections/exploration-rules.ts
sed -n '3017,3032p' dnd-app/src/renderer/src/i18n/locales/en.json
sed -n '10,47p' dnd-app/src/renderer/src/components/game/modals/utility/TravelPaceModal.tsx
```

### F6 — Emotion vocabulary: the prompt's mood list is the cross-domain contract but is pinned nowhere (bug/low, VTT half)

- `prompt-sections/voice-narration.ts:11` prompts: `[EMOTION:mood] — optional mood: neutral, calm, happy, sad, angry, excited, fearful, menacing.` and `:10` lists 8 NPC archetypes (`gruff_dwarf, mysterious_elf, booming_dragon, elderly_wizard, cheerful_bard, stern_guard, tavern_keeper, whispery_rogue`). Both lists are inline prose — no exported constant, no test.
- Pi side (`bmo/pi/services/voice_personality.py:44-55`): `PIPER_EMOTION_PROSODY` keys are `happy, excited, calm, dramatic, sleepy, sad, scared, sassy, mischievous, shy` — **missing `neutral`, `angry`, `fearful`, `menacing`** (it has `scared`, which `fearful` should alias to). `get_prosody()` (`:226-244`) falls back to flat `{"speed": 1.0, "pitch": 0}` for unknown emotions, so half the prompted moods produce flat narration. The 8 archetype keys in `NPC_PROSODY` (`:30-39`) DO match the prompt's archetype list exactly.
- Tags are parsed main-side by `parseVoiceTags` (`ai-response-parser.ts:29-44`, regexes `\[NPC:\s*([a-z_]+)\s*\]` / `\[EMOTION:\s*([a-z_]+)\s*\]`, first match wins, lowercased) and stripped by `stripVoiceTags` (`:47-55`).
- Ownership split (locked in PHASE-21's plan): PHASE-21 sub-phase 21D fixes the Pi map via an alias table accepting this exact VTT vocabulary; **this phase makes the VTT vocabulary an explicit, tested contract** so neither side can drift silently. `prompt-assembler.test.ts` byte-compares the assembled prompt against the imported `VOICE_NARRATION_PROMPT` constant, so restructuring the file is test-safe as long as the exported string is well-formed.

Verification:
```bash
sed -n '8,13p' dnd-app/src/main/ai/prompt-sections/voice-narration.ts
sed -n '43,56p' bmo/pi/services/voice_personality.py
sed -n '226,244p' bmo/pi/services/voice_personality.py
grep -rn "VOICE_NARRATION_PROMPT" dnd-app/src --include='*.ts' | grep -v prompt-sections
```

### F7 — `actingCharacterId` is dead at BOTH ends; the per-actor full/abbreviated context split never activates (bug/high)

- Designed behavior (`src/main/ai/context-builder.ts:160-162` doc + `:225-231`): the acting character gets `formatCharacterForContext` (full sheet), other party members get `formatCharacterAbbreviated` (name/HP/AC/conditions one-liner, `character-context.ts:39-48`); with no actor, everyone gets a full sheet.
- Dead end #1 — no caller passes it: `use-ai-dm-store.ts` `sendMessage` accepts and forwards `actingCharacterId` (param at `:330`, forwarded into `window.api.ai.chatStream` at `:357`), but every production call omits the argument: `ai-dm-routing.ts:137-149` (the single route for solo + host-own + peer messages, built by `routePlayerMessageToAiDm`) passes 6 args; its catch-fallback at `:148-149` passes 4; `use-game-network.ts:127-135` (the `player:time-request` path) passes 6.
- Dead end #2 — the schema strips it even if passed: `AiChatRequestSchema` (`src/shared/ipc-schemas.ts:24-31`) has no `actingCharacterId` field; zod `z.object` strips unknown keys, and the `AI_CHAT_STREAM` handler forwards `parsed.data` (`src/main/ipc/ai-handlers.ts:207-217`). `ai-service.ts:654-660` then passes `request.actingCharacterId` — always `undefined` — into `buildContext`.
- The TYPES all already declare the field (`src/main/ai/types.ts:29`, `src/preload/index.d.ts:211`, store signature `use-ai-dm-store.ts:125`), so only the zod schema + the renderer callers need work.
- Caller-side resolution material: `routePlayerMessageToAiDm(campaignId, message, senderName, campaignPlayers, exactTimeDefault?)` already computes the roster via `buildPlayerRoster(lobbyPlayers, campaignPlayers)` (`ai-dm-routing.ts:51-89`), which maps `displayName → characterId` from lobby players (multiplayer) or active campaign players (solo fallback). `senderName` at the call sites is the player's display name (`ChatPanel.tsx:263-270` passes `playerName`; `use-game-network.ts:107` passes `msg.senderName ?? 'Player'`). No tests currently cover the actor split (`grep -n actingCharacterId dnd-app/src/main/ai/context-builder.test.ts` → no hits). `ipc-schemas.test.ts:110+` already has an `AiChatRequestSchema` describe to extend.

Verification:
```bash
grep -rn "actingCharacterId" dnd-app/src --include='*.ts' --include='*.tsx' | grep -v '.test.'
sed -n '24,31p' dnd-app/src/shared/ipc-schemas.ts          # no actingCharacterId field
sed -n '225,231p' dnd-app/src/main/ai/context-builder.ts    # dead actor branch
sed -n '137,150p' dnd-app/src/renderer/src/services/ai-dm-routing.ts
```

### F8 — AI Vision is text-only: the screenshot is captured + base64-encoded but never sent; the prompt claims otherwise (stub/high)

- `src/main/ai/ai-vision.ts`: `analyzeMapState` (`:135-196`) calls `captureMapScreenshot()` (`:36-52`, Electron `webContents.capturePage()` → PNG buffer) and `encodeForVision()` (`:99-129`, base64-encodes), then sends ONLY text via `provider.chatOnce(systemPrompt, [{ role: 'user', content: userMessage }], model)`. `imageBase64`'s sole use (`:183-186`) is appending `"(A screenshot of the map has been captured for reference.)"` to the text — telling the model an image exists that it never received. The provider interface cannot carry images: `ChatMessage` is `{role, content: string}` and `chatOnce(systemPrompt, messages, model, maxTokens?)` (`llm-provider.ts:33`); the Ollama client posts to the OpenAI-compat `/v1/chat/completions` with plain string content (`ollama-client.ts:93-96`, `:227-231`).
- `AI_ANALYZE_MAP` HAS one renderer caller (`AiMapAnalysisModal.tsx:71` `window.api.ai.analyzeMap(gameState)`) — the text-only tactical analysis is a live, working feature. **The dead surface is `AI_CAPTURE_MAP`**: channel (`src/shared/ipc-channels.ts:125`), handler (`src/main/ipc/ai-handlers.ts:624-632`), preload `captureMap` (`src/preload/index.ts:164`, type at `index.d.ts:303`) — zero renderer callers. No test pins `AI_CAPTURE_MAP` (`ipc-channels.test.ts` checks only generic invariants: string values, uniqueness, `^[a-z-]+:[a-z-]+` format).
- Decision: **strip, don't wire.** Rationale in Research notes (vision requires multimodal-trained models the app doesn't default to; every provider needs a different image-content shape; the structured token-position text is strictly more reliable for grid tactics than a screenshot).

Verification:
```bash
grep -rn "captureMap\|AI_CAPTURE_MAP" dnd-app/src --include='*.ts' --include='*.tsx'   # 4 hits, none in renderer/src
grep -rn "analyzeMap" dnd-app/src/renderer/src --include='*.tsx' | grep -v test        # AiMapAnalysisModal.tsx:71
sed -n '180,190p' dnd-app/src/main/ai/ai-vision.ts                                     # the misleading sentence
grep -n "chatOnce" dnd-app/src/main/ai/llm-provider.ts                                 # string-only interface
```

### F9 — Character context reads v4-stripped fields: weapons, armor, known/prepared spells, feats (and magic-item names) are invisible to the AI (bug/high)

- The v3→v4 character migration is LIVE: `CURRENT_SCHEMA_VERSION = 4` (`src/main/storage/migrations.ts:9`); `migrateCharacter5eToRefs` strips the inline arrays on every load/save (`src/shared/migrations/v4-character-refs.ts:193-200` — deletes `classes, knownSpells, preparedSpellIds, weapons, armor, magicItems, feats, conditions`). The file's header comment (`v4-character-refs.ts:18-19`, "Dormant… stays 3") is stale — do not trust it.
- `src/main/ai/character-context.ts` `formatCharacter5e` still reads only the stripped inline fields:
  - `:137-144` — `c.preparedSpellIds` / `c.knownSpells` → no Prepared/Known Spells line for v4 characters;
  - `:168-177` — `c.armor` → no Equipped/Carried Armor lines;
  - `:179-184` — `c.weapons` → no Weapons line;
  - `:225-228` — `c.feats` → no Feats line;
  - (`:236-248` conditions — **PHASE-02's 02B owns this read; do not touch**).
- The v4 data IS recoverable main-side:
  - **weapons/armor**: refs always carry the full inline object as `ref.overrides` (BUG-2 fix, `v4-character-refs.ts:92-109`); equipped state lives in `state.weaponEquipped`/`state.armorEquipped` keyed by `instanceId` (`src/shared/types/character-5e.ts:35-41`);
  - **spells**: `knownSpellRefs[].ref.entryId` is the v3 spell `id` (library slug for library spells; migration `:87-90` adds no overrides); prepared state is `state.preparedSpellIds` keyed by `instanceId`. Names resolve from `src/renderer/public/data/5e/spells/spells.json` (verified: array of 395 entries with `id` + `name`, e.g. `acid-splash` → "Acid Splash"), which the main process can already read via the `getDataDir()` pattern used by `srd-provider.ts:7-24`;
  - **feats**: `featRefs` (no overrides, migration `:82-85`); names from `feats/index.json` (verified: 76 entries with `id` + `name`);
  - **magic items** (**expansion vs the audit**): `magicItemRefs` (migration `:111-117`, `entryId` = item id, no overrides) are never listed by name — only the `Attunement: X/3 slots used` count (`character-context.ts:243-249`) — yet the `attune_item`/`unattune_item` DM actions (`dm-actions-schema.ts:233-235`) require the AI to name an item. Names resolve from `equipment/magic-items.json` (verified: 471 entries with `id` + `name`).
  - `Character5eV3 extends Character5e` (`src/shared/types/character-5e.ts:143`), so the v4 ref/state fields are already on the type `formatCharacter5e` receives.

Verification:
```bash
grep -n "CURRENT_SCHEMA_VERSION = " dnd-app/src/main/storage/migrations.ts             # = 4
grep -n "delete out\." dnd-app/src/shared/migrations/v4-character-refs.ts
grep -n "preparedSpellIds\|knownSpells\|c.armor\|c.weapons\|c.feats" dnd-app/src/main/ai/character-context.ts
python3 -c "import json; d=json.load(open('dnd-app/src/renderer/public/data/5e/spells/spells.json')); print(len(d), d[0]['id'], d[0]['name'])"
python3 -c "import json; d=json.load(open('dnd-app/src/renderer/public/data/5e/feats/index.json')); print(len(d), d[0]['id'])"
python3 -c "import json; d=json.load(open('dnd-app/src/renderer/public/data/5e/equipment/magic-items.json')); print(len(d), d[0]['id'])"
```

## Sub-phases

Run in order; each leaves the tree green. During sub-phase work run only the listed cheap checks (INSTRUCTIONS.md rule 5); the full 4-gate runs once at phase end.

### 11A — Action-contract corrections: prompt docs, union gap, union CI gate

**Objective:** the trio is documented only as `[STAT_CHANGES]`; character-targeted change docs sit under an honest heading; `light_source`/`extinguish_source` join the `DmAction` union; a new contract test prevents future union drift.

**Files:** `src/main/ai/prompt-sections/dm-actions-schema.ts`, `src/main/ai/prompt-sections/character-rules.ts`, `src/main/ai/dm-actions.ts`, `src/main/ai/ai-schemas.test.ts`, `src/main/ai/AI_ACTION_CONTRACT.md`.

**Steps:**
1. `dm-actions-schema.ts` — delete the four lines `**Ability Scores & Features:**` + the three action bullets (currently `:237-240`). Verify no few-shot example in the same file uses the trio (`grep -n "set_ability_score" dm-actions-schema.ts` must return nothing after the edit).
2. `character-rules.ts` — split the `### Creature Mutations` list: keep the heading + intro + the ten `creature_*` bullets (currently `:82-93`); insert a new heading before the `set_ability_score` bullet (currently `:94`):
   ```
   ### Character Sheet Mutations
   These character-targeted changes also go in the SAME [STAT_CHANGES] block (NEVER in [DM_ACTIONS]):
   ```
   so `set_ability_score`, `grant_feature`, `revoke_feature`, `set_equipped`, `set_proficiency`, `set_skill_proficiency`, `set_save_proficiency` (currently `:94-100`) live under it. Wording of the bullets is already correct — do not change it. (PHASE-02 may have added a `pool` doc line earlier in this file; leave it alone.)
3. `dm-actions.ts` — add to the `DmAction` union (a `// Lighting` group near the darkness-zone variants is fine), matching the zod schemas at `ai-schemas.ts:1258-1270` exactly:
   ```ts
   | { action: 'light_source'; entityName: string; sourceName: string; reason?: string }
   | { action: 'extinguish_source'; entityName: string; sourceName?: string; reason?: string }
   ```
4. `ai-schemas.test.ts` — inside the existing `DM action schema ↔ executor contract` describe (currently `:722-744`), add a third sync surface: extract the union's action literals from `dm-actions.ts` source and compare with `DM_ACTION_SCHEMAS` keys both ways:
   ```ts
   const unionActions = (() => {
     const code = readFileSync(resolve(__dirname, 'dm-actions.ts'), 'utf-8')
     const start = code.indexOf('export type DmAction =')
     const end = code.indexOf('export interface DmActionParseResult')
     return new Set([...code.slice(start, end).matchAll(/action: '([a-z_]+)'/g)].map((m) => m[1]))
   })()
   ```
   New `it`s: sanity (`unionActions.size > 100`, has `place_creature`), `every DM_ACTION_SCHEMAS action has a DmAction union variant` (filter → `toEqual([])`), `every DmAction union variant has a schema`. (Before step 3 lands, the first direction fails on exactly `['light_source','extinguish_source']` — write test and fix in the same sub-phase.)
5. `AI_ACTION_CONTRACT.md` — add the union as sync point #4 (file `dm-actions.ts`, role "main-process compile-time type") and note the test now enforces #1 ↔ #2 ↔ #4.

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/ai-schemas.test.ts src/main/ai/dm-actions.test.ts`

**Acceptance:** trio absent from `dm-actions-schema.ts`; `### Character Sheet Mutations` heading present; union contains both lighting actions; new contract tests green; contract doc lists 4 sync points.

### 11B — Collapse the GameMode machinery (prefix-cache-stable single assembly)

**Objective:** remove the dead-mode switch; `assembleSystemPrompt()` takes no argument and returns the one static section join; all callers updated; stale comments fixed.

**Files:** `src/main/ai/prompt-assembler.ts`, `src/main/ai/prompt-assembler.test.ts`, `src/main/ai/conversation-manager.ts`, `src/main/ai/token-budget.ts` (PHASE-01's `getStaticSystemPromptTokens` call site — only if PHASE-01 landed it), `src/main/ai/prompt-sections/exploration-rules.ts`, `src/main/ai/prompt-sections/social-rules.ts`.

**Steps:**
1. `prompt-assembler.ts` — delete `export type GameMode` and the switch. New body:
   ```ts
   export function assembleSystemPrompt(): string {
     return [
       NARRATIVE_RULES_PROMPT,
       CHARACTER_RULES_PROMPT,
       COMBAT_RULES_PROMPT,
       EXPLORATION_RULES_PROMPT,
       SOCIAL_RULES_PROMPT,
       DM_ACTIONS_SCHEMA_PROMPT,
       VOICE_NARRATION_PROMPT
     ].join('\n\n')
   }
   ```
   Update the header comment: the assembly is deliberately mode-independent so the rules base stays a byte-stable prefix for provider prompt caching (cite conversation-manager's `COMBAT_TACTICS_PROMPT` append as the only combat-conditional content). Section order must NOT change (byte-identical output to today's `'general'`).
2. `conversation-manager.ts` — drop the `GameMode` import and the `gameMode` local (`:92-93`); call `assembleSystemPrompt()`. Keep `hasCombat` — it still gates `COMBAT_TACTICS_PROMPT` (`:96`).
3. Update every other `assembleSystemPrompt(` caller to zero-arg (`grep -rn "assembleSystemPrompt(" dnd-app/src --include='*.ts'`); after PHASE-01 this includes `token-budget.ts`'s `getStaticSystemPromptTokens()`.
4. `prompt-assembler.test.ts` — rewrite to a single describe: all seven `HDR_*` markers present; exact byte-equality with the seven-section join; starts with `NARRATIVE_RULES_PROMPT`; ends with `VOICE_NARRATION_PROMPT`; `DM_ACTIONS_SCHEMA_PROMPT` precedes `VOICE_NARRATION_PROMPT`. Delete the per-mode describes.
5. Fix stale header comments: `exploration-rules.ts:3` and `social-rules.ts:3` → "Always included in every prompt assembly." (matching `narrative-rules.ts:2-3` phrasing).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/prompt-assembler.test.ts src/main/ai/conversation-manager.test.ts`

**Acceptance:** `grep -rn "GameMode" dnd-app/src --include='*.ts'` → no hits; assembled prompt byte-identical to the pre-change `'general'` output (assert in the rewritten test by section-join equality); conversation-manager tests green.

### 11C — Prompt truth: bold contradiction + 2024 travel pace (prompt side)

**Objective:** the prompt never instructs the model to emit bold; the travel-pace effects match the 2024 PHB.

**Files:** `src/main/ai/prompt-sections/narrative-rules.ts`, `src/main/ai/prompt-sections/social-rules.ts`, `src/main/ai/prompt-sections/exploration-rules.ts`.

**Steps:**
1. `narrative-rules.ts:82` → `- Use the explicit format: "Please make a [Ability] ([Skill]) check" (plain text — no bold or other markdown)`.
2. `social-rules.ts:19` → `2. Ask the player: "Please make a [Ability] ([Skill]) check"`.
3. `exploration-rules.ts:10-12` → 2024 PHB effects (distances unchanged):
   ```
   - **Fast:** 400 ft/min, 4 mi/hour, 30 mi/day. Disadvantage on Wisdom (Perception or Survival) checks and Dexterity (Stealth) checks.
   - **Normal:** 300 ft/min, 3 mi/hour, 24 mi/day. Disadvantage on Dexterity (Stealth) checks.
   - **Slow:** 200 ft/min, 2 mi/hour, 18 mi/day. Advantage on Wisdom (Perception or Survival) checks.
   ```
   (The `**Fast:**` bullet bolding is prompt-internal formatting the model READS, not output instruction — keep it. Keep the `## Exploration & Travel (DMG 2024)` header unchanged; the rest of the section is DMG Gameplay Toolbox material.)
4. Confirm no other prompt section mandates bold output: `grep -rn '\*\*\[' dnd-app/src/main/ai/prompt-sections/` → only placeholder-free hits.

**Cheap checks:** `npx vitest run src/main/ai/prompt-assembler.test.ts` (byte-equality test from 11B recomputes from the same constants, so it stays green) + `npx tsc --noEmit -p tsconfig.node.json`.

**Acceptance:** `grep -rn '\*\*\[Ability\]' dnd-app/src/main/ai` → no hits; `grep -n "Cannot use Stealth\|passive Perception" dnd-app/src/main/ai/prompt-sections/exploration-rules.ts` → no hits.

### 11D — 2024 travel pace in the UI (modal + en/es locales)

**Objective:** the TravelPaceModal shows exactly the 2024 effects, one line per pace, in both locales, with the i18n gates green.

**Files:** `src/renderer/src/components/game/modals/utility/TravelPaceModal.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, `src/renderer/src/i18n/generated-keys.ts` (regenerated).

**Steps:**
1. `TravelPaceModal.tsx` `PACES`: set each `effects` array to ONE entry (the inline strings drive only the rendered-line count, but keep them equal to the English text for greppability): Fast → `['Disadvantage on Wisdom (Perception or Survival) and Dexterity (Stealth) checks']`; Normal → `['Disadvantage on Dexterity (Stealth) checks']`; Slow → `['Advantage on Wisdom (Perception or Survival) checks']`.
2. `en.json` `game.travelPaceModal.paces`: `fast.effect0` = the Fast string above, DELETE `fast.effect1`; `normal.effect0` unchanged in key, value = the Normal string; `slow.effect0` = the Slow string, DELETE `slow.effect1`.
3. `es.json` same keys: fast.effect0 `"Desventaja en las pruebas de Sabiduría (Percepción o Supervivencia) y Destreza (Sigilo)"`; normal.effect0 `"Desventaja en las pruebas de Destreza (Sigilo)"`; slow.effect0 `"Ventaja en las pruebas de Sabiduría (Percepción o Supervivencia)"`; delete the two `effect1` keys.
4. Regenerate + verify keys: `cd dnd-app && npm run i18n:gen-keys && node scripts/i18n/check-keys.mjs`.

**Cheap checks:** `npx vitest run src/renderer/src/i18n/locale-parity.test.ts src/renderer/src/i18n/generated-keys.test.ts src/renderer/src/i18n/key-check.test.ts src/renderer/src/components/game/modals/utility/TravelPaceModal.test.tsx && npx tsc --noEmit -p tsconfig.web.json`

**Acceptance:** modal shows one 2024-accurate effect line per pace; `grep -n "effect1" dnd-app/src/renderer/src/i18n/locales/en.json | sed -n '/travelPace/p'` → no travel-pace hits; parity/key tests green.

### 11E — Emotion vocabulary as an exported, tested contract

**Objective:** the mood + archetype lists become exported constants the prompt is built from, with a colocated test pinning the contract PHASE-21's Pi alias table mirrors.

**Files:** `src/main/ai/prompt-sections/voice-narration.ts`, NEW `src/main/ai/prompt-sections/voice-narration.test.ts`.

**Steps:**
1. `voice-narration.ts`:
   ```ts
   /** VTT↔Pi voice contract. The Pi prosody map (bmo/pi/services/voice_personality.py)
    *  must accept every term below — see the PHASE-21 alias table. Changing either
    *  list is a cross-domain contract change. */
   export const NPC_ARCHETYPES = ['gruff_dwarf', 'mysterious_elf', 'booming_dragon', 'elderly_wizard', 'cheerful_bard', 'stern_guard', 'tavern_keeper', 'whispery_rogue'] as const
   export const EMOTION_VOCABULARY = ['neutral', 'calm', 'happy', 'sad', 'angry', 'excited', 'fearful', 'menacing'] as const
   ```
   Rebuild `VOICE_NARRATION_PROMPT` as a template literal interpolating `${NPC_ARCHETYPES.join(', ')}` and `${EMOTION_VOCABULARY.join(', ')}` in the existing sentences — the output string must be byte-identical to today's constant (the lists and separators already match `, `). Do NOT add a `[SPEAKER:]` line (PHASE-21 21C owns that).
2. New `voice-narration.test.ts`: (a) prompt contains every archetype and every emotion term; (b) the two arrays are pinned exactly (`toEqual([...])` with the 8+8 literals) so any edit is a deliberate contract change; (c) every term matches the `parseVoiceTags` capture charset `/^[a-z_]+$/` (guards against adding a term the `ai-response-parser.ts:29-30` regexes can't capture); (d) prompt still starts with `## VOICE TAGS` (the `HDR_VOICE` marker used by prompt-assembler.test.ts).

**Cheap checks:** `npx vitest run src/main/ai/prompt-sections/voice-narration.test.ts src/main/ai/prompt-assembler.test.ts && npx tsc --noEmit -p tsconfig.node.json`

**Acceptance:** constants exported; prompt byte-identical; new test green.

### 11F — Wire `actingCharacterId` end-to-end

**Objective:** the IPC schema preserves the field; the message router resolves the sender's character and passes it; the per-actor context split activates as designed.

**Files:** `src/shared/ipc-schemas.ts`, `src/shared/ipc-schemas.test.ts`, `src/renderer/src/services/ai-dm-routing.ts`, `src/renderer/src/services/ai-dm-routing.test.ts`, `src/renderer/src/hooks/use-game-network.ts`, `src/main/ai/context-builder.test.ts`.

**Steps:**
1. `ipc-schemas.ts` — add `actingCharacterId: z.string().optional()` to `AiChatRequestSchema` (after `characterIds`). The handler already forwards `parsed.data`, `ai-service.ts:654-660` already passes `request.actingCharacterId` to `buildContext`, and all TS types already declare the field — no other main/preload edits needed.
2. `ai-dm-routing.ts` — export a resolver:
   ```ts
   /** Resolve the acting character for an AI message: the sender's own character.
    *  Lobby players (multiplayer) take precedence; active campaign players are the
    *  solo fallback; a single-member roster is the actor regardless of name match. */
   export function resolveActingCharacterId(
     senderName: string,
     lobbyPlayers: Array<{ displayName: string; characterId: string | null }>,
     campaignPlayers: CampaignPlayer[]
   ): string | undefined
   ```
   Order: lobby `displayName === senderName && characterId` → campaign `displayName === senderName && isActive && characterId` → if the `buildPlayerRoster`-style resolved set has exactly ONE member, that member's id (covers solo, where `playerName` may differ from the campaign-player display name) → `undefined`.
3. In `routePlayerMessageToAiDm`, compute `const actingCharacterId = resolveActingCharacterId(senderName, lobbyPlayers, campaignPlayers)` next to the existing `buildPlayerRoster` call and pass it as `sendMessage`'s 7th argument in BOTH the main path (`:138-147`) and the context-free catch fallback (`:148-149` — pass `undefined` for creatures/gameState as today, then `actingCharacterId`).
4. `use-game-network.ts` time-request path (`:127-135`) — resolve via the same exported helper using `payload.requesterName` and pass as the 7th argument.
5. Tests:
   - `ai-dm-routing.test.ts` — extend the existing route test to assert `sendMessage.mock.calls[0][6] === 'c1'`; add: multiplayer sender-name match picks the right id; unknown sender in a 2+ roster → `undefined`; solo name-mismatch still resolves (single-member fallback); direct unit tests for `resolveActingCharacterId`.
   - `ipc-schemas.test.ts` — in the `AiChatRequestSchema` describe: round-trips `actingCharacterId`; still strips genuinely unknown keys.
   - `context-builder.test.ts` — actor split: with `actingCharacterId` set, the actor's block comes from the full formatter and another character's block is the one-liner; with it unset, both get full sheets (mock `loadCharacterById`/storage the way existing tests in that file do).

**Behavior note (intentional activation):** in multiplayer, non-acting party members now ship abbreviated sheets (name/HP/AC/conditions) — this is the documented design (`context-builder.ts:160-162`) and a token-budget win; cross-character damage/heal targeting still works from the abbreviated line + roster. Solo play is unchanged (the lone character is always the actor → full sheet).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/renderer/src/services/ai-dm-routing.test.ts src/shared/ipc-schemas.test.ts src/main/ai/context-builder.test.ts`

**Acceptance:** schema preserves the field; both renderer send paths pass a resolved id; actor branch covered by tests; solo behavior unchanged.

### 11G — v4-aware character context: weapons, armor, spells, feats, magic items

**Objective:** `formatCharacter5e` renders Weapons / Equipped+Carried Armor / Prepared|Known Spells / Feats / Magic Items lines from the v4 refs + state, with main-side name resolution for ref-only categories. Conditions are NOT touched (PHASE-02).

**Files:** NEW `src/main/ai/library-name-resolver.ts`, NEW `src/main/ai/library-name-resolver.test.ts`, `src/main/ai/character-context.ts`, `src/main/ai/character-context.test.ts`.

**Steps:**
1. `library-name-resolver.ts` — minimal cached id→name lookup over the bundled data files, mirroring `srd-provider.ts`'s loader pattern (`join(getDataDir(), file)`, `existsSync`, try/parse, module cache):
   ```ts
   type NameCategory = 'spells' | 'feats' | 'magic-items'
   const FILES: Record<NameCategory, string> = {
     spells: 'spells/spells.json',
     feats: 'feats/index.json',
     'magic-items': 'equipment/magic-items.json'
   }
   export function resolveEntryName(category: NameCategory, entryId: string): string | null
   ```
   Build a `Map<string, string>` per category on first use from entries' `id`/`name`; return `null` on miss or unreadable file. Export `_resetNameCacheForTests()`.
2. `character-context.ts` — add a local helper:
   ```ts
   const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
   function refDisplayName(category: NameCategory, ref: { entryId?: string; overrides?: { name?: string } } | undefined): string
   ```
   resolution order: `ref?.overrides?.name` → `resolveEntryName(category, entryId)` → `titleCase(entryId)` when `SLUG_RE` matches → raw `entryId` → `'Unknown'`. Then extend `formatCharacter5e` — every change is an `else if` fallback so inline v3 input (writer-side callers) keeps its exact current output:
   - **Spells** (inside the existing `if (spellcasting)` block, after the inline branch at `:137-144`): when no inline `knownSpells` but `c.knownSpellRefs?.length`, map prepared instanceIds via `c.state?.preparedSpellIds` → `Prepared Spells: <names>`; else `Known Spells: <all ref names>` (category `'spells'`).
   - **Weapons** (after `:179-184` inline branch): from `c.weaponRefs`; each entry's overrides usually carry the full `WeaponEntry` (F9) — when `overrides.damage`/`damageType`/`attackBonus` are present render the existing detail format `Name (1d8 slashing, +5 to hit)`, else name only; suffix `(equipped)` when `c.state?.weaponEquipped?.[instanceId]`.
   - **Armor** (after `:168-177` inline branch): from `c.armorRefs` + `c.state?.armorEquipped` → `Equipped Armor:` (with `(AC +N)` when `overrides.acBonus` is a number) and `Carried Armor (unequipped):` lines, mirroring the inline format.
   - **Feats** (after `:225-228`): from `c.featRefs` (category `'feats'`).
   - **Magic items** (NEW — place immediately before the attunement-count block at `:243-249`): when `c.magicItemRefs?.length`, `Magic Items: <names>` with `(attuned)` suffix per `c.state?.magicItemAttuned?.[instanceId]` (category `'magic-items'`). Keep the existing `Attunement: X/3 slots used` line as-is.
   - Do NOT modify the conditions read (`:236-248`) or `formatCharacterAbbreviated` — PHASE-02 owns both.
3. Tests:
   - `library-name-resolver.test.ts` — resolves a known spell (`acid-splash` → `Acid Splash`), a feat from `feats/index.json`, a magic item (`adamantine-armor` → `Adamantine Armor`); returns null for a miss; cache reset works. (The data dir resolves under vitest via `getDataDir()` → `src/renderer/public/data/5e`; if the path is unavailable in the node test env, mock `../paths`' `getDataDir` to the repo-relative path the way other main tests mock modules.)
   - `character-context.test.ts` — add a v4 fixture (NO inline `weapons/armor/knownSpells/feats/magicItems`; with `weaponRefs` carrying overrides + `state.weaponEquipped`, `armorRefs` + `state.armorEquipped`, `knownSpellRefs` (library slugs) + `state.preparedSpellIds`, `featRefs`, `magicItemRefs` + `state.magicItemAttuned`): assert Weapons line (with detail + `(equipped)`), Equipped/Carried Armor lines, Prepared Spells line (resolved names), Feats line, Magic Items line with `(attuned)`; assert inline-v3 fixtures still produce the previous exact lines (regression); assert a ref with neither overrides nor a library match falls back to title-cased slug.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/library-name-resolver.test.ts src/main/ai/character-context.test.ts`

**Acceptance:** a v4-only character's context contains weapons/armor/spells/feats/magic-item names; v3-inline output unchanged; conditions code untouched (`git diff` shows no hunk over the conditions block).

### 11H — AI Vision honesty: text-only analysis, dead capture surface removed

**Objective:** `analyzeMapState` stops paying the screenshot cost and stops telling the model an image was provided; the caller-less `AI_CAPTURE_MAP` IPC surface is deleted.

**Files:** `src/main/ai/ai-vision.ts`, `src/main/ipc/ai-handlers.ts`, `src/shared/ipc-channels.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`.

**Steps:**
1. `ai-vision.ts` — delete `captureMapScreenshot` (and the now-unused `BrowserWindow` import); replace `encodeForVision` with `buildMapStateDescription(tokenData: MapStateData | null): string` (the existing text-building body, minus `imageBase64`); in `analyzeMapState` drop the capture call and the `if (imageBase64)` sentence append (`:183-186`). The system prompt, provider call, logging, and result shape stay identical. Add a header comment: analysis is deliberately text-only — the structured token-position description carries exact grid/HP/AC data no screenshot can; image wiring would require multimodal models + per-provider image content support (see PHASE-INDEX scope note).
2. `ai-handlers.ts` — remove the `AI_CAPTURE_MAP` handler (`:624-632`) and the `captureMapScreenshot` import (keep `analyzeMapState` + `MapStateForVisionAnalysis`).
3. `ipc-channels.ts` — remove `AI_CAPTURE_MAP: 'ai:capture-map'` (`:125`).
4. `preload/index.ts` — remove `captureMap` (`:164`); `preload/index.d.ts` — remove its type (`:303`).
5. Sweep: `grep -rn "captureMap\|AI_CAPTURE_MAP\|capture-map" dnd-app/src` → zero hits. (`ipc-channels.test.ts` has no per-channel pin for it; `AiMapAnalysisModal` calls only `analyzeMap`, which is untouched.)

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/shared/ipc-channels.test.ts src/main/ipc/ai-handlers.test.ts`

**Acceptance:** zero `captureMap` references repo-wide in dnd-app/src; map analysis still works text-only (handler returns `{success, analysis}`); no misleading screenshot sentence in the user message.

## Research notes

- **2024 travel pace (F5, 11C/11D).** The official 2024 Free Rules give the exact effects: Fast — "imposes Disadvantage on a traveler's Wisdom (Perception or Survival) and Dexterity (Stealth) checks"; Normal — "imposes Disadvantage on Dexterity (Stealth) checks"; Slow — "grants Advantage on Wisdom (Perception or Survival) checks"; distances 400/300/200 ft per minute, 4/3/2 mph, 30/24/18 mi/day. The 2014 "−5 passive Perception" and "can/cannot use Stealth" framing is gone in 2024. Sources: [D&D Beyond Free Rules — Playing the Game](https://www.dndbeyond.com/sources/dnd/free-rules/playing-the-game), [Roll20 D&D 2024 Compendium — Travel Pace](https://roll20.net/compendium/dnd5e/Rules:Travel%20Pace), [Screen Rant — 2024 DMG travel rules overview](https://screenrant.com/dnd-travel-terrain-maximum-pace-encounter-2024-rules/).
- **Contradictory formatting instructions measurably hurt instruction following (F4).** Recent evaluations show models behave inconsistently under even basic intra-prompt formatting conflicts and rarely acknowledge the conflict; adherence degrades as rule count grows — strongest on small local models, which this app targets by default. Removing the bold mandate (rather than carving an exception into three "never bold" rules) is the lowest-token, lowest-conflict fix. Sources: [Control Illusion: The Failure of Instruction Hierarchies in LLMs (arXiv:2502.15851)](https://arxiv.org/html/2502.15851v1), [LLMs can be easily Confused by Instructional Distractions (arXiv:2502.04362)](https://arxiv.org/html/2502.04362v1).
- **Mode collapse vs mode detection (F3, 11B).** Ollama reuses the KV cache across requests when the prompt PREFIX is byte-stable; per-mode section toggling would invalidate the cached ~12k-token rules base on every exploration↔social↔combat flip, re-paying full prefill on CPU-bound hardware (Raspberry Pi / laptop iGPU). PHASE-01 (which owns `num_ctx`/keep_alive and prompt ordering) verified the current base is already byte-stable across the two reachable modes and ordered context blocks static-first to exploit this; 11B locks the property in. Token savings from dropping one section (~1–2k estimator tokens) are dwarfed by losing prefix reuse on a ~14k prompt. Alternative considered — implementing real exploration/social detection — rejected for the above; revisit only if a future phase moves rules content out of the static prompt entirely (PHASE-24's RAG direction).
- **Vision strip vs wire (F8, 11H).** Wiring images would require: (a) a multimodal-trained model (Ollama only applies `images` for vision models such as llava/gemma-vision-class; the app's defaults are text-only), (b) per-provider message-shape work — Ollama native `/api/chat` takes `images: [base64]` per message, while the app talks to the OpenAI-compat `/v1/chat/completions` endpoint where image support arrived late and differently (content-part `image_url`), plus distinct shapes again for Claude/Gemini, and (c) paying screenshot + image-token costs per analysis. Meanwhile the existing structured text (exact grid coordinates, HP, AC, conditions per token) is strictly more reliable for tactical analysis than pixels. Strip is the honest, cheap fix; if a future feature needs real vision, it starts from a multimodal-model gate, not from this stub. Sources: [Ollama vision capabilities](https://docs.ollama.com/capabilities/vision), [Ollama API reference — chat `images` field](https://github.com/ollama/ollama/blob/main/docs/api.md), [ollama#3690 — vision in the OpenAI-compat endpoint](https://github.com/ollama/ollama/issues/3690).
- **Emotion contract as code (F6, 11E).** Cross-language contracts (TS prompt ↔ Python prosody map) can't share a literal, so each side pins the SAME list in its own tests; PHASE-21's 21D mirrors `EMOTION_VOCABULARY` in `bmo/pi/tests` against its alias table. Exporting the array and interpolating it into the prompt makes the prompt physically unable to drift from the tested list.
- **Name resolution for v4 refs (F9, 11G).** Weapons/armor carry full `overrides` by construction (BUG-2, `v4-character-refs.ts:92-109`) so they need no library; spells/feats/magic-items refs are id-only, and the main process already reads the bundled data dir directly (`srd-provider.ts` pattern over `getDataDir()`), so a 3-file id→name cache is the entire cost. Homebrew entries (non-slug ids, not in the bundled files) fall back to `overrides.name` when present, else the raw id — degraded but never wrong, and never a crash.

## Test plan

Per sub-phase (cheap, targeted — listed above): 11A `ai-schemas.test.ts` (+3 contract tests) + `dm-actions.test.ts`; 11B rewritten `prompt-assembler.test.ts` + `conversation-manager.test.ts`; 11C `prompt-assembler.test.ts`; 11D i18n gates (`locale-parity`, `generated-keys`, `key-check`) + `TravelPaceModal.test.tsx`; 11E NEW `voice-narration.test.ts`; 11F `ai-dm-routing.test.ts` (+actor cases) + `ipc-schemas.test.ts` (+field round-trip) + `context-builder.test.ts` (+actor split); 11G NEW `library-name-resolver.test.ts` + `character-context.test.ts` (+v4 fixture suite); 11H `ipc-channels.test.ts` + `ai-handlers.test.ts`.

End-of-phase 4-gate (INSTRUCTIONS.md rule 5), run once after 11H:

```bash
cd dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

No Pi code is touched (the Pi half of F6 is PHASE-21's), so no pytest run is required.

## Acceptance criteria

1. `set_ability_score`/`grant_feature`/`revoke_feature` appear in exactly one prompt location — under `### Character Sheet Mutations` in `character-rules.ts` — and nowhere in `dm-actions-schema.ts`.
2. A CI test fails if any `DM_ACTION_SCHEMAS` key is missing from the main `DmAction` union or vice versa; `light_source`/`extinguish_source` are union members.
3. `GameMode` no longer exists; `assembleSystemPrompt()` is zero-arg and its output is byte-identical to the previous `'general'` assembly; `COMBAT_TACTICS_PROMPT` still appends only when the context contains `Initiative:`.
4. No prompt rule instructs the model to emit `**bold**`; the check-request format is plain text in both narrative and social sections.
5. Travel-pace effects match the 2024 PHB verbatim-equivalent wording in the prompt, the modal, `en.json`, and `es.json`; i18n parity/key gates green.
6. `NPC_ARCHETYPES` + `EMOTION_VOCABULARY` are exported constants interpolated into `VOICE_NARRATION_PROMPT`, pinned by a colocated test, and every term passes the `parseVoiceTags` charset.
7. `AiChatRequestSchema` preserves `actingCharacterId`; both renderer AI send paths pass a resolved actor id; `buildContext` produces a full sheet for the actor and abbreviated sheets for the rest (covered by tests); solo output is unchanged.
8. A v4 character's AI context lists weapons (with equipped state), armor (equipped/carried), prepared/known spell names, feats, and magic items (with attuned markers); inline-v3 output is byte-identical to before.
9. `analyzeMapState` performs no screenshot capture, sends no claim that an image exists, and the `AI_CAPTURE_MAP` channel/handler/preload entries are gone (zero grep hits).
10. End-of-phase 4-gate green; one commit; one push (no release — INSTRUCTIONS.md rule 6).

## Out of scope

- Condition reads in `character-context.ts` (abbreviated + `Active Conditions`) and all stat-mutation write-path fixes — **PHASE-02**.
- Pi-side prosody map completion, emotion alias table, `[SPEAKER:]` tag, narrate endpoint/zod schema for `BMO_*` channels — **PHASE-21** (and **PHASE-20** for the bridge plumbing).
- `restreamConversation` losing the context block after `[FILE_READ]`/`[WEB_SEARCH]` (`ai-service.ts:654-663`) — **PHASE-06**.
- Replacing regex extraction of `[DM_ACTIONS]`/`[STAT_CHANGES]` with decoder-constrained structured outputs and the `repairJson` retirement path — **PHASE-23**.
- The broad es.json AI-DM translation-consistency sweep and other wording fixes (full-view Send, "(Phase 16a)" tooltip, etc.) — **PHASE-12** (11D touches only the `travelPaceModal.paces` keys that parity forces).
- Surfacing `wasContextTruncated`/token breakdown/connection status in the UI — **PHASE-14**.
- `num_ctx`/`keep_alive`/token-budget scaling/prompt-part ordering — **PHASE-01**.
- The dead `ai-renderer-actions.ts` `[ACTION:…]` tag system and the dead `ai-stream-handler.ts`/`finalizeAiResponse` pipeline — **PHASE-08** (dead-pipeline removals) / **PHASE-04** (store strip call).
- Any new vision feature (multimodal model gating, image generation/attachment) — **PHASE-33** owns image generation; real map-vision has no owning phase and would be net-new work.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
