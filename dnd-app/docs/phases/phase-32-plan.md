# Phase 28 — dnd-app Audit Follow-Ups (2026-05-12)

> Origin: comprehensive dnd-app audit at `~/.claude/plans/your-job-is-to-wild-thacker.md` (2026-05-12).
> Every finding from that audit is logged across `docs/ISSUES-LOG-DNDAPP.md`, `docs/SECURITY-LOG.md`, and `docs/SUGGESTIONS-LOG-DNDAPP.md` (entries dated 2026-05-12).
> This phase plan groups all of them into 9 sub-phases (28a–28i) for execution. **User approved all items, including minor / future / out-of-scope (2026-05-12).**

---

## Architecture & Environment

- **Target:** all work in `dnd-app/` on the Windows 11 / macOS dev box (`/home/patrick/home-lab/dnd-app/` on the Pi mirror).
- **No work on BMO / Pi** in this phase. (BMO is the trust counterparty for 28a but its side is already done — see `bmo/pi/app.py:163-178`.)
- **No restructuring** of `src/{main,preload,renderer,shared}/` — electron-vite layout is fixed (logged gotcha).
- **Discipline:** commit per sub-phase; do NOT bundle 28a + 28b. Each sub-phase merges or pauses for review on its own.

---

## Sub-Phase Ordering Rationale

The order prioritizes (1) live security exposure first, (2) game-mechanic correctness second, (3) external-surface correctness (network / AI) third, (4) internal hygiene last.

| Sub-phase | Theme | Why this order |
|-----------|-------|----------------|
| 28a | Critical security & game integrity | Sync receiver is LAN-exposed today; Math.random affects every roll |
| 28b | AI surface refresh | Stale models, missing cache, SDK lag — user-visible cost / quality |
| 28c | Network resilience | BMO bridge bugs surface as random flaky Discord sync |
| 28d | Data integrity & type safety | Latent bugs in stat-mutations + save-queue; type hygiene |
| 28e | CI hardening | Gate must exist before later phases land or they regress immediately |
| 28f | UI / UX polish | Lower urgency; many small items |
| 28g | Docs & long tail | After implementation lands so docs reflect reality |
| 28h | Test coverage uplift | After CI is in place to enforce future tests |
| 28i | Coverage-gap audits | Knowledge work to drive a Phase 29 if needed |

---

## Sub-Phase 28a — Critical Security & Game Integrity

**Audit entries covered:**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Math.random for game-affecting rolls (25+ sites) — **Critical**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] readBody unbounded buffer — **Low** (companion to security M)
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] JSON.parse unguarded in game-data-handlers.ts:29 — **Low**
- `SECURITY-LOG.md` [2026-05-12] BMO sync receiver binds 0.0.0.0 — **High**
- `SECURITY-LOG.md` [2026-05-12] Wildcard CORS on BMO sync receiver — **High**
- `SECURITY-LOG.md` [2026-05-12] BMO sync receiver no zod validation on inbound JSON — **High**
- `SECURITY-LOG.md` [2026-05-12] VTT → BMO never sends Authorization: Bearer — **High**
- `SECURITY-LOG.md` [2026-05-12] No rate limiting on sync receiver — **Medium**
- `SECURITY-LOG.md` [2026-05-12] No max-body-size guard on sync receiver — **Medium**

### Step 28a.1 — Replace Math.random across game-roll sites

**Files (25+ sites — full list in ISSUES-LOG-DNDAPP entry):**
- Critical d20 paths: `src/renderer/src/components/game/GameLayout.tsx:781`, `src/renderer/src/components/game/overlays/ReactionPrompts.tsx:195`, `src/renderer/src/components/game/overlays/GamePrompts.tsx:124, 240`, `src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx:85`
- Death-save / bless / recovery: `src/renderer/src/components/game/overlays/PlayerHUDEffects.tsx:231, 278, 297`
- Character builder: `src/renderer/src/stores/builder/types.ts:44` (4d6)
- DM tools: `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx:74`, `src/renderer/src/components/game/modals/dm-tools/NPCGeneratorModal.tsx:50, 54`, `src/renderer/src/components/game/modals/dm-tools/treasure-generator-utils.ts:66, 72`, `src/renderer/src/components/game/sidebar/TablesPanel.tsx:79, 115, 123`
- Data tables: `src/renderer/src/data/starting-equipment-table.ts:71`, `src/renderer/src/data/bastion-events.ts:14`, `src/renderer/src/data/sentient-items.ts:49`, `src/renderer/src/data/personality-tables.ts:20`, `src/renderer/src/data/weather-tables.ts:106, 115`
- Utility: `src/renderer/src/utils/dawn-recharge.ts:27`

