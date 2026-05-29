# Phase 28 — dnd-app Audit Follow-Ups

## Context

This phase rolls up a comprehensive dnd-app code audit (2026-05-12) into one execution plan grouped by theme. Findings landed in `docs/ISSUES-LOG-DNDAPP.md`, `docs/SECURITY-LOG.md`, and `docs/SUGGESTIONS-LOG-DNDAPP.md` (entries dated 2026-05-12). The user approved every item, including minor / future / out-of-scope ones.

The work spans live security exposure on the BMO sync receiver, stale Claude model strings, missing retry / shutdown discipline on the BMO bridge, type-safety hygiene, CI gates, UI polish, and docs. Each sub-phase is committed and pushed independently — no bundling.

The intended outcome: every 2026-05-12 audit entry is either resolved (moved to `RESOLVED-ISSUES-DNDAPP.md` / `RESOLVED-SECURITY-ISSUES.md`) or carried into a follow-up Phase 29.

## Depends on / blocks

- Depends on: Phase 15 (Option A) for the 28a.1 data-tables sweep and 28d.3 `library-service.ts` casts — those files reshape or get deleted; defer scope until they stabilize. Phase 33g for 28h.3 (TokenContextMenu tests blocked by `useNetworkStore` circular dep codemod).
- Blocks: Phase 29 (any items not resolved here cascade forward); Phase 30 / 31 / 32 / 33 inherit several call-site refactors (TransportAdapter consolidation, JWT auth, dual-import resolution, no-bare-writeFile lint).
- Cross-coordination: 28a.2 / 28c.3 / 28c.5 / 28i.1 / 28d.4 land at sites Phase 30 reshapes; 28a.4 token shape must reconcile with Phase 32 WS JWT.

## Files touched

| Path | Role |
|------|------|
| `src/renderer/src/utils/crypto-random.ts` | Existing RNG utility — adoption sweep target |
| `src/renderer/src/components/game/GameLayout.tsx` | d20 roll + dep-suppression site |
| `src/renderer/src/components/game/overlays/ReactionPrompts.tsx` | d20 roll site |
| `src/renderer/src/components/game/overlays/GamePrompts.tsx` | d20 roll site |
| `src/renderer/src/components/game/overlays/PlayerHUDEffects.tsx` | Bless / recovery rolls + Date.now IDs |
| `src/renderer/src/components/game/modals/dm-tools/NPCGeneratorModal.tsx` | Dice + index random |
| `src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx` | d20 roll site |
| `src/renderer/src/components/game/modals/dm-tools/treasure-generator-utils.ts` | Random index |
| `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx` | Random modifier |
| `src/renderer/src/components/game/sidebar/TablesPanel.tsx` | Random index |
| `src/renderer/src/components/lobby/PlayerCard.tsx` | Reconnecting badge (28c.5 already done) |
| `src/renderer/src/data/{starting-equipment-table,bastion-events,sentient-items,personality-tables,weather-tables}.ts` | Tables (deferred per Phase 15) |
| `src/renderer/src/stores/builder/types.ts` | 4d6 builder roll |
| `src/renderer/src/utils/dawn-recharge.ts` | Recharge dice |
| `src/renderer/src/hooks/use-game-effects.ts` | Effect-dep suppressions |
| `src/renderer/src/hooks/use-game-network.ts` | Effect-dep + Phase 30 overlap |
| `src/renderer/src/services/library-service.ts` | `as unknown as` cluster |
| `src/renderer/src/network/host-manager.ts` | peerjs reconnection (28c.5 done) |
| `src/renderer/src/network/client-manager.ts` | peerjs reconnection (28c.5 done) |
| `src/renderer/src/network/registry-client.ts` | peerjs reconnection (28c.5 done) |
| `src/main/bmo-bridge.ts` | Sync receiver hardening, retry, BridgeResponse, graceful shutdown, Bearer |
| `src/main/bmo-config.ts` | `BMO_PI_URL` precedence + `getBmoApiKey` |
| `src/main/ipc/game-data-handlers.ts` | JSON.parse containment |
| `src/main/ipc/settings-handlers.ts` | bmoApiKey settings I/O |
| `src/main/ai/claude-client.ts` | Model list, SDK 1.x, prompt caching, max_tokens |
| `src/main/ai/llm-provider.ts` | Provider registry |
| `src/main/ai/context-builder.ts` | Cache-control block split |
| `src/main/ai/stat-mutations.ts` | Typed character pipeline |
| `src/main/ai/character-context.ts` | Shared character types |
| `src/main/storage/save-queue.ts` | Dead-cleanup rewrite |
| `src/main/storage/migrations.ts` | Mutation/return contract |
| `src/main/storage/atomic-write.ts` | Storage-write JSDoc |
| `src/main/storage/index.security.test.ts` | New BrowserWindow security regression test |
| `src/main/index.ts` | Window min size, before-quit wiring, `ELECTRON_RENDERER_URL` validation |
| `src/shared/types/character-5e.ts` | Move shared Character5e + HitPoints types |
| `src/shared/ipc-schemas.ts` | SyncEventSchema, InitiativeSyncSchema |
| `src/renderer/src/components/campaign/AiProviderSetup.tsx` | UI default + max-tokens slider |
| `src/renderer/src/components/sheet/{FeaturesSection5e,PrintSheet,Tooltip,LanguagesTab5e}.tsx` | Silent catch + z-index |
| `tailwind.config` | Color tokens + z-index tokens |
| `dnd-app/package.json` | check:full script, SDK bump, electron-builder allowlist |
| `.github/workflows/dnd-app-ci.yml` (new) | CI gate |
| `dnd-app/docs/{PLUGIN-SYSTEM.md,UI-LAYERS.md}` | Trust model + z-index conventions |
| `dnd-app/README.md` | BMO key + min viewport |
| `AGENTS.md`, `CLAUDE.md` | Storage / IPC discipline docs |
| `scripts/audit/check-no-div-onclick.mjs` (new) | Regression script |

