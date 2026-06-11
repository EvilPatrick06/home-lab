# PHASE-31 — "Previously on" session recaps + private campaign Q&A assistant

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Ship two DM-facing memory tools: (1) a one-click **"Previously on…" session-start recap** generated from the campaign's own record (conversation summaries, AI memory files, journal), surfaced in a new modal and savable to the journal; and (2) a **private campaign Q&A side-channel** ("campaign archivist") — an out-of-fiction assistant, separate from the in-fiction DM conversation, that answers questions like "what did the innkeeper say about the mine?" strictly from recorded campaign data and refuses to invent. Both are user-initiated (button/command), never auto-fire, and never broadcast to players. The phase also repairs the existing end-of-session recap feature (its renderer→main wire is broken today) and ties the BMO/Discord pipeline in: a new Pi HTTP endpoint exposes the Discord DM bot's live-session recap (the same generator behind the bot's `/recap` slash command and `/dm stop`), and the VTT recap modal can fetch it and narrate the "Previously on" text into the Discord voice channel.

## Dependencies & cross-phase notes

- **Depends on PHASE-25 (entity-memory-lore)** per PHASE-INDEX.md row 31. Phase 25 adds entity records (NPC/location/item/faction) and player-editable lore pages that join AI context as labeled blocks. The Q&A context assembly in 31C must include whatever context-block builder Phase 25 shipped — sub-phase 31C step 1 is an explicit re-verification step for this.
- Phases run in numeric order (INSTRUCTIONS.md rule 1), so by the time 31 executes, these earlier phases have also landed and may have moved the surfaces this plan cites — re-verify (rule 3) before editing:
  - **PHASE-07 (conversation-persistence)** touches `src/main/ai/conversation-manager.ts` and the `AI_LOAD_CONVERSATION` restore path. 31B's disk-fallback conversation read must reuse Phase 07's hardened restore, not re-implement it.
  - **PHASE-20 (discord-bridge-foundation)** rewrites `src/main/bmo-bridge.ts` (honest/idempotent narrate, session start/stop/status UI) and `bmo/pi/app.py` Discord routes. 31E touches both files — coordinate: 31E adds a *new* recap route + bridge function and must follow whatever request/response/eventId conventions Phase 20 established. The `/api/discord/dm/stop` 30s-recap-vs-15s-client-timeout double-trigger bug is **Phase 20's** to fix, not 31's.
  - **PHASE-21/22 (discord voice/sync)** also touch `bmo-bridge.ts` and `bmo/pi/bots/discord_dm_bot.py`.
  - **PHASE-26 (scene-summarization)** restructures `ConversationManager` summaries (scene→session→campaign layers). 31B consumes summaries read-only; if 26 renamed accessors, update call sites, not semantics.
  - **PHASE-09 (chat-commands-cleanup)** adds a registry collision test; 31D extends the existing `/session` command's subcommands rather than registering a new top-level command, so no collision risk.
  - **PHASE-12 (i18n sweep)** owns wording consistency; 31D adds new keys to BOTH `en.json` and `es.json` from the start.
  - **PHASE-14 (ai-observability)** touches `src/main/ipc/ai-handlers.ts`; merge conflicts possible but scopes are disjoint.
- Security note: the 2026-06-10 audit flagged ten AI IPC handlers passing unsanitized `campaignId` into filesystem paths; `AI_GENERATE_END_OF_SESSION_RECAP` is one of the three indirect ones. 31A fixes that one (it is this phase's surface). If, at execution time, the other nine are still unsanitized (no earlier phase fixed them), log one entry to `docs/SECURITY-LOG.md` per INSTRUCTIONS.md rule 12 — do not fix them here.

## Verified findings

All verifications below were run 2026-06-10 against the live tree at the repo root (worktree `ai-p6-roadmap`). Re-run each command before implementing (rule 3).

### F1 — The end-of-session recap feature exists end-to-end EXCEPT the preload bridge entry: the renderer button is broken today (corrected from audit)

The audit said "BMO already has a `session_recap` agent to build on" and implied a working VTT recap to extend. Reality: the VTT's recap **main-process side** works, but the **preload wire is missing**, so the UI button always fails.

- Channel constant: `dnd-app/src/shared/ipc-channels.ts:122` — `AI_GENERATE_END_OF_SESSION_RECAP: 'ai:generate-end-of-session-recap'`.
- Main handler: `dnd-app/src/main/ipc/ai-handlers.ts:311-320` — calls `aiService.generateSessionSummary(campaignId)` and returns `{ success, data | error }`. It does **not** call `sanitizeCampaignId` (the sibling conversation handlers at `:326-412` do; the sanitizer lives at `ai-handlers.ts:96-105`, regex `/^[a-f0-9-]{36}$/i` + resolved-path containment check).
- Type declaration: `dnd-app/src/preload/index.d.ts:297` — `generateEndOfSessionRecap: (campaignId: string) => Promise<{ success: boolean; data?: string; error?: string }>`.
- Renderer caller: `dnd-app/src/renderer/src/components/game/modals/utility/EndOfSessionModal.tsx:36` — `await window.api.ai.generateEndOfSessionRecap(campaign.id)`.
- **Missing link:** the `ai: { … }` object in `dnd-app/src/preload/index.ts` (spans lines 80–228) has NO `generateEndOfSessionRecap` entry. At runtime `window.api.ai.generateEndOfSessionRecap` is `undefined`; the call throws `TypeError`, the `catch (_e)` at `EndOfSessionModal.tsx:42` swallows it, and the user sees the generic `generateError` toast every time.

Verification commands + observed results:

```bash
grep -rn "AI_GENERATE_END_OF_SESSION_RECAP" dnd-app/src
#  → only ai-handlers.ts:311 and ipc-channels.ts:122 (NO preload/index.ts hit)
grep -n -i "recap" dnd-app/src/preload/index.ts
#  → no output (entry absent)
grep -n "generateEndOfSessionRecap" dnd-app/src/preload/index.d.ts dnd-app/src/renderer/src/components/game/modals/utility/EndOfSessionModal.tsx
#  → index.d.ts:297 (declared), EndOfSessionModal.tsx:36 (called)
grep -n "sanitizeCampaignId" dnd-app/src/main/ipc/ai-handlers.ts | head
#  → defined :96, used by AI_SAVE/RESTORE/LOAD/DELETE_CONVERSATION + memory-file handlers; NOT at :311
```

### F2 — Main-process recap generator: `generateSessionSummary` summarizes since-last-summary conversation slices and appends to a per-day session log

- `dnd-app/src/main/ai/conversation-manager.ts:156-181` — `generateSessionSummary()`: returns `null` if no `summarizeCallback` or zero messages; takes messages after the last summary's `coversUpTo`, formats `Player:`/`DM:` lines capped at 500 chars each, calls the summarize callback with an "end-of-session recap" instruction, pushes the result onto `this.summaries`.
- `dnd-app/src/main/ai/ai-service.ts:999-1015` — `export async function generateSessionSummary(campaignId)`: delegates to the conversation manager, then `memMgr.appendSessionLog(sessionId, '\n--- SESSION SUMMARY ---\n…')` where `sessionId = new Date().toISOString().slice(0, 10)` (ISO date).
- The summarize callback is wired in `ai-service.ts:460-473` (`getConversation`) → `chatOnce(summarizerSystemPrompt, text)`; `chatOnce` is module-private at `ai-service.ts:935-939` (`provider.chatOnce(systemPrompt, messages, currentConfig.model)` — non-streaming).
- `AI_SAVE_CONVERSATION` (`ai-handlers.ts:325-337`) also generates a summary as a side effect of saving.

```bash
grep -n "generateSessionSummary" dnd-app/src/main/ai/ai-service.ts dnd-app/src/main/ai/conversation-manager.ts
#  → ai-service.ts:999 (export), conversation-manager.ts:156
grep -n "function chatOnce" dnd-app/src/main/ai/ai-service.ts   # → :935 (NOT exported)
```

### F3 — Memory manager: rich per-campaign AI memory on disk, but no Q&A log and no recap cache

`dnd-app/src/main/ai/memory-manager.ts` (651 lines), base path `userData/campaigns/{campaignId}/ai-context/`:

- `appendSessionLog(sessionId, text)` / `getSessionLog(sessionId)` at `:253-267` — markdown files under `ai-context/session-history/<sessionId>.md`.
- `getWorldStateSummary()` at `:436` — `world-state-summary.json` with `currentLocation`, `timeOfDay`, `activeQuests: string[]`, `recentEvents: string[]` (type `WorldStateSummary`, `dnd-app/src/main/ai/types.ts:115-122`).
- `assembleContext(currentScene?)` at `:512+` — builds labeled blocks `[WORLD STATE]`, `[WORLD SUMMARY]`, `[FACTION STANDINGS]`, `[DM RULINGS]`, `[COMBAT]`, `[NPCS]`, `[NPC PERSONALITIES]` + relationship web + NPC conversation logs. It deliberately excludes `secretMotivation` (comment at the personality map).
- Read-modify-writes are serialized via `this.mutate(...)` (Phase 17d NET-11 pattern) — new JSON-list files added in this phase must use the same `mutate` helper.
- Size budgets: `MAX_MEMORY_FILE_SIZE` 1 MB/file, `MAX_TOTAL_MEMORY_SIZE` 10 MB/dir (`memory-manager.ts:7-9`).
- There is **no** Q&A history file and **no** cached-recap file today (`grep -n "qa" dnd-app/src/main/ai/memory-manager.ts` → no relevant hits).
- Test conventions: `memory-manager.test.ts:1-25` mocks `electron` (`app.getPath → '/tmp/test'`), `fs.promises`, and stubs `crypto.randomUUID`.

### F4 — Renderer surfaces that exist for recaps today

- `EndOfSessionModal.tsx` (132 lines) — generate → editable textarea → "Save to Journal" appends a `JournalEntry` (`{ id, sessionNumber, date, title, content, isPrivate: false, authorId: 'ai-dm', createdAt }`, type at `dnd-app/src/renderer/src/types/campaign.ts:239-248`) to `campaign.journal.entries` and calls `useGameStore.getState().startNewSession()`.
- Mounted from `dnd-app/src/renderer/src/components/game/modal-groups/UtilityModals.tsx:135`: `{activeModal === 'recaps' && effectiveIsDM && <EndOfSessionModal …/>}`; modal id `'recaps'` is in the union at `dnd-app/src/renderer/src/components/game/active-modal-types.ts:59`.
- Chat command: `dnd-app/src/renderer/src/services/chat-commands/commands-dm-campaign.ts:120-138` — `/session end` and `/session recap` call `ctx.openModal?.('recaps')` (dmOnly).
- DM tab strip: `dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx` renders tabs from `dnd-app/src/renderer/public/data/ui/dm-tabs.json` (includes `{ "id": "aidm", "label": "AI DM", … }`); the `case 'aidm':` block at `DMTabPanel.tsx:203+` shows pause/cancel/approval/narration toggles when `aiEnabled` — the natural home for the two new buttons.
- i18n: `game.endOfSessionModal.*` keys exist in BOTH locales (`en.json:2741`, `es.json:2741`).
- Game-session bookkeeping lives in `dnd-app/src/renderer/src/stores/game/time-slice.ts:150-186` (`sessionLog`, `currentSessionLabel`, `startNewSession()`); persisted via `stores/game/index.ts:112-174`.

### F5 — BMO has three independent recap generators plus a SQLite campaign memory; none are reachable by the VTT without ending the session

- **Agent:** `bmo/pi/agents/session_recap_agent.py` (83 lines) — `SessionRecapAgent` with `RECAP_PROMPT` ("Previously on…" TV-intro narrator voice, 3-5 sentences, no mechanical details, end with a hook). Registered in `bmo/pi/agents/_registry.py:85-86`; router binds `"!recap"` and keywords at `bmo/pi/agents/router.py:44,179,228`. Pulls gamestate from the `dnd_dm` agent via the orchestrator. Reachable through the BMO chat/orchestrator path only.
- **dnd_dm helper:** `bmo/pi/agents/dnd_dm.py:604` `generate_session_recap(messages)`, exposed via `bmo/pi/agent.py:1343-1347` and used by `POST /api/dnd/sessions/<date>/restore` (`bmo/pi/app.py:1599-1605`) — recap on session *restore* only.
- **Discord DM bot:** `bmo/pi/bots/discord_dm_bot.py:1021-1053` — `async _generate_recap(session)`: summarizes `session.combat_log[-50:]` via `cloud_chat(recap_messages, DM_MODEL, 0.7, 512)` (BMO-voice prompt, 2-3 paragraphs, under 800 chars); returns `""` when `combat_log` is empty or on error. Used by the `/recap` slash command (`:986-1017`, embed titled "📜 Previously, on our adventure...") and by `/dm stop`.
- **Flask routes** (`bmo/pi/app.py`): `api_discord_dm_start` at `:2791` (`future.result(timeout=15)`), `api_discord_dm_stop` at `:2850` — generates the recap at `:2862`, stores it via `bot._campaign_memory.end_session(...)` at `:2864-2865`, waits `future.result(timeout=30)` at `:2882`, returns `{"ok": True, "recap": …}` at `:2884`; `api_discord_dm_narrate` at `:2894` (`future.result(timeout=15)` at `:2914`, rate-limited via `@limiter.limit(RATE_LIMIT_NARRATE)`, `RATE_LIMIT_NARRATE = os.environ.get("BMO_NARRATE_RATE_LIMIT", "30 per minute")` at `:226`); `api_discord_dm_status` at `:2924`. All routes have `/api/v1/...` aliases; auth is the global `@app.before_request` `_bmo_optional_api_key` hook at `:291-292` (new routes inherit it). **Audit line drift corrected:** the audit cited `app.py:2904` for narrate's `future.result(timeout=15)` and `:2871-2872` for stop's recap — actual lines are `:2914` and `:2862`/`:2882`.
- **CampaignMemory:** `bmo/pi/services/campaign_memory.py` — SQLite at `~/home-lab/bmo/pi/data/campaign_memory.db` (`DB_PATH` at `:15`); `start_session`/`end_session(session_id, summary)` at `:127-148`, `get_recent_sessions(campaign, limit)` at `:157`, `build_dm_context(campaign)` at `:423` (aggregates last-5 session summaries, NPCs, locations, plot threads). The Discord bot stores the VTT's `campaign_id` as the campaign name (`bot._campaign_name = campaign_id` in `api_discord_dm_start`, `app.py:2820-2822`).
- **No route exposes a recap without ending the session.** `grep -n "discord/dm/recap" bmo/pi/app.py` → no hits.

### F6 — VTT↔BMO bridge: recap returned by stop is currently dropped; fetch timeout is a fixed 15s with automatic 5xx retry

- `dnd-app/src/main/bmo-bridge.ts`: `TIMEOUT_MS = 15_000` (`:16`); `bmoPiFetchOnce` (`:109-133`) aborts at `TIMEOUT_MS`; `bmoPiFetch` (`:141-158`) retries network errors/5xx with 200/800/2000 ms backoff and never retries 4xx. Exported bridge calls: `startDiscordDm` `:160`, `stopDiscordDm` `:167`, `sendNarration` `:171`, `getDmStatus` `:178`, plus initiative/state push.
- IPC plumbing exists main↔preload: `BMO_START_DM/BMO_STOP_DM/BMO_NARRATE/BMO_STATUS` (`ipc-channels.ts:204-207`; handlers `ai-handlers.ts:656-665`; preload `index.ts:506-510`; `index.d.ts:845` types `bmoStopDm` as returning `{ ok?, error?, recap? }`).
- **No renderer caller exists for `bmoStartDm`/`bmoStopDm`** (`grep -rn "bmoStopDm\|bmoStartDm" dnd-app/src/renderer` → empty) — the session start/stop UI is Phase 20's deliverable; by execution time it should exist. The `recap` field BMO returns from stop is therefore dropped on the floor today.
- A 15s client timeout against stop's 30s server-side recap means the bridge can time out and (for 5xx) retry while the LLM call is still running — the duplicate-trigger pattern the audit flagged (Phase 20's fix). 31E's new recap fetch must use a longer per-call timeout and must NOT retry (each retry would re-bill a cloud LLM call).

### F7 — No campaign Q&A exists anywhere in the VTT

```bash
grep -rn "archivist\|campaign-qa\|campaignQa\|CAMPAIGN_QA" dnd-app/src --include="*.ts" --include="*.tsx"
#  → no hits
```

The only "ask the AI" path is the in-fiction DM chat (`AI_CHAT_STREAM`), which mutates the shared `ConversationManager` history (`ai-service.ts` chat path calls `conv.addMessage(...)`) and triggers the full DM-action/stat-change pipeline — unsuitable for private out-of-fiction questions. Supporting context loaders already exist main-side: `loadCampaignById` + `formatCampaignForContext` (`dnd-app/src/main/ai/campaign-context.ts:1-80+` — campaign name/description, custom rules, NPCs, **lore entries**, maps), token tooling (`estimateTokens`, `trimToTokenBudget`, `TOKEN_BUDGETS` in `dnd-app/src/main/ai/token-budget.ts`), and `ConversationManager.getMessages()/serialize()` for transcript access. `Campaign.lore?: LoreEntry[]` exists at `types/campaign.ts:52-59,113`.

### F8 — IPC + handler conventions to follow

- Channels: `dnd-app/src/shared/ipc-channels.ts` (309 lines, `AI_*` block around `:100-145`); schemas: `dnd-app/src/shared/ipc-schemas.ts` (zod at the IPC boundary, e.g. `AiChatRequestSchema`).
- Handlers register through `handle()` from `dnd-app/src/main/ipc/_safe.ts:38-40` (wraps `safeHandler` → normalizes throws to `{ success: false, error }`).
- `ai-handlers.test.ts` exists in `dnd-app/src/main/ipc/` for handler tests; `bmo-bridge.test.ts` exists in `dnd-app/src/main/`.
- BMO Flask route tests live in `bmo/pi/tests/test_app_endpoints.py` (mocks all hardware/LLM modules via `sys.modules` injection before importing `app`; class-based pytest with a `client` fixture).

## Sub-phases

Order keeps the tree green: main-process plumbing before renderer consumers; BMO last (independent surface).

### 31A — Repair the end-of-session recap wire + harden the handler

**Objective:** make the existing "Generate AI Recap" button work; sanitize `campaignId` on the recap channel.

**Files:** `dnd-app/src/preload/index.ts`, `dnd-app/src/main/ipc/ai-handlers.ts`, `dnd-app/src/main/ipc/ai-handlers.test.ts`.

**Steps:**
1. In `preload/index.ts`, inside the `ai: { … }` object (after the `deleteConversation` entry, ~line 100), add:
   ```ts
   generateEndOfSessionRecap: (campaignId: string) =>
     ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_END_OF_SESSION_RECAP, campaignId),
   ```
   `index.d.ts:297` already declares the matching signature — verify, don't duplicate.
2. In `ai-handlers.ts`, add `sanitizeCampaignId(campaignId)` as the first line of the `AI_GENERATE_END_OF_SESSION_RECAP` handler body (`:311`). The `handle()` wrapper converts the throw into `{ success: false, error: 'Invalid campaignId' }` — same envelope the renderer already handles.
3. Extend `ai-handlers.test.ts`: invoking the recap channel with `'../../evil'` resolves to `{ success: false, error: /Invalid campaignId/ }`; with a valid UUID it calls the (mocked) `aiService.generateSessionSummary`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ipc/ai-handlers.test.ts`.

**Acceptance:** preload entry present (grep hits `preload/index.ts`); handler rejects malformed ids; existing tests still pass.

### 31B — Main-side "Previously on" session-start recap

**Objective:** a generator that produces a player-facing session-start recap from the campaign record, cached on disk so reopening the modal does not re-bill.

**Files:** new `dnd-app/src/main/ai/recap-context.ts` (+ colocated `recap-context.test.ts`), `dnd-app/src/main/ai/memory-manager.ts` (+ test), `dnd-app/src/main/ai/ai-service.ts`, `dnd-app/src/shared/ipc-channels.ts`, `dnd-app/src/shared/ipc-schemas.ts`, `dnd-app/src/main/ipc/ai-handlers.ts` (+ test), `dnd-app/src/preload/index.ts`, `dnd-app/src/preload/index.d.ts`.

**Steps:**
1. `recap-context.ts` — pure, dependency-free assembly so it is trivially testable:
   ```ts
   export interface SessionStartRecapInputs {
     conversationSummaries: string[]        // ConversationManager.serialize().summaries[].content
     latestSessionLog: string               // memMgr.getSessionLog(<most recent date>)
     worldSummary: WorldStateSummary | null // activeQuests + recentEvents
     journalRecaps: Array<{ title: string; content: string }> // authorId === 'ai-dm', last 2
   }
   export function buildSessionStartRecapPrompt(inputs: SessionStartRecapInputs): { system: string; user: string }
   ```
   System prompt mirrors the proven BMO `RECAP_PROMPT` guidelines (F5): dramatic "Previously on…" narrator voice; focus on where the party is, accomplishments, ongoing threats, unresolved threads; name characters; 4–8 sentences; END with a hook; NO mechanical details (HP/slots). User message labels each input block (`[CONVERSATION SUMMARIES]`, `[LAST SESSION LOG]`, `[WORLD SUMMARY]`, `[SAVED RECAPS]`) and instructs: base the recap ONLY on these records. Cap each block with `trimToTokenBudget`/`estimateTokens` (≤ ~1,500 estimated tokens per block) so the one-shot call stays small.
2. `memory-manager.ts` — recap cache: `saveSessionStartRecap(recap: { text: string; generatedAt: string })` / `getSessionStartRecap()` reading/writing `session-start-recap.json` via the existing `readJson`/`writeJson` helpers. Also add `listSessionLogDates(): Promise<string[]>` (sorted readdir of `session-history/`, empty array on ENOENT) so the latest log can be located.
3. `ai-service.ts` — `export async function generateSessionStartRecap(campaignId: string, force = false): Promise<{ text: string; generatedAt: string; cached: boolean } | null>`:
   - if `!force`, return the memory-manager cache when present (cached: true);
   - gather inputs: in-memory `getConversation(campaignId).serialize().summaries`; fall back to `loadConversation(campaignId)` from `../storage/ai-conversation-storage` when the manager is empty (read-only — do NOT `restore()` into the manager; Phase 07 owns restore semantics); latest session log via the new `listSessionLogDates`; `memMgr.getWorldStateSummary()`; journal recaps via `loadCampaignById(campaignId)` filtering `journal.entries` for `authorId === 'ai-dm'` (last 2, content capped);
   - return `null` when every input is empty (brand-new campaign);
   - call the existing private `chatOnce` (same module — no export needed), persist via `saveSessionStartRecap`, return `{ text, generatedAt, cached: false }`.
4. IPC: add `AI_GENERATE_SESSION_START_RECAP: 'ai:generate-session-start-recap'` to `ipc-channels.ts` (next to `:122`); add `SessionStartRecapRequestSchema = z.object({ campaignId: z.string().uuid(), force: z.boolean().optional() })` to `ipc-schemas.ts`; handler in `ai-handlers.ts` validates with the schema (plus `sanitizeCampaignId`) and returns `{ success: true, data }` / `{ success: false, error }` (incl. "no campaign history yet" when the generator returns null). Preload entry + `index.d.ts` declaration:
   ```ts
   generateSessionStartRecap: (campaignId: string, force?: boolean) =>
     Promise<{ success: boolean; data?: { text: string; generatedAt: string; cached: boolean }; error?: string }>
   ```
5. Tests: `recap-context.test.ts` (blocks present/labeled, caps enforced, empty-input handling); `memory-manager.test.ts` additions (cache round-trip, `listSessionLogDates` ENOENT → `[]`); `ai-handlers.test.ts` (schema rejection of bad uuid / non-boolean force).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/recap-context.test.ts src/main/ai/memory-manager.test.ts`.

**Acceptance:** generator returns cached vs fresh correctly; prompt contains only labeled record blocks; channel validates input; no `ConversationManager` mutation anywhere in the path.

### 31C — Main-side campaign Q&A ("archivist") service

**Objective:** grounded, out-of-fiction Q&A over the campaign record; private, persisted history; zero interaction with the DM conversation.

**Files:** new `dnd-app/src/main/ai/campaign-qa.ts` (+ `campaign-qa.test.ts`), `dnd-app/src/main/ai/memory-manager.ts` (+ test), `dnd-app/src/shared/ipc-channels.ts`, `dnd-app/src/shared/ipc-schemas.ts`, `dnd-app/src/main/ipc/ai-handlers.ts` (+ test), `dnd-app/src/preload/index.ts`, `dnd-app/src/preload/index.d.ts`, `dnd-app/src/main/ai/ai-service.ts` (one small export).

**Steps:**
1. **Re-verify Phase 25's deliverables first** (`git log --oneline -20`, `ls dnd-app/src/main/ai/`, grep for the entity/lore context module Phase 25 added). The Q&A context MUST include Phase 25's entity-record/lore labeled blocks via whatever builder it shipped. If Phase 25's surface is absent or unrecognizable, that is a rule-9 STOP-and-ask, not a silent skip.
2. `campaign-qa.ts`:
   ```ts
   export interface QaAnswer { answer: string; askedAt: string }
   export async function askCampaignQuestion(campaignId: string, question: string): Promise<QaAnswer>
   export function buildQaPrompt(blocks: { label: string; content: string }[], question: string): { system: string; user: string }   // pure, exported for tests
   ```
   Context blocks (each trimmed with `trimToTokenBudget`, ~1,500 estimated tokens per block):
   - `[CAMPAIGN]` — `formatCampaignForContext(await loadCampaignById(campaignId))` (includes NPCs, lore, custom rules — F7);
   - `[AI MEMORY]` — `getMemoryManager(campaignId).assembleContext()` (world summary, NPCs, rulings, factions — F3; keeps the existing `secretMotivation` exclusion);
   - `[ENTITY RECORDS]` / `[LORE]` — Phase 25's blocks (step 1);
   - `[CONVERSATION]` — latest summaries + last 20 messages from the in-memory manager (disk fallback as in 31B, read-only);
   - `[JOURNAL]` — last 10 `journal.entries` (title + content capped at 500 chars each).
   System prompt (grounded-QA pattern — see Research notes): "You are the campaign archivist, an out-of-character reference assistant. Answer the question using ONLY the labeled campaign records provided. Name the record block(s) your answer came from (e.g. 'per the JOURNAL'). If the records do not contain the answer, reply exactly: `Not recorded in the campaign log.` Never invent events, names, or dialogue. Do not narrate; answer plainly and concisely." Repeat the only-from-records constraint at the END of the user message (instruction reinforcement).
   Execution: one-shot, non-streaming. Reuse the provider call by exporting a thin wrapper from `ai-service.ts`: `export async function aiChatOnce(system: string, user: string): Promise<string>` delegating to the private `chatOnce` (`:935`) — do not duplicate provider logic.
3. `memory-manager.ts` — private Q&A history: `appendQaEntry(entry: { id: string; question: string; answer: string; timestamp: string })`, `getQaLog(): Promise<QaLogEntry[]>`, `clearQaLog()`. File `qa-log.json`, list capped at the most recent 50 entries, writes through the existing `mutate()` helper (F3 concurrency pattern). This file lives under `ai-context/` so it is visible in the existing AiContextPanel memory-file browser and is removed by `AI_CLEAR_MEMORY` — both desirable.
4. IPC: channels `AI_CAMPAIGN_QA_ASK: 'ai:campaign-qa-ask'`, `AI_CAMPAIGN_QA_HISTORY: 'ai:campaign-qa-history'`, `AI_CAMPAIGN_QA_CLEAR: 'ai:campaign-qa-clear'`. Schema `CampaignQaAskSchema = z.object({ campaignId: z.string().uuid(), question: z.string().trim().min(1).max(2000) })`. Handlers: sanitize + validate; `ASK` runs `askCampaignQuestion`, appends to the Q&A log, returns `{ success: true, data: { answer, askedAt } }`; `HISTORY` returns the log; `CLEAR` empties it. Preload entries `campaignQaAsk` / `campaignQaHistory` / `campaignQaClear` + `index.d.ts` declarations.
5. Tests: `campaign-qa.test.ts` — `buildQaPrompt` includes every supplied block labeled, enforces caps, embeds the exact refusal sentence, repeats the grounding instruction in the user message; `askCampaignQuestion` never calls `ConversationManager.addMessage` (mock + assert). `memory-manager.test.ts` — qa-log append/cap-at-50/clear. `ai-handlers.test.ts` — question length/uuid validation.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/campaign-qa.test.ts src/main/ai/memory-manager.test.ts`.

**Acceptance:** Q&A answers flow through a one-shot provider call with grounded prompt; history persists and caps; DM conversation provably untouched.

### 31D — Renderer UI: SessionStartRecapModal + CampaignQaModal + entry points

**Objective:** DM-only, user-initiated surfaces for both features; nothing auto-opens, nothing broadcasts.

**Files:** `dnd-app/src/renderer/src/components/game/active-modal-types.ts`, `dnd-app/src/renderer/src/components/game/modal-groups/UtilityModals.tsx`, new `dnd-app/src/renderer/src/components/game/modals/utility/SessionStartRecapModal.tsx` (+ `.test.tsx`), new `dnd-app/src/renderer/src/components/game/modals/utility/CampaignQaModal.tsx` (+ `.test.tsx`), `dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `dnd-app/src/renderer/src/services/chat-commands/commands-dm-campaign.ts` (+ its test if one exists), `dnd-app/src/renderer/src/i18n/locales/en.json`, `dnd-app/src/renderer/src/i18n/locales/es.json`.

**Steps:**
1. Add `'previouslyOn'` and `'campaignQa'` to the `ActiveModal` union in `active-modal-types.ts` (next to `'recaps'` at `:59`).
2. `SessionStartRecapModal.tsx` (model on `EndOfSessionModal.tsx`, F4):
   - on open, call `window.api.ai.generateSessionStartRecap(campaign.id)` — shows the cached recap immediately when one exists (display `generatedAt` + a "cached" hint);
   - "Regenerate" button → `generateSessionStartRecap(campaign.id, true)`;
   - editable textarea; "Save to Journal" reuses the exact `JournalEntry` construction from `EndOfSessionModal.handleSaveRecap` (`authorId: 'ai-dm'`, next `sessionNumber`) WITHOUT calling `startNewSession()` (this is session *start*, not end);
   - "Narrate via Discord" button rendered only when `campaign.aiDm?.discordBridge` is true; on click, check `window.api.bmoDmStatus()` → if `active`, send the recap text through `window.api.bmoNarrate(text)` (preload `index.ts:506-510`); surface the returned `ok/error` as a toast. Off-path when the bridge flag is off — no new config flag needed because nothing fires without a click;
   - AI-not-configured guard identical to `EndOfSessionModal.tsx:26-29`.
3. `CampaignQaModal.tsx`:
   - history list loaded from `campaignQaHistory(campaign.id)` (question/answer/timestamp, newest first);
   - question input (maxLength 2000) + Ask button with pending state → `campaignQaAsk`; append result locally; error toast on `{ success: false }`;
   - "Clear history" → `campaignQaClear` + refresh;
   - a static privacy line from i18n: answers are private to this screen and are not broadcast to players;
   - render the exact refusal sentence (`Not recorded in the campaign log.`) in a muted style when it is the whole answer.
4. Mount both in `UtilityModals.tsx` beside the `'recaps'` line (`:135`), gated `effectiveIsDM`, lazy-imported like `EndOfSessionModal` (`:22`).
5. Entry points:
   - `DMTabPanel.tsx` `case 'aidm':` block (`:203+`): two new buttons inside the `aiEnabled` branch — `t('game.dmTabPanel.previouslyOn')` → `onOpenModal('previouslyOn')` and `t('game.dmTabPanel.campaignQa')` → `onOpenModal('campaignQa')`.
   - `commands-dm-campaign.ts` `/session` switch (`:125+`): add `case 'previously': ctx.openModal?.('previouslyOn'); return { type: 'local', content: … }`. Use a `local` (non-broadcast) result — opening a recap modal is not table-facing. No new top-level command (Phase 09 registry hygiene).
6. i18n: add `game.sessionStartRecapModal.*`, `game.campaignQaModal.*`, `game.dmTabPanel.previouslyOn`, `game.dmTabPanel.campaignQa` to BOTH `en.json` and `es.json` (es translations in normal professional Spanish, consistent with the existing `endOfSessionModal` block at `es.json:2741`).
7. Tests: colocated `.test.tsx` for each modal — renders, generate/ask happy path with mocked `window.api`, error envelope path, Discord button hidden when `discordBridge` falsy, refusal-sentence styling, clear-history flow.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/components/game/modals/utility/SessionStartRecapModal.test.tsx src/renderer/src/components/game/modals/utility/CampaignQaModal.test.tsx`.

**Acceptance:** both modals reachable only via explicit DM action (tab button / `/session previously`); no auto-open on game load; player clients never see Q&A traffic.

### 31E — BMO tie-in: live Discord recap endpoint + VTT surfacing

**Objective:** expose the Discord DM bot's recap over HTTP without ending the session; let the VTT recap modal show it; surface the `/dm stop` recap instead of dropping it.

**Files:** `bmo/pi/app.py`, `bmo/pi/tests/test_app_endpoints.py`, `dnd-app/src/main/bmo-bridge.ts` (+ `bmo-bridge.test.ts`), `dnd-app/src/shared/ipc-channels.ts`, `dnd-app/src/main/ipc/ai-handlers.ts` (+ test), `dnd-app/src/preload/index.ts`, `dnd-app/src/preload/index.d.ts`, `dnd-app/src/renderer/src/components/game/modals/utility/SessionStartRecapModal.tsx`.

**Steps:**
1. `bmo/pi/app.py` — new route directly after `api_discord_dm_narrate` (~`:2916`), with `/api/v1/...` alias and a rate limit (`RATE_LIMIT_RECAP = os.environ.get("BMO_RECAP_RATE_LIMIT", "6 per minute")` beside `:226` — it is a billable cloud LLM call):
   ```python
   @app.route("/api/discord/dm/recap", methods=["GET"])
   @app.route("/api/v1/discord/dm/recap", methods=["GET"])
   @limiter.limit(RATE_LIMIT_RECAP)
   def api_discord_dm_recap():
       """Generate a recap of the ACTIVE Discord DM session without ending it.
       ?mode=last returns the most recent stored session summary instead."""
   ```
   - `mode=last` (+ optional `campaign` param, defaulting to `bot._campaign_name`): return the latest stored summary via `bot._campaign_memory.get_recent_sessions(campaign, limit=1)` (F5) — `{"ok": True, "recap": summary, "session_id": id, "ended_at": ...}`, 404 when none. No LLM call → exempt this branch from the limiter cost by checking mode BEFORE generation (the limiter still counts the request; acceptable).
   - live mode: 503 when `get_dm_bot()` is None; 404 when `not bot.session.active`; `{"ok": True, "recap": ""}` when `combat_log` is empty (matches `_generate_recap`'s empty-log contract); otherwise `asyncio.run_coroutine_threadsafe(_generate_recap(bot.session), bot.loop)` with `future.result(timeout=45)` and `future.cancel()` in the timeout handler (do NOT leave the coroutine running — the audit's narrate lesson, F6); on timeout return 504 `{"error": "recap generation timed out"}`.
   - Follow whatever response-shape conventions Phase 20 standardized on these routes (re-verify at execution).
2. `bmo/pi/tests/test_app_endpoints.py` — new test class `TestDiscordDmRecap` using the existing mock pattern: bot-missing → 503; inactive session → 404; active session with mocked `_generate_recap` → 200 + recap body; `mode=last` with mocked campaign memory → stored summary; timeout path → 504 (mock `future.result` raising `concurrent.futures.TimeoutError`).
3. `dnd-app/src/main/bmo-bridge.ts`:
   - extend `bmoPiFetchOnce`/`bmoPiFetch` with an options bag `{ timeoutMs?: number; retry?: boolean }` (defaults preserve current behavior: 15s, retry on);
   - `export async function getDiscordRecap(mode: 'live' | 'last' = 'live'): Promise<BridgeResponse>` → `bmoPiFetch('/api/discord/dm/recap' + (mode === 'last' ? '?mode=last' : ''), undefined, { timeoutMs: 50_000, retry: false })`. No retry: a retried timeout would double-bill the LLM (F6).
   - `bmo-bridge.test.ts`: timeout override honored (fake timers), retry suppressed for the recap call, query string for `mode=last`.
4. IPC: `BMO_DISCORD_RECAP: 'bmo:discord-recap'` in `ipc-channels.ts` (next to `:207`); handler in `ai-handlers.ts` beside `BMO_STATUS` (`:656-665`) calling `getDiscordRecap(mode)`; preload `bmoDiscordRecap: (mode?: 'live' | 'last') => …` + `index.d.ts` (model the declaration on `bmoStopDm` at `:845`).
5. `SessionStartRecapModal.tsx`: when `campaign.aiDm?.discordBridge` is true, show a collapsed "Discord session recap" section with two buttons — "Fetch live recap" (`bmoDiscordRecap('live')`; explain it needs an active `/dm start` session) and "Last Discord session" (`bmoDiscordRecap('last')`); render the returned text read-only with a copy button and an "Insert into draft" action that appends it to the editable recap textarea. All fetches are click-driven; failures render the bridge's `error` string inline (never a silent empty state).
6. Stop-recap surfacing: if Phase 20's session UI calls `bmoStopDm()`, locate that call site at execution time and route a non-empty `recap` field into a toast + clipboard-able dialog or directly into the `'recaps'` modal draft. If Phase 20 shipped no renderer call site (still none today, F6), add the surfacing inside whatever component Phase 20 created for stop — and if genuinely nothing exists, log a coordination entry to `docs/ISSUES-LOG-DNDAPP.md` referencing Phase 20 rather than building a parallel stop UI here.

**Cheap checks:** `cd bmo/pi && python -m pytest tests/test_app_endpoints.py -q`; `npx vitest run src/main/bmo-bridge.test.ts`; `npx tsc --noEmit -p tsconfig.node.json`.

**Acceptance:** recap endpoint returns live/last recaps without ending the session and cancels the coroutine on timeout; VTT fetch uses 50s/no-retry; modal surfaces Discord recaps on explicit click only.

## Research notes

- **Why a side-channel assistant (not the DM chat):** CALYPSO (AIIDE 2023) found DMs specifically valued LLM "distillation of game context into bite-sized prose" delivered *without interrupting play*, with the human retaining creative agency — i.e., an assistant that informs the DM privately rather than speaking in-fiction. That maps directly to a separate one-shot Q&A path that never touches the in-fiction conversation state. Source: https://arxiv.org/abs/2308.07540
- **Product precedent — recap + campaign Q&A as one bundle:** Archivist AI ships exactly this pairing: "Previously on…" recap generation from session records plus a campaign-aware chatbot whose "answers come from … transcripts, summaries, uploaded lore docs, entity descriptions, and timeline events." Confirms the data-source list used in 31C (transcript summaries + lore + entities + journal). Sources: https://www.myarchivist.ai/dnd-session-recap, https://www.myarchivist.ai/, https://www.myarchivist.ai/ai-dungeon-master/foundry-vtt
- **VTT-integrated precedent:** FoundryAI provides "polished narrative summaries of your sessions" and RAG-indexed campaign knowledge (journals/actors/scenes) answered from a sidebar chat — validating the in-VTT placement (DM tab + modal) rather than an external tool. Source: https://foundryvtt.com/packages/foundry-ai
- **Grounded-QA prompt shape (anti-hallucination):** current best practice for closed-book-over-provided-context QA: (a) explicit boundary instruction ("answer only from the documents provided"), (b) explicit uncertainty handling (a fixed refusal string rather than "best effort"), (c) ask the model to attribute the answer to a source, (d) repeat the key constraint near the end of the prompt (instruction reinforcement measurably reduces fabrication). 31C encodes all four: labeled blocks, the exact sentence `Not recorded in the campaign log.`, "name the record block", and a trailing restatement of the only-from-records rule. Sources: https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/best-practices-for-mitigating-hallucinations-in-large-language-models-llms/4403129, https://www.prompthub.us/blog/improve-accuracy-and-reduce-hallucinations-with-a-simple-prompting-technique
- **Why one-shot/non-streaming for both features:** streaming adds listener-lifecycle complexity (the Phase 05 problem class) for no UX gain on short outputs (recaps ≤ 8 sentences; Q&A answers concise by prompt). The existing `chatOnce` path (`ai-service.ts:935`) is already used for summarization/world-state extraction — proven on small local models.
- **Why cache the session-start recap on disk:** local-model generation is slow on CPU (the documented prefill pain) and cloud calls bill per token; the recap is stable between sessions, so cache-with-explicit-Regenerate is strictly better than regenerate-on-open. Mirrors the existing pattern of persisting summaries in `session-history/`.
- **Why the BMO endpoint cancels its future on timeout:** the audit's fleet-verified narrate bug (un-cancelled `_speak` coroutine completing after the HTTP 500 → retry → quadruple speech) shows the failure mode; for a billable LLM recap the equivalent is double-billing. Hence `future.cancel()` + client-side `retry: false` + a 50s client timeout > the 45s server budget.
- **Alternatives considered:** (a) routing Q&A through `AI_CHAT_STREAM` with a "meta" flag — rejected: pollutes conversation history, triggers the stat-change/DM-action pipeline, and risks the approval-queue machinery; (b) building Q&A on the rules-RAG search engine — rejected for this phase: PHASE-24/25 own retrieval; 31C's block-stuffing with per-block budgets is sufficient at current campaign sizes and Phase 25's labeled blocks slot in directly; (c) a BMO-side Q&A agent — rejected: the VTT owns campaign truth (journal, memory files); BMO only owns the Discord session record, which is exactly what the recap endpoint exposes.

## Test plan

| Sub-phase | New/updated tests |
|---|---|
| 31A | `src/main/ipc/ai-handlers.test.ts` — recap channel sanitization + happy path |
| 31B | new `src/main/ai/recap-context.test.ts`; `src/main/ai/memory-manager.test.ts` (recap cache, `listSessionLogDates`); `ai-handlers.test.ts` (schema validation) |
| 31C | new `src/main/ai/campaign-qa.test.ts` (prompt blocks, caps, refusal string, no ConversationManager mutation); `memory-manager.test.ts` (qa-log append/cap/clear); `ai-handlers.test.ts` (ask/history/clear validation) |
| 31D | new `SessionStartRecapModal.test.tsx`, new `CampaignQaModal.test.tsx`; `commands-dm-campaign` test for `/session previously` if a test file exists |
| 31E | `bmo/pi/tests/test_app_endpoints.py::TestDiscordDmRecap` (503/404/200/last/504); `src/main/bmo-bridge.test.ts` (timeout override, no-retry, mode query); `ai-handlers.test.ts` (`BMO_DISCORD_RECAP`) |

End-of-phase 4-gate (INSTRUCTIONS.md rule 5), run from `dnd-app/`: `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run`. Because 31E touches `bmo/pi/`, also run `cd bmo/pi && python -m pytest tests/` per rule 5. One commit + one push for the whole phase.

## Acceptance criteria

1. "Generate AI Recap" in the existing End of Session modal works (preload entry present; manual chain: handler ← channel ← preload ← modal all grep-verified) and the channel rejects non-UUID campaign ids.
2. A DM can click "Previously on…" in the AI DM tab (or run `/session previously`) and get a narrative session-start recap built only from campaign records; reopening shows the cached recap with its timestamp; Regenerate forces a fresh one; Save to Journal appends an `authorId: 'ai-dm'` entry without starting a new session.
3. A DM can ask the campaign archivist a question and get an answer grounded in labeled campaign records, with `Not recorded in the campaign log.` for unknowns; history persists across app restarts (qa-log.json), caps at 50, and is clearable; the in-fiction DM conversation is byte-identical before/after a Q&A exchange.
4. Neither feature fires without an explicit DM action; neither emits any network/P2P broadcast; both UIs are gated `effectiveIsDM`.
5. `GET /api/discord/dm/recap` (live + `mode=last`) works on the Pi test client with the documented status codes; the VTT can fetch and display both via the recap modal's Discord section; the fetch never retries and outlives the server budget.
6. All new IPC channels are registered in `ipc-channels.ts`, zod-validated in `ipc-schemas.ts`/handler, exposed in `preload/index.ts`, and typed in `preload/index.d.ts`. New UI strings exist in `en.json` AND `es.json`. 4-gate + bmo pytest green.

## Out of scope

- Fixing the `/api/discord/dm/stop` 30s-vs-15s timeout double-trigger and narrate idempotency/eventId — **PHASE-20**.
- Streaming sentence-chunked TTS for the recap narration (Kokoro/Piper pipeline) — **PHASE-21**; 31E narrates via the existing `bmoNarrate` path as-is.
- Building the rules/lore retrieval index (hybrid BM25+vector) the Q&A could later use — **PHASE-24**; entity-record/lore extraction itself — **PHASE-25**.
- Scene-boundary layered summarization (changes what `summaries` contain) — **PHASE-26**.
- Player-facing (non-DM) access to the archivist across the P2P network — future work; would require relaying Q&A through the host's AI and a permission model (log as suggestion if demand appears).
- The remaining unsanitized-`campaignId` AI handlers beyond the recap channel — security log per rule 12 (see Dependencies note).
- Per-NPC voice casting for the narrated recap — **PHASE-21**.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
