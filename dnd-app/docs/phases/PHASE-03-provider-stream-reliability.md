# PHASE-03 — Provider stream reliability

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make every AI provider path survive real-world latency and configuration instead of silently dying or hanging: cloud streaming (Claude/OpenAI/Gemini) moves from a hard 90-second whole-stream wall-clock kill to first-token + inter-token inactivity timeouts (matching the fix Ollama already received); `listOllamaModels()` gets a bounded fetch so the preflight that runs before EVERY Ollama stream can no longer hang for minutes against an unreachable host (and unreachable-host failures stop masquerading as "no models installed"); the ollama-manager's pull/delete/details operations honor the configured `ollamaUrl` instead of hardcoded localhost; `getConfig()` stops re-reading disk on every call so the in-memory model auto-switch stops reverting; and the openai client stops sending the deprecated `max_tokens` parameter that o-series models reject, honors the interface's `maxTokens` parameter, and handles the o1-mini/o1-preview system-role rejection. Several stale timeout comments that misdescribe the current architecture are corrected alongside.

## Dependencies & cross-phase notes

- **No prerequisite phases** (PHASE-INDEX row 03: depends on "—"). Phases run in numeric order, so PHASE-01 and PHASE-02 will already have landed.
- **PHASE-01 (ollama-context-window) touches `ollama-client.ts` and `ollama-manager.ts` first** — it adds `options: { num_ctx, ... }` / `keep_alive` to the Ollama request bodies and wires curated `contextSize`. Re-verify the cited line numbers in those two files at execution time (rule 3); the functions touched here (`listOllamaModels`, `pullModel`, `deleteModel`, `listInstalledModelsDetailed`) are distinct from PHASE-01's request-body work, but line numbers will have shifted.
- **PHASE-23 (structured-outputs) depends on THIS phase** — it builds two-call structured extraction on top of the provider clients (`chatOnce` + `format` constraints). Keep the `LLMProvider` interface (`llm-provider.ts:21-38`) stable apart from the already-declared optional `maxTokens`; do not change method arity beyond what this plan specifies.
- **PHASE-06/07 also touch `ai-service.ts`** (scene-prep and conversation persistence respectively) — different functions (`prepareScene`, restore handlers); this phase touches `getConfig`/`initFromSavedConfig`/`resolveOllamaModel`/`chatOnce`. No semantic overlap, but expect merge-adjacent diffs in the same file across phases.
- **PHASE-10 (ai-dm-ui-truth) touches `AiProviderSetup.tsx`** — this phase does NOT touch renderer components; the AiProviderSetup pull-targets-localhost symptom is fixed entirely in the main process (`ollama-manager.ts`).
- **PHASE-14 (ai-observability)** adds a connection-status badge reading `getConnectionStatus()` in `ai-service.ts` — untouched here.
- No IPC channel additions or schema changes anywhere in this phase (`src/shared/ipc-channels.ts` / `ipc-schemas.ts` unchanged).

## Verified findings

All findings re-verified against the live tree on 2026-06-10. Line numbers are from that verification; re-confirm with the given commands before editing (PHASE-01/02 land first and may shift lines).

### F1 — Cloud providers cap the ENTIRE stream at 90s wall-clock; long narrations are killed mid-stream (bug/high)

`PROVIDER_REQUEST_TIMEOUT_MS = 90_000` is defined at `dnd-app/src/main/ai/llm-provider.ts:85`. `withRequestTimeout(signal?, ms = PROVIDER_REQUEST_TIMEOUT_MS)` (`llm-provider.ts:106-109`) wraps `AbortSignal.timeout(ms)` around the **whole request** and combines it with the caller's signal via `AbortSignal.any`. It is never reset on token arrival, so any cloud response whose total stream time exceeds 90s is aborted mid-stream:

- **Claude**: `claude-client.ts:44-52` — `client.messages.stream({...}, { signal: withRequestTimeout(abortSignal) })`. The abort rejects `stream.finalMessage()` (line 61) → catch at 78-81 → `callbacks.onError(classifyProviderError('claude', error))`.
- **OpenAI**: `openai-client.ts:36-44` — `client.chat.completions.create({..., stream: true}, { signal: withRequestTimeout(abortSignal) })`; the `for await` loop at 48-55 throws on abort → catch at 58-61 → `onError`.
- **Gemini**: `gemini-client.ts:34-37` — the SDK has no `signal` in model-level `RequestOptions`, so the client passes `{ timeout: PROVIDER_REQUEST_TIMEOUT_MS }` to `getGenerativeModel`. The SDK turns that into `setTimeout(() => controller.abort(), timeout)` on the fetch (verified in `node_modules/@google/generative-ai/dist/index.js:441-456`, `buildFetchOptions`), which also kills mid-stream body reads.

When this fires, partial text is never finalized: `onError` is delivered instead of `onDone`, so no stat-changes/dm-actions parse happens and the assistant message is not added to the conversation.

**Ollama already got the inactivity-based fix for exactly this failure class**: `ollama-client.ts:77-86` creates an `AbortController` + `armInactivity()` re-armed on every chunk read (`ollama-client.ts:121-123`), with `OLLAMA_INACTIVITY_TIMEOUT_MS = 90_000` and unbounded prefill; the catch at 202-216 distinguishes user-cancel / inactivity-timeout / other. Cloud providers did not.

**Stale comments confirmed:**
- `llm-provider.ts:79-83` claims the renderer backstop is "STREAM_SAFETY_TIMEOUT_MS (120s, app-constants.ts)". Actual: `STREAM_SAFETY_TIMEOUT_MS = 330_000` (`dnd-app/src/renderer/src/constants/app-constants.ts:50`) and the renderer timer is an **inactivity** timer re-armed on every heartbeat/token (`rearmSafetyTimeout`, `dnd-app/src/renderer/src/stores/use-ai-dm-store.ts:138-162`).
- `gemini-client.ts:32-33` says "enforce a 120s request timeout" and claims "this SDK's RequestOptions has no `signal`"; `gemini-client.ts:73` says "120s request timeout". The constant is 90s, and the no-signal claim is **stale at the per-request level**: the installed SDK (`@google/generative-ai@0.24.1`) accepts `SingleRequestOptions extends RequestOptions` with `signal?: AbortSignal` as the second argument of `sendMessage`/`sendMessageStream` (verified `node_modules/@google/generative-ai/dist/generative-ai.d.ts:1297-1307` and `:138,148`); per-call fields are merged over model-level options via `Object.assign` (`dist/index.js:1235`) and the signal is attached to the underlying fetch (`dist/index.js:448-453`). **Correction vs the audit**: the audit implied Gemini could only be bounded via `RequestOptions.timeout`; an abortable per-request path exists in the installed SDK version.