## Sub-phase summary

| # | Sub-phase | Theme |
|---|-----------|-------|
| 28a | Critical security & game integrity | Sync receiver hardening + Math.random sweep + JSON containment |
| 28b | AI surface refresh | Model list, SDK 1.x, prompt caching, model-aware max_tokens |
| 28c | Network resilience | bmoPiFetch retry, BridgeResponse contract, graceful shutdown, RENDERER_URL validation |
| 28d | Data integrity & type safety | Typed character pipeline, save-queue, casts sweep, dep audit, IDs, migrateData |
| 28e | CI hardening | check:full, dnd-app-ci.yml, lint rules |
| 28f | UI / UX polish | Button semantics, error surfacing, tokens, aria, virtualization |
| 28g | Docs & long tail | BMO key docs, plugin trust model, allowlist, JSDoc rules |
| 28h | Test coverage uplift | Baseline gate, lobby tests, security regression |
| 28i | Coverage-gap audits | Knowledge scan to drive Phase 29 |

## Sub-phase details

### 28a — Critical Security & Game Integrity

#### 28a.1 — Math.random sweep
**Files:**
- `src/renderer/src/components/game/GameLayout.tsx:893`
- `src/renderer/src/components/game/overlays/ReactionPrompts.tsx:195`
- `src/renderer/src/components/game/overlays/GamePrompts.tsx:124, 240`
- `src/renderer/src/components/game/overlays/PlayerHUDEffects.tsx:231, 278, 297`
- `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx:74`
- `src/renderer/src/components/game/modals/dm-tools/NPCGeneratorModal.tsx:50, 54`
- `src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx` (line moved; re-grep)
- `src/renderer/src/components/game/modals/dm-tools/treasure-generator-utils.ts:66, 72`
- `src/renderer/src/components/game/sidebar/TablesPanel.tsx:79, 115, 123`
- `src/renderer/src/stores/builder/types.ts:44`
- `src/renderer/src/utils/dawn-recharge.ts:27`
- `src/renderer/src/data/{starting-equipment-table,bastion-events,sentient-items,personality-tables,weather-tables}.ts` — **skip per Phase 15 sequencing (Option A): the data tables get deleted; library-stored equivalents pick up `cryptoRandom` during the Phase 15 port.**

**Steps:**
1. Add `import { cryptoRollDie, cryptoRandom } from '@renderer/utils/crypto-random'` per file.
2. Single-die: `Math.floor(Math.random() * N) + 1` → `cryptoRollDie(N)`.
3. Random index: `Math.floor(Math.random() * arr.length)` → `Math.floor(cryptoRandom() * arr.length)`.
4. Weighted random: `Math.random() * total` → `cryptoRandom() * total`.
5. Range: `min + Math.random() * (max - min)` → `min + cryptoRandom() * (max - min)`.
6. Skip `*.test.*` files.

**Acceptance:**
- `grep -rn 'Math\.random' --include='*.ts' --include='*.tsx' src/renderer/ | grep -v '\.test\.'` returns only acceptable cases (currently 89 hits; target is the count after subtracting Phase-15-deferred sites and intentional UI ephemerals like `DiceOverlay.tsx:124`).
- All vitest roll suites still pass.
- Manual: roll initiative on a token, value lands in [1, 20].

#### 28a.2 — Harden BMO sync receiver (loopback + CORS + body limits + rate)
**Files:** `src/main/bmo-bridge.ts`

> Phase 32 coordination: Cloud-host mode uses WS transport, not the sync receiver. Both code paths need hardening; they don't overlap structurally.

**Steps:**
1. `src/main/bmo-bridge.ts:16` — keep `SYNC_RECEIVER_PORT` env-overridable.
2. Add `const SYNC_BIND = process.env.BMO_SYNC_BIND ?? '127.0.0.1'` (default loopback; opt-in to `0.0.0.0`).
3. `src/main/bmo-bridge.ts:201` — `syncServer.listen(port, SYNC_BIND, ...)`.
4. `src/main/bmo-bridge.ts:118, 147` — drop `'Access-Control-Allow-Origin': '*'` on loopback bind. When `SYNC_BIND === '0.0.0.0'`, set to the configured BMO origin via `getBmoBaseUrl()`.
5. Add `MAX_BODY_BYTES = 64_000` constant. In `readBody` (line 108), track running total + `req.destroy()` + reject if exceeded; reject up-front if `Content-Length` exceeds.
6. Reject POST whose `Content-Type !== 'application/json'` with 415.
7. Token-bucket rate limit per source IP, 60 events / minute, 429 on overflow (`Map<string, { tokens, lastRefill }>`).
8. Log inbound source IP via `logToFile('INFO', 'sync from', req.socket.remoteAddress)`.

**Acceptance:**
- `curl http://0.0.0.0:5001/api/sync` from another LAN machine fails when `BMO_SYNC_BIND` unset.
- Posting >64 KB returns 413.
- Posting non-JSON returns 415.
- 100 events in 10 s → last 40 get 429.