**Approach:**
1. Add `import { cryptoRollDie, cryptoRandom } from '@renderer/utils/crypto-random'` per file
2. Single-die: `Math.floor(Math.random() * N) + 1` → `cryptoRollDie(N)`
3. Random index: `Math.floor(Math.random() * arr.length)` → `Math.floor(cryptoRandom() * arr.length)`
4. Weighted random (weather-tables.ts:106): `Math.random() * total` → `cryptoRandom() * total`
5. Range: `min + Math.random() * (max - min)` → `min + cryptoRandom() * (max - min)`
6. Skip tests (`*.test.*`) — keep `Math.random` there (mocked anyway)

**Acceptance:**
- `grep -rn "Math\.random" --include='*.ts' --include='*.tsx' src/renderer/ | grep -v '\.test\.'` returns only acceptable cases (UI ephemeral ids in DiceOverlay.tsx:124, if intentionally kept) — ideally 0
- All game-roll vitest tests still pass
- Manual: roll initiative on a token, confirm value lands in [1, 20]

**Future-proofing:** Add a biome rule (or simple grep-based pre-commit) that flags `Math.random` outside `utils/crypto-random.ts` and `*.test.*`.

### Step 28a.2 — Harden BMO sync receiver (loopback + CORS + body limits)

**Files:** `src/main/bmo-bridge.ts`

**Changes:**
1. Line 16: keep `SYNC_RECEIVER_PORT` env-overridable.
2. Add `const SYNC_BIND = process.env.BMO_SYNC_BIND ?? '127.0.0.1'` (default loopback; explicit opt-in to `0.0.0.0`).
3. Line 201: `syncServer.listen(port, SYNC_BIND, …)`.
4. Lines 118, 147: drop `'Access-Control-Allow-Origin': '*'` entirely on loopback bind. If `SYNC_BIND === '0.0.0.0'`, set to the configured BMO origin instead (parse from `getBmoBaseUrl()`).
5. Add `MAX_BODY_BYTES = 64_000` constant. In `readBody`, track running total and `req.destroy()` + reject if exceeded. In handlers, reject if `Content-Length` header exceeds it up-front.
6. Reject any POST whose `Content-Type !== 'application/json'` with 415.
7. Token-bucket rate limit: per-source-IP, 60 events / minute, 429 on overflow. Use a `Map<string, { tokens, lastRefill }>`.
8. Log inbound source IP via `logToFile('INFO', 'sync from', req.socket.remoteAddress)`.

**Acceptance:**
- `curl http://0.0.0.0:5001/api/sync` from another LAN machine fails to connect when `BMO_SYNC_BIND` unset
- `curl http://127.0.0.1:5001/api/sync` from the same machine succeeds
- Posting >64 KB returns 413
- Posting non-JSON returns 415
- Posting 100 events in 10 s gets the last 40 rejected with 429

### Step 28a.3 — Add zod validation to sync receiver

**Files:** `src/main/bmo-bridge.ts`, `src/shared/ipc-schemas.ts`

**Changes:**
1. In `ipc-schemas.ts`, add `SyncEventSchema` as a discriminated union on the `type` field:
   ```ts
   const SyncEventSchema = z.discriminatedUnion('type', [
     z.object({ type: z.literal('discord_message'), payload: z.object({ /* … */ }), timestamp: z.number() }),
     z.object({ type: z.literal('initiative_sync'), payload: z.object({ /* … */ }), timestamp: z.number() }),
     // … one per type
   ])
   const InitiativeSyncSchema = z.object({ /* … */ })
   ```