**Retry interaction (important for the fix):** `streamWithRetry` (`ai-service.ts:180-215`) fails fast — no retry — when the error message matches `/tim(e|ed)\s*out/i` (`ai-service.ts:202`), and `streamChatRetryable` (`ai-service.ts:230-264`) never retries failures that occur after text has streamed. New timeout error messages must contain "timed out" to keep the no-retry fail-fast behavior.

Verification commands:
```bash
grep -n "PROVIDER_REQUEST_TIMEOUT_MS\|withRequestTimeout\|OLLAMA_INACTIVITY" dnd-app/src/main/ai/llm-provider.ts
grep -n "withRequestTimeout" dnd-app/src/main/ai/claude-client.ts dnd-app/src/main/ai/openai-client.ts
grep -n "timeout\|signal" dnd-app/src/main/ai/gemini-client.ts | head
grep -n "STREAM_SAFETY_TIMEOUT_MS = " dnd-app/src/renderer/src/constants/app-constants.ts   # → 330_000
grep -n "armInactivity\|inactivityTimer" dnd-app/src/main/ai/ollama-client.ts
grep -n "interface SingleRequestOptions" -A 10 dnd-app/node_modules/@google/generative-ai/dist/generative-ai.d.ts
grep -n "tim(e|ed)" dnd-app/src/main/ai/ai-service.ts                                       # → :202 fail-fast regex
```

### F2 — `listOllamaModels()` has no fetch timeout; the preflight before EVERY Ollama stream can hang minutes on an unreachable host (bug/high)

`listOllamaModels()` (`dnd-app/src/main/ai/ollama-client.ts:46-55`) fetches `${ollamaBaseUrl}/api/tags` with **no AbortSignal** — contrast `isOllamaRunning()` directly above it (`ollama-client.ts:33-43`) which uses `AbortSignal.timeout(2000)`, and `listInstalledModelsDetailed()` (`ollama-manager.ts:519-521`) which uses 5000ms. Its `catch` swallows every failure into `[]`.

`resolveOllamaModel()` (`ai-service.ts:591-609`) awaits it ungated as the **first async step of every Ollama `startChat`** (`ai-service.ts:652`, inside the async IIFE, after the `firstTokenTimer` interval is armed at `ai-service.ts:645-647`). Consequences against an unreachable remote `ollamaUrl`:

- TCP connect failure: ~10s OS-level drop. TCP connects but server stalls: up to 300s (Node/undici default `headersTimeout`/`bodyTimeout` are 300s).
- During the hang the user sees misleading `loading_model` notices every 12s (`FIRST_TOKEN_NOTICE_MS = 12_000`, `ai-service.ts:582`; interval emits `sendStreamStatus(streamId, 'loading_model')`).
- When the fetch finally fails, `installed.length === 0` and the user gets the **wrong error**: `"No Ollama models installed at ${getOllamaUrl()}. Install one, e.g.: ollama pull llama3.2:3b"` (`ai-service.ts:594-597`) — a network failure reported as an empty library. *(Minor correction vs audit: the message now already includes the URL via `getOllamaUrl()`; it is still the wrong error class.)*

Also reachable from `AI_LIST_INSTALLED_MODELS` (`ai-handlers.ts:582-584` → `listInstalledModels()` at `ollama-manager.ts:510-512` → `listOllamaModels()`), and from `ollamaProvider.listModels` (`ollama-client.ts:251`).

Verification commands:
```bash
sed -n '33,55p' dnd-app/src/main/ai/ollama-client.ts          # isOllamaRunning has timeout(2000); listOllamaModels has none
grep -n "FIRST_TOKEN_NOTICE_MS\|resolveOllamaModel(currentConfig" dnd-app/src/main/ai/ai-service.ts
sed -n '591,609p' dnd-app/src/main/ai/ai-service.ts            # the misleading "No Ollama models installed" throw
grep -n "AI_LIST_INSTALLED_MODELS" dnd-app/src/main/ipc/ai-handlers.ts
```

### F3 — ollama-manager pull/delete/details hardcode `OLLAMA_BASE_URL` (localhost), ignoring the configured `ollamaUrl` (bug/high)

`OLLAMA_BASE_URL = 'http://localhost:11434'` is a constant (`dnd-app/src/main/ai/ollama-constants.ts:3`). `ollama-client.ts` keeps a module-level `ollamaBaseUrl` that `setOllamaUrl()` updates from config (`ollama-client.ts:5-15`; called by `configure`/`initFromSavedConfig` at `ai-service.ts:351,407`). But `ollama-manager.ts` fetches the **constant** directly in:

- `pullModel` — `ollama-manager.ts:458` (`${OLLAMA_BASE_URL}/api/pull`)
- `listInstalledModelsDetailed` — `ollama-manager.ts:519` (`${OLLAMA_BASE_URL}/api/tags`)
- `deleteModel` — `ollama-manager.ts:622` (`${OLLAMA_BASE_URL}/api/delete`)

Renderer-visible symptom: with a remote Ollama configured, `AiProviderSetup.tsx:114` lists installed models from the **remote** (it goes through `listInstalledModels` → `listOllamaModels`, which uses the configured URL), but the Install step at `AiProviderSetup.tsx:201` (`window.api.ai.pullModel(model)` → `ai-handlers.ts:569` → `pullModel`) pulls to **localhost** — so the install spins against the wrong host and the model dropdown (remote) disagrees with the management screen detail view (`listInstalledModelsDetailed`, local). Delete (`ai-handlers.ts:615`) deletes from localhost too.

