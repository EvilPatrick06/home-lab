# PHASE-29 — Per-task model routing, mid-session model swap, llama-server backend option

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Today every LLM call in the app — narration, conversation compaction, end-of-session recaps, vision analysis, and (after PHASE-23/25/26/28) structured extraction, entity extraction, scene summaries, and quest checking — runs on the ONE globally-configured model. This phase adds (1) an opt-in per-task routing layer in the main process that sends mechanics/extraction/summary work to a small fast model while reserving the primary model for narration (directly reducing the local-CPU big-prompt prefill pain by keeping large-prompt calls rare), (2) a DM-facing mid-session model swap UI so the model can be changed without leaving the game (reviewers single this out as a standout competitor feature), and (3) an opt-in `llamacpp` local-endpoint flavor so the existing local provider can target a llama.cpp `llama-server` instance running speculative decoding — a capability stock Ollama still lacks. All three are off by default; with nothing enabled, runtime behavior is byte-identical to today.

## Dependencies & cross-phase notes

- **Depends on PHASE-23 (structured outputs)** per PHASE-INDEX. PHASE-23 introduces the two-call structured-extraction pattern (`format` = JSON schema, `stream: false`); that second call is the highest-value routing target ("extraction"). 29B routes it.
- **Executes after PHASE-01/03/25/26/28 by numeric order** (INSTRUCTIONS.md rule 1), all of which touch the same surface:
  - **PHASE-01** (`ollama-client.ts`) sets `num_ctx`/`keep_alive` and demands options-block **stability per model** (a changed option = model reload = KV-cache wipe). The routing layer must keep a *stable per-model options block*: the small model and the primary model each keep their own constant options; routing never varies options on the same model between requests.
  - **PHASE-03** (`ai-service.ts`, `ollama-client.ts`, `ollama-manager.ts`) fixes `listOllamaModels` no-timeout, the `getConfig()` disk-clobber of in-memory model auto-switch, and the `listInstalledModelsDetailed` localhost hardcode. 29's config extensions to `configure()`/`getConfig()` must merge with whatever shape PHASE-03 left — re-verify those functions before editing.
  - **PHASE-10** (`AiProviderSetup.tsx`) reworks provider defaults/dropdown states. 29C adds an "Advanced" routing section to the same component — re-read the component as PHASE-10 left it before editing.
  - **PHASE-14** (`AiContextPanel.tsx`) builds the context-inspector. 29 only emits routing log lines (29B); surfacing routed-model info in that panel belongs to PHASE-14's panel and is NOT extended here.
  - **PHASE-25/26/28** add entity-extraction, scene-summarization, and director/quest-checker LLM calls. 29B's survey step finds and routes every such call site that exists at execution time.
- **Coordinate file list** (phases above may have shifted line numbers; all citations below were verified 2026-06-10 and must be re-verified per INSTRUCTIONS.md rule 3): `src/main/ai/ai-service.ts`, `src/main/ai/ollama-client.ts`, `src/main/ai/ollama-manager.ts`, `src/main/ipc/ai-handlers.ts`, `src/shared/ipc-schemas.ts`, `src/renderer/src/components/campaign/AiProviderSetup.tsx`, `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/types/campaign.ts`, `src/renderer/src/services/ai-dm-routing.ts`, `src/renderer/src/pages/campaign-detail/AiDmCard.tsx`, `src/renderer/src/i18n/locales/en.json` + `es.json`.

## Verified findings

All claims verified 2026-06-10 against the live tree. Re-run each command from the repo root before implementing.

### F1 — One global model serves every LLM call; no task-routing concept exists anywhere

- The main process holds a single mutable config with ONE `model` field: `currentConfig` at `dnd-app/src/main/ai/ai-service.ts:272-283` (`provider`, `model`, `ollamaUrl`, three API keys). `DEFAULT_AI_MODEL = 'llama3.2:3b'` at `ai-service.ts:269` is the only place a model id is hardcoded main-side.
- The narration stream resolves that one model: `startChat` → `resolveOllamaModel(currentConfig.model, streamId)` at `ai-service.ts:652`, passed to `provider.streamChat(...)` at `ai-service.ts:711`.
- Background summaries use the SAME model: `getConversation()` installs a summarize callback (`ai-service.ts:464-470`) that calls module-local `chatOnce` (`ai-service.ts:935-939`), which sends `currentConfig.model` to `provider.chatOnce(...)`. This callback powers both mid-conversation compaction (`conversation-manager.ts:183-207`) and the end-of-session recap (`conversation-manager.ts:153-177`, surfaced via `generateSessionSummary` at `ai-service.ts:999-1015` and IPC `AI_GENERATE_END_OF_SESSION_RECAP`).
- Vision map analysis uses it too: `analyzeMapState` at `dnd-app/src/main/ai/ai-vision.ts:191-192` calls `getModelForProvider`, which at `ai-vision.ts:210-218` returns `getConfig()?.model || DEFAULT_AI_MODEL`.
- No routing/small-model concept exists:
  ```bash
  grep -rn "smallModel\|fastModel\|taskModel\|TaskClass\|routing" dnd-app/src/main --include=*.ts | grep -vi test
  # → only an unrelated mDNS comment hit in src/main/bmo-config.ts:10
  grep -rn "chatOnce" dnd-app/src/main --include=*.ts | grep -v "\.test\."
  # → llm-provider.ts:33 (interface), 4 provider impls, ai-service.ts:466,935,938, ai-vision.ts:190-192
  ```