#### 28a.3 — Zod validation on sync receiver
**Files:** `src/main/bmo-bridge.ts:163-178, 174`, `src/shared/ipc-schemas.ts`

**Steps:**
1. In `ipc-schemas.ts`, add `SyncEventSchema` as a discriminated union on `type`, plus `InitiativeSyncSchema`.
2. `bmo-bridge.ts:164` after `readBody(req)` — `SyncEventSchema.safeParse(JSON.parse(body))`; 400 with issues on failure; forward `parsed.data` on success.
3. `bmo-bridge.ts:174` — same for `/api/sync/initiative` with `InitiativeSyncSchema`.
4. `logToFile('WARN', 'sync event rejected', parsed.error.issues)` on failure.

**Acceptance:** Posting event with `type: 'banana'` returns 400. Valid events still forward. Renderer handlers need no changes (zod-narrowed shape matches existing TS type).

#### 28a.4 — Authorization Bearer to BMO
**Files:** `src/main/bmo-config.ts`, `src/main/bmo-bridge.ts:31-53`, `src/main/ipc/settings-handlers.ts`, settings UI panel, `dnd-app/README.md`

> Phase 32 coordination: reconcile token shape (issuer, signing secret, audience claim) so one secret validates both LAN Bearer + WS JWT.

**Steps:**
1. `bmo-config.ts` — add `getBmoApiKey()`: env (`BMO_API_KEY`) > settings (decrypted via `safeStorage`) > undefined.
2. `bmo-bridge.ts:31-53` — in `bmoPiFetch`, inject `Authorization: Bearer ${apiKey}` when `getBmoApiKey()` returns a value.
3. Add `bmoApiKey` to `settings.json` schema; wrap with `safeStorage.encryptString` on write.
4. Settings-UI "BMO connection" panel: text field + "Test connection" button hitting `getDmStatus`.
5. README: env-var / settings flow.

**Acceptance:**
- BMO `BMO_API_KEY` unset → behavior unchanged.
- Both sides set + matching → all `bmoPiFetch` calls succeed.
- BMO set + dnd-app missing → `{ ok: false, error: 'HTTP 401: ...' }` + actionable UI.
- Unit test confirms env precedence over settings.

#### 28a.5 — JSON.parse containment in `game:load-json`
**Files:** `src/main/ipc/game-data-handlers.ts:29`

**Steps:**
1. Wrap `JSON.parse(content)` in local try/catch.
2. On parse failure, throw `Error('INVALID_JSON: ' + relativePath)`.
3. Add vitest case with malformed JSON fixture.

**Acceptance:** Renderer surfaces a useful error (not generic IPC reject) on corrupted 5e data file.

### 28b — AI Surface Refresh

#### 28b.1 — Update Claude model list (Jan 2026 cutoff)
**Files:**
- `src/main/ai/llm-provider.ts:20` (registry — currently lists only `claude-sonnet-4-20250514`)
- `src/main/ai/claude-client.ts:96` (`isAvailable()` ping)
- `src/main/ai/claude-client.ts:107` (`listModels()` — currently `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`)
- `src/renderer/src/components/campaign/AiProviderSetup.tsx:251` (UI default)
- `src/shared/ipc-schemas.test.ts:18` (test fixture)

**Steps:**
1. Add current Claude 4.x family entries (Opus 4.7, Sonnet 4.6, Haiku 4.5). Keep older ids as deprecated.
2. Bump `isAvailable()` to ping Haiku 4.5.

```ts
{ id: 'claude-opus-4-7',           name: 'Claude Opus 4.7',   desc: 'Most capable; best for long DM narration' },
{ id: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6', desc: 'Best balance of speed and intelligence' },
{ id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5',  desc: 'Fastest; good for quick responses' },
{ id: 'claude-sonnet-4-20250514',  name: 'Claude Sonnet 4',   desc: '(deprecated) prior generation' },
```

**Acceptance:** UI dropdown shows new models first; fresh campaigns default to Sonnet 4.6; existing campaigns with older ids still work; API-key validation pings Haiku 4.5.

#### 28b.2 — Bump `@anthropic-ai/sdk` to 1.x
**Files:** `dnd-app/package.json` (currently `^0.78.0`), `src/main/ai/claude-client.ts`

**Steps:**
1. `npm install @anthropic-ai/sdk@^1.0.0`.
2. Update imports per the 1.x migration notes.
3. Run `npm run lint && npx tsc --noEmit && npm test`; fix breakages.
4. Add smoke test that the SDK still streams a simple message.

**Acceptance:** All gates pass; smoke test green.

#### 28b.3 — Wire Anthropic prompt caching
**Files:** `src/main/ai/claude-client.ts`, `src/main/ai/context-builder.ts`

**Steps:**
1. Restructure the `system` param into an array of content blocks: stable prefix (system + character/campaign context) as one block; per-turn user message as another.
2. Mark stable prefix with `cache_control: { type: 'ephemeral' }`.
3. Read `usage.cache_creation_input_tokens` + `usage.cache_read_input_tokens`; surface in dev logs.
4. Vitest assertion that `cache_control` reaches the SDK call (mock SDK, capture args).

**Acceptance:** Second turn in a session reads from cache (dev logs); per-turn token cost drops measurably for long-context conversations; no regression in short conversations.

#### 28b.4 — Model-aware `max_tokens`
**Files:** `src/main/ai/claude-client.ts:40, 77` (both hardcode 4096), `src/main/ai/llm-provider.ts`, `src/renderer/src/components/campaign/AiProviderSetup.tsx`

