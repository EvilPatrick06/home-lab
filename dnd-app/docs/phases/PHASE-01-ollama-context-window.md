# PHASE-01 — Ollama context window: `num_ctx`/`keep_alive`, budget reconciliation, prefix-cache ordering

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Every Ollama request today is sent with the server's default ~4k context window while the app assembles prompts whose static rules section alone is ~12.3k tokens by the app's own estimator — Ollama silently drops the front of the prompt, so the model literally never sees most of the rules, character sheets, and game state the app builds. This phase makes the model actually receive what the app sends: migrate the Ollama client to the native `/api/chat` endpoint (the only endpoint that accepts a per-request `options.num_ctx` and `keep_alive`), resolve a model-appropriate context window (config override → curated metadata → default, clamped to the model's true maximum via `/api/show`), keep the options block byte-stable so Ollama's prefix (KV) cache survives between turns (~17.7× measured prefill speedup on hits), reconcile the token budgets against the effective window so trimming is honest instead of fictional, reorder the context block static-first/volatile-last to maximize cache hits, and add opt-in flash-attention + KV-cache-quantization tuning so larger windows fit consumer VRAM. This is the likely root cause of the broad "AI ignores its instructions / forgets game state" symptom class.

## Dependencies & cross-phase notes

- **No prerequisite phases** (PHASE-INDEX row 01: depends on —).
- **PHASE-03 (provider-stream-reliability)** touches the same files: `ollama-client.ts` (`listOllamaModels` has no timeout) and `ollama-manager.ts` (uses the `OLLAMA_BASE_URL` constant instead of the configured URL for detect/start/pull). This phase does NOT fix those; it deliberately keeps the new `/api/show` lookup on the *configured* URL (`getOllamaUrl()` passed in as a parameter) so it doesn't add another hardcode for PHASE-03 to clean up. Coordinate: if PHASE-03 runs later and refactors URL handling, the `resolveOllamaOptions(model, baseUrl)` parameter is already URL-agnostic.
- **PHASE-10 (ai-dm-ui-truth)** owns the token-meter `{{max}}` interpolation (`en.json:907` "~{{used}} / 23,000 tokens") and the AI settings surfaces (AiDmCard/AiProviderSetup). This phase exposes `getEffectiveBudgets()` / `getActiveContextWindow()` from `token-budget.ts` so PHASE-10 can interpolate the real cap; it adds NO renderer UI controls.
- **PHASE-14 (ai-observability)** owns surfacing `wasContextTruncated()` / `getLastTokenEstimate()` (`ai-service.ts:1021-1032`) and the context-inspector panel. This phase improves what those getters *report* (window-overflow detection, `getLastOllamaStats()` with real `prompt_eval_count`) but does not add IPC channels or UI.
- **PHASE-23 (structured-outputs, depends on 03)** plans to use Ollama's `format` (JSON-schema) parameter — that parameter only exists on the native `/api/chat` endpoint this phase migrates to. PHASE-23 builds directly on 01A's transport.
- **PHASE-24 (rules-rag-hybrid) depends on this phase** (PHASE-INDEX): retrieval quality work is pointless while retrieved chunks are silently truncated away.
- **PHASE-26 (scene-summarization)** exploits the prefix-cache behavior this phase establishes (compaction at scene boundaries keeps the prefix stable); do not re-tune budget scaling there without re-reading 01C.
- **PHASE-05 (stream-listener-lifecycle)** touches `OllamaManagement` renderer components only — no file collision with this phase's `ollama-manager.ts` (main) edits, but both land near "Ollama management"; keep commits scoped.

## Verified findings

### F1 — Ollama requests never set `num_ctx`/`keep_alive`; default window is ~4k (CRITICAL)

**Claim (verified 2026-06-10):** Both Ollama request bodies send only `{ model, messages, stream }` — no `options`, no `keep_alive`:

- `dnd-app/src/main/ai/ollama-client.ts:93-98` — `ollamaStreamChat` POSTs to `${ollamaBaseUrl}/v1/chat/completions` with `body: JSON.stringify({ model, messages: apiMessages, stream: true })`.
- `dnd-app/src/main/ai/ollama-client.ts:227-234` — `ollamaChatOnce` POSTs the same body with `stream: false`.
- `num_ctx`/`keep_alive`/`numCtx`/`keepAlive` appear nowhere in `dnd-app/src/` (only in docs).
- All Ollama traffic flows through these two functions: `ollamaProvider` (`ollama-client.ts:246-252`) is registered in `provider-registry.ts:9` and every caller (chat streaming `ai-service.ts:711`, restream `ai-service.ts:795`, summaries `ai-service.ts:935-939`, vision `ai-vision.ts:192`, scene prep via `prepareScene → startChat` `ai-service.ts:943-983`) goes through the provider registry. Fixing the two functions fixes every path.

Ollama's default context length is **4096 tokens** (configurable via `OLLAMA_CONTEXT_LENGTH`; per-request via `options.num_ctx` — native API only). When input exceeds it, the runner logs `msg="truncating input prompt" limit=N prompt=M` server-side and **trims from the start of the prompt** — exactly where this app puts the system prompt and rules. The API response gives no truncation flag; the only client-side signals are comparing your own estimate against the window and reading `prompt_eval_count` in the final native-API chunk.

**Correction vs the audit text (important):** the audit's suggested fix — "pass `options: { num_ctx }` on every request" — **does not work on the endpoint the app currently uses.** Ollama's OpenAI-compatible `/v1/chat/completions` deliberately rejects/ignores `num_ctx`; maintainers closed the feature request ("OpenAI's API doesn't allow setting the context length, hence Ollama's compatibility layer doesn't either" — [issue #5356](https://github.com/ollama/ollama/issues/5356), [PR #6137 closed unmerged](https://github.com/ollama/ollama/pull/6137)). The real fix is migrating to the **native `/api/chat`** endpoint, which accepts `options` (incl. `num_ctx`), `keep_alive`, `format`, and returns `prompt_eval_count`/`eval_count` in its final chunk ([/api/chat docs](https://docs.ollama.com/api/chat)).

**Verification commands:**

```bash
grep -n "v1/chat/completions\|body: JSON.stringify" dnd-app/src/main/ai/ollama-client.ts
# → :93/:96 (stream) and :227/:230 (once); bodies carry only model/messages/stream
grep -rn "num_ctx\|keep_alive\|numCtx\|keepAlive" dnd-app/src --include='*.ts' --include='*.tsx'
# → no hits (docs-only mentions live outside src/)
grep -rn "ollamaStreamChat\|ollamaChatOnce\|ollamaProvider" dnd-app/src --include='*.ts' | grep -v ollama-client | grep -v test
# → provider-registry.ts only (all traffic via the registry)
```

### F2 — Token budgets engineer a prompt the window can't hold; several budget keys are fiction

**Claim (verified + refined 2026-06-10):** `dnd-app/src/main/data/token-budgets.json` declares `total: 25000` with sections `systemPrompt: 1500, retrievedChunks: 8000, srdData: 2000, campaignData: 2000, creatures: 2000, gameState: 1500, memory: 2000, conversationHistory: 4000, responseBuffer: 4000, fileReadContent: 4000, webSearchResults: 2000`.

Refinements found during verification:

1. **The section values sum to 33,000 — the declared `total: 25000` is not even internally consistent**, and nothing enforces `total` anywhere.
2. **Only 7 of the 12 keys are consumed.** `TOKEN_BUDGETS.conversationHistory` gates history packing (`conversation-manager.ts:111,147`); `retrievedChunks`, `srdData` (plus `srdData*0.4` for the monster list), `campaignData`, `creatures`, `gameState`, `memory` trim context sections (`context-builder.ts:199,209,255,276,288,300,312`). `systemPrompt`, `responseBuffer`, `fileReadContent`, `webSearchResults`, and `total` are loaded into the `TOKEN_BUDGETS` type (`token-budget.ts:23-36`) but never read by any code path (`grep -rn "TOKEN_BUDGETS\." dnd-app/src --include='*.ts' | grep -v test` shows the 9 consuming lines above only).
3. **The `systemPrompt: 1500` figure is off by ~8×.** Measured live: `assembleSystemPrompt('general')` returns 49,342 chars ≈ **12,336 tokens by the app's own `estimateTokens` (chars/4) heuristic** (`token-budget.ts:4-6`); a real llama tokenizer puts it at ~9.6k. Conditional add-ons (`COMBAT_TACTICS_PROMPT`, `PLANAR_RULES_CONTEXT`, `DM_TOOLBOX_CONTEXT`, `conversation-manager.ts:94-99`) add up to ~1.5k more. Either way the *static rules alone* exceed the entire 4096 default window, and even an 8192 window leaves no room for context/history.

**Verification commands:**

```bash
cat dnd-app/src/main/data/token-budgets.json
node -e "const b=require('./dnd-app/src/main/data/token-budgets.json');delete b.total;console.log(Object.values(b).reduce((a,c)=>a+c,0))"   # → 33000
grep -rn "TOKEN_BUDGETS\." dnd-app/src --include='*.ts' | grep -v '\.test\.'
cd dnd-app && node_modules/.bin/tsx -e "
import { assembleSystemPrompt } from './src/main/ai/prompt-assembler'
const p = assembleSystemPrompt('general')
console.log(p.length, Math.ceil(p.length/4))                       // → 49342 12336
console.log(assembleSystemPrompt('combat') === p)                  // → true (see F5)
"
```

### F3 — Curated `contextSize` metadata is display-only and stale

**Claim (verified 2026-06-10):** `CURATED_MODELS` (`dnd-app/src/main/ai/ollama-manager.ts:56-91`) declares `contextSize` per model (8192 for the 7B–9B class, 4096 for `phi3:14b`, `mixtral:8x7b`, `command-r:35b`, `llama3.1:70b`). Consumers: the IPC handler `AI_GET_CURATED_MODELS` (`ai-handlers.ts:578-580`) and the renderer display `{(model.contextSize / 1024).toFixed(0)}K ctx` (`OllamaModelList.tsx:250`). **No code path ever feeds `contextSize` into a request.** The values are also stale relative to model reality (e.g. `llama3.1`, `llama3.2`, `command-r`, `deepseek-r1` are 128k-native; `mistral:7b`/`qwen2.5:7b`/`mixtral` are 32k-native; `gemma2:9b` is 8k-max; the default `phi3:14b` tag is the 4k variant). The model's true maximum is queryable at runtime: `POST /api/show {model}` → `model_info["general.architecture"]` → `model_info["<arch>.context_length"]` (e.g. `llama.context_length`) ([api.md](https://github.com/ollama/ollama/blob/main/docs/api.md)).

**Verification commands:**

```bash
grep -rn "contextSize" dnd-app/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
# → ollama-manager.ts (declaration), ai-handlers.ts/preload (pass-through), OllamaModelList.tsx:250 (display only)
curl -s http://localhost:11434/api/show -d '{"model":"llama3.2:3b"}' | python3 -c "import json,sys; d=json.load(sys.stdin)['model_info']; a=d['general.architecture']; print(a, d[f'{a}.context_length'])"
# → llama 131072 (requires a running Ollama with the model pulled; informational, not a gate)
```

### F4 — `keep_alive` never set: model unloads after 5 min idle, wiping the KV cache

**Claim (verified 2026-06-10 against Ollama docs):** Ollama keeps a model loaded **5 minutes** after the last request by default, then unloads — discarding the KV cache, so the next message re-pays the full ~10k-token prefill (the exact pain behind the v2.4.48/v2.4.50 timeout work; see `llm-provider.ts:88-100` comments). The API `keep_alive` parameter **overrides** the server's `OLLAMA_KEEP_ALIVE` env ([FAQ](https://docs.ollama.com/faq)). The app never sends it (F1). Prefix-cache mechanics ([Ollama prompt caching](https://leanpub.com/read/ollama/prompt-caching), [KV cache & scheduling](https://jonathanding.github.io/llm-learning/en/articles/ollama-kv-cache-scheduling/)):

- Cache hit requires a **token/byte-identical prefix** with a still-loaded model; measured **17.7× prefill speedup** on hits (962.39 ms → 54.49 ms in the cited benchmark).
- Cache invalidates at the **first differing byte** — an early changed timestamp forces full re-prefill of everything after it.
- **Changing `num_ctx` or any options value between requests counts as a new runner configuration** → recompute/reload, cache gone. The options block must be byte-stable across requests.

### F5 — Context block is ordered volatile-first; static-first ordering is nearly free

**Claim (verified 2026-06-10):** The final system prompt is assembled in `conversation-manager.ts:94-99` as `assembleSystemPrompt(gameMode) + [conditional blocks] + contextBlock`. Confirmed properties:

- `getMessagesForApi` only ever selects `'combat'` or `'general'` mode (`conversation-manager.ts:92-93`), and **`assembleSystemPrompt('combat') === assembleSystemPrompt('general')` byte-for-byte** (both push the same five sections in the same order — `prompt-assembler.ts:28-56`; verified by execution, F2 command). So the ~12.3k-token rules base is already a stable cacheable prefix. The conditional add-ons (`COMBAT_TACTICS_PROMPT` when `Initiative:` present, `PLANAR_RULES_CONTEXT`, `DM_TOOLBOX_CONTEXT`) toggle at scene granularity and sit immediately after the base — acceptable.
- **Inside `buildContext` (`context-builder.ts:164-326`) the order is volatile-first:** (1) rulebook chunks — *query-dependent, change every message* (`:193-203`), (2) SRD data — query-dependent (`:206-215`), (3) character data + party composition + encounter budget + available monsters (query-scored, `:218-268`), (4) campaign data — semi-static (`:271-283`), (5) active creatures (`:286-291`), (6) game state snapshot — changes every message, contains `[GAME TIME] … Total seconds: N` (`state-snapshot.ts:293-326`) (`:296-304`), (7) memory (`:307-319`). Because rulebook chunks come first, *every* message busts the cache for everything after the rules base.
- `ai-service.ts:662-663` then appends a **static** `[PROVIDER CONTEXT]` blurb *after* the volatile context (`conv.getMessagesForApi(context + providerContext)`), guaranteeing it is re-prefilled every turn.
- The game-state snapshot itself (`state-snapshot.ts`, renderer) is wholly volatile (token positions, distances, conditions) — no intra-snapshot reorder is worth doing; placing the whole block last is sufficient.

**Verification commands:**

```bash
sed -n '92,99p' dnd-app/src/main/ai/conversation-manager.ts
grep -n "parts.push\|// 1\.\|// 2\.\|// 3\.\|// 4\.\|// 5\.\|// 6\.\|// 7\." dnd-app/src/main/ai/context-builder.ts
sed -n '662,663p' dnd-app/src/main/ai/ai-service.ts
grep -n "GAME TIME\|Total seconds" dnd-app/src/renderer/src/services/game-actions/state-snapshot.ts
```

### F6 — Truncation tracking exists main-side but is window-blind (surfacing is PHASE-14's)

**Claim (verified 2026-06-10):** `conversation-manager.ts:140-148` computes `_lastTokenEstimate` and `_contextTruncated` (history-budget hit OR any context-builder section trimmed via `getLastTokenBreakdown()?.truncated`); `ai-service.ts:1021-1032` exports `wasContextTruncated(campaignId)` / `getLastTokenEstimate(campaignId)`. Nothing compares the estimate against an actual provider window (there is no window concept in the code at all), so a 20k-token prompt into a 4k window with zero section-trims reports "not truncated". PHASE-14 owns wiring these getters to the UI; this phase makes them *true* (window-overflow check + real `prompt_eval_count` from the native API).

**Verification commands:**

```bash
sed -n '140,150p' dnd-app/src/main/ai/conversation-manager.ts
sed -n '1018,1034p' dnd-app/src/main/ai/ai-service.ts
grep -rn "wasContextTruncated\|getLastTokenEstimate" dnd-app/src --include='*.ts' | grep -v test   # → defined, never called
```

### F7 — Current config/IPC surface (what 01B extends)

**Verified 2026-06-10:** `AiConfig` (`src/main/ai/types.ts:5-14`) = `{ provider, model, ollamaUrl, claudeApiKey?, openaiApiKey?, geminiApiKey?, ollamaModel? (deprecated) }`. Zod boundary: `AiConfigSchema` (`src/shared/ipc-schemas.ts:5-13`), parsed in the `AI_CONFIGURE` handler (`src/main/ipc/ai-handlers.ts:108-122`). Persistence: `ai-service.ts configure()` (`:325-374`, atomic write) / `getConfig()` (`:376-402`). Renderer: `AiDmConfig` (`src/renderer/src/types/campaign.ts:63-74`) pushed per-campaign via `configureAiFromCampaign` (`src/renderer/src/services/ai-dm-routing.ts:27-48`); preload type `AiConfigData` (`src/preload/index.d.ts:137-145`), invoke at `src/preload/index.ts:81`. No context-length field exists anywhere in this chain.

### F8 — `startOllama` spawn env (where opt-in tuning lands)

**Verified 2026-06-10:** When the app itself spawns the server, `startOllama` (`ollama-manager.ts:342-393`) spawns `ollama serve` detached with `env: nvidiaPresent ? { ...process.env, OLLAMA_VULKAN: '0' } : process.env` (`:368-374`). This is the one place the app controls Ollama's environment — `OLLAMA_FLASH_ATTENTION` / `OLLAMA_KV_CACHE_TYPE` can only take effect here (or in the user's own service config for externally managed servers). Flash attention is the prerequisite for KV-cache quantization; `q8_0` halves KV memory with negligible quality loss, `q4_0` quarters it (Llama-3-8B-class at 128k ctx: f16 23.3 GB → q8_0 17.0 GB → q4_0 13.8 GB total; the KV portion halves/quarters) ([mitjamartini](https://mitjamartini.com/posts/ollama-kv-cache-quantization/), [FAQ](https://docs.ollama.com/faq)). Caveat: some models (Gemma 3 reported) slow down with KV quantization ([ollama#9683](https://github.com/ollama/ollama/issues/9683)) — hence opt-in, off by default.

## Sub-phases

> Constants introduced in this phase (all in `src/main/ai/ollama-context.ts` unless noted):
> `OLLAMA_KEEP_ALIVE = '60m'`, `DEFAULT_NUM_CTX = 16384`, `MIN_NUM_CTX = 4096`,
> `CLOUD_CONTEXT_WINDOW = 100_000` (token-budget.ts), zod bounds `2048 ≤ contextLength ≤ 131072`.

### 01A — Migrate `ollama-client.ts` to the native `/api/chat` endpoint

**Objective:** switch both Ollama functions from `/v1/chat/completions` (SSE) to `/api/chat` (NDJSON), send `keep_alive`, and capture `prompt_eval_count`/`eval_count` — without yet sending `options` (01B adds it), so this sub-phase is a pure transport swap.

**Files:** `src/main/ai/ollama-client.ts`, `src/main/ai/ollama-client.test.ts`.

**Steps:**

1. In `ollamaStreamChat` (`ollama-client.ts:58`): change the fetch URL to `${ollamaBaseUrl}/api/chat`; body to `JSON.stringify({ model, messages: apiMessages, stream: true, keep_alive: OLLAMA_KEEP_ALIVE })` (import the constant from `./ollama-context` once 01B creates it; for 01A declare `const OLLAMA_KEEP_ALIVE = '60m'` locally in `ollama-client.ts` and move it in 01B).
2. Replace the SSE parser (the `data: ` prefix slicing, `[DONE]` sentinel, and the three-stage `jsonBuffer` partial-JSON heuristic, `:129-198`) with NDJSON parsing: keep the existing `lineBuffer` split-on-`\n` accumulation (NDJSON objects are one complete JSON document per line; the lineBuffer already handles lines split across network chunks); for each non-empty trimmed line, `JSON.parse` inside try/catch (skip unparseable lines); shape:
   - `{ message?: { role, content, thinking? }, done: false }` → append `message.content` (may be `''`) via `callbacks.onText` when non-empty. **Ignore `message.thinking`** (newer Ollama separates thinking-model reasoning into this field — do not surface it; this incidentally stops `deepseek-r1` think-text leaking into narration on servers that parse it).
   - `{ done: true, done_reason?, prompt_eval_count?, eval_count?, ... }` → record stats (step 4) and stop expecting content.
   - `{ error: string }` → `callbacks.onError(new Error(line.error))` and return (native API can emit a JSON error object mid-stream).
3. Update the `interface OllamaChatResponse` (`:17-22`) to the native shape: `{ message?: { content?: string; thinking?: string }; done?: boolean; done_reason?: string; prompt_eval_count?: number; eval_count?: number; error?: string }`.
4. Add module state + export:
   ```ts
   export interface OllamaLastStats { model: string; promptEvalCount: number; evalCount: number; at: string }
   let lastStats: OllamaLastStats | null = null
   export function getLastOllamaStats(): OllamaLastStats | null { return lastStats }
   ```
   Set it from the `done: true` chunk in both functions (ISO timestamp `new Date().toISOString()`). PHASE-14 consumes this.
5. In `ollamaChatOnce` (`:221`): same URL/body change with `stream: false`; response shape is a single JSON object — read `data.message?.content || ''`; record stats.
6. Preserve unchanged: the inactivity-guard arming on each read (`armInactivity`, `:80-86,123`), `AbortSignal.any` combination, user-cancel swallow (`abortSignal?.aborted`), the `timedOut` classification and its error message, `OLLAMA_PREFILL_TIMEOUT_MS` on `chatOnce`, and `ollamaHttpError`'s 404→"ollama pull" mapping (native API 404 body is `{"error":"model \"x\" not found, try pulling it first"}` — the existing status-based branch still fires).
7. Rewrite the transport-shape tests in `ollama-client.test.ts`: stream fixtures become NDJSON lines (`{"message":{"content":"Hello"},"done":false}\n` … `{"done":true,"prompt_eval_count":120,"eval_count":8}\n`); assert URL `http://localhost:11434/api/chat`; assert body contains `"keep_alive":"60m"`; assert system prompt is still `messages[0]` with `role:'system'`; keep/adapt the 404, no-body, abort, malformed-line, multi-chunk, and split-line cases; add: mid-stream `{"error":"..."}` line → `onError`; `message.thinking` present → not emitted via `onText`; `getLastOllamaStats()` returns the final chunk's counts.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/ollama-client.test.ts`.

**Acceptance:** both functions hit `/api/chat`; NDJSON parsed; `keep_alive` sent on every request; stats captured; all ollama-client tests green; no other file touched.

### 01B — `num_ctx` resolution (config → curated → default, clamped to model max) + options stability

**Objective:** every Ollama request carries a deterministic, byte-stable `options: { num_ctx }`, sized per model and clamped to the model's true maximum.

**Files:** new `src/main/ai/ollama-context.ts` + `src/main/ai/ollama-context.test.ts`; `src/main/ai/ollama-client.ts`; `src/main/ai/ollama-manager.ts`; `src/main/ai/types.ts`; `src/shared/ipc-schemas.ts`; `src/main/ai/ai-service.ts`; `src/preload/index.d.ts`; `src/renderer/src/types/campaign.ts`; `src/renderer/src/services/ai-dm-routing.ts`; `src/main/ai/ollama-manager.test.ts`.

**Steps:**

1. Create `src/main/ai/ollama-context.ts` (leaf module — must NOT import `ollama-client` or `ai-service`; the base URL arrives as a parameter, keeping the import graph acyclic: `ollama-client → ollama-context`, `ollama-manager → ollama-context`, `ai-service → ollama-context`):
   ```ts
   export const OLLAMA_KEEP_ALIVE = '60m'
   export const DEFAULT_NUM_CTX = 16384
   export const MIN_NUM_CTX = 4096

   let configuredContextLength: number | undefined            // from AiConfig.contextLength
   export function setConfiguredContextLength(n: number | undefined): void  // also clears the resolve cache
   export function getConfiguredContextLength(): number | undefined

   /** POST {baseUrl}/api/show {model} → model_info["general.architecture"] →
    *  model_info[`${arch}.context_length`]. 5s AbortSignal.timeout. Returns
    *  undefined on any failure (offline, old server, missing key). Cached per model. */
   export async function fetchModelMaxContext(model: string, baseUrl: string): Promise<number | undefined>

   /** Deterministic per (model, configuredContextLength):
    *  choice = configuredContextLength ?? curatedContextSize(model) ?? DEFAULT_NUM_CTX
    *  resolved = max(MIN_NUM_CTX, min(choice, modelMax ?? choice))
    *  Cached so the SAME value is returned for every request this session —
    *  a changed options block is a new runner config and wipes the KV cache (F4). */
   export async function resolveNumCtx(model: string, baseUrl: string): Promise<number>
   export function clearNumCtxCache(): void
   ```
   `curatedContextSize` does a local lookup against `CURATED_MODELS` — import it from `./ollama-manager`? **No** — `ollama-manager` imports `ollama-client` which imports `ollama-context`; `ollama-context → ollama-manager` would close a cycle. Instead move the `CURATED_MODELS` array + `CuratedModel` interface INTO `ollama-context.ts` and re-export from `ollama-manager.ts` (`export { CURATED_MODELS, type CuratedModel } from './ollama-context'`) so the existing `ai-handlers.ts:22` import keeps working. Match by exact id first, then by base name prefix (`model.split(':')[0]`) so `llama3.1:8b-instruct-q5_K_M` still matches the `llama3.1:8b` family entry; exact-id match wins.
2. While moving `CURATED_MODELS`, update the stale `contextSize` values — these now ARE the per-model `num_ctx` (still clamped by `/api/show` at runtime, so an over-claim degrades gracefully):
   - `llama3.2:3b` 8192 → **16384**; `llama3.1:8b` 8192 → **16384**; `mistral:7b` 8192 → **16384**; `qwen2.5:7b` 8192 → **16384**; `deepseek-r1:8b` 8192 → **16384** (all ≥32k-native; KV at 16k ≈ 1–2 GB f16 for this class).
   - `gemma2:9b` stays **8192** (model max).
   - `phi3:14b` stays **4096** (default tag is the 4k variant).
   - `mixtral:8x7b` 4096 → **16384**, `command-r:35b` 4096 → **16384**, `llama3.1:70b` 4096 → **16384** (these require 20–40 GB cards where 16k KV is trivial; the old 4096 was below even the audit-era default guidance).
   Update the `CuratedModel.contextSize` doc comment: "Recommended `num_ctx` for this model on its target hardware tier; sent as `options.num_ctx` on every request and clamped to the model's reported maximum. Also shown in the install UI."
3. `ollama-client.ts`: in BOTH functions, before the fetch: `const numCtx = await resolveNumCtx(model, ollamaBaseUrl)`; add `options: { num_ctx: numCtx }` to the body; replace the 01A-local keep-alive constant with the `ollama-context` import. Do NOT add other options (temperature/num_predict) — an absent key can't accidentally vary (F4 stability rule).
4. Config plumbing for the manual override (`contextLength`, optional — `undefined`/absent = auto; this is the off-by-default posture, no behavior change for existing configs beyond the new auto-sizing):
   - `types.ts` `AiConfig` += `contextLength?: number` (JSDoc: "Ollama context window override in tokens; unset = auto (curated/default clamped to model max)").
   - `ipc-schemas.ts` `AiConfigSchema` += `contextLength: z.number().int().min(2048).max(131072).optional()`.
   - `ai-service.ts`: add `contextLength` to the `currentConfig` literal type + default object (`:272-283`), to `configure()` (assign + persist in the atomic write JSON, `:339-374`), to `getConfig()` (read `saved.contextLength as number | undefined`, `:376-402`), and call `setConfiguredContextLength(currentConfig.contextLength)` in BOTH `configure()` (after assignment) and `initFromSavedConfig()` (`:405-411`).
   - `preload/index.d.ts` `AiConfigData` += `contextLength?: number` (`:137-145`).
   - `renderer/src/types/campaign.ts` `AiDmConfig` += `contextLength?: number` (`:63-74`); `ai-dm-routing.ts configureAiFromCampaign` passes `contextLength: aiDm.contextLength` (`:34-41`). No UI control in this phase (PHASE-10 owns the settings surfaces).
5. Tests — new `ollama-context.test.ts`: resolution precedence (config > curated > default); clamp to fetched model max (mock fetch returning `model_info`); clamp UP to `MIN_NUM_CTX`; `/api/show` failure → unclamped choice; cache stability (two calls → one `/api/show` fetch, same value); `setConfiguredContextLength` clears cache; curated family-prefix matching; exact-id beats prefix. Extend `ollama-client.test.ts`: request body contains `"options":{"num_ctx":` with the resolved value (mock `/api/show` or pre-seed via exported cache API). Extend `ollama-manager.test.ts` `CURATED_MODELS` block (`:73-97`): assert the re-export still works and `contextSize >= 4096` for every entry.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/main/ai/ollama-context.test.ts src/main/ai/ollama-client.test.ts src/main/ai/ollama-manager.test.ts`.

**Acceptance:** every Ollama request body carries identical `options.num_ctx` for a given model+config; value provably config>curated>default and clamped; config round-trips renderer→zod→disk; no import cycles (`npx madge --circular src/main/ai` if available, else tsc green suffices).

### 01C — Reconcile token budgets against the effective window + honest truncation flag

**Objective:** section budgets scale to the actual window so trimming happens in the trimmer (visibly, flagged) instead of in Ollama's runner (silently, front-of-prompt); `wasContextTruncated` becomes window-aware.

**Files:** `src/main/ai/token-budget.ts`, `src/main/data/token-budgets.json`, `src/main/ai/context-builder.ts`, `src/main/ai/conversation-manager.ts`, `src/main/ai/ai-service.ts`, `src/main/ai/token-budget.test.ts`, `src/main/ai/conversation-manager.test.ts`, `src/main/ai/context-builder.test.ts`.

**Steps:**

1. `token-budgets.json`: fix the fictional entries so the file states reality — `"systemPrompt": 12500` (measured static estimate + headroom; documentation-only, see step 2), `"total": 25000` → recompute as the true sum of the *consumed* dynamic sections (retrievedChunks 8000 + srdData 2000 + campaignData 2000 + creatures 2000 + gameState 1500 + memory 2000 + conversationHistory 4000 = **21500**, so `"total": 21500`). Leave `responseBuffer`, `fileReadContent`, `webSearchResults` as-is (documented intent; `fileReadContent`/`webSearchResults` enforcement is out of scope here).
2. `token-budget.ts` additions:
   ```ts
   /** Effective window for budget math. Cloud providers get CLOUD_CONTEXT_WINDOW
    *  (≥100k real windows — budgets apply unscaled); Ollama gets the resolved num_ctx. */
   export const CLOUD_CONTEXT_WINDOW = 100_000
   let activeContextWindow = CLOUD_CONTEXT_WINDOW
   export function setActiveContextWindow(tokens: number): void   // invalidates the memo below
   export function getActiveContextWindow(): number

   /** Lazy, cached: estimateTokens(assembleSystemPrompt('general')) — the real static cost. */
   export function getStaticSystemPromptTokens(): number

   export interface EffectiveBudgets { retrievedChunks: number; srdData: number; campaignData: number;
     creatures: number; gameState: number; memory: number; conversationHistory: number }
   /** available = window − getStaticSystemPromptTokens() − OUTPUT_RESERVE(2000) − CONDITIONAL_RESERVE(1500).
    *  If available ≥ sum(raw section budgets) → raw budgets (cloud path, big local windows).
    *  Else scale each section by available/sum, flooring at per-section minimums
    *  (conversationHistory 1000, retrievedChunks 600, others 200). If available < sum(floors),
    *  pin at floors and logToFile('WARN', …) once per window value (the prompt WILL overflow;
    *  the F6 flag below still reports it honestly). Memoized per window value. */
   export function getEffectiveBudgets(): EffectiveBudgets
   ```
   Import `assembleSystemPrompt` from `./prompt-assembler` (verified acyclic: prompt-assembler imports only prompt-sections). Note in a comment: all numbers are in the chars/4 estimator's units, which over-counts prose by ~25% vs the llama tokenizer — i.e. the scaling is conservative-safe (estimator-fits ⇒ real-fits).
3. `context-builder.ts`: replace the six `TOKEN_BUDGETS.<section>` reads (`:199,209,255,276,288,300,312`) with `getEffectiveBudgets().<section>` (capture `const budgets = getEffectiveBudgets()` once at the top of `buildContext`). Keep `TOKEN_BUDGETS` exported for the raw values.
4. `conversation-manager.ts`: `:111,147` use `getEffectiveBudgets().conversationHistory`; extend the `_contextTruncated` expression (`:146-148`) with `|| totalTokens > getActiveContextWindow() - 2000` (same OUTPUT_RESERVE constant — export it from token-budget rather than duplicating the literal).
5. `ai-service.ts` `startChat`: after `const model = await resolveOllamaModel(currentConfig.model, streamId)` (`:652`), set the window BEFORE `buildContext`/`getMessagesForApi` run:
   ```ts
   if (getActiveProviderType() === 'ollama') {
     setActiveContextWindow(await resolveNumCtx(model, getOllamaUrl()))
   } else {
     setActiveContextWindow(CLOUD_CONTEXT_WINDOW)
   }
   ```
   (`getOllamaUrl` is already imported at `:35`.) The restream path (`handleStreamCompletion → conv.getMessagesForApi`) reuses the window set at stream start — correct, same model.
6. Tests: `token-budget.test.ts` — raw budgets returned when window large; proportional scaling arithmetic at window 16384 (compute expected from `getStaticSystemPromptTokens()`); floors respected; pin-at-floors path warns (spy `logToFile`); memo invalidation on `setActiveContextWindow`. `conversation-manager.test.ts` — `_contextTruncated` true when estimate exceeds window even with zero section trims (set a small window, large messages). `context-builder.test.ts` — sections trim to the scaled budget under a small window.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/token-budget.test.ts src/main/ai/conversation-manager.test.ts src/main/ai/context-builder.test.ts`.

**Acceptance:** with window 16384 the assembled prompt estimate (`lastTokenEstimate`) ≤ window − reserve in tests; with `CLOUD_CONTEXT_WINDOW` behavior is byte-identical to today (raw budgets — regression guard); `wasContextTruncated` true on window overflow.

### 01D — Prefix-cache prompt ordering: static-first, volatile-last

**Objective:** maximize the byte-stable prefix so consecutive turns hit Ollama's KV cache: rules base (already stable) → static provider blurb → semi-static campaign/character data → volatile retrieval/state, with the every-message-changing game state last.

**Files:** `src/main/ai/context-builder.ts`, `src/main/ai/ai-service.ts`, `src/main/ai/context-builder.test.ts`, `src/main/ai/ai-service.test.ts` (only if it asserts blurb placement).

**Steps:**

1. `ai-service.ts:662-663`: prepend instead of append the static blurb — `conv.getMessagesForApi(providerContext + context)` with `providerContext` no longer carrying the leading `\n\n` (move it between blurb and context). The blurb only changes when the provider changes; today it is re-prefilled every turn because it trails the volatile snapshot.
2. `context-builder.ts buildContext`: reorder the `parts.push` sequence to: **(a)** campaign data (semi-static, currently #4), **(b)** character data + party composition + encounter budget (semi-static between level-ups/HP changes, currently #3 — keep the three sub-blocks together and in their current relative order), **(c)** rulebook chunks (query-volatile, currently #1), **(d)** SRD data + available monsters (query-volatile, currently #2 + the monster list from the character branch — move the `formatAvailableMonstersContext` push next to the SRD push so the volatile pieces are adjacent), **(e)** active creatures, **(f)** memory (currently #7), **(g)** game state snapshot LAST (currently #6 — it embeds `[GAME TIME] Total seconds: N`, changed every message). Implementation note: the character-data branch currently also pushes the monster list and the memory-cache side-effect (`:253-266`) — keep the `saveCharacterContext` side-effect with the character branch; only the *push order* moves. Do not change any block's internal text (downstream regexes in `conversation-manager.ts:76-92` key on content substrings, which are order-independent).
3. Leave `state-snapshot.ts` untouched (the snapshot is wholly volatile — F5).
4. Add a comment block at the top of `buildContext` documenting the ordering contract and why (KV prefix cache, first-differing-byte invalidation), citing this phase.
5. Tests: `context-builder.test.ts` — assert relative order via `indexOf` on a built context (campaign < character < rulebook < creatures < memory < game-state markers); update any existing order-sensitive assertions.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/context-builder.test.ts src/main/ai/ai-service.test.ts`.

**Acceptance:** two consecutive `buildContext` calls that differ only in query + game state produce outputs whose common prefix covers campaign+character blocks (test compares `commonPrefixLength` > campaign+character section length); provider blurb precedes the context block.

### 01E — Opt-in flash-attention / KV-cache-quantization tuning + operator docs

**Objective:** let bigger windows fit consumer VRAM — opt-in, off by default (model-specific slowdown caveat, F8).

**Files:** `src/main/ai/ollama-context.ts`, `src/main/ai/types.ts`, `src/shared/ipc-schemas.ts`, `src/main/ai/ai-service.ts`, `src/preload/index.d.ts`, `src/renderer/src/types/campaign.ts`, `src/renderer/src/services/ai-dm-routing.ts`, `src/main/ai/ollama-manager.ts`, `src/main/ai/ollama-manager.test.ts`, `src/main/ai/ollama-context.test.ts`, new `docs/OLLAMA-TUNING.md`.

**Steps:**

1. Config field `ollamaKvCacheType?: 'q8_0' | 'q4_0'` — absent/undefined = OFF (no env injected, today's behavior). Plumb exactly like `contextLength` in 01B step 4: `AiConfig`, `AiConfigSchema` (`z.enum(['q8_0','q4_0']).optional()`), `currentConfig`/`configure()`/`getConfig()`/`initFromSavedConfig()`, `AiConfigData`, `AiDmConfig`, `configureAiFromCampaign`. Store into `ollama-context.ts` via `setOllamaKvCacheType(v)` / `getOllamaKvCacheType()`.
2. `ollama-manager.ts startOllama` (`:368-374`): build the env once —
   ```ts
   const kv = getOllamaKvCacheType()
   const tuningEnv = kv ? { OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: kv } : {}
   const child = spawn(ollamaPath, ['serve'], { ...,
     env: { ...process.env, ...(nvidiaPresent ? { OLLAMA_VULKAN: '0' } : {}), ...tuningEnv } })
   ```
   (Flash attention is set only alongside KV quantization — it is the prerequisite; standalone flash-attention stays a server-operator concern per the doc.) Note in a comment: applies only when THIS app spawns the server; an already-running/system-managed Ollama is unaffected until restarted through the app.
3. New `docs/OLLAMA-TUNING.md` (operator guidance — the "guidance" half of the scope bullet): what `num_ctx` the app now sends and how to override it (`contextLength`); why `keep_alive: '60m'` is sent (KV cache retention; API value overrides `OLLAMA_KEEP_ALIVE`); VRAM math summary (KV f16 vs q8_0 vs q4_0, the 23.3/17.0/13.8 GB example); how to enable tuning in-app (`ollamaKvCacheType`) vs externally (`Environment="OLLAMA_FLASH_ATTENTION=1"` + `OLLAMA_KV_CACHE_TYPE` in the user's systemd unit / launchd plist / Windows env); the Gemma-family slowdown caveat with the upstream issue link; the desktop-app caveat that recent Ollama GUI builds expose their own context-length setting which can override env expectations (per-request `options.num_ctx` — what this app sends — remains authoritative); and how to verify (server log `truncating input prompt`, `getLastOllamaStats().promptEvalCount` ≈ estimate ⇒ no truncation). Cite the source URLs from Research notes.
4. Tests: `ollama-context.test.ts` — setter/getter + absent-by-default; `ollama-manager.test.ts` — `startOllama` spawn env contains both vars when the type is set and neither when unset (existing spawn mock pattern; if `startOllama` isn't currently under test, add a focused test that mocks `child_process.spawn` + the fetch poll).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/main/ai/ollama-context.test.ts src/main/ai/ollama-manager.test.ts`.

**Acceptance:** default config produces a spawn env byte-identical to today's; setting `ollamaKvCacheType` injects exactly `OLLAMA_FLASH_ATTENTION=1` + `OLLAMA_KV_CACHE_TYPE=<value>`; doc exists and is linked from `dnd-app/README.md`'s docs list if one exists (check `grep -n "docs/" dnd-app/README.md`; add a line only if such a list exists).

## Research notes

- **Why migrate endpoints instead of passing `options` where we are:** Ollama's OpenAI-compatibility layer rejects context-length control by design — feature request closed ([ollama#5356](https://github.com/ollama/ollama/issues/5356)), implementation PR closed unmerged with "OpenAI's API doesn't allow setting the context length, hence Ollama's compatibility layer doesn't either" ([ollama#6137](https://github.com/ollama/ollama/pull/6137)). Alternatives considered: (a) **Modelfile clones** (`ollama create x -f` with `PARAMETER num_ctx`) — the upstream-recommended workaround, rejected here because it forks every installed model id (breaks `resolveOllamaModel`'s installed-list matching, doubles disk for manifests, confuses the management UI); (b) **`OLLAMA_CONTEXT_LENGTH` env** — only effective for servers the app spawns, invisible drift for external servers, and reports exist of env being ignored in some desktop builds ([ollama#11283](https://github.com/ollama/ollama/issues/11283)); (c) **native `/api/chat`** — per-request, authoritative, also unlocks `format` (PHASE-23), `keep_alive`, and real token counts (`prompt_eval_count`/`eval_count`) in the final chunk ([/api/chat reference](https://docs.ollama.com/api/chat), [api.md](https://github.com/ollama/ollama/blob/main/docs/api.md)). Chosen: (c).
- **Default window + truncation behavior:** default context is 4096; per-request `options.num_ctx` overrides; truncation is server-side, logged as `msg="truncating input prompt" limit=… prompt=…`, trims from the start, and is NOT reported in the API response — client-side detection is estimate-vs-window plus `prompt_eval_count` comparison ([Ollama FAQ](https://docs.ollama.com/faq), [ollama#8099](https://github.com/ollama/ollama/issues/8099)).
- **Prefix/KV cache:** hit requires token-identical prefix AND a still-loaded model; measured 17.7× prefill speedup (962.39 ms → 54.49 ms); busted by (1) model unload (default 5 min `keep_alive`), (2) `num_ctx` change between requests, (3) any options change; recommendation `keep_alive: "60m"` + static-first prompt layout ([Ollama prompt caching chapter](https://leanpub.com/read/ollama/prompt-caching), [KV cache & scheduling internals](https://jonathanding.github.io/llm-learning/en/articles/ollama-kv-cache-scheduling/), [keep-alive guide](https://mljourney.com/ollama-keep-alive-and-model-preloading-eliminate-cold-start-latency/)). `keep_alive: '60m'` was chosen over `-1` (never unload) so an abandoned session eventually frees VRAM on shared machines.
- **KV-cache quantization:** `OLLAMA_KV_CACHE_TYPE=q8_0` halves KV memory (q4_0 quarters) with flash attention as prerequisite; Llama-3-8B-class at 128k ctx: 23.3 GB f16 → 17.0 GB q8_0 → 13.8 GB q4_0; global setting, applies to all models; quality loss negligible at q8_0, measurable at q4_0; Gemma-family slowdown reports ([mitjamartini KV-cache quantization](https://mitjamartini.com/posts/ollama-kv-cache-quantization/), [ollama#9683](https://github.com/ollama/ollama/issues/9683), [Ollama FAQ](https://docs.ollama.com/faq)). Hence opt-in, off by default.
- **Model max detection:** `POST /api/show` returns `model_info` keyed by architecture (`general.architecture` → `<arch>.context_length`), plus `capabilities`/`details` ([api.md](https://github.com/ollama/ollama/blob/main/docs/api.md)). Used as a clamp only — never as the chosen window (128k-native models would otherwise get monstrous KV allocations on small GPUs).
- **Estimator caveat:** the app's `estimateTokens` (chars/4) over-counts dense rules prose by ~25% vs the llama tokenizer (measured: 12,336 estimated vs ~9.6k real for the static prompt). Budget math stays in estimator units throughout — conservative-safe (if the estimate fits, reality fits). Do not mix real `prompt_eval_count` into budget *math*; it is observability data (PHASE-14).
- **Thinking models:** newer Ollama parses thinking-model reasoning into `message.thinking` on the native endpoint ([/api/chat reference](https://docs.ollama.com/api/chat)); the client ignores that field — narration loses stray reasoning text on such servers, and behavior on older servers (inline `<think>` in `content`) is unchanged from today.

## Test plan

- **01A:** `src/main/ai/ollama-client.test.ts` rewritten for `/api/chat` NDJSON (URL, body shape incl. `keep_alive`, system-message position, multi-chunk, split-line, malformed-line, mid-stream error object, 404 pull-hint, no-body, abort swallow, `message.thinking` ignored, `getLastOllamaStats`).
- **01B:** new `src/main/ai/ollama-context.test.ts` (precedence, clamping both directions, `/api/show` failure fallback, cache stability + invalidation, curated family matching); `ollama-client.test.ts` `options.num_ctx` presence; `ollama-manager.test.ts` re-export + curated invariants.
- **01C:** `token-budget.test.ts` (scaling math, floors, memoization, cloud-window pass-through); `conversation-manager.test.ts` (window-overflow flag); `context-builder.test.ts` (scaled trims).
- **01D:** `context-builder.test.ts` (section order, common-prefix stability); `ai-service.test.ts` only if blurb placement is asserted there.
- **01E:** `ollama-context.test.ts` (tuning setters), `ollama-manager.test.ts` (spawn env with/without opt-in).
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`. No Pi code is touched — pytest not required.

## Acceptance criteria

1. Every Ollama request (stream + once) goes to `/api/chat` with `keep_alive: '60m'` and an `options.num_ctx` that is byte-identical across requests for a given model+config (test-proven).
2. `num_ctx` resolution is config (`contextLength`) > curated `contextSize` > `DEFAULT_NUM_CTX` (16384), clamped to `[MIN_NUM_CTX, model max from /api/show]`, resilient to `/api/show` failure.
3. `contextLength` and `ollamaKvCacheType` round-trip renderer → zod schema → `ai-config.json` → restart (`initFromSavedConfig`); both optional; absent values reproduce today's behavior exactly (except the new auto `num_ctx`/`keep_alive`, which is the point).
4. With a 16384 window, the assembled prompt estimate fits `window − OUTPUT_RESERVE` via scaled budgets; with the cloud window, budgets are numerically identical to the pre-phase JSON values (regression-guarded by test).
5. `wasContextTruncated()` reports true when the estimate exceeds the active window even without section trims; `getLastOllamaStats()` exposes the final chunk's `prompt_eval_count`/`eval_count`.
6. Context block order is campaign → character → retrieval → creatures → memory → game state, provider blurb precedes it, and no block's internal text changed.
7. `token-budgets.json` is internally consistent (`total` = sum of consumed dynamic sections; `systemPrompt` reflects the measured static cost).
8. Default spawn env unchanged; opt-in KV tuning injects exactly the two documented vars; `docs/OLLAMA-TUNING.md` exists with the operator guidance + caveats.
9. 4-gate green; one phase commit + push; plan moved to `completed/`.

## Out of scope

- `listOllamaModels` timeout + `ollama-manager` configured-URL adoption (detect/start/pull on `OLLAMA_BASE_URL`), provider timeout comments, cloud-provider `maxTokens` handling → **PHASE-03**.
- Surfacing truncation/token data in the UI (context-inspector, alert wiring, connection badge) and any new IPC channels for it → **PHASE-14**.
- Token-meter `{{max}}` interpolation in locales and all AI settings UI (a `contextLength` input would land in the PHASE-10 AiDmCard rework) → **PHASE-10**.
- Ollama `format`/JSON-schema structured outputs (enabled by this phase's endpoint migration) → **PHASE-23**.
- Retrieval quality (hybrid BM25+vector, chunking) → **PHASE-24**; scene-boundary summarization & compaction cadence → **PHASE-26**.
- `fileReadContent`/`webSearchResults` budget enforcement at their injection sites → log to `docs/ISSUES-LOG-DNDAPP.md` if observed broken during execution (not in any phase's allocation).
- Per-task model routing / mid-campaign model swap UI → **PHASE-29**.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