2. In `bmo-bridge.ts:163-178`, after `const body = await readBody(req)`, do `const parsed = SyncEventSchema.safeParse(JSON.parse(body))`. On failure, 400 with the issues; on success, forward `parsed.data`.
3. Same for `/api/sync/initiative` with `InitiativeSyncSchema`.
4. Add `logToFile('WARN', 'sync event rejected', parsed.error.issues)` on failure.

**Acceptance:**
- Posting a `SyncEvent` with `type: 'banana'` returns 400, not 200
- Posting a valid event still forwards to the renderer
- Renderer-side handlers do NOT need changes (zod-narrowed shape matches the existing TS type)

### Step 28a.4 — Authorization Bearer to BMO

**Files:** `src/main/bmo-config.ts`, `src/main/bmo-bridge.ts`, `src/main/ipc/settings-handlers.ts` (or wherever settings I/O lives), settings UI panel.

**Changes:**
1. In `bmo-config.ts`, add `getBmoApiKey()`: read order = env (`BMO_API_KEY`) > settings (decrypted via `safeStorage`) > undefined.
2. In `bmo-bridge.ts:31-53`, in `bmoPiFetch`, inject `Authorization: Bearer ${apiKey}` into headers when `getBmoApiKey()` returns a value.
3. Add a `bmoApiKey` field to `settings.json` schema; wrap with `safeStorage.encryptString` on write (mirror the `2026-04-24-encrypt-persisted-secrets` pattern).
4. Add a settings-UI surface ("BMO connection" panel): text field for the key, "Test connection" button that calls `getDmStatus` and reports auth pass/fail.
5. Update `dnd-app/README.md` with the env-var / settings flow.

**Acceptance:**
- With BMO `BMO_API_KEY` unset on the Pi: dnd-app behaves identically to before
- With BMO `BMO_API_KEY` set on the Pi + matching key in dnd-app settings: all `bmoPiFetch` calls succeed
- With BMO `BMO_API_KEY` set on the Pi + missing key in dnd-app: calls return `{ ok: false, error: 'HTTP 401: …' }` and the UI shows an actionable error
- `getBmoApiKey()` unit test confirms env precedence over settings

### Step 28a.5 — Add error containment to `game:load-json` JSON.parse

**Files:** `src/main/ipc/game-data-handlers.ts:29`

**Changes:**
1. Wrap `JSON.parse(content)` in a local try/catch.
2. On parse failure, throw `Error('INVALID_JSON: ' + relativePath)` so renderer-side handlers see a typed error code.
3. Add a vitest case loading a malformed JSON fixture.

**Acceptance:** Renderer surfaces a useful error message (not a generic IPC reject) on corrupted 5e data file.

---

## Sub-Phase 28b — AI Surface Refresh

**Audit entries covered:**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Claude model strings stale — **High**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] `@anthropic-ai/sdk@^0.78.0` pre-1.x — **High**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] claude-client hardcodes max_tokens 4096 — **Medium**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] No Anthropic prompt caching wired — **Medium**

### Step 28b.1 — Update Claude model list (per Jan 2026 knowledge cutoff)

**Files:**
- `src/main/ai/llm-provider.ts:20-22` — registry
- `src/main/ai/claude-client.ts:96` — `isAvailable()` ping model
- `src/main/ai/claude-client.ts:107` — `listModels()`
- `src/renderer/src/components/campaign/AiProviderSetup.tsx:251` — UI default
- `src/shared/ipc-schemas.test.ts:18` — test fixture

**Changes:** Add the current Claude 4.x family (Opus 4.7, Sonnet 4.6, Haiku 4.5). Keep the older ids as deprecated for back-compat. Bump `isAvailable()` to ping Haiku 4.5.

```ts
// llm-provider.ts:20
{ id: 'claude-opus-4-7',            name: 'Claude Opus 4.7',    desc: 'Most capable; best for long DM narration' },
{ id: 'claude-sonnet-4-6',          name: 'Claude Sonnet 4.6',  desc: 'Best balance of speed and intelligence' },
{ id: 'claude-haiku-4-5-20251001',  name: 'Claude Haiku 4.5',   desc: 'Fastest; good for quick responses' },
// keep older entries for back-compat (mark deprecated)
{ id: 'claude-sonnet-4-20250514',   name: 'Claude Sonnet 4',    desc: '(deprecated) prior generation' },
```