**Steps:**
1. Add `maxTokens?: number` to `LLMProvider.streamChat` / `chatOnce` signatures.
2. Defaults: Opus → 16384, Sonnet/Haiku → 8192.
3. Surface "Max response length" slider (1k → 16k) in AiProviderSetup.

**Acceptance:** Slider drives the call; defaults respect per-model caps.

### 28c — Network Resilience

#### 28c.1 — Retry / backoff for `bmoPiFetch`
**Files:** `src/main/bmo-bridge.ts:31-53`

**Steps:**
1. Wrap in retry helper: 3 attempts, backoff 200 / 800 / 2000 ms.
2. Don't retry on 4xx.
3. Track consecutive failures; after 3, emit renderer toast via IPC ("BMO unreachable — Discord sync paused").
4. Reset counter on first success.

**Acceptance:** Unit test forces 2 timeouts, third succeeds, function resolves; 3 consecutive failures emit the toast.

#### 28c.2 — Normalize `BridgeResponse` contract
**Files:** `src/main/bmo-bridge.ts:18-22` + every caller in `src/main/`

**Steps:**
1. Change `BridgeResponse` to discriminated union:
   ```ts
   type BridgeResponse =
     | { ok: true; data: unknown }
     | { ok: false; error: string; statusCode?: number }
   ```