- `keyword-extractor.ts` is deterministic (stop-word lists, no LLM) and `memory-manager.ts` makes no LLM calls (`grep -n "chatOnce\|streamChat" dnd-app/src/main/ai/memory-manager.ts` → no hits) — neither needs routing.
- The `LLMProvider` interface (`dnd-app/src/main/ai/llm-provider.ts:21-38`) already takes `model: string` per call on both `streamChat` and `chatOnce`, so per-task routing needs NO provider-interface change — only call sites need to pass a different model id.

### F2 — Config plumbing: flat `AiConfig` persisted to `ai-config.json`, zod-validated at the IPC boundary

- Type: `AiConfig` at `dnd-app/src/main/ai/types.ts:5-14` — `provider`, `model`, `ollamaUrl`, three optional keys, deprecated `ollamaModel`.
- Schema: `AiConfigSchema` at `dnd-app/src/shared/ipc-schemas.ts:5-13` (zod; repo uses zod `^4.4.3` per `dnd-app/package.json:238`). The IPC handler `AI_CONFIGURE` safe-parses and forwards `parsed.data` (`dnd-app/src/main/ipc/ai-handlers.ts:108-122`); **zod strips unknown keys**, so any new config field MUST be added to the schema or it silently never reaches the main process (same trap as the audit's `actingCharacterId` finding).
- Persistence: `configure()` at `ai-service.ts:325-374` writes `{provider, model, ollamaUrl, keys}` to `ai-config.json` via `atomicWriteFile`; `getConfig()` at `ai-service.ts:376-403` re-reads disk into `currentConfig` on every call (PHASE-03 owns the clobber fix — merge carefully).
- Preload passthrough is untyped on the way in: `configure: (config: Record<string, unknown>)` at `dnd-app/src/preload/index.ts:81`, `getConfig` at `:82` — adding fields needs no preload edit.
- `AI_CONFIGURE` also calls `ensureOllamaUsesDedicatedGpu()` when `provider === 'ollama'` (`ai-handlers.ts:118-120`) — relevant to 29E (must be skipped for the `llamacpp` flavor).

### F3 — Model swap today requires leaving the game session; campaign is the per-campaign source of truth

- Per-campaign AI settings live in `campaign.aiDm` (`AiDmConfig` at `dnd-app/src/renderer/src/types/campaign.ts:63-74`: `enabled`, `provider?`, `model?`, `ollamaUrl?`, three keys, `discordBridge?`, deprecated `ollamaModel?`).
- The ONLY model-change UIs are outside the session: `AiDmCard` on the campaign-detail page (`dnd-app/src/renderer/src/pages/campaign-detail/AiDmCard.tsx:98-125` — Save writes `campaign.aiDm` via `saveCampaign` and pushes `window.api.ai.configure`) and `CampaignWizard.tsx:420` at creation time. Both render `AiProviderSetup`.
- At session start, `configureAiFromCampaign` (`dnd-app/src/renderer/src/services/ai-dm-routing.ts:27-47`) pushes the campaign's `aiDm` to the main process — the campaign, not `ai-config.json`, is the per-campaign source of truth (the "S-4" comment block documents this).
- In-game, the DM-only AI status bar (`dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx:417-438`) shows a readiness dot + token meter; `ChatPanel` loads `window.api.ai.getConfig()` only to compute readiness (`ChatPanel.tsx:151-179`). There is **no in-session affordance to view or change the model** — `grep -rn "ai\.configure" dnd-app/src/renderer/src/components/game` → no hits.
- In-game campaign saves use `useCampaignStore.getState().saveCampaign(updated)` (pattern at `dnd-app/src/renderer/src/components/game/dm/DMNotepad.tsx:129`; store method at `dnd-app/src/renderer/src/stores/use-campaign-store.ts:135-137`). Toasts via `addToast` from `hooks/use-toast` (used at `GameLayout.tsx:10`).
- `GameLayout` receives `campaign: Campaign` + `isDM` (`GameLayout.tsx:98-104`) and passes `campaign` into `ChatPanel` (`ChatPanel.tsx:108-117` props already include `campaign?: Campaign`).
- Model pickers already have data sources: `AI_GET_CURATED_MODELS` returns `CURATED_MODELS` (10 entries, `dnd-app/src/main/ai/ollama-manager.ts:56-91`), `AI_LIST_INSTALLED_MODELS` returns `listOllamaModels()` strings (`ollama-manager.ts:510-512`), `AI_LIST_CLOUD_MODELS` returns live per-provider ids (`ai-handlers.ts:134-152`). `AiProviderSetup` consumes all three (`AiProviderSetup.tsx:90,113-114`).

### F4 — llama-server compatibility gap: chat already works, health/list/preflight do not

- `ollama-client.ts` already speaks the **OpenAI-compatible** chat protocol: streaming POST `${ollamaBaseUrl}/v1/chat/completions` at `dnd-app/src/main/ai/ollama-client.ts:93`, non-streaming at `:227`. llama.cpp's `llama-server` serves the identical endpoint, so chat requests would work unmodified if `ollamaUrl` pointed at one.
- BUT three Ollama-only call paths break against llama-server:
  1. `isOllamaRunning()` GETs `/api/tags` (`ollama-client.ts:34-43`) — llama-server has no `/api/tags`; availability would always read false.
  2. `listOllamaModels()` GETs `/api/tags` (`ollama-client.ts:46-55`) — returns `[]` against llama-server.
  3. `resolveOllamaModel()` (`ai-service.ts:592-608`) preflights every stream against `listOllamaModels()`; an empty list **throws** `No Ollama models installed at <url>… ollama pull llama3.2:3b` — so chat never starts.
  Verify: `grep -n "api/tags\|v1/chat/completions" dnd-app/src/main/ai/ollama-client.ts` → lines 36, 48, 93, 227.
- `ollama-manager.ts` flows (detect/install/start/pull/update, `ensureOllamaUsesDedicatedGpu`) are all Ollama-binary-specific and must simply not run for a llama-server endpoint.
- llama-server equivalents (verified against upstream docs 2026-06-10, see Research notes): `GET /health` → `{"status":"ok"}` when ready (503 while loading); `GET /v1/models` → OpenAI-shape `{data:[{id:…}]}` where `id` is the model file path or the `--alias` value; the server **accepts any `model` value** in chat requests (single-model server ignores mismatches).

### F5 — Stock Ollama still lacks speculative decoding (audit claim confirmed; details corrected)

- [ollama#5800](https://github.com/ollama/ollama/issues/5800) (opened 2024-07-19) is **still open** as of 2026-06-10 — no maintainer commitment, no timeline. Speculative decoding therefore requires llama.cpp's `llama-server` (or another engine) — confirming the audit entry.
- **Correction 1 (flag names drifted):** current llama.cpp master renamed the speculative flags. Master now uses `--spec-draft-model` (alias `-md`/`--model-draft` retained), `--spec-draft-n-max` (default 3), `--spec-draft-n-min` (default 0), `--spec-draft-p-min`, `--spec-draft-ngl`/`-ngld`, plus draftless n-gram modes via `--spec-type ngram-simple|ngram-map-k|ngram-map-k4v|ngram-mod`. Older releases/guides use `--draft-max`/`--draft-min`/`--draft-p-min`. Documentation written in 29E must show BOTH spellings.
- **Correction 2 (speedup is configuration-dependent, not guaranteed):** the audit's "Qwen3-0.6B drafting for 8B ≈ 1.9×" figure is real for dense targets, but 2026 community benchmarks (RTX 3090, Qwen3.6-35B-A3B MoE, 19 configurations) found **no net speedup — 3-12% slower — even at 100% draft acceptance** on that MoE-on-Ampere combination, and a vocab-mismatched draft (Qwen3-0.6B vocab 151936 vs target vocab 248320) fails to start at all. The feature ships as strictly opt-in with a "benchmark on your own hardware; draft and target must share a compatible vocabulary" caveat.

### F6 — Ollama can hold both models resident (routing won't thrash)

- Ollama's default `OLLAMA_MAX_LOADED_MODELS` is **3 × GPU count (or 3 for CPU)**, so a 7-9B primary plus a 0.5-3B small model coexist when memory allows; when it doesn't, Ollama queues and unloads idle models in order ([Ollama FAQ](https://docs.ollama.com/faq)). Per-request `keep_alive` (PHASE-01's work) overrides `OLLAMA_KEEP_ALIVE` and applies per model, so routed small-model calls must send the same `keep_alive` policy PHASE-01 established to keep both warm. Routed calls on a *different* model do NOT invalidate the primary model's KV prefix cache (caches are per-model) — routing is cache-neutral for narration.

## Sub-phases

Execute in order; the tree stays green after each (new code is dead until its consumer lands in the same phase).

### 29A — Routing core (main process, pure + config plumbing)

**Objective:** a task-class model resolver, opt-in and inert by default, persisted alongside the existing AI config.

**Files:** `src/main/ai/model-routing.ts` (new), `src/main/ai/model-routing.test.ts` (new), `src/main/ai/types.ts`, `src/main/ai/ai-service.ts`, `src/shared/ipc-schemas.ts`.

**Steps:**
1. Create `src/main/ai/model-routing.ts`:
   ```ts
   export type AiTaskClass = 'narration' | 'summary' | 'extraction' | 'mechanics' | 'vision'
   export type RoutableTask = 'summary' | 'extraction' | 'mechanics'
   export interface AiRoutingConfig {
     enabled: boolean            // master switch — default false
     smallModel: string          // '' = unset → everything falls back to primary
     overrides?: Record<string, string>  // per-task model id; keys validated against ROUTABLE_TASKS
   }
   export const ROUTABLE_TASKS: readonly RoutableTask[] = ['summary', 'extraction', 'mechanics']
   export function isRoutableTask(t: AiTaskClass): t is RoutableTask
   /** Pure: no IO. narration/vision ALWAYS return primaryModel. Routable tasks return
    *  overrides[task] ?? smallModel when enabled and non-empty, else primaryModel. */
   export function resolveModelForTask(task: AiTaskClass, primaryModel: string, routing: AiRoutingConfig | undefined): string
   ```
   Keep it pure (no imports from ai-service) so it unit-tests in isolation and other modules (PHASE-23 extraction helpers, future callers) can import it without cycles.
2. Extend `AiConfig` (`types.ts:5-14`) with `routing?: AiRoutingConfig` (import the type from `./model-routing`).
3. Extend `AiConfigSchema` (`ipc-schemas.ts:5-13`) with:
   ```ts
   routing: z.object({
     enabled: z.boolean().default(false),
     smallModel: z.string().default(''),
     overrides: z.record(z.string(), z.string()).optional()
   }).optional()
   ```
   (zod 4 syntax — `z.record` takes key + value schemas; unknown override keys are tolerated by schema and ignored by the resolver.)
4. In `ai-service.ts`: add `routing` to `currentConfig` (`:272-283`), thread it through `configure()` (accept + persist in the JSON written at `:362-374`), `getConfig()` (read back at `:376-403`; default `undefined` when absent — back-compat with existing `ai-config.json` files), and `initFromSavedConfig()`. Merge with whatever PHASE-03 did to these functions.
5. Add to `ai-service.ts` an exported async resolver with validation + telemetry:
   ```ts
   export async function getModelForTask(task: AiTaskClass): Promise<string>
   ```
   - Calls `resolveModelForTask(task, currentConfig.model, currentConfig.routing)`.
   - If the result differs from the primary AND the active provider is `ollama`: check it against `listOllamaModels()`; if not installed, `logToFile('warn', '[AI routing] small model "<m>" not installed; falling back to primary')` and return `currentConfig.model` (mirrors the `resolveOllamaModel` fail-soft philosophy at `ai-service.ts:592-608`).
   - On every routed (non-primary) resolution: `logToFile('info', '[AI routing] task=<task> model=<m>')`.

**Cheap checks:** `npx tsc --noEmit -p dnd-app/tsconfig.node.json`; `npx vitest run dnd-app/src/main/ai/model-routing.test.ts`.

**Acceptance:** resolver returns primary for every task when `routing` is undefined/disabled/empty (asserted in tests); config round-trips `routing` through `configure()` → `getConfig()`; schema parse drops nothing.

### 29B — Wire every non-narration call site through the resolver

**Objective:** all background/mechanics LLM calls route; narration and vision stay on the primary model; zero behavior change while routing is disabled.

**Files:** `src/main/ai/ai-service.ts`, plus every file the survey step identifies (expected: the PHASE-23 structured-extraction module, PHASE-25 entity-extraction, PHASE-26 scene-summarization, PHASE-28 quest-checker/director call sites), `src/main/ai/ai-service.test.ts`.

**Steps:**
1. **Survey (mandatory, run at execution time** — phases 23-28 have added call sites since this plan was authored):
   ```bash
   grep -rn "chatOnce\|ollamaChatOnce\|streamChat(" dnd-app/src/main --include=*.ts | grep -v "\.test\."
   ```
   Classify every hit: narration stream (`startChat` path) and vision (`ai-vision.ts`) stay primary; everything else gets a task class — summarization/compaction/recap → `'summary'`; structured/entity extraction → `'extraction'`; quest-check/goal-check/oracle/adjudication helpers → `'mechanics'`. Also check the completed plans `dnd-app/docs/phases/completed/PHASE-23-*.md`, `PHASE-25-*.md`, `PHASE-26-*.md`, `PHASE-28-*.md` Completed sections for the call sites they landed.
2. Change module-local `chatOnce` (`ai-service.ts:935-939`) to `chatOnce(systemPrompt, userMessage, task: AiTaskClass = 'narration')` using `await getModelForTask(task)`; export a public `taskChatOnce(systemPrompt, messages, task)` for call sites living in other modules.
3. Summarize callback (`ai-service.ts:464-470`) passes `'summary'`.
4. Route each surveyed call site (pass the task class through whatever helper signature each module uses). Do NOT touch `startChat`'s `resolveOllamaModel(currentConfig.model, …)` at `:652` (narration) or `ai-vision.ts`'s `getModelForProvider` (vision needs the capable model).
5. Per-model option stability (PHASE-01 invariant): if PHASE-01 attached an options/keep_alive block to Ollama requests, ensure the routed small-model requests carry their own CONSTANT options block (same `keep_alive`, a `num_ctx` sized for short prompts is fine as long as it never varies between small-model requests).

**Cheap checks:** `npx tsc --noEmit -p dnd-app/tsconfig.node.json`; `npx vitest run dnd-app/src/main/ai/ai-service.test.ts`.

**Acceptance:** with routing disabled, an `ai-service.test.ts` test asserts the summarize callback still hits the primary model; with routing enabled + a mocked installed small model, it hits the small model; with routing enabled + small model NOT installed (mocked `listOllamaModels`), it falls back to primary and logs a warning.

### 29C — Campaign persistence + setup-UI routing controls

**Objective:** routing is configurable per campaign (campaign = source of truth, F3) and survives session start.

**Files:** `src/renderer/src/types/campaign.ts`, `src/renderer/src/services/ai-dm-routing.ts`, `src/renderer/src/pages/campaign-detail/AiDmCard.tsx`, `src/renderer/src/components/campaign/AiProviderSetup.tsx`, `src/renderer/src/components/campaign/CampaignWizard.tsx`, `src/renderer/src/i18n/locales/en.json` + `es.json`.

**Steps:**
1. Extend `AiDmConfig` (`campaign.ts:63-74`) with `routingEnabled?: boolean` and `routingSmallModel?: string` (flat — keeps campaign JSON migration-free; absent = disabled).
2. `configureAiFromCampaign` (`ai-dm-routing.ts:27-47`): include `routing: { enabled: aiDm.routingEnabled ?? false, smallModel: aiDm.routingSmallModel ?? '' }` in the `window.api.ai.configure` payload.
3. `AiProviderSetup.tsx`: add a collapsed "Advanced — background-task model" block below the model picker (re-read the component post-PHASE-10 first). Contents: a checkbox (`routingEnabled`, default unchecked) + a model dropdown (Ollama: `installedModels` already in state at `:69`; cloud: `cloudModels` at `:70`) with helper text explaining what routes (summaries, extraction, mechanics — not narration). Extend `AiProviderSetupProps.onChange`'s data object with the two optional fields; update both consumers (`AiDmCard.tsx`, `CampaignWizard.tsx`) to pass them through their save/configure paths (`AiDmCard.tsx:98-125`, `CampaignWizard.tsx:420`).
4. New i18n keys under `campaign.aiProviderSetup.*` in `en.json` AND `es.json` (PHASE-12 convention: es.json must not lag).

**Cheap checks:** `npx tsc --noEmit -p dnd-app/tsconfig.web.json`; `npx vitest run dnd-app/src/renderer/src/pages/campaign-detail/AiDmCard.test.tsx`.

**Acceptance:** saving the AiDmCard modal with routing enabled persists `routingEnabled`/`routingSmallModel` on `campaign.aiDm` and the `ai.configure` payload includes the `routing` block (extend `AiDmCard.test.tsx`); with the checkbox untouched, the saved campaign JSON is unchanged from today.

### 29D — Mid-session model swap UI (DM-only)

**Objective:** the DM can inspect and change the active model without leaving the game.

**Files:** `src/renderer/src/components/game/dm/AiModelSwapPopover.tsx` (new) + colocated `.test.tsx` (new), `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/i18n/locales/en.json` + `es.json`.

**Steps:**
1. New `AiModelSwapPopover.tsx`: props `{ campaign: Campaign; disabled: boolean }`. On open: `Promise.all([window.api.ai.getConfig(), window.api.ai.listInstalledModels(), …])` — for cloud providers call `window.api.ai.listCloudModels(provider)` (keys are already configured main-side per F2, so no key argument is needed). Render current provider + model and a dropdown of available models **for the currently-active provider only** (provider switching mid-session stays in the campaign-detail flow — smaller blast radius). Apply button:
   - merge: `const cfg = await window.api.ai.getConfig(); await window.api.ai.configure({ ...cfg, model: next })` (preserves keys/url/routing),
   - persist: `useCampaignStore.getState().saveCampaign({ ...campaign, aiDm: { ...campaign.aiDm, enabled: true, model: next }, updatedAt: new Date().toISOString() })` (pattern from `DMNotepad.tsx:129`),
   - notify: `addToast` (from `hooks/use-toast`) — "AI model switched to <next>".
2. Mount it in ChatPanel's DM-only AI status bar (`ChatPanel.tsx:417-438`): a small "change" affordance next to the model-readiness label, rendered only when `isDM && aiEnabled`. Pass `disabled={aiIsTyping}` so the model can't be swapped mid-stream (the in-flight stream already captured its model; disabling just avoids a confusing mid-reply switch). `campaign` is already a ChatPanel prop (`:111`).
3. The next message after a swap picks the new model automatically — `startChat` re-reads `currentConfig.model` per request (F1); no further wiring needed. The conversation history is model-agnostic (plain messages), so no conversation reset is performed or wanted.
4. i18n keys `game.chatPanel.modelSwap.*` in both locales.

**Cheap checks:** `npx tsc --noEmit -p dnd-app/tsconfig.web.json`; `npx vitest run dnd-app/src/renderer/src/components/game/dm/AiModelSwapPopover.test.tsx`.

**Acceptance:** popover test (mock `window.api.ai`) asserts: opens with current model selected; Apply calls `configure` with merged config + `saveCampaign` with updated `aiDm.model` + fires a toast; trigger is absent for non-DM and disabled while `aiIsTyping`.

### 29E — `llamacpp` local-endpoint flavor (speculative-decoding backend)

**Objective:** opt-in flavor switch so the local provider works against a llama.cpp `llama-server` (which provides speculative decoding); default `'ollama'` keeps today's behavior bit-for-bit.

**Files:** `src/main/ai/types.ts`, `src/shared/ipc-schemas.ts`, `src/main/ai/ollama-client.ts` + `.test.ts`, `src/main/ai/ai-service.ts`, `src/main/ipc/ai-handlers.ts`, `src/renderer/src/types/campaign.ts`, `src/renderer/src/services/ai-dm-routing.ts`, `src/renderer/src/components/campaign/AiProviderSetup.tsx`, `dnd-app/docs/LLAMA-SERVER.md` (new), `src/renderer/src/i18n/locales/en.json` + `es.json`.

**Steps:**
1. Config: add `localEndpointFlavor?: 'ollama' | 'llamacpp'` to `AiConfig` (`types.ts`), `AiConfigSchema` (`z.enum(['ollama','llamacpp']).optional()`), `currentConfig` + `configure()`/`getConfig()` persistence (`ai-service.ts`), `AiDmConfig` (`campaign.ts`), and the `configureAiFromCampaign` payload (`ai-dm-routing.ts`). Absent = `'ollama'`.
2. `ollama-client.ts`: add `setLocalEndpointFlavor(f)` / module state alongside `ollamaBaseUrl` (`:5-15`); make the two Ollama-only probes flavor-aware:
   - `isOllamaRunning()` (`:34-43`): flavor `llamacpp` → `GET ${base}/health`, ok ⇒ true (llama-server returns `{"status":"ok"}` when ready, 503 while loading).
   - `listOllamaModels()` (`:46-55`): flavor `llamacpp` → `GET ${base}/v1/models`, map `data[].id` (id = model path or `--alias` value).
   Chat paths (`/v1/chat/completions` at `:93`/`:227`) need no change. If PHASE-01/23 added Ollama-native request fields (`options`, `keep_alive`, `format` on an `/api/chat` body), gate them: flavor `llamacpp` must send only OpenAI-compatible fields; structured extraction (PHASE-23) uses `response_format: { type: 'json_schema', json_schema: … }` against llama-server instead of Ollama's `format` (llama-server supports JSON-schema-constrained generation via its OpenAI endpoint). If PHASE-01 moved streaming to `/api/chat`, the `llamacpp` flavor keeps/uses the `/v1/chat/completions` path.
   - Error copy: `ollamaHttpError` (`:26-31`) tells the user to `ollama pull` — for flavor `llamacpp`, a 404/connection error should instead say "check that llama-server is running at <url>".
3. `ai-service.ts` `resolveOllamaModel` (`:592-608`): no logic change required — with the flavor-aware `listOllamaModels`, an empty configured model resolves to the server's single served model (`installed[0]`), and the throw message should be flavor-aware (reuse the flavor for wording). Call `setLocalEndpointFlavor` from `configure()`/`initFromSavedConfig()` next to the existing `setOllamaUrl` calls (`:351`, `:407-408`).
4. `ai-handlers.ts`: skip `ensureOllamaUsesDedicatedGpu()` (`:118-120`) when `parsed.data.localEndpointFlavor === 'llamacpp'` (it execs the Ollama binary).
5. `AiProviderSetup.tsx`: inside the Ollama section, an "Advanced — local endpoint" toggle: `Ollama (default)` vs `llama.cpp server (experimental)`. When `llamacpp`: hide the detect/download/install/pull wizard UI (it manages the Ollama binary only) and show the URL field + a short hint linking to `docs/LLAMA-SERVER.md`. Thread the field through `onChange`/`AiDmCard`/`CampaignWizard` like 29C did.
6. Write `dnd-app/docs/LLAMA-SERVER.md`: what it is (speculative decoding is not available in stock Ollama — ollama#5800 open since 2024); example launch commands, current-master flags first with legacy spellings noted:
   ```bash
   # llama.cpp master (2026):
   llama-server -m Meta-Llama-3.1-8B-Instruct-Q8_0.gguf \
     --spec-draft-model Llama-3.2-1B-Instruct-Q8_0.gguf \
     --spec-draft-n-max 8 --spec-draft-n-min 4 --spec-draft-p-min 0.9 \
     -ngl 99 --spec-draft-ngl 99 -c 8192 --host 127.0.0.1 --port 8080
   # older releases: -md model.gguf --draft-max 8 --draft-min 4 --draft-p-min 0.9 -ngld 99
   ```
   plus the draftless option (`--spec-type ngram-simple` — useful for repetitive RPG prose with no second model), the vocab-compatibility requirement (draft + target must share a compatible vocabulary — a mismatched pair fails to start), and the honest caveat: speedups of ~1.5-2× are typical for dense targets with a good draft, but 2026 benchmarks measured 3-12% NET SLOWDOWNS on some MoE/GPU combinations even at 100% acceptance — benchmark before adopting. Then: point the app at it (provider Ollama → Advanced → llama.cpp server, URL `http://127.0.0.1:8080`).

**Cheap checks:** `npx tsc --noEmit -p dnd-app/tsconfig.node.json` and `-p dnd-app/tsconfig.web.json`; `npx vitest run dnd-app/src/main/ai/ollama-client.test.ts`.

**Acceptance:** with flavor unset/`'ollama'`, mocked-fetch tests show `/api/tags` is hit exactly as today; with `'llamacpp'`, `isOllamaRunning` hits `/health` and `listOllamaModels` parses `/v1/models` `data[].id`; `AI_CONFIGURE` with flavor `llamacpp` does not invoke `ensureOllamaUsesDedicatedGpu` (assert via mock in `ai-handlers.test.ts`); `docs/LLAMA-SERVER.md` exists with both flag spellings and the vocab + benchmark caveats.

### 29F — Test consolidation + i18n parity + phase gate

**Objective:** fill any test gaps from 29A-29E, confirm locale parity, run the end-of-phase 4-gate.

**Files:** test files from prior sub-phases; `en.json`/`es.json`.

**Steps:**
1. Verify every new i18n key exists in BOTH locales: `node -e "const en=require('./dnd-app/src/renderer/src/i18n/locales/en.json'),es=require('./dnd-app/src/renderer/src/i18n/locales/es.json'); /* walk + diff keys */"` (or the repo's existing locale-parity test if one exists — grep `i18n` tests first).
2. Confirm routing is provably inert by default: one integration-style test in `ai-service.test.ts` that configures WITHOUT a routing block and asserts `getModelForTask('summary')` === primary model.
3. Run the 4-gate per INSTRUCTIONS.md rule 5 (`npm run lint`, `tsc` web + node, full `npx vitest run`), fix any reds, single phase commit + push, move this plan to `completed/`.

**Acceptance:** 4-gate green; one commit; plan moved.

## Research notes

- **Per-task routing pattern.** Routing each request to the smallest model that can do the job is the established cost/latency pattern (rule-based task→model maps are the recommended starting point over learned routers for a fixed task set like ours): [Portkey — task-based LLM routing](https://portkey.ai/blog/task-based-llm-routing/), [RouteLLM (arXiv 2406.18665)](https://arxiv.org/pdf/2406.18665), [Requesty — intelligent LLM routing](https://www.requesty.ai/blog/intelligent-llm-routing-in-enterprise-ai-uptime-cost-efficiency-and-model), [IBM Research — LLM routers](https://research.ibm.com/blog/LLM-routers). We chose a *static task-class map* (not a learned router): the app has exactly three routable task families, all machine-generated prompts, so a classifier adds latency and failure modes for zero benefit. Alternative considered and rejected: per-request complexity scoring — pointless when the caller already knows the task type.
- **Competitor anchor.** Mid-campaign model swap + heterogeneous model use is highlighted in the AI-DM product space ([AI Realm](https://airealm.com/) advertises switching models mid-campaign; [FoundryAI](https://foundryvtt.com/packages/foundry-ai) exposes any-OpenRouter-model flexibility but no per-task split — fetched 2026-06-10, its docs confirm model *choice* but not task routing, so per-task routing is a differentiator here).
- **Ollama concurrency.** Default `OLLAMA_MAX_LOADED_MODELS` = 3 × GPU count (3 on CPU); idle models are evicted in order when memory is tight; API `keep_alive` overrides `OLLAMA_KEEP_ALIVE` per request ([Ollama FAQ](https://docs.ollama.com/faq)). Consequence: routing adds at most one extra resident small model; KV caches are per-model so routed calls never bust the narration prefix cache.
- **Speculative decoding.** Stock Ollama: not supported, [ollama#5800](https://github.com/ollama/ollama/issues/5800) open since 2024-07-19. llama.cpp: supported in `llama-server`; current master flags are `--spec-draft-model/--spec-draft-n-max/--spec-draft-n-min/--spec-draft-p-min/--spec-draft-ngl` plus draftless `--spec-type ngram-*` modes ([speculative.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/speculative.md), [tools/server README](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)); older spellings `-md/--draft-max/--draft-min/--draft-p-min/-ngld` appear in most guides ([The Register intro](https://www.theregister.com/2024/12/15/speculative_decoding/), [worked example with full command line](https://medium.com/write-a-catalyst/how-i-doubled-my-local-llms-speed-without-buying-new-hardware-0201539eb935), [Unsloth docs](https://unsloth.ai/docs/basics/inference-and-deployment/saving-to-gguf/speculative-decoding)). Server endpoints used by 29E: `/health`, `/v1/models` (model `id` = path or `--alias`; any `model` value accepted in chat), `/v1/chat/completions` ([tools/server README](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)).
- **Speculative-decoding caveats (why opt-in + documented-not-managed).** 2026 benchmarks on Qwen3.6-35B-A3B + RTX 3090 found every speculative mode at-or-below baseline (3-12% slower) despite 100% acceptance, and vocab-mismatched draft models fail outright ([benchmark repo](https://github.com/thc1006/qwen3.6-speculative-decoding-rtx3090), [HackMD writeup](https://hackmd.io/ODXuOQNzSiyUITz7g9mtBw), [llama.cpp discussion #22473](https://github.com/ggml-org/llama.cpp/discussions/22473)). Predictable RPG prose has high acceptance rates, which favors gains on dense models, but the result is hardware-dependent — hence: the app *connects to* a user-launched llama-server (flavor switch + docs) instead of managing/downloading one (lifecycle management of a second inference engine is out of scope and would duplicate the entire ollama-manager surface for a niche, experimental path).
- **Why the swap UI doesn't allow provider switching mid-session:** keys/URL validation, GPU pinning (`ensureOllamaUsesDedicatedGpu`), and the setup wizard live in the campaign-detail flow; mid-session needs only the cheap, safe operation (same provider, different model). This mirrors how `resolveOllamaModel` already hot-switches models server-side today (F1) — the UI just makes the existing capability deliberate and visible.

## Test plan

- **29A:** `src/main/ai/model-routing.test.ts` (new) — resolver matrix: disabled/enabled × set/unset smallModel × overrides × all five task classes; narration/vision never route.
- **29B:** `src/main/ai/ai-service.test.ts` (extend) — summarize callback model selection under routing on/off; not-installed fallback + warn log (mock `listOllamaModels`); routed call sites found by the survey get one routing assertion each in their own colocated test files.
- **29C:** `src/renderer/src/pages/campaign-detail/AiDmCard.test.tsx` (extend) — routing fields persist + reach `ai.configure`.
- **29D:** `src/renderer/src/components/game/dm/AiModelSwapPopover.test.tsx` (new) — open/list/apply/toast/DM-gating/disabled-while-typing.
- **29E:** `src/main/ai/ollama-client.test.ts` (extend) — flavor-aware health + model-list fetch targets; `src/main/ipc/ai-handlers.test.ts` (extend) — GPU-pin skip for `llamacpp`; `src/shared/ipc-schemas.test.ts` (extend) — `routing` + `localEndpointFlavor` parse/strip behavior.
- **End-of-phase 4-gate (rule 5):** `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`. No Pi code is touched — pytest not required.

## Acceptance criteria

1. With no config changes (no `routing` block, no flavor), every LLM call resolves to exactly the same model/endpoints as before this phase (proven by tests in 29A/29B/29E).
2. With routing enabled + a small model set: summary/extraction/mechanics calls use the small model (or fall back with a logged warning if it is not installed); narration and vision always use the primary model; each routed call emits a `[AI routing]` log line.
3. Routing settings persist per campaign (`aiDm.routingEnabled`/`aiDm.routingSmallModel`), survive `configureAiFromCampaign` at session start, and are editable in `AiProviderSetup`.
4. A DM can swap the active model from inside the game session (ChatPanel status bar → popover); the swap persists to `campaign.aiDm.model` AND the live main-process config; non-DMs never see the affordance; the control is disabled mid-stream.
5. Flavor `llamacpp` makes availability checks hit `/health`, model listing hit `/v1/models`, chat keep working over `/v1/chat/completions` without Ollama-only fields, and Ollama-binary management (install/pull/GPU-pin) inert; `docs/LLAMA-SERVER.md` documents launch commands (both flag generations), vocab compatibility, and the benchmark-first caveat.
6. New UI strings exist in `en.json` and `es.json`; 4-gate green; one phase commit; plan moved to `completed/`.

## Out of scope

- Surfacing per-task routing/token info in the context-inspector panel — **PHASE-14** owns that panel.
- The structured-output extraction call itself (schema design, `stream:false`, repairJson retirement) — **PHASE-23**; 29 only routes the call PHASE-23 created.
- Entity extraction (**PHASE-25**), scene-boundary summarization (**PHASE-26**), and quest-checking/director calls (**PHASE-28**) — 29 routes whatever they landed, never changes their prompts or logic.
- `num_ctx`/`keep_alive`/prefix-cache ordering and options-block stability — **PHASE-01** (29 only honors its invariants).
- `getConfig()` disk-clobber, `listOllamaModels` timeout, manager localhost hardcode — **PHASE-03**.
- AiProviderSetup provider-default model IDs from main + dropdown/wizard states — **PHASE-10**.
- Managing the llama-server process lifecycle (download/start/stop), draft-model downloads, or auto-benchmarking — deliberately not built (documented manual launch only; see Research notes).
- Heuristic monster-turn automation (the other "small model for mechanics" consumer) — **PHASE-30**.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