**Acceptance:**
- AI Provider UI dropdown shows new models first
- A new fresh campaign defaults to Sonnet 4.6
- Existing campaigns referencing older ids continue to work
- API key validation pings Haiku 4.5

### Step 28b.2 — Bump `@anthropic-ai/sdk` to 1.x

**Files:** `dnd-app/package.json`, `src/main/ai/claude-client.ts`

**Changes:**
1. `npm install @anthropic-ai/sdk@^1.0.0` (or latest 1.x)
2. Update imports — the 1.x line moved some named exports; check `node_modules/@anthropic-ai/sdk/CHANGELOG.md` for the migration notes
3. Run `npm run lint && npx tsc --noEmit && npm test` — fix any breakages in claude-client
4. Add a smoke test that the SDK still streams a simple message

**Blocks:** 28b.3 (prompt caching uses the 1.x helpers).

### Step 28b.3 — Wire Anthropic prompt caching

**Files:** `src/main/ai/claude-client.ts`, `src/main/ai/context-builder.ts`

**Changes:**
1. Restructure the `system` param into an array of content blocks (the 1.x SDK pattern) so the stable prefix (system prompt + character / campaign context) is one block, the per-turn user message is another.
2. Mark the stable prefix block with `cache_control: { type: 'ephemeral' }`.
3. Read the response's `usage.cache_creation_input_tokens` and `usage.cache_read_input_tokens`; surface in dev logs.
4. Add a vitest assertion that the `cache_control` field reaches the SDK call (mock the SDK, capture the args).

**Acceptance:**
- Second user turn in the same session reads from cache (verify in dev logs)
- Token cost per turn drops measurably for long-context conversations
- No behavior regression in non-cached short conversations

### Step 28b.4 — Make `max_tokens` model-aware

**Files:** `src/main/ai/claude-client.ts:40, 77`, `src/main/ai/llm-provider.ts`, `src/renderer/src/components/campaign/AiProviderSetup.tsx`

**Changes:**
1. Add `maxTokens?: number` to `LLMProvider.streamChat` / `chatOnce` signatures.
2. In claude-client, default to: Opus → 16384, Sonnet/Haiku → 8192.
3. Surface "Max response length" slider (1k → 16k) in AiProviderSetup.

---

## Sub-Phase 28c — Network Resilience

**Audit entries covered:**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] `bmoPiFetch` no retry / backoff — **High**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] BridgeResponse.ok vs .error contract inconsistent — **High**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] stopSyncReceiver doesn't await in-flight — **Medium**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] bmo-config.ts default hardcoded — **Medium**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] peerjs reconnection absent — **Low**
- `SECURITY-LOG.md` [2026-05-12] ELECTRON_RENDERER_URL passed to loadURL without validation — **Low**

### Step 28c.1 — Retry/backoff for `bmoPiFetch`

**Files:** `src/main/bmo-bridge.ts:31-53`

**Changes:**
1. Wrap in retry helper: 3 attempts, backoff 200 / 800 / 2000 ms.
2. Don't retry on 4xx (auth errors, bad request — retry won't fix).
3. Track consecutive failures; after 3, emit a renderer toast via IPC ("BMO unreachable — Discord sync paused").
4. Reset failure counter on first success.

### Step 28c.2 — Normalize `BridgeResponse` contract

**Files:** `src/main/bmo-bridge.ts:18-22` plus every caller in `src/main/`.

**Changes:**
1. Change `BridgeResponse` to a discriminated union:
   ```ts
   type BridgeResponse =
     | { ok: true; data: unknown }
     | { ok: false; error: string; statusCode?: number }
   ```