**Intentionally localhost (do NOT change):** `detectOllama` (`:174`), `startOllama` (`:345,383`), `stopOllama` (`:427`), `getOllamaVersion` (`:555`), `checkOllamaUpdate`, `downloadOllama`/`installOllama`/`updateOllama`, `ensureOllamaUsesDedicatedGpu` — these manage the **local binary lifecycle** (spawn/kill the local process, check the local binary's version for the in-app updater). The audit explicitly flags `getOllamaVersion`'s localhost targeting as plausibly intentional; verification agrees — it feeds the local-binary update flow.

No import-cycle risk: `ollama-manager.ts` already imports from `./ollama-client` (`listOllamaModels`, line 5), and `ollama-client` imports only `./ollama-constants` — adding `getOllamaUrl` to the existing import is safe.

Verification commands:
```bash
grep -n "OLLAMA_BASE_URL" dnd-app/src/main/ai/ollama-manager.ts        # :174,345,383,427,458,519,555,622
cat dnd-app/src/main/ai/ollama-constants.ts
grep -n "listInstalledModels\|pullModel" dnd-app/src/renderer/src/components/campaign/AiProviderSetup.tsx
grep -n "pullModel\|deleteModel" dnd-app/src/main/ipc/ai-handlers.ts | head
```

### F4 — `getConfig()` re-reads disk and clobbers in-memory `currentConfig`; `resolveOllamaModel`'s auto-switch keeps reverting (bug/high)

`getConfig()` (`dnd-app/src/main/ai/ai-service.ts:376-401`) re-reads `ai-config.json` and **overwrites the module-level `currentConfig`** on every call. The Ollama model auto-switch in `resolveOllamaModel` (`ai-service.ts:602`: `currentConfig.model = picked`) is in-memory only — nothing persists it to disk. So any later `getConfig()` reverts the model to the stale on-disk value. Confirmed `getConfig()` trigger paths:

- `AI_GET_CONFIG` IPC handler (`ai-handlers.ts:124-126`), called from the renderer on ChatPanel mount (`dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx:160`).
- `ai-vision.ts` `getModelForProvider` (`ai-vision.ts:210-218`, lazy `require('./ai-service')`), called per manual map analysis.
- `initFromSavedConfig` (`ai-service.ts:405-411`) — legitimate (startup).

Consequences after a revert: the next stream re-resolves and re-emits the `model_switched` stream-status notice (`sendStreamStatus` at `ai-service.ts:606`, channel `AI_STREAM_STATUS` = `'ai:stream-status'`, `ipc-channels.ts:139`) — so the "one-time notice" repeats every time; and non-stream paths use the missing model **un-resolved**: `chatOnce` (`ai-service.ts:935-938`) and vision (`ai-vision.ts:192` via `getModelForProvider`) pass `currentConfig.model`/`getConfig()?.model` straight to the provider, which 404s against Ollama ("Model X is not installed…" via `ollamaHttpError`, `ollama-client.ts:26-31`).

The only writer of `ai-config.json` is `configure()` itself (`ai-service.ts:361-373`, atomic write) — there is no external-writer reason for `getConfig()` to re-read disk.

Existing tests that encode the current (wrong) behavior: `ai-service.test.ts:255-295` ("getConfig — loads config from disk if file exists", "loads legacy config with ollamaModel field", "returns defaults if config file does not exist", "returns defaults if config file has invalid JSON") call `getConfig()` directly with mocked `existsSync`/`readFileSync`.

Verification commands:
```bash
sed -n '376,411p' dnd-app/src/main/ai/ai-service.ts
grep -n "currentConfig.model = picked" dnd-app/src/main/ai/ai-service.ts     # :602
grep -rn "ai\.getConfig" dnd-app/src/renderer/src --include='*.tsx' | grep -v test   # ChatPanel.tsx:160
sed -n '205,220p' dnd-app/src/main/ai/ai-vision.ts
grep -n "describe('getConfig'" -A 40 dnd-app/src/main/ai/ai-service.test.ts | head -45
```

### F5 — openai-client sends deprecated `max_tokens`, offers o-series models that reject it, ignores `maxTokens`, and hardcodes the `system` role o1-mini rejects (bug/medium)

All four sub-claims confirmed in `dnd-app/src/main/ai/openai-client.ts`:

- `max_tokens: 4096` sent in `streamChat` (`:41`) and `chatOnce` (`:79`). The Chat Completions API deprecates `max_tokens` in favor of `max_completion_tokens`; o-series reasoning models (o1, o3, o4-mini, …) **reject** `max_tokens` outright.
- `listModels` filter `/^(gpt-|o\d|chatgpt)/i` (`:109`) deliberately includes o-series ids — so the UI can select a model the client then breaks against.
- Both method signatures omit the interface's optional `maxTokens` param (`streamChat` at `:19-25`, `chatOnce` at `:64`) even though `LLMProvider` declares it (`llm-provider.ts:24-33`) — claude-client honors it (`claude-client.ts:35,47,84,95`). No production caller currently passes `maxTokens` (verified: `ai-service.ts:261` and `ai-stream-handler.ts:163` pass 5 args), so wiring it is interface-honesty with zero behavior change.
- The system prompt is hardcoded as a `{ role: 'system' }` message (`:29` streaming, `:67` once). o1-mini and o1-preview reject `system` **and** `developer` roles (400 "Unsupported value: 'messages[0].role'"); o1-and-newer reasoning models accept `system` (treated as `developer` server-side).

The installed SDK (`openai@6.39.1`, `package.json:231`) fully supports the fixes: `max_completion_tokens?: number | null` exists on `ChatCompletionCreateParams` (`node_modules/openai/resources/chat/completions/completions.d.ts:1290`), and `ChatCompletionDeveloperMessageParam` exists (`completions.d.ts:749`).

Verification commands:
```bash
grep -n "max_tokens\|maxTokens\|role: 'system'\|gpt-\|o\\\\d" dnd-app/src/main/ai/openai-client.ts
grep -n "max_completion_tokens" dnd-app/node_modules/openai/resources/chat/completions/completions.d.ts | head -2
grep -rn "streamChat(sp\|streamChat(systemPrompt" dnd-app/src/main/ai/ai-stream-handler.ts dnd-app/src/main/ai/ai-service.ts | grep -v test
```

### Current-state notes the fix builds on (verified)

- The Anthropic SDK (`@anthropic-ai/sdk@0.100.1`) has a 10-minute default client timeout (`node_modules/@anthropic-ai/sdk/client.js:791`: `DEFAULT_TIMEOUT = 600000`) and accepts a per-request `signal` (`internal/request-options.d.ts:56`); `MessageStream` exposes a `streamEvent` listener fired per SSE event (`lib/MessageStream.d.ts:8`). Our 90s external signal currently preempts the SDK default.
- The OpenAI SDK default client timeout is also 10 minutes (`node_modules/openai/client.js:695`) with per-request `signal` support (`internal/request-options.d.ts:56`).
- `ollamaChatOnce` (non-streaming) keeps a generous whole-request `AbortSignal.timeout(OLLAMA_PREFILL_TIMEOUT_MS)` = 300s (`ollama-client.ts:227-234`) — the pattern for "no token stream to watch → one overall ceiling" that cloud `chatOnce` should keep mirroring (at 90s).

## Sub-phases

Run in order; each leaves the tree green. All files are main-process TypeScript → type-check with `npx tsc --noEmit -p tsconfig.node.json`. No renderer files, IPC channels, or schemas change in this phase.

### 03A — Shared stream-inactivity guard + stale-comment corrections (`llm-provider.ts`)

**Objective:** one reusable first-token + inter-token inactivity guard for cloud streaming, plus accurate comments.

**Files:** `dnd-app/src/main/ai/llm-provider.ts`, new `dnd-app/src/main/ai/llm-provider.test.ts`.

**Steps:**
1. Add constants below `OLLAMA_INACTIVITY_TIMEOUT_MS` (currently `llm-provider.ts:100`):
   ```ts
   /**
    * Cloud streaming timeouts. Cloud providers prefill server-side in seconds, so —
    * unlike Ollama — the time-to-first-token IS bounded (a connect/hang failure should
    * be classified and surfaced before the renderer's 330s inactivity backstop). Once
    * tokens are flowing, only inter-token SILENCE aborts the stream; total stream
    * duration is unbounded (long narrations were previously killed at 90s wall-clock).
    * INVARIANT: both values < the renderer's STREAM_SAFETY_TIMEOUT_MS (330s,
    * app-constants.ts), which re-arms per token/heartbeat.
    */
   export const CLOUD_FIRST_TOKEN_TIMEOUT_MS = 90_000
   export const CLOUD_INACTIVITY_TIMEOUT_MS = 90_000
   ```
2. Add the guard factory (module export, next to `withRequestTimeout`):
   ```ts
   export interface StreamInactivityGuard {
     /** Combined caller-abort + guard signal — pass to the SDK request. */
     signal: AbortSignal
     /** Re-arm the inactivity window; call on every token/SSE event. */
     bump: () => void
     /** Stop the timer; call on done and in every catch/finally. */
     clear: () => void
     /** True iff the GUARD aborted (vs the caller's signal). */
     timedOut: () => boolean
   }

   export function createStreamInactivityGuard(options?: {
     firstTokenMs?: number
     inactivityMs?: number
     signal?: AbortSignal
   }): StreamInactivityGuard
   ```
   Implementation mirrors the proven Ollama pattern (`ollama-client.ts:77-86`): an `AbortController`, a `timedOut` flag, a `setTimeout` armed at construction with `firstTokenMs ?? CLOUD_FIRST_TOKEN_TIMEOUT_MS`; `bump()` clears + re-arms with `inactivityMs ?? CLOUD_INACTIVITY_TIMEOUT_MS`; `clear()` clears the timer; `signal` is `options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal`.
3. Rewrite the stale doc comment at `llm-provider.ts:77-84`: `PROVIDER_REQUEST_TIMEOUT_MS` now documents itself as the whole-request ceiling for **non-streaming** cloud calls (`chatOnce`) and provider availability probes only; streaming uses `createStreamInactivityGuard`. Replace the "120s" renderer reference with the truth: renderer backstop is `STREAM_SAFETY_TIMEOUT_MS = 330s` and is itself an inactivity timer re-armed per token/heartbeat (`use-ai-dm-store.ts` `rearmSafetyTimeout`). Keep the invariant statement (`provider timeouts < 330s`).
4. New `llm-provider.test.ts` (vitest, fake timers): guard times out at `firstTokenMs` when never bumped (`signal.aborted === true`, `timedOut() === true`); `bump()` before expiry defers the abort (advance past `firstTokenMs`, assert not aborted, then past `inactivityMs` with no bump → aborted); `clear()` prevents any abort; caller's signal aborting → combined signal aborted but `timedOut() === false`; defaults pull from the exported constants.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/llm-provider.test.ts` (run from `dnd-app/`).

**Acceptance:** guard exported + fully tested; no caller changed yet; comments at `llm-provider.ts` no longer mention 120s.

### 03B — Claude streaming: inactivity guard replaces the 90s whole-stream kill

**Objective:** Claude streams are bounded by first-token (90s) + inter-token silence (90s), never by total duration.

**Files:** `dnd-app/src/main/ai/claude-client.ts`, `dnd-app/src/main/ai/claude-client.test.ts`.

**Steps:**
1. In `streamChat` (`claude-client.ts:29-82`): replace `{ signal: withRequestTimeout(abortSignal) }` with a guard:
   ```ts
   const guard = createStreamInactivityGuard({ signal: abortSignal })
   const stream = client.messages.stream({ ... }, { signal: guard.signal })
   stream.on('streamEvent', () => guard.bump())
   ```
   (`streamEvent` fires for every SSE event the SDK delivers — message_start, content_block_delta, message_delta, message_stop — so it bumps even during non-text deltas.) Keep the existing `stream.on('text', ...)` accumulation unchanged. Call `guard.clear()` after `await stream.finalMessage()` resolves and in the `catch`.
2. In the `catch` (`claude-client.ts:78-81`), before the generic classify: if `abortSignal?.aborted` return (unchanged, user cancel); else if `guard.timedOut()` →
   ```ts
   callbacks.onError(new Error('Claude stream timed out (no output for 90s). The provider may be unresponsive — try again.'))
   ```
   The message MUST contain "timed out" so `streamWithRetry`'s fail-fast regex (`ai-service.ts:202`) skips the pointless retry. Derive the "90s" from `CLOUD_INACTIVITY_TIMEOUT_MS / 1000` rather than a literal.
3. `chatOnce` (`claude-client.ts:84-109`) is non-streaming: keep `withRequestTimeout()` exactly as is (mirrors the Ollama PREFILL pattern — one overall ceiling when there is no token stream to watch).
4. Update `claude-client.test.ts`: the mocked SDK's `messages.stream` (test file top) must also accept/record the second options arg and expose an `on` that records listeners. Add tests: (a) `streamChat` passes a `signal` in request options (an `AbortSignal` instance, not the old `withRequestTimeout` product — assert `signal` defined); (b) a `streamEvent` listener is registered; (c) when the guard's signal aborts and `finalMessage` rejects, `onError` receives a message containing "timed out" (simulate with fake timers: never fire `streamEvent`, make `finalMessage` reject when the captured signal aborts).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/claude-client.test.ts`.

**Acceptance:** no call to `withRequestTimeout` remains in the Claude **streaming** path; `chatOnce` still uses it; new tests green.

### 03C — OpenAI: `max_completion_tokens`, `maxTokens` wiring, o1-mini/o1-preview system-prompt folding, inactivity guard

**Objective:** openai-client works against every model its own `listModels` offers, honors the interface, and gets the same streaming timeout semantics.

**Files:** `dnd-app/src/main/ai/openai-client.ts`, new `dnd-app/src/main/ai/openai-client.test.ts`.

**Steps:**
1. Replace `max_tokens: 4096` with `max_completion_tokens: maxTokens ?? 4096` in both `streamChat` (`:41`) and `chatOnce` (`:79`). Add the optional `maxTokens?: number` parameter to both signatures (after `abortSignal` in `streamChat`, after `model` in `chatOnce`) matching the `LLMProvider` interface (`llm-provider.ts:24-33`). `max_completion_tokens` is accepted by all chat-capable models on api.openai.com (it replaced `max_tokens` API-wide; only o-series *reject* the old param).
2. Add a module-level helper + message builder:
   ```ts
   /** o1-mini / o1-preview reject BOTH `system` and `developer` roles (400). Every other
    *  chat model accepts `system` (reasoning models treat it as `developer` server-side). */
   function rejectsSystemRole(model: string): boolean {
     return /^(o1-mini|o1-preview)/i.test(model)
   }
   ```
   In both methods, when `rejectsSystemRole(model)`: omit the system message and instead prepend the prompt to the first user message (`content: `${systemPrompt}\n\n${firstUserContent}``); if there are no messages, send the system prompt as a single user message. Otherwise keep `{ role: 'system', content: systemPrompt }` exactly as today (do NOT switch to `developer` — `system` is auto-mapped for o1+ and required for GPT-series).
3. In `streamChat`, replace `{ signal: withRequestTimeout(abortSignal) }` with `createStreamInactivityGuard({ signal: abortSignal })`, pass `{ signal: guard.signal }`, call `guard.bump()` at the top of the `for await` loop body, `guard.clear()` before `callbacks.onDone` and in the `catch`. In the catch: `abortSignal?.aborted` → return (unchanged); `guard.timedOut()` → `onError(new Error('OpenAI stream timed out (no output for ${...}s). ...'))` ("timed out" wording required, same rationale as 03B); else classify as today.
4. `chatOnce` keeps `withRequestTimeout()` (non-streaming ceiling), only gaining `max_completion_tokens` + `maxTokens`.
5. New `openai-client.test.ts` modeled on `claude-client.test.ts` (mock the `openai` default export class with `chat.completions.create` capturing `(body, options)` and returning an async-iterable for `stream: true`): (a) body contains `max_completion_tokens` and NOT `max_tokens`; (b) caller-supplied `maxTokens` is forwarded; (c) `model: 'o1-mini'` → no `system`-role message, prompt folded into first user message; (d) `model: 'gpt-4o'` → `system` message present; (e) streaming options carry an `AbortSignal`; (f) guard timeout (fake timers, iterator that never yields then rejects on abort) → `onError` message contains "timed out"; (g) `listModels` filter still returns gpt-/o-series ids (regression).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/openai-client.test.ts`.

**Acceptance:** `grep -n "max_tokens" src/main/ai/openai-client.ts` → no hits; both signatures declare `maxTokens`; o1-mini path has no system/developer role; tests green.

### 03D — Gemini: per-request abort signal + inactivity guard; comment truth

**Objective:** Gemini streaming stops being killed at 90s total; stale "120s"/"no signal" comments corrected.

**Files:** `dnd-app/src/main/ai/gemini-client.ts`, new `dnd-app/src/main/ai/gemini-client.test.ts`.

**Steps:**
1. In `streamChat` (`gemini-client.ts:23-69`): build the model **without** the model-level `timeout` (remove `{ timeout: PROVIDER_REQUEST_TIMEOUT_MS }` from the `getGenerativeModel` call — if left, the merged per-call options would still wall-clock-kill the stream, since per-call options only override fields they set; verified merge at `dist/index.js:1235`). Create `const guard = createStreamInactivityGuard({ signal: abortSignal })` and pass the signal per-request: `chat.sendMessageStream(lastMessage.content, { signal: guard.signal })` (supported by `SingleRequestOptions` in `@google/generative-ai@0.24.1`; the SDK wires it into the fetch's AbortController, killing mid-stream reads on abort — verified `dist/index.js:441-456`). `guard.bump()` at the top of the `for await` body; `guard.clear()` before `onDone` and in the catch. Catch ordering identical to 03B/03C, with a "Gemini stream timed out (no output for …s)…" message containing "timed out".
2. Replace the stale comment at `gemini-client.ts:32-33` with one stating: per-request `SingleRequestOptions.signal` carries caller abort + the inactivity guard; total stream duration is unbounded.
3. `chatOnce` (`:71-94`): KEEP the model-level `{ timeout: PROVIDER_REQUEST_TIMEOUT_MS }` (non-streaming ceiling), but fix the comment at `:73` ("120s" → reference `PROVIDER_REQUEST_TIMEOUT_MS` without a hardcoded number).
4. New `gemini-client.test.ts` (mock `@google/generative-ai`'s `GoogleGenerativeAI` class; capture `getGenerativeModel(params, requestOptions)` args, `startChat`, and `sendMessageStream(content, options)` args; return `{ stream: asyncIterable }`): (a) `streamChat`'s `getGenerativeModel` request options contain NO `timeout`; (b) `sendMessageStream` receives `{ signal: AbortSignal }`; (c) `chatOnce`'s `getGenerativeModel` request options DO contain `timeout === PROVIDER_REQUEST_TIMEOUT_MS`; (d) guard timeout → `onError` message contains "timed out" (fake timers, iterator that never yields and rejects when the captured signal aborts); (e) chunks flow to `onText` and `onDone` gets the full text (happy path).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/gemini-client.test.ts`.

**Acceptance:** no "120s" text remains in `gemini-client.ts` (`grep -n "120s" src/main/ai/gemini-client.ts` → empty); streaming path passes a per-request signal and no model-level timeout; tests green.

### 03E — Bounded + honest Ollama model listing; unreachable ≠ "no models installed"

**Objective:** the per-stream preflight fails in ≤5s with the right error; list endpoints stay `[]`-on-failure but bounded.

**Files:** `dnd-app/src/main/ai/ollama-client.ts`, `dnd-app/src/main/ai/ollama-client.test.ts`, `dnd-app/src/main/ai/ai-service.ts`, `dnd-app/src/main/ai/ai-service.test.ts`.

**Steps:**
1. `ollama-client.ts`: add `const OLLAMA_LIST_TIMEOUT_MS = 5000` (matches `listInstalledModelsDetailed`'s existing 5s). Add a strict variant and re-base the lenient one on it:
   ```ts
   /** List installed models — THROWS on network failure/timeout/non-OK status
    *  (so callers can distinguish "unreachable" from "no models"). 5s bound. */
   export async function fetchOllamaModels(): Promise<string[]> {
     const res = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(OLLAMA_LIST_TIMEOUT_MS) })
     if (!res.ok) throw new Error(`Ollama /api/tags returned HTTP ${res.status}`)
     const data = (await res.json()) as { models?: Array<{ name: string }> }
     return (data.models || []).map((m) => m.name)
   }

   /** Lenient list — [] on any failure (UI list paths). */
   export async function listOllamaModels(): Promise<string[]> {
     try { return await fetchOllamaModels() } catch { return [] }
   }
   ```
2. `ai-service.ts` `resolveOllamaModel` (`:591-609`): import `fetchOllamaModels` (extend the existing `./ollama-client` import) and replace `const installed = await listOllamaModels()` with:
   ```ts
   let installed: string[]
   try {
     installed = await fetchOllamaModels()
   } catch (err) {
     const detail = err instanceof Error ? err.message : String(err)
     throw new Error(
       `Cannot reach Ollama at ${getOllamaUrl()} (${detail}). Check that Ollama is running and the server URL in AI Settings is correct.`
     )
   }
   ```
   Keep the existing `installed.length === 0` → "No Ollama models installed at …" throw unchanged (it is now genuinely about an empty library). The thrown error propagates through `startChat`'s catch → `onError` → renderer, same as the current "No Ollama models" error does.
3. `ai-service.test.ts`: the module mock `vi.mock('./ollama-client', ...)` (test file ~line 73) must add a `fetchOllamaModels` mock alongside `listOllamaModels` — without it every ai-service test fails at import. In the `describe('resolveOllamaModel')` block (~`:611-640`): point the existing cases at `fetchOllamaModels` mocks; add: `fetchOllamaModels` rejects (network) → `resolveOllamaModel('x')` rejects with message containing `Cannot reach Ollama at`; resolves `[]` → message containing `No Ollama models installed` (regression split of the two error classes).
4. `ollama-client.test.ts`: in `describe('listOllamaModels')`, assert the fetch now receives an options object with a `signal` (`expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.objectContaining({ signal: expect.anything() }))`). New `describe('fetchOllamaModels')`: throws on fetch rejection; throws `HTTP 500` on non-ok; returns names on success.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/ollama-client.test.ts src/main/ai/ai-service.test.ts`.

**Acceptance:** `listOllamaModels` fetch carries a 5s signal; unreachable-host failure in `resolveOllamaModel` surfaces "Cannot reach Ollama at <url>", empty library surfaces "No Ollama models installed"; `AI_LIST_INSTALLED_MODELS`/`checkProviders`/`ollamaProvider.listModels` keep `[]`-on-failure semantics (no caller changes needed).

### 03F — ollama-manager model operations honor the configured `ollamaUrl`

**Objective:** pull/delete/details target the same server the model dropdown lists.

**Files:** `dnd-app/src/main/ai/ollama-manager.ts`, `dnd-app/src/main/ai/ollama-manager.test.ts`.

**Steps:**
1. Extend the existing import at `ollama-manager.ts:5` to `import { getOllamaUrl, listOllamaModels } from './ollama-client'` (no cycle — verified `ollama-client` imports only `./ollama-constants`).
2. Swap `OLLAMA_BASE_URL` → `getOllamaUrl()` in exactly three fetches: `pullModel` (`:458` → `${getOllamaUrl()}/api/pull`), `listInstalledModelsDetailed` (`:519` → `${getOllamaUrl()}/api/tags`), `deleteModel` (`:622` → `${getOllamaUrl()}/api/delete`).
3. Add a short comment block above `detectOllama` documenting the deliberate split: *model registry operations (pull/delete/list-details) follow the configured server URL; binary lifecycle operations (detect/start/stop/version/update) always target localhost because they manage the locally installed binary.* Leave `detectOllama`/`startOllama`/`stopOllama`/`getOllamaVersion`/`checkOllamaUpdate`/`updateOllama`/`ensureOllamaUsesDedicatedGpu` on `OLLAMA_BASE_URL` untouched.
4. `ollama-manager.test.ts`: the test file currently has no `./ollama-client` mock for `getOllamaUrl` — add it (extend or create the `vi.mock('./ollama-client', ...)` factory to export `getOllamaUrl: vi.fn(() => 'http://remote-gpu:11434')` plus the existing `listOllamaModels` passthrough the file needs). Add tests asserting `pullModel`, `deleteModel`, and `listInstalledModelsDetailed` fetch `http://remote-gpu:11434/...` URLs, and (regression) `getOllamaVersion` still fetches `http://localhost:11434/api/version`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/ollama-manager.test.ts`.

**Acceptance:** `grep -n "OLLAMA_BASE_URL" src/main/ai/ollama-manager.ts` shows hits ONLY in the import/re-export and the binary-lifecycle functions (`:174,345,383,427,555` equivalents post-PHASE-01-drift); the three registry operations use `getOllamaUrl()`; tests green.

### 03G — `getConfig()` stops clobbering in-memory state; non-stream paths resolve the model

**Objective:** the model auto-switch survives the session; `chatOnce` summaries and vision stop using a known-missing model.

**Files:** `dnd-app/src/main/ai/ai-service.ts`, `dnd-app/src/main/ai/ai-service.test.ts`, `dnd-app/src/main/ai/ai-vision.ts`.

**Steps:**
1. `ai-service.ts`: extract the disk read out of `getConfig()` (`:376-401`) into an exported `loadConfigFromDisk(): void` containing the current `existsSync`/`readFileSync`/`JSON.parse` → `currentConfig = {...}` body (including the legacy `ollamaModel` fallback and the swallow-and-default catch). `getConfig()` becomes a pure in-memory snapshot (returns the same shallow copy it already builds at `:394-401`, no disk access). `initFromSavedConfig()` (`:405-411`) calls `loadConfigFromDisk()` first, then `const config = getConfig()` and the rest unchanged. Add a comment on `getConfig` noting `ai-config.json` has exactly one writer (`configure`'s atomic write) and one load point (startup), so in-memory state is authoritative — this is what keeps `resolveOllamaModel`'s auto-switch (`currentConfig.model = picked`, `:602`) from reverting on ChatPanel mount / AI settings open / map analysis.
2. `ai-service.ts` `chatOnce` (`:935-938`): resolve the model before use — `const model = await resolveOllamaModel(currentConfig.model)` (no `streamId`, so no renderer notice; the function no-ops for cloud providers at `:592`). Pass `model` to `provider.chatOnce`. This closes the "summaries fail with a 404 on the missing configured model until the first stream auto-switches" gap.
3. `ai-vision.ts` (`:210-218`): in the lazy `require('./ai-service')` destructure, also pull `resolveOllamaModel`; make `getModelForProvider` async (`return await resolveOllamaModel(getConfig()?.model || DEFAULT_AI_MODEL)`) and `await` it at its call sites inside this file (the analyze functions are already async; verified the single consumer pattern at `:192`). Adjust the destructure's inline type annotation accordingly.
4. `ai-service.test.ts`: rewrite `describe('getConfig')` (`:255-295`) — the four disk-behavior tests move to a new `describe('loadConfigFromDisk')` (call `loadConfigFromDisk()` then assert via `getConfig()`; same `existsSync`/`readFileSync` mocks, same expectations). Add two new tests: (a) `getConfig()` does NOT touch disk (`existsSync`/`readFileSync` not called when invoking `getConfig()` alone — reset mock call counts first); (b) auto-switch survives: configure model `'ghost-model'`, make the mocked installed list return `['real-model']`, `await resolveOllamaModel('ghost-model')`, then `getConfig().model === 'real-model'` even with `existsSync` primed to offer a stale disk file. Update the `chatOnce`-dependent tests if any assert the un-resolved model id (check `summarizeText`/world-state extraction tests in the file; the `./ollama-client` mock from 03E already provides `fetchOllamaModels`).
5. Sanity-check remaining `getConfig()` call sites are happy with in-memory semantics: `ai-handlers.ts:124-126` (AI_GET_CONFIG — yes, settings UI should see live state), `ai-vision.ts` (step 3), `initFromSavedConfig` (step 1). Verified there are no other main-process callers (`grep -rn "getConfig\b" src/main --include='*.ts' | grep -v test`).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/ai-service.test.ts`.

**Acceptance:** `getConfig()` contains no `readFileSync`; `loadConfigFromDisk` exported and called from `initFromSavedConfig`; `chatOnce` + vision resolve through `resolveOllamaModel`; new tests green.

## Research notes

- **Inactivity-based streaming timeouts (approach):** the repo already proved this pattern on Ollama (`ollama-client.ts:77-86`, shipped v2.4.48–v2.4.50 for the "5 min then timed out, no output" class). Cloud differs in one respect: server-side prefill is fast, so a *bounded* first-token window (90s) is kept — preserving the original Phase 17d intent that a dead provider is classified and surfaced **before** the renderer's 330s backstop (`llm-provider.ts:77-84` invariant; renderer re-arm behavior at `use-ai-dm-store.ts:138-162`). Alternative considered: simply raising the wall-clock cap (e.g. to 330s) — rejected: any fixed total-duration cap still kills sufficiently long narrations and re-creates the bug at a different number.
- **OpenAI `max_completion_tokens`:** `max_tokens` is deprecated API-wide and rejected by o-series reasoning models; `max_completion_tokens` is the replacement and covers reasoning tokens. Sources: [OpenAI community — why was max_tokens changed](https://community.openai.com/t/why-was-max-tokens-changed-to-max-completion-tokens/938077), [OpenAI API reference — chat](https://platform.openai.com/docs/api-reference/chat), [simonw/llm#724 (o1 requires max_completion_tokens)](https://github.com/simonw/llm/issues/724), [OpenAI help center — controlling response length](https://help.openai.com/en/articles/5072518-controlling-the-length-of-openai-model-responses). Caveat found: "Unrecognized request argument: max_completion_tokens" reports trace to **Azure** OpenAI with old `api-version`s ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/2139738/openai-badrequesterror-error-code-400-((error-((me)) — irrelevant here (this app calls api.openai.com via the official SDK; `openai@6.39.1` types confirm the param).
- **o-series system/developer roles:** o1-and-newer accept `system` (treated as `developer` server-side per [Azure reasoning-models doc](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/reasoning)); o1-mini and o1-preview reject **both** `system` and `developer` ([community: developer role not accepted for o1-mini](https://community.openai.com/t/developer-role-not-accepted-for-o1-o1-mini-o3-mini/1110750), [community: o1 supports system, o1-mini does not](https://community.openai.com/t/o1-supports-system-role-o1-mini-does-not/1071954), [openai-dotnet#330](https://github.com/openai/openai-dotnet/issues/330)). Hence the chosen fix: keep `system` for everything, fold the prompt into the first user message only for `o1-mini`/`o1-preview`. Alternative considered: always send `developer` — rejected (GPT-series semantics + o1-mini still rejects it).
- **Anthropic SDK:** default client timeout 10 minutes, per-request `signal` supported, streams cancellable via signal or `stream.controller.abort()`; SDK retries *timeouts* by default but never retries caller aborts — so the external guard signal cleanly bypasses SDK retry. Sources: [anthropic-sdk-typescript repo/README](https://github.com/anthropics/anthropic-sdk-typescript); locally verified `node_modules/@anthropic-ai/sdk/client.js:791` (`DEFAULT_TIMEOUT = 600000`), `internal/request-options.d.ts:56` (`signal`), `lib/MessageStream.d.ts:8` (`streamEvent`).
- **Gemini SDK:** `@google/generative-ai` is **deprecated/EOL** upstream in favor of `@google/genai` ([deprecated-generative-ai-js](https://github.com/google-gemini/deprecated-generative-ai-js), [migration guide](https://ai.google.dev/gemini-api/docs/migrate)) — migration is deliberately NOT part of this phase (see Out of scope). Within the installed 0.24.1: `SingleRequestOptions.signal` exists, per-call options merge over model-level via `Object.assign` (so an unset per-call `timeout` does NOT cancel the model-level one — the model-level timeout must be removed for streaming), and the signal/timeout are attached to the fetch's AbortController, aborting mid-stream reads. All verified directly in `node_modules/@google/generative-ai/dist/index.js:441-456,1222-1236` and `dist/generative-ai.d.ts:1297-1307`.
- **undici timeouts (why the unbounded `listOllamaModels` hang reaches minutes):** Node's built-in fetch (undici) defaults to 300s `headersTimeout`/`bodyTimeout` — a TCP-connected-but-stalled server holds the preflight ~300s; a connect-refused fails in seconds; an unrouteable address can sit in connect for ~10s+ depending on OS. Source: [undici docs](https://github.com/nodejs/undici#undicifetchinput-init-promise).
- **Error-message contract:** new timeout messages include the literal words "timed out" because `streamWithRetry` fail-fasts on `/tim(e|ed)\s*out/i` (`ai-service.ts:202`) — retrying a timeout just multiplies the wait (comment at `ai-service.ts:198-205`). Post-first-token failures are already non-retryable via `streamChatRetryable`'s `hadText` branch (`ai-service.ts:246-256`).
- **Behavior risk assessment:** all changes are strict bug-fix relaxations (streams that previously died now finish; operations that hit the wrong host now hit the configured one; errors become accurate). No new user-visible features → no opt-in flags warranted. The only semantically new surface is the o1-mini prompt folding, which converts a guaranteed 400 into a working request.

## Test plan

Per sub-phase (cheap, targeted — per INSTRUCTIONS.md rule 5):
- 03A: NEW `src/main/ai/llm-provider.test.ts` — guard timing/abort/clear/caller-signal semantics (fake timers).
- 03B: UPDATED `src/main/ai/claude-client.test.ts` — signal passed, streamEvent bump registered, "timed out" error path.
- 03C: NEW `src/main/ai/openai-client.test.ts` — `max_completion_tokens`, `maxTokens` forwarding, o1-mini folding, gpt-4o system retention, guard timeout, listModels regression.
- 03D: NEW `src/main/ai/gemini-client.test.ts` — no model-level timeout in streaming, per-request signal, chatOnce timeout retained, guard timeout, happy-path chunks.
- 03E: UPDATED `src/main/ai/ollama-client.test.ts` (signal on list fetch; `fetchOllamaModels` strict semantics) + UPDATED `src/main/ai/ai-service.test.ts` (mock factory gains `fetchOllamaModels`; unreachable-vs-empty error split).
- 03F: UPDATED `src/main/ai/ollama-manager.test.ts` (configured-URL assertions for pull/delete/details; localhost regression for version).
- 03G: UPDATED `src/main/ai/ai-service.test.ts` (`loadConfigFromDisk` describe, getConfig-no-disk test, auto-switch-survives test).

End-of-phase 4-gate (ONCE, after 03G — rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`. No Pi code touched → no pytest. Then ONE commit + push and move this plan to `completed/` (rule 8).

## Acceptance criteria

1. No cloud provider streaming path aborts on total stream duration; all three use first-token (90s) + inter-token inactivity (90s) guards, with timeout errors containing "timed out" (no-retry contract).
2. `llm-provider.ts` and `gemini-client.ts` contain no stale "120s" references; `PROVIDER_REQUEST_TIMEOUT_MS` documentation matches its actual (non-streaming-only) role.
3. `openai-client.ts` sends `max_completion_tokens` (never `max_tokens`), declares + forwards `maxTokens` in both methods, and produces no `system`/`developer` role for o1-mini/o1-preview.
4. `listOllamaModels` is bounded at 5s; `resolveOllamaModel` distinguishes "Cannot reach Ollama at <url>" from "No Ollama models installed"; list-UI paths keep `[]`-on-failure.
5. `pullModel`/`deleteModel`/`listInstalledModelsDetailed` target `getOllamaUrl()`; binary-lifecycle functions still target localhost.
6. `getConfig()` performs no disk I/O; `loadConfigFromDisk()` is the single load point (startup); the Ollama model auto-switch survives ChatPanel mount, AI-settings open, and map analysis; `chatOnce` and vision resolve the model before use.
7. All new/updated test files pass; the end-of-phase 4-gate is green; no IPC channels/schemas or renderer files changed.

## Out of scope

- Ollama `num_ctx`/`keep_alive`/options-block + `contextSize` wiring — **PHASE-01**.
- Renderer status/labels for providers, AiProviderSetup wizard UX (silent detect failure, dropdown states), hardcoded "Ollama" strings — **PHASE-10**.
- Stream-listener lifecycle leaks (AiProviderSetup/OllamaManagement renderer listeners, preload unsubscribe) — **PHASE-05**.
- Connection-status badge / token-breakdown observability — **PHASE-14**.
- Structured outputs (`format`/JSON-schema constraints, two-call extraction, repairJson retirement) — **PHASE-23** (depends on this phase).
- Migrating `@google/generative-ai` → `@google/genai` (upstream EOL) — not allocated to any phase; if desired, log to `docs/SUGGESTIONS-LOG-DNDAPP.md` during execution per rule 12 rather than expanding this phase.
- Per-task model routing / mid-campaign model swap UI — **PHASE-29**.

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)*