2. Always set `ok` explicitly.
3. Wrap server data under `data` (don't spread top-level).
4. Codemod callers (`if (!result.error)` → `if (result.ok)`).

**Acceptance:** TS compile clean; all bridge consumers updated.

#### 28c.3 — `stopSyncReceiver` graceful shutdown
**Files:** `src/main/bmo-bridge.ts:212` (currently sync `void` return), `src/main/index.ts` (before-quit wiring)

> Phase 30 coordination: when `TransportAdapter` lands, move this into `TransportAdapter.close()`.

**Steps:**
1. Call `syncServer.closeAllConnections()` (Node 18.2+) before `syncServer.close()`.
2. Make `stopSyncReceiver` return `Promise<void>` resolving after full close.
3. Wire into `app.on('before-quit', async (e) => { e.preventDefault(); await stopSyncReceiver(); app.exit() })`.

**Acceptance:** Quitting with an active connection waits for close before exit.

#### 28c.4 — Document `bmoBaseUrl` override chain
**Files:** `src/main/bmo-config.ts` (precedence already implemented — needs JSDoc + UI), `dnd-app/README.md`, settings UI

**Steps:**
1. Add JSDoc explaining precedence (env > settings > default).
2. Confirm `BMO_PI_URL` env-var precedence (currently `process.env.BMO_PI_URL || BMO_PI_URL_DEFAULT` at line 23 — no settings-layer read).
3. Add settings-UI surface for base URL.

**Acceptance:** UI override roundtrips to settings.json; env-var still wins.

#### 28c.6 — Validate `ELECTRON_RENDERER_URL`
**Files:** `src/main/index.ts:203-204`

**Steps:**
1. Before `loadURL(process.env.ELECTRON_RENDERER_URL)`, parse via `new URL(env)` (try/catch).
2. Confirm `hostname` is `localhost` or `127.0.0.1`.
3. Confirm `port` is in `[5170, 5180]`.
4. On mismatch: fall back to `file://` packaged path + `logToFile('WARN', ...)`.

**Acceptance:** Test passes a malformed URL; loader falls back.

### 28d — Data Integrity & Type Safety

#### 28d.1 — Type the character pipeline through `stat-mutations.ts`
**Files:**
- `src/renderer/src/types/character-5e.ts:136` (source of `HitPoints`)
- `src/main/ai/stat-mutations.ts:178` (currently `applyChange(char: Record<string, unknown>, change: StatChange): void`)
- `src/main/ai/character-context.ts:43`
- Move `Character5e` / `HitPoints` to `src/shared/types/character-5e.ts`

**Steps:**
1. Move shared types into `src/shared/types/character-5e.ts`.
2. Update `stat-mutations.ts` signature: `applyChange(char: Character5e, change: StatChange): void` (or return `Character5e`).
3. Drop per-case `as { current; maximum; temporary }` casts.
4. Decide: keep in-place mutation (document loudly) OR refactor to return new object.
5. Vitest covering every `StatChange` case (damage / heal / temp_hp / condition adds / removes / death-save / exhaustion).

**Acceptance:** TS compile clean without casts; vitest covers each case.

#### 28d.2 — Finish / remove `save-queue.ts` dead cleanup
**Files:** `src/main/storage/save-queue.ts:33-50`

**Steps:** Store stable handle:
```ts
const queueHandle = next.catch(() => undefined)
queues.set(key, queueHandle)
try { return await next } finally {
  if (queues.get(key) === queueHandle) queues.delete(key)
}
```
Delete the dead comment block. Vitest: enqueue 100 saves, wait for quiesce, confirm `queues.size === 0`.

**Acceptance:** Map empty after quiesce.

#### 28d.3 — `as unknown as` sweep
**Files:** primary hotspots `src/renderer/src/services/library-service.ts:639, 678-679, 694, 702, 710` (currently 30 casts in this file alone), plus 7+ test helpers. Total non-test: 143 occurrences.

**Sequencing:** Phase 15 A.3.iii rewrites `library-service.ts` import/cache routing but does NOT move the JSON-parse-boundary casts. Sweep after Phase 15 A.3.iii lands.

**Steps:**
1. Cluster the casts by boundary (IPC, JSON-from-disk, third-party SDK, test mock).
2. For known-shape data: zod parse at the boundary.
3. For truly dynamic (plugin payloads): document with comment ("plugin-supplied; no schema possible").
4. Target: < 40 casts outside tests after the sweep.

**Acceptance:** Total non-test casts < 40; library-service.ts casts have either zod-parse or doc-comment.

#### 28d.4 — Effect-dep suppression audit
**Files:**
- `src/renderer/src/hooks/use-game-effects.ts:117, 143, 296, 306, 387, 423` (6 suppressions currently)
- `src/renderer/src/components/game/GameLayout.tsx` (re-grep for any `eslint-disable.*react-hooks`)
- `src/renderer/src/hooks/use-game-network.ts` (re-grep)

> Phase 30 coordination: `use-game-network.ts` is part of the network surface Phase 30 reshapes; verify the suppression survives the rewrite.

**Steps:**
1. Per site, attempt honest dep list; if it loops, refactor surrounding state (don't suppress).
2. Where dep really is stable (`useState` setter, `useRef` current), narrow the comment.
3. Vitest exercising a state change that should re-run the effect.

**Acceptance:** Suppression count drops; each survivor has a precise reason.

#### 28d.5 — Date.now()-based IDs → `crypto.randomUUID()`
**Files:** `src/renderer/src/components/game/overlays/PlayerHUDEffects.tsx:55, 234, 300` (3 remaining `cond-${Date.now()` patterns)

**Steps:**
1. Grep for `\`cond-\${Date.now()` / similar.
2. Replace with `crypto.randomUUID()` (or scoped `idFor('cond')` helper).
3. Unit test: two rapid calls produce distinct ids.

**Acceptance:** No `Date.now()` ID patterns remain.

#### 28d.6 — UUID truncation audit
**Files:** ~86 sites using `crypto.randomUUID().slice(0, 8)` (or similar) across `src/`.

**Steps:**
1. Enumerate sites by purpose: "UI ephemeral" (OK) vs "persistent game state" (full UUID required).
2. Migrate persistent-state sites to full UUIDs.
3. Add helper pair: `ephemeralId(prefix?)` + `entityId()`.

**Acceptance:** Persistent-state IDs use full UUID; UI ephemerals routed through helper.

#### 28d.7 — `migrateData` return-value contract
**Files:** `src/main/storage/migrations.ts:33` (currently `migration(record)` — return value discarded)

**Origin:** SUGGESTIONS-LOG-DNDAPP `[2026-04-24] DO NOT update migrateData to return new objects` gotcha — fix the contract instead of documenting the trap.

**Steps:**
1. Refactor `migrateData()` to capture each migration's return: `record = migration(record)`.
2. Mutation-style returns mutated record; immutable-style returns new object — both work.
3. Update JSDoc: "Migrations may mutate in place OR return a new record — the caller captures either way."
4. Vitest with one mutation-style + one immutable-style migration producing the same final shape.

**Acceptance:** Both forms pass; gotcha entry can be deleted from SUGGESTIONS-LOG.

### 28e — CI Hardening

#### 28e.1 — `npm run check:full` aggregate
**Files:** `dnd-app/package.json` (currently has `audit:ci` at line 35; no `check:full`)

**Steps:** Add:
```json
"check:full": "npm run lint && tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json && npm test && npm run circular && npm run dead-code && npm run audit:ci"
```

**Acceptance:** Script runs end-to-end locally; failure on any step aborts.

#### 28e.2 — `.github/workflows/dnd-app-ci.yml`
**Files:** new `.github/workflows/dnd-app-ci.yml` (currently only `release.yml`, `bmo-pi-pytest.yml`, `deploy.yml`, `dnd-app-validate-5e.yml`, `security-audit.yml`)

**Trigger:** `push` + `pull_request` on `paths: ['dnd-app/**', '.github/workflows/dnd-app-ci.yml']`.

**Jobs:**
- `setup-node@v4`, `node-version: 22`, `cache: npm`, `cache-dependency-path: dnd-app/package-lock.json`
- `npm ci`
- `npm run lint`
- `npx tsc --noEmit -p tsconfig.web.json`
- `npx tsc --noEmit -p tsconfig.node.json`
- `npm test`
- `npm run audit:ci`
- `npm run circular`
- `npm run dead-code` (`continue-on-error: true` until knip baseline clean)

**Acceptance:** PR breaking tsc / circular / test fails the job.

#### 28e.3 — Lint rule: no `Math.random` outside `crypto-random.ts` + tests
**Files:** `biome.json` (or `scripts/lint/no-math-random.mjs`)

**Origin:** SUGGESTIONS-LOG `[2026-05-12] DO NOT use Math.random()` gotcha.

**Steps:**
1. Biome custom rule (or grep-based pre-commit): `Math.random` forbidden except in `src/renderer/src/utils/crypto-random.ts` and `*.test.ts(x)`.
2. Wire into `check:full` + `dnd-app-ci.yml`.

**Acceptance:** Rule active after 28a.1 sweep lands; PR adding `Math.random` fails.

#### 28e.4 — Lint rule: no bare `writeFile` outside `atomic-write.ts`
**Files:** `biome.json`

**Origin:** SUGGESTIONS-LOG `[2026-04-24] atomic-write.ts is canonical storage write`.

**Steps:** Biome rule forbidding `import { writeFile } from 'node:fs'` / `'node:fs/promises'` outside `src/main/storage/atomic-write.ts`.

**Acceptance:** New storage module that imports bare `writeFile` fails lint.

#### 28e.5 — Lint rule: forbid `useNetworkStore` import from `stores/use-network-store.ts`
**Files:** `biome.json`

**Origin:** SUGGESTIONS-LOG `[2026-04-24] DO NOT import useNetworkStore from use-network-store.ts`. Pairs with Phase 33g codemod.

**Acceptance:** Re-introducing the circular barrel fails lint.

#### 28e.6 — Lint rule: forbid `require()` in `electron.vite.config.ts`
**Files:** grep-based pre-commit hook

**Origin:** SUGGESTIONS-LOG `[2026-04-24] DO NOT use CJS require()`. Pairs with Phase 33e migration.

**Acceptance:** Hook flags `require(` in `electron.vite.config.ts`.

#### 28e.7 — Lint rule: no skipped tests
**Files:** CI step

**Origin:** SUGGESTIONS-LOG `[2026-05-12] Vitest suite has zero skipped` info — convert observation to enforcement.

**Steps:** CI step: `! grep -rE '\b(it|describe|test)\.skip\b|\b(xit|xdescribe|xtest)\b|\.todo\b' src/`.

**Acceptance:** PR adding `.skip` / `.todo` / `xit` fails.

#### 28e.8 — License audit gate
**Files:** CI step

**Origin:** SUGGESTIONS-LOG `[2026-04-24] License audit clean — 222 prod deps` — replace snapshot with enforcement.

**Steps:** `npx license-checker --production --failOn 'GPL;LGPL;AGPL'`.

**Acceptance:** Copyleft dep introduction fails.

#### 28e.9 — IPC-SURFACE.md drift gate
**Files:** CI step

**Origin:** SUGGESTIONS-LOG `[2026-04-24] IPC-SURFACE.md lists channel names, not contracts` gotcha — turn regeneration into a CI check.

**Steps:** `npm run gen:ipc-surface && git diff --exit-code docs/IPC-SURFACE.md`.

**Acceptance:** PR modifying `ipc-channels.ts` without regenerating surface doc fails.

### 28f — UI / UX / Graphical Polish

#### 28f.1 — Replace `<div onClick>` with `<button>`
**Files:** 73 occurrences across `src/renderer/src/`.

**Steps:**
1. `grep -rn '<div[^>]*onClick' --include='*.tsx' src/renderer` to enumerate.
2. Each: `<button type="button" className="...">` preserving Tailwind classes.
3. Where the div must stay (card with nested interactives), add `role="button" tabIndex={0}` + Enter/Space handler.

**Acceptance:** Count drops to near-zero; survivors have explicit `role`+tabIndex+keyboard handler.

#### 28f.2 — Surface silent `.catch()` errors
**Files:** `src/renderer/src/components/sheet/FeaturesSection5e.tsx:47, 55` + broader sweep.

**Steps:**
1. Add `useErrorToast()` hook (log + toast + retry-button pattern).
2. Per site, decide user-actionable → toast; not → `logToFile` (main-side) instead of `console`.

**Acceptance:** No silent `console`-only catch in renderer.

#### 28f.3 — Centralize color tokens
**Files:** `tailwind.config`, 20-30 inline `#hex` sites.

**Steps:**
1. `grep -rn '#[0-9a-fA-F]\{3,6\}' --include='*.tsx' --include='*.ts' --include='*.css' src/renderer`.
2. Triage chart palettes (intentional inline) vs theme drift.
3. Tailwind tokens for any color used > 3 times.

**Acceptance:** Theme-drift hexes replaced by tokens.

#### 28f.4 — Z-index layer convention
**Files:** `tailwind.config`, `src/renderer/src/components/sheet/PrintSheet.tsx:27, 67`, `Tooltip.tsx:78`, `LanguagesTab5e.tsx:65`, plus broader.

**Steps:**
1. Add `z-app`, `z-modal-backdrop`, `z-modal`, `z-tooltip`, `z-toast`, `z-overlay-print` tokens to Tailwind.
2. Replace magic numbers.
3. Document in new `dnd-app/docs/UI-LAYERS.md`.

**Acceptance:** No magic `z-[9999]` in src/.

#### 28f.5 — Aria coverage sweep
**Steps:**
1. Top 20 user-traffic components (initiative tracker, dice tray, action buttons, modals, lobby).
2. Per component: icon-only buttons get `aria-label`; list updates get `aria-live`.
3. Aim for "all interactive elements with non-text content".

**Acceptance:** Audit script + manual screen-reader sweep on the 20 components.

#### 28f.6 — Window minimum size check
**Files:** `src/main/index.ts:70-71` (currently `minWidth: 1024, minHeight: 768`).

**Steps:**
1. Manually test each panel layout at 1024×768.
2. If broken: bump `minWidth` to 1280 OR add a "compact mode" toggle.
3. Document minimum supported viewport in README.

**Acceptance:** All panels render usably at the chosen minimum.

#### 28f.7 — Profile + virtualize long lists
**Files:** `EncounterLog*.tsx`, journal components, any list > 100 items.

**Steps:**
1. React DevTools profile with synthetic 500-entry data.
2. If render > 16 ms, virtualize with `@tanstack/react-virtual`.
3. Document the "if > 200 items, virtualize" rule.

**Acceptance:** Profiled list render < 16 ms at 500 items.

#### 28f.8 — `console.warn` validation handling
**Files:** `src/renderer/src/stores/network-store/client-handlers.ts:67`, `host-handlers.ts:50, 62, 230`.

**Steps:** Per site, decide throw+catch upstream OR fall-through-with-clearer-comment; if thrown, surface as renderer toast via `addSysMsg()`.

**Acceptance:** No `console.warn` leaves validation failure silent.

### 28g — Docs & Long Tail

#### 28g.1 — BMO_API_KEY end-to-end docs
**Files:** `dnd-app/README.md`, `src/main/bmo-bridge.ts` JSDoc, `docs/ARCHITECTURE.md`.

**Depends on:** 28a.4 landing first.

**Acceptance:** Setup walkthrough exists; matches actual env / settings precedence.

#### 28g.2 — Plugin trust model docs
**Files:** `dnd-app/docs/PLUGIN-SYSTEM.md`, README, plugin-install UI.

**Steps:**
1. Add "Trust model" section.
2. Plugin-install UI warning ("Plugins have full access to your game data — only install plugins you trust").

**Acceptance:** Section + UI banner present.

#### 28g.3 — Close the 2 open TODOs
**Files:**
- `src/renderer/src/components/game/GameLayout.tsx:296` ("TODO: Could enhance to pre-select the specific item")
- `src/renderer/src/components/game/map/map-overlay-effects.ts:27` ("TODO: Add playing state management")

**Steps:** Per TODO, either action it OR convert to dated `// FIXME: [2026-05-12] ...` with matching ISSUES-LOG-DNDAPP entry.

**Acceptance:** No bare `TODO:` markers remain in those files.

#### 28g.4 — Verify electron-builder files-allowlist doesn't leak `docs/`
**Files:** `dnd-app/package.json`

**Steps:**
1. Run `electron-builder --dir`; `ls dist/`.
2. If `docs/` present, add `!docs/**/*` to `build.files`.
3. (Optional) Add `audit:bundle` script that fails CI if forbidden paths slip in.

**Acceptance:** `docs/` absent from packaged bundle.

#### 28g.5 — Document `atomic-write.ts` as canonical storage write
**Files:** `AGENTS.md`, `src/main/storage/atomic-write.ts` JSDoc.

**Steps:**
1. AGENTS.md new "Storage rules" section under "When adding new dnd-app files": new storage modules MUST use `atomicWriteFile`; bare `writeFile` forbidden (28e.4 lint enforces).
2. JSDoc at top of `atomic-write.ts` documenting rename-after-temp-write atomicity.

**Acceptance:** Rule visible; JSDoc present.

#### 28g.6 — Document IPC-SURFACE.md regeneration discipline
**Files:** `AGENTS.md`, `CLAUDE.md`.

**Steps:** New "When editing `ipc-channels.ts`" rule: regenerate `docs/IPC-SURFACE.md` via `npm run gen:ipc-surface` and commit alongside. CI gate 28e.9 enforces.

**Acceptance:** Rule documented; CI gate active.

#### 28g.7 — Document `migrateData` mutation/return contract
**Files:** `src/main/storage/migrations.ts` JSDoc.

**Depends on:** 28d.7 (the rewrite).

**Steps:** Top-of-file JSDoc post-28d.7: "Migrations may mutate in place OR return a new record. The caller captures either way."

**Acceptance:** JSDoc updated; old gotcha entry deletable.

#### 28g.8 — Document dual-import resolution in `provider-registry.ts`
**Files:** `src/main/ai/provider-registry.ts` JSDoc.

**Depends on:** Phase 33f (picks the pattern).

**Steps:** JSDoc explaining chosen pattern (eager or lazy) and why mixing produces silent no-op dynamic imports.

**Acceptance:** JSDoc reflects Phase 33f's choice.

### 28h — Test Coverage Uplift

#### 28h.1 — Coverage baseline
**Files:** new `dnd-app/.coverage-baseline.json`.

**Steps:**
1. `npm run test:coverage` for authoritative figure.
2. Commit baseline.
3. CI gate fails if coverage drops below baseline.

**Acceptance:** Gate visible; baseline committed.

#### 28h.2 — Lobby / onboarding flow tests
**Files:**
- `src/renderer/src/components/lobby/ReadyButton.tsx`
- `src/renderer/src/components/lobby/CharacterSelector.tsx`
- `src/renderer/src/components/campaign/SessionZeroStep.tsx`

**Acceptance:** Component tests cover ready toggle, character pick, session-zero step transitions.

#### 28h.3 — TokenContextMenu test recovery
**Depends on:** Phase 33g `useNetworkStore` circular-dep codemod.

**Acceptance:** Test file imports cleanly; ContextMenu behaviour covered.

#### 28h.4 — Electron BrowserWindow security regression test
**Files:** new `src/main/index.security.test.ts`.

**Origin:** SUGGESTIONS-LOG `[2026-04-24] Electron security base config correctly hardened` info — convert snapshot to regression test.

**Steps:** vitest spec importing `createWindow` config and asserting:
- `webPreferences.sandbox === true`
- `webPreferences.contextIsolation === true`
- `webPreferences.nodeIntegration === false`
- `setWindowOpenHandler` denies all (`{ action: 'deny' }`); routes `http(s)` to `shell.openExternal`
- CSP header set on `webContents.session.webRequest.onHeadersReceived`
- `requestSingleInstanceLock` called on startup
- `uncaughtException` + `unhandledRejection` handlers registered

**Acceptance:** Test passes against current code; flipping any setting to insecure default fails the test.

#### 28h.5 — `<div onClick>` regression test
**Files:** new `scripts/audit/check-no-div-onclick.mjs`.

**Steps:** Script greps `<div[^>]*onClick=` across `src/renderer/src/components/`; fails if found (allowlist: explicit `// a11y-allow-div-onclick: <reason>` comment). Wire into `check:full` + CI.

**Depends on:** 28f.1 sweep landing first.

**Acceptance:** Sweep + gate prevents regression.

### 28i — Coverage-Gap Audits

#### 28i.1 — Per-area scoped audits
Each of the 9 gap areas gets its own narrow scan:

1. Multiplayer / peerjs — fog-of-war state, host-migration, reconnect. **Phase 30/31 absorb most of this scope** — re-scope to "items not absorbed" once those land.
2. Pixi map — fog-of-war correctness, viewport math, GPU memory growth.
3. Plugin runtime — actual privilege boundary, lifecycle, error containment.
4. Cloud sync (rclone) — conflict resolution, partial-failure recovery, retry behavior.
5. TipTap — content sanitization on import (paste from web, restore from backup).
6. Updater — signature verification, channel pinning, rollback path.
7. Discord integration — bot token storage (overlaps SUGGESTIONS-LOG info).
8. 5e JSON — schema correctness (overlaps `2026-04-24-schemas-content-mismatch`).
9. Renderer IPC consumers — every `window.api.*` call site for async-error handling.

**Output:** one log entry per finding (per the standard triage table). May spawn Phase 29.

**Acceptance:** Each area has a written scan note + zero-or-more log entries.

## Constraints & edge cases

- **Discipline:** commit per sub-phase; stop and await approval between each one. Don't bundle 28a + 28b.
- **Layout fixed:** no restructuring of `src/{main,preload,renderer,shared}/` — electron-vite layout enforced.
- **Phase 15 deferral:** 28a.1 data-tables (`bastion-events`, `weather-tables`, `personality-tables`, `sentient-items`, `starting-equipment-table`) and 28d.3 `library-service.ts` casts wait for Phase 15 Option A to land.
- **Phase 30 overlap:** 28a.2 / 28c.3 / 28c.5 / 28d.4 (`use-game-network.ts`) / 28i.1 must reframe call sites once `TransportAdapter` exists. Implement where drafted now; migrate during Phase 30.
- **Phase 32 overlap:** 28a.4 Bearer token shape must reconcile with the WS JWT (issuer / secret / audience).
- **Phase 33 overlaps:** 28e.5 lint pairs with Phase 33g codemod; 28e.6 + 28g.8 pair with Phase 33e/33f.
- **BMO side already done:** Bearer auth counterpart exists at `bmo/pi/app.py:163-178`; no Pi-side work required in this phase.

## Verification

- `grep -rn 'Math\.random' --include='*.ts' --include='*.tsx' src/renderer/ | grep -v '\.test\.'` returns only acceptable cases (currently 89; expected residual: Phase-15-deferred tables + intentional `DiceOverlay.tsx` ephemeral).
- BMO sync receiver binds `127.0.0.1` by default; rejects malformed / oversized / wrong-content-type / over-rate payloads.
- VTT → BMO sends `Authorization: Bearer` when `BMO_API_KEY` set; falls back cleanly when unset.
- Claude 4.7 / 4.6 / 4.5 visible in AI Provider UI; prompt caching present (`cache_control` reaches SDK).
- `@anthropic-ai/sdk` resolves to `^1.0.0`.
- `npm run check:full` exists and runs all gates.
- `.github/workflows/dnd-app-ci.yml` blocks PRs on lint / typecheck / test / audit failures.
- All 2026-05-12 log entries either resolved (moved to `RESOLVED-ISSUES-DNDAPP.md` / `RESOLVED-SECURITY-ISSUES.md`) or have a Phase 29 follow-up entry.

## Completed

> **PHASE 28 PARTIAL — 2026-05-29 (overnight autonomous pass; high-value contained sweep done, large audit rollup otherwise deferred).** 4-gate green (lint 0, tsc web+node 0, vitest 6514/6514).
> - **28a.1 DONE** — Math.random → cryptoRandom/cryptoRollDie sweep across 10 renderer files (GameLayout, ReactionPrompts, GamePrompts, PlayerHUDEffects, NPCGeneratorModal, MapEditorRightPanel, treasure-generator-utils, TablesPanel, builder/types, dawn-recharge). Data-table sites skipped per Phase 15 sequencing.
> - **28a.3 DONE (prior)** — GAME_LOAD_JSON JSON.parse containment landed in Phase 17b.
> - **DEFERRED (large audit rollup; many items overlap Phases 29–33 or need BMO/app/two-window verification):** 28a.2 BMO sync-receiver hardening (loopback bind + CORS + body/rate limits), 28b AI surface refresh (Claude model list, SDK 1.x, prompt caching, max_tokens), 28c bmoPiFetch retry + BridgeResponse + graceful shutdown + RENDERER_URL validation, 28d typed character pipeline + save-queue + casts sweep + migrateData contract, 28e CI hardening (check:full, dnd-app-ci.yml, lint rules), 28f UI polish (button semantics, tokens, aria, virtualization), 28g docs (BMO key, plugin trust model, allowlist), 28h test-coverage uplift, 28i coverage-gap audits. These remain the live Phase-28 backlog.

- 28c.5 — peerjs reconnection DONE (`src/renderer/src/network/host-manager.ts:277-310`, `client-manager.ts:57`, `registry-client.ts:196`) — exponential backoff (1s/2s/4s/8s/16s/30s cap) + max-attempts + jitter present; "Reconnecting..." badge at `src/renderer/src/components/lobby/PlayerCard.tsx:167`.