2. Always set `ok` explicitly.
3. Wrap server data under `data` (don't spread into the top level).
4. Codemod every caller (`if (!result.error)` → `if (result.ok)`).

### Step 28c.3 — `stopSyncReceiver` graceful shutdown

**Files:** `src/main/bmo-bridge.ts:212-218`, `src/main/index.ts` (before-quit wiring)

**Changes:**
1. Call `syncServer.closeAllConnections()` (Node 18.2+) before `syncServer.close()`.
2. Make `stopSyncReceiver` return a `Promise<void>` that resolves after the server fully closes.
3. Wire into `app.on('before-quit', async (e) => { e.preventDefault(); await stopSyncReceiver(); app.exit() })`.

### Step 28c.4 — Document `bmoBaseUrl` override chain

**Files:** `src/main/bmo-config.ts`, `dnd-app/README.md`, settings UI

**Changes:**
1. Add JSDoc to `bmo-config.ts` explaining the precedence (env > settings > default).
2. Confirm `BMO_PI_URL` env-var precedence (or add it if missing).
3. Add a settings-UI surface for the base URL.

### Step 28c.5 — peerjs reconnection

**Files:** `src/renderer/src/network/*.ts` (audit first to find the right insertion point)

**Changes:**
1. Read all 25 files in `src/renderer/src/network/` to find the existing disconnect handler (if any).
2. If absent, add `peer.on('disconnected', () => { peer.reconnect() })` with exponential backoff (1s, 2s, 4s, …, capped at 30s) and a max-attempts cap (10).
3. Surface the reconnect state in the lobby UI (greyed-out "Reconnecting…" badge).

### Step 28c.6 — Validate `ELECTRON_RENDERER_URL`

**Files:** `src/main/index.ts:106-135`

**Changes:**
1. Before `loadURL(process.env.ELECTRON_RENDERER_URL)`, parse via `new URL(env)` (try/catch).
2. Confirm `hostname` is `localhost` or `127.0.0.1`.
3. Confirm `port` is in `[5170, 5180]` (the expected dev port range).
4. On mismatch: fall back to `file://` packaged path + `logToFile('WARN', …)`.

---

## Sub-Phase 28d — Data Integrity & Type Safety

**Audit entries covered:**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] stat-mutations.ts unsafe HP cast + in-place mutation — **Medium**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] save-queue.ts dead cleanup — **Medium**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] ~74 `as unknown as` casts — **Medium**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Effect-dep suppressions in critical hooks — **Medium**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Date.now()-based condition IDs — **Low**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] UUID truncation pattern audit needed — **Low**

### Step 28d.1 — Type the character pipeline through to `stat-mutations.ts`

**Files:**
- `src/renderer/src/types/character-5e.ts:136` (source of `HitPoints`)
- `src/main/ai/stat-mutations.ts:160-220`
- `src/main/ai/character-context.ts:43`
- Move `Character5e` / `HitPoints` types to `src/shared/` so main + renderer share them

**Changes:**
1. Move the shared types into `src/shared/types/character-5e.ts`.
2. Update `stat-mutations.ts` signature: `applyChange(char: Character5e, change: StatChange): void` (or `Character5e` return).
3. Drop the per-case `as { current; maximum; temporary }` casts.
4. Decide: keep in-place mutation (document loudly) OR refactor to return a new object piped through call sites.
5. Add a vitest that exercises every `StatChange` case (damage/heal/temp_hp/condition adds/removes/death-save/exhaustion).

### Step 28d.2 — Finish or remove the `save-queue.ts` dead cleanup

**Files:** `src/main/storage/save-queue.ts`

**Changes (preferred): store stable handle for the equality check.**
```ts
const queueHandle = next.catch(() => undefined)
queues.set(key, queueHandle)
try { return await next } finally {
  if (queues.get(key) === queueHandle) queues.delete(key)
}
```
- Delete the dead comment block.
- Add a vitest: enqueue 100 saves, wait for quiesce, confirm `queues.size === 0`.

### Step 28d.3 — `as unknown as` pass

**Files:** broad — primary hotspots `src/renderer/src/services/library-service.ts:639, 678-679, 694, 702, 710`, plus 7+ test helpers

**Changes:**
1. Cluster the 74 casts by boundary (IPC, JSON-from-disk, third-party SDK, test mock).
2. For known-shape data: zod parse at the boundary; downstream gets the typed result.
3. For truly dynamic (plugin payloads): document the cast with a comment ("plugin-supplied; no schema possible").
4. Target: < 40 casts outside tests after the pass.

### Step 28d.4 — Effect-dep suppression audit

**Files:**
- `src/renderer/src/components/game/GameLayout.tsx:407`
- `src/renderer/src/hooks/use-game-effects.ts:144, 307`
- `src/renderer/src/hooks/use-game-network.ts:92`

**Per site:**
1. Attempt the honest dep list; if it causes a render loop, refactor the surrounding state (don't suppress).
2. Where the dep really is provably stable (`useState` setter, `useRef` current), narrow the comment ("setter ref stable per React docs").
3. Add a vitest exercising a state change that should re-run the effect.

### Step 28d.5 — Date.now()-based IDs → `crypto.randomUUID()`

**Files:** `src/renderer/src/components/game/overlays/PlayerHUDEffects.tsx:234, 300`, plus any other `id: \`cond-${Date.now()}\`` pattern

**Changes:**
1. Grep for `\`cond-\${Date.now()` / similar.
2. Replace with `crypto.randomUUID()` (or a scoped `idFor('cond')` helper).
3. Add a unit test that two rapid calls produce distinct ids.

### Step 28d.6 — UUID truncation audit

**Files:** ~40+ sites using `crypto.randomUUID().slice(0, 8)`

**Changes:**
1. Enumerate sites by purpose: "UI ephemeral" (OK to truncate) vs "persistent game state" (full UUID required).
2. Migrate the persistent-state sites to full UUIDs.
3. Add helper pair: `ephemeralId(prefix?)` (for UI-only) and `entityId()` (for persistent state) to make intent explicit.

---

## Sub-Phase 28e — CI Hardening

**Audit entries covered:**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] dnd-app CI minimal — **Medium**
- `SUGGESTIONS-LOG-DNDAPP.md` [2026-04-24] Add `npm run check:full` aggregate script — **future-idea** (composes here)

### Step 28e.1 — Add `npm run check:full` aggregate

**Files:** `dnd-app/package.json`

**Changes:**
```json
"check:full": "npm run lint && tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json && npm test && npm run circular && npm run dead-code && npm run audit:ci"
```

### Step 28e.2 — Add `.github/workflows/dnd-app-ci.yml`

**Files:** new `.github/workflows/dnd-app-ci.yml`

**Trigger:** `push` and `pull_request` on `paths: ['dnd-app/**', '.github/workflows/dnd-app-ci.yml']`.

**Jobs:**
- `setup-node@v4` with `node-version: 22`, `cache: npm`, `cache-dependency-path: dnd-app/package-lock.json`
- `npm ci`
- `npm run lint`
- `npx tsc --noEmit -p tsconfig.web.json`
- `npx tsc --noEmit -p tsconfig.node.json`
- `npm test`
- `npm run audit:ci`
- `npm run circular`
- `npm run dead-code` (allow-fail until knip baseline is clean — `continue-on-error: true`)

**Acceptance:**
- A PR that breaks `tsc` fails the job
- A PR that adds a circular dep fails the job
- A PR that drops a test fails the job

---

## Sub-Phase 28f — UI / UX / Graphical Polish

**Audit entries covered:**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Limited aria-* coverage — **Low**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] `<div onClick>` anti-pattern present — **Low**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Silent `.catch()` blocks no UI feedback — **Low**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Color tokens not centralized — **Low**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] z-[9999] magic z-index — **Low**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Window 1024×768 min tight — **Low**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Lists may need virtualization — **Low**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] console.warn for validation failures continues processing — **Low**

### Step 28f.1 — Replace `<div onClick>` with `<button>`

**Approach:**
1. `grep -rn '<div[^>]*onClick' --include='*.tsx' src/renderer` to enumerate.
2. Each one: `<button type="button" className="...">` (preserve Tailwind classes).
3. Where the div must stay (card with nested interactive children), add `role="button" tabIndex={0}` + Enter/Space handler.

### Step 28f.2 — Surface silent `.catch()` errors

**Files:** `src/renderer/src/components/sheet/FeaturesSection5e.tsx:47, 55` + the broader sweep.

**Changes:**
1. Add a `useErrorToast()` hook wrapping the common "log + toast + retry-button" pattern.
2. Per silent-catch site, decide: user-actionable → toast; not → `logToFile` (main-side) instead of `console`.

### Step 28f.3 — Centralize color tokens

**Files:** `tailwind.config`, ~20-30 inline `#hex` sites.

**Changes:**
1. Enumerate: `grep -rn "#[0-9a-fA-F]\{3,6\}" --include='*.tsx' --include='*.ts' --include='*.css' src/renderer`.
2. Triage: chart palettes (intentional inline) vs. theme drift.
3. Tokens to add to Tailwind: any color used > 3 times.

### Step 28f.4 — Z-index layer convention

**Files:** `tailwind.config`, `src/renderer/src/components/sheet/PrintSheet.tsx:27, 67`, `Tooltip.tsx:78`, `LanguagesTab5e.tsx:65`, plus broader

**Changes:**
1. Add a `z-app`, `z-modal-backdrop`, `z-modal`, `z-tooltip`, `z-toast`, `z-overlay-print` token set to Tailwind.
2. Replace magic numbers.
3. Document in new `dnd-app/docs/UI-LAYERS.md`.

### Step 28f.5 — Aria coverage sweep

**Approach:**
1. Top 20 user-traffic components (initiative tracker, dice tray, action buttons, modals, lobby).
2. Per component: icon-only buttons get `aria-label`; list updates get `aria-live`.
3. Don't aim for 100% coverage; aim for "all interactive elements with non-text content".

### Step 28f.6 — Window minimum size check

**Files:** `src/main/index.ts:38-41`

**Changes:**
1. Manually test each panel layout at 1024×768.
2. If broken: bump `minWidth` to 1280, OR add a "compact mode" toggle.
3. Document the minimum supported viewport in `dnd-app/README.md`.

### Step 28f.7 — Profile + virtualize long lists

**Files:** `EncounterLog*.tsx`, journal components, any list rendering > 100 items

**Changes:**
1. React DevTools profile with synthetic 500-entry data.
2. If render > 16 ms, virtualize with `@tanstack/react-virtual` (same lib as chat).
3. Document the "if > 200 items, virtualize" rule.

### Step 28f.8 — console.warn validation handling

**Files:** `src/renderer/src/stores/network-store/client-handlers.ts:67`, `host-handlers.ts:50, 62, 230`

**Changes:**
- Per site: decide throw+catch upstream OR fall-through-with-clearer-comment.
- If thrown, surface as renderer toast via `addSysMsg()`.

---

## Sub-Phase 28g — Docs & Long Tail

**Audit entries covered:**
- `SUGGESTIONS-LOG-DNDAPP.md` [2026-05-12] Document BMO_API_KEY end-to-end flow — **future-idea**
- `SUGGESTIONS-LOG-DNDAPP.md` [2026-05-12] Document plugin trust model — **future-idea**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Two open TODO markers — **Low**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] files-allowlist may leak `docs/` — **Low**

### Step 28g.1 — BMO_API_KEY end-to-end docs

(Depends on 28a.4 landing first.)

**Files:** `dnd-app/README.md`, `src/main/bmo-bridge.ts` (JSDoc), `docs/ARCHITECTURE.md`.

### Step 28g.2 — Plugin trust model docs

**Files:** `dnd-app/docs/PLUGIN-SYSTEM.md`, `dnd-app/README.md`, plugin-install UI.

**Changes:**
1. Add "Trust model" section to PLUGIN-SYSTEM.md.
2. Add warning to plugin-install UI ("Plugins have full access to your game data — only install plugins you trust").

### Step 28g.3 — Close the 2 open TODOs

**Files:**
- `src/renderer/src/components/game/GameLayout.tsx:280` — "TODO: Could enhance to pre-select the specific item"
- `src/renderer/src/components/game/map/map-overlay-effects.ts:27` — "TODO: Add playing state management"

**Approach:** Per TODO, either action it OR convert to a dated `// FIXME: [2026-05-12] …` and confirm it has an entry in `ISSUES-LOG-DNDAPP.md`.

### Step 28g.4 — Verify electron-builder files-allowlist doesn't leak `docs/`

**Files:** `dnd-app/package.json`

**Approach:**
1. Run `electron-builder --dir`; `ls dist/`.
2. If `docs/` present, add `!docs/**/*` to `build.files`.
3. (Optional) Add an `audit:bundle` script that fails CI if forbidden paths slip in.

---

## Sub-Phase 28h — Test Coverage Uplift

**Audit entries covered:**
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] Component test coverage ≈ 42% — **Medium**

### Step 28h.1 — Coverage baseline

**Files:** `dnd-app/.coverage-baseline.json` (new)

**Approach:**
1. Run `npm run test:coverage` to get the authoritative figure (the 42% is a colocated-file proxy).
2. Commit the baseline.
3. Add a CI gate that fails if coverage drops below baseline.

### Step 28h.2 — Lobby / onboarding flow

**Untested files prioritized (game-gating):**
- `src/renderer/src/components/lobby/ReadyButton.tsx`
- `src/renderer/src/components/lobby/CharacterSelector.tsx`
- `src/renderer/src/components/campaign/SessionZeroStep.tsx`

### Step 28h.3 — TokenContextMenu test recovery

**Blocked by:** the `useNetworkStore` circular dep fix (SUGGESTIONS-LOG `2026-04-24-network-store-barrel-circular`). That fix is a prerequisite — run it first or include in 28h.

---

## Sub-Phase 28i — Coverage-Gap Audits

**Audit entries covered:**
- `SUGGESTIONS-LOG-DNDAPP.md` [2026-05-12] Audit coverage gaps — info
- `SUGGESTIONS-LOG-DNDAPP.md` [2026-05-12] discord-service.ts Bot token storage path unverified — info
- `ISSUES-LOG-DNDAPP.md` [2026-05-12] peerjs reconnection logic absent on audited surface — Low (audit follow-up overlaps 28c.5)

### Step 28i.1 — Per-area scoped audits

Each of the 9 gap areas (multiplayer/peerjs, Pixi map rendering, plugin runtime, cloud sync, TipTap, updater, Discord integration, 5e JSON, renderer IPC consumers) gets its own narrow scan:

1. Multiplayer/peerjs — fog-of-war state, host-migration, reconnect (overlaps 28c.5)
2. Pixi map — fog-of-war correctness, viewport math, GPU memory growth
3. Plugin runtime — actual privilege boundary, plugin lifecycle, error containment
4. Cloud sync (rclone) — conflict resolution, partial-failure recovery, retry behavior
5. TipTap — content sanitization on import (paste from web, restore from backup)
6. Updater — signature verification, channel pinning, rollback path
7. Discord integration — bot token storage (overlaps SUGGESTIONS-LOG info entry)
8. 5e JSON — schema correctness (overlaps existing `2026-04-24-schemas-content-mismatch` gotcha)
9. Renderer IPC consumers — every `window.api.*` call site for async-error handling

**Output:** one log entry per finding (per the standard triage table). May spawn a Phase 29.

---

## Cross-Phase Dependencies

| Sub-phase | Blocks | Blocked by |
|-----------|--------|------------|
| 28a.4 (Auth Bearer) | 28g.1 (docs) | — |
| 28b.2 (SDK 1.x bump) | 28b.3 (prompt cache) | — |
| 28e (CI) | 28h (coverage baseline gate) | — |
| 28h.3 (TokenContextMenu tests) | — | `2026-04-24-network-store-barrel-circular` fix |

The user has previously agreed (memory) to phase-by-phase execution: **stop and await approval between every sub-phase**; commit + push BEFORE summarizing. Apply the same discipline within Phase 28 — finish 28a, push, summarize, wait. Don't bundle.

---

## Acceptance Checklist (whole phase)

- [ ] `grep -rn 'Math\.random' --include='*.ts' --include='*.tsx' src/renderer/ | grep -v '\.test\.'` returns only acceptable cases
- [ ] BMO sync receiver binds 127.0.0.1 by default
- [ ] Sync receiver rejects malformed / oversized / wrong-content-type payloads
- [ ] VTT → BMO sends `Authorization: Bearer` when `BMO_API_KEY` is set
- [ ] Claude 4.7 / 4.6 / 4.5 visible in AI Provider UI; prompt caching wired
- [ ] `npm run check:full` exists and runs all gates
- [ ] `.github/workflows/dnd-app-ci.yml` blocks PRs on lint / typecheck / test / audit failures
- [ ] All 2026-05-12 log entries either resolved (moved to `RESOLVED-ISSUES-DNDAPP.md` / `RESOLVED-SECURITY-ISSUES.md`) or have a follow-up Phase 29 entry
