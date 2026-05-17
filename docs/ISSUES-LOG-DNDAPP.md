# Issues Log — dnd-app

> **Active dnd-app bugs / tech debt / broken config — Electron VTT issues only.**
> Sibling logs:
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dnd-app/` (TS/React/Electron/Vite/biome/vitest/Pixi/peerjs/the 5e JSON content set) → here. `Domain: both` cross-cutting entries → mirror in BOTH `BMO-ISSUES-LOG.md` AND this file (small duplication is intentional; one fix removes both copies).

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **Backlog re-opened 2026-05-12** after the comprehensive dnd-app audit (plan: `~/.claude/plans/your-job-is-to-wild-thacker.md`). Entries below all sourced from that scan. Execution batched into Phase 28 sub-phases — see `dnd-app/docs/phases/phase-28-plan.md`.

## Critical

### [2026-05-12] `Math.random()` used for game-affecting dice rolls across 25+ sites — bypasses `services/dice/dice-engine.ts`

- **Category:** bug
- **Severity:** critical
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive dnd-app audit (2026-05-12)
- **Phase:** 28a

**Description:** The canonical secure dice path exists (`src/renderer/src/utils/crypto-random.ts` exposing `cryptoRandom()` and `cryptoRollDie(sides)` backed by `crypto.getRandomValues`) and is correctly used in `services/dice/dice-engine.ts:1`, `utils/dice-utils.ts:34`, and `utils/invite-code.ts:18` (which even includes an explanatory comment on V8 `Math.random` predictability). But the rest of the game code reaches for `Math.random()` directly, with the same pattern repeated 25+ times. Game outcomes therefore depend on `XorShift128+` instead of `crypto.getRandomValues`, can't be seeded for reproducibility, and bypass any future audit/log instrumentation the engine adds.

**Affected sites (game-affecting):**

| File:line | Roll |
|-----------|------|
| `src/renderer/src/components/game/GameLayout.tsx:781` | **d20 initiative** (context menu → Add to Initiative) |
| `src/renderer/src/components/game/overlays/PlayerHUDEffects.tsx:231, 297` | **1d4 recovery hours** (Stable condition) |
| `src/renderer/src/components/game/overlays/PlayerHUDEffects.tsx:278` | **1d4 Bless bonus** to death save |
| `src/renderer/src/components/game/overlays/ReactionPrompts.tsx:195` | **d20 reaction** |
| `src/renderer/src/components/game/overlays/GamePrompts.tsx:124, 240` | **d20 game prompts** |
| `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx:74` | d6 ± modifier |
| `src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx:85` | d20 |
| `src/renderer/src/components/game/modals/dm-tools/NPCGeneratorModal.tsx:50, 54` | dN, random selection |
| `src/renderer/src/components/game/modals/dm-tools/treasure-generator-utils.ts:66, 72` | dN, d100 treasure |
| `src/renderer/src/components/game/sidebar/TablesPanel.tsx:79, 115, 123` | random tables |
| `src/renderer/src/stores/builder/types.ts:44` | **4d6 stat generation** (character builder) |
| `src/renderer/src/data/starting-equipment-table.ts:71` | d10 |
| `src/renderer/src/data/bastion-events.ts:14` | dN |
| `src/renderer/src/data/sentient-items.ts:49` | dN |
| `src/renderer/src/data/personality-tables.ts:20` | random index |
| `src/renderer/src/data/weather-tables.ts:106, 115` | weighted random + range |
| `src/renderer/src/utils/dawn-recharge.ts:27` | dN recharge |

Test files using `Math.random` (`dice-physics.test.ts:74`, `dice-meshes.test.ts:220`, `dawn-recharge.test.ts:33`) are acceptable. `DiceOverlay.tsx:124` uses it for a tray id — non-game but inconsistent with the rest of the UUID scheme.

**Proposed fix:**
- [ ] Per call site, replace `Math.floor(Math.random() * N) + 1` with `cryptoRollDie(N)` (single-die rolls) or wrap as `cryptoRandom()` for [0,1) needs
- [ ] Where a roll feeds a derived value (e.g., `Math.random() * arr.length`), use `Math.floor(cryptoRandom() * arr.length)`
- [ ] Weighted-random in `weather-tables.ts:106` needs an explicit cryptoRandom replacement
- [ ] Add a biome/eslint rule that flags `Math.random` outside `utils/crypto-random.ts` and `*.test.*`
- [ ] (Optional) Audit log of rolls — once on the engine path, log d20s for replay/dispute resolution

**Related entries:** SUGGESTIONS-LOG-DNDAPP "[2026-05-12] DO NOT use `Math.random` for game-rolling code" (design-gotcha companion).

**Related files:** `src/renderer/src/utils/crypto-random.ts`, `src/renderer/src/services/dice/dice-engine.ts`, plus all 25+ sites above.

---

## High

### [2026-05-12] Claude model strings stale across 4 sites — Claude 4.5 / 4.6 / 4.7 family missing

- **Category:** debt
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** AI surface audit (2026-05-12)
- **Phase:** 28b
- **Effort estimate:** 30 min

**Description:** The AI provider config exposes only Sonnet 4 + 3.5-Sonnet + 3.5-Haiku. Per the current Anthropic model line, the live family is Opus 4.7 / Sonnet 4.6 / Haiku 4.5. Worse, `claude-client.ts:96` hardcodes the deprecated 3.5-haiku for the API-key validation ping — if Anthropic retires that model, valid keys will start returning false. The 4.5/4.6 Sonnet line is missing entirely.

**Affected sites:**
- `src/main/ai/llm-provider.ts:20-22` — registry: `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`
- `src/main/ai/claude-client.ts:96` — `isAvailable()` pings `claude-3-5-haiku-20241022`
- `src/main/ai/claude-client.ts:107` — `listModels()` returns the same 3 stale ids
- `src/renderer/src/components/campaign/AiProviderSetup.tsx:251` — defaults to `claude-sonnet-4-20250514`

**Proposed fix:**
- [ ] Add Opus 4.7 (`claude-opus-4-7`), Sonnet 4.6 (`claude-sonnet-4-6`), Haiku 4.5 (`claude-haiku-4-5-20251001`) to `llm-provider.ts:20-22`
- [ ] Use the cheapest available Haiku for `isAvailable()` (currently 3-5-haiku — bump to 4.5)
- [ ] Bump UI default in `AiProviderSetup.tsx:251` to Sonnet 4.6 (sane mid-tier default; let the user opt into Opus 4.7)
- [ ] Keep old ids in `listModels()` for back-compat if existing campaigns reference them, but mark deprecated

**Related entries:** "[2026-05-12] `@anthropic-ai/sdk@^0.78.0` pre-1.x" (same phase). SUGGESTIONS-LOG-DNDAPP existing `2026-04-24-ai-provider-imports-mixed` (related — picking one import pattern simplifies adding new models).

**Related files:** `src/main/ai/llm-provider.ts`, `src/main/ai/claude-client.ts`, `src/renderer/src/components/campaign/AiProviderSetup.tsx`, `src/shared/ipc-schemas.test.ts:18`.

---

### [2026-05-12] `bmoPiFetch` has no retry / backoff — every flaky LAN call surfaces as hard error

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** BMO bridge audit (2026-05-12)
- **Phase:** 28c

**Description:** `src/main/bmo-bridge.ts:31-53` — `bmoPiFetch` sets an AbortController with a 15 s timeout, but on any failure (timeout, ECONNRESET, 5xx) it returns `{ error }` once. No retry, no exponential backoff, no circuit breaker. Worse, `sendInitiativeToPi` (line 80) fires on every initiative change and just throws the rejection into the floor — a flaky Pi link silently drops Discord sync.

**Proposed fix:**
- [ ] Wrap `bmoPiFetch` in a retry helper: 3 attempts, backoff 200 ms / 800 ms / 2000 ms, skip retry on 4xx
- [ ] Surface persistent failures (3 consecutive) into a renderer toast via IPC ("BMO unreachable — Discord sync paused")
- [ ] Distinguish "transient" (retried) vs "permanent" (4xx, auth missing) errors in the returned `BridgeResponse`

**Related entries:** "[2026-05-12] `BridgeResponse.ok` vs `.error` contract inconsistent" (same module, related).

**Related files:** `src/main/bmo-bridge.ts:31-53, 80-89`.

---

### [2026-05-12] `BridgeResponse.ok` vs `.error` contract is inconsistent — callers must check both

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** BMO bridge audit (2026-05-12)
- **Phase:** 28c

**Description:** `src/main/bmo-bridge.ts:18-22` declares `BridgeResponse { ok?: boolean; error?: string; [key: string]: unknown }`. The function:
- Sets `ok: false, error: 'HTTP …'` only when `res.ok === false` (line 44-46)
- Sets `error: …` (no `ok` field) when the fetch throws (line 48-49)
- Sets nothing on success — relies on the server response body's own shape

Callers that check `if (!result.error)` succeed/fail differently from callers that check `if (result.ok)`. The body-pass-through also means a server response containing the key `ok` (some BMO endpoints use this naturally) collides with the bridge-injected `ok`.

**Proposed fix:**
- [ ] Always set `ok: true | false` on every return
- [ ] Wrap the server response under a `data` field instead of spreading at the top level
- [ ] Make `BridgeResponse` a discriminated union: `{ ok: true; data: unknown } | { ok: false; error: string }`
- [ ] Codemod-update all callers

**Related files:** `src/main/bmo-bridge.ts:18-22, 31-53` plus every caller in `src/main/` (`sendInitiativeToPi`, `sendNarration`, `startDiscordDm`, etc.).

---

### [2026-05-12] `@anthropic-ai/sdk@^0.78.0` pre-1.x — missing newer streaming & cache helpers

- **Category:** debt
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** AI surface audit (2026-05-12)
- **Phase:** 28b

**Description:** `package.json` pins `@anthropic-ai/sdk: ^0.78.0`. The 1.x line (mid-2025+) has cleaner streaming, ergonomic `cache_control` block helpers, and is the supported track per Anthropic docs. The 0.78 line will accumulate deprecation pressure as new features land.

**Proposed fix:**
- [ ] Bump `@anthropic-ai/sdk` to latest 1.x in `package.json`
- [ ] Update `src/main/ai/claude-client.ts` imports / API usage to match (the breaking changes are mostly named-export reshuffles)
- [ ] Run the full claude-client.test path if it exists; otherwise add one
- [ ] Pairs with the prompt-caching work — much easier on 1.x

**Related entries:** "[2026-05-12] No Anthropic prompt caching wired" (same phase, depends on this).

**Related files:** `dnd-app/package.json`, `src/main/ai/claude-client.ts`.

---

## Medium

### [2026-05-12] `stat-mutations.ts` unsafe HP cast + in-place mutation of `Record<string, unknown>`

- **Category:** debt, bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28d

**Description:** `src/main/ai/stat-mutations.ts:178` — `applyChange(char: Record<string, unknown>, change: StatChange): void` takes an `unknown`-keyed bag and then per-case re-asserts shape with:
```ts
const hp = char.hitPoints as { current: number; maximum: number; temporary: number }
```
…at lines 181, 192, 201. The same shape exists as a typed `HitPoints` in `src/renderer/src/types/character-5e.ts:136` but isn't reachable from `src/main/` cleanly today. The function is also documented as mutating in place (line 178 comment), which is brittle if a caller passes a store-owned or frozen object and assumes immutable behavior. A missing `hitPoints` field, or a shape-changing migration, would surface as runtime `TypeError: Cannot read properties of undefined` rather than a compile error.

**Proposed fix:**
- [ ] Move the canonical `Character5e` / `HitPoints` types to `src/shared/` so they're consumable from main + renderer
- [ ] Replace `Record<string, unknown>` with the typed `Character5e` so HP / conditions / deathSaves are typed at the boundary
- [ ] Decide: keep in-place mutation (document it loudly) or return new objects and pipe through `migrateData`-style call sites
- [ ] Add a unit test that exercises all `StatChange` cases (damage, heal, temp_hp, condition adds/removes, exhaustion, death saves)

**Related files:** `src/main/ai/stat-mutations.ts:160-220`, `src/main/ai/character-context.ts:43`, `src/renderer/src/types/character-5e.ts:136`.

---

### [2026-05-12] `save-queue.ts` cleanup is dead-coded in a comment — map grows unbounded

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28d

**Description:** `src/main/storage/save-queue.ts:38-46` — the cleanup `if (queues.get(key) === next.catch(() => undefined))` is documented as broken in an inline comment (lines 40-42): *"the catch wrapper above is a new promise, so the equality check always fails — fall through to the simpler 'delete if last' below"*. There is no "simpler delete if last" below — the function falls through to a "leave it" comment (lines 44-46) acknowledging the map grows by O(unique-ids) over the app lifetime. For a campaign app that's bounded by hundreds of entity ids, but unbounded across long-running sessions with imports/creates.

**Proposed fix:**
- [ ] Store a stable handle to the wrapped promise so the equality check works:
      ```ts
      const queueHandle = next.catch(() => undefined)
      queues.set(key, queueHandle)
      // …after await…
      if (queues.get(key) === queueHandle) queues.delete(key)
      ```
- [ ] OR remove the dead comment + accept the bounded growth (document the bound)
- [ ] Add a unit test that confirms map size returns to zero after a quiesce

**Related files:** `src/main/storage/save-queue.ts`.

---

### [2026-05-12] `stopSyncReceiver()` doesn't await in-flight connections

- **Category:** bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** BMO bridge audit (2026-05-12)
- **Phase:** 28c

**Description:** `src/main/bmo-bridge.ts:212-218` — `syncServer.close()` stops accepting new connections but does not call `syncServer.closeAllConnections()`. In-flight requests can still write to the response and pre-Node-18 will hang the shutdown. The function also reassigns `syncServer = null` immediately, so if an in-flight handler errors after close, the `'error'` listener (line 205) sets `syncServer = null` redundantly but harmlessly. Result: graceful shutdown is slow / fragile on app quit.

**Proposed fix:**
- [ ] Call `syncServer.closeAllConnections()` (Node ≥ 18.2) before `syncServer.close()`
- [ ] Make `stopSyncReceiver` return a Promise so callers can await full close
- [ ] Wire into the `before-quit` handler in `src/main/index.ts`

**Related files:** `src/main/bmo-bridge.ts:104-218`, `src/main/index.ts` (before-quit lifecycle).

---

### [2026-05-12] `claude-client.ts` hardcodes `max_tokens: 4096` — long narration / lore truncates

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** AI surface audit (2026-05-12)
- **Phase:** 28b

**Description:** `src/main/ai/claude-client.ts:40, 77` both pass `max_tokens: 4096`. Opus 4.7 / Sonnet 4.6 support far higher; long DM narration, lore exposition, or session-recap generation will be cut off mid-sentence. The fix is to either expose the limit through `LLMProvider` (per-call) or pick a model-aware default.

**Proposed fix:**
- [ ] Add `maxTokens?: number` to the `LLMProvider.streamChat` / `chatOnce` signatures with a model-aware default in claude-client
- [ ] Surface "Max response length" in `AiProviderSetup.tsx` UI (slider 1k → 16k)
- [ ] Default to ~8192 for Sonnet/Haiku, ~16384 for Opus

**Related files:** `src/main/ai/claude-client.ts:40, 77`, `src/main/ai/llm-provider.ts`, `src/renderer/src/components/campaign/AiProviderSetup.tsx`.

---

### [2026-05-12] No Anthropic prompt caching wired — paying full cost on stable prefixes

- **Category:** debt, performance
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** AI surface audit (2026-05-12)
- **Phase:** 28b

**Description:** `src/main/ai/claude-client.ts` calls `client.messages.stream({ system, messages, … })` with no `cache_control` blocks. The system prompt (built in `context-builder.ts`) and the character / campaign context blocks are exactly the kind of stable prefix that Anthropic prompt caching is designed for — every turn of an AI DM session pays the full token cost of re-sending them. CLAUDE.md `claude-api` skill explicitly expects prompt caching by default.

**Proposed fix:**
- [ ] Restructure `system` into either an array of content blocks or use the user-message cache-control pattern (per the SDK 1.x API)
- [ ] Mark the stable prefix (system prompt + campaign / character context) with `cache_control: { type: 'ephemeral' }`
- [ ] Measure cache-hit rate via the response usage object; surface in dev logs
- [ ] Add a unit test that confirms the cache_control field reaches the SDK call

**Blocked by:** "[2026-05-12] `@anthropic-ai/sdk@^0.78.0` pre-1.x" — much easier on 1.x SDK.

**Related files:** `src/main/ai/claude-client.ts:37-65, 67-89`, `src/main/ai/context-builder.ts`.

---

### [2026-05-12] dnd-app CI is minimal — only `validate:5e` gates PRs

- **Category:** config, debt
- **Severity:** medium
- **Domain:** dnd-app, tooling
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28e

**Description:** `.github/workflows/dnd-app-validate-5e.yml` is the only workflow whose `paths:` glob includes `dnd-app/**`, and it runs only `npm run validate:5e`. Every other gate is wired as an npm script (`test`, `lint`, `audit:ci`, `dead-code`, `circular`) but no workflow invokes them. PRs can land with TypeScript errors, biome violations, vitest regressions, new npm vulnerabilities, or new circular deps, and nothing catches them at the gate.

**Proposed fix:**
- [ ] Add `.github/workflows/dnd-app-ci.yml` that runs on PRs touching `dnd-app/**`:
  - `npm ci`
  - `npx tsc --noEmit -p tsconfig.web.json` and `npx tsc --noEmit -p tsconfig.node.json`
  - `npm run lint`
  - `npm test`
  - `npm run audit:ci`
  - `npm run circular`
  - `npm run dead-code` (allow-fail until knip baseline is clean)
- [ ] Cache `node_modules` via `actions/setup-node@v4` `cache: npm` (same as the existing workflow)

**Related entries:** SUGGESTIONS-LOG-DNDAPP existing `[2026-04-24] Add npm run check:full aggregate script` — this CI work composes naturally with the check:full script.

**Related files:** `.github/workflows/dnd-app-validate-5e.yml` (template), new `.github/workflows/dnd-app-ci.yml`, `dnd-app/package.json` scripts.

---

### [2026-05-12] ~74 `as unknown as <Type>` casts — deserializer / mapper gaps

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28d

**Description:** A repo-wide grep shows ~74 `as unknown as ...` casts. Hot spots:
- `src/renderer/src/services/library-service.ts:639, 678-679, 694, 702, 710` (5 sites in one file)
- 7+ test-helper files with `as any` (worse — total type erasure)

`as unknown as X` is the type system's escape valve when the surrounding code can't express the shape — usually a sign that data crossing a serialization or IPC boundary has no schema. Each one is a place a bad payload can silently corrupt downstream state.

**Proposed fix:**
- [ ] Triage the 74 by file: cluster by the boundary they sit on (IPC, JSON-from-disk, third-party SDK)
- [ ] Where the data has a known shape, add a zod parse at the boundary and return the typed result
- [ ] Where it's truly dynamic (plugin payloads), document the cast with a comment instead of swallowing silently
- [ ] Net target: <40 across `dnd-app/src/` outside of tests

**Related entries:** SECURITY-LOG `2026-04-24 dnd-app: 119 of 121 IPC handlers don't zod-validate payloads` — same family of "schemas aren't enforced at boundaries".

**Related files:** `src/renderer/src/services/library-service.ts`, plus the grep `as unknown as` output across `src/`.

---

### [2026-05-12] Effect-dependency suppressions in game-critical hooks — stale-closure bug risk

- **Category:** bug, debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28d

**Description:** Four sites suppress `biome useExhaustiveDependencies` with reasoning that depends on a "stable" assumption. Each is a latent bug: when the "stable" prop ever becomes non-stable (a refactor that adds reactivity, a new wrapper hook), the effect runs against a stale closure and the symptom is subtle (UI doesn't update, state desyncs).

**Affected sites:**
- `src/renderer/src/components/game/GameLayout.tsx:407` — `// biome-ignore useExhaustiveDependencies: "activeMap.id is sufficient"`
- `src/renderer/src/hooks/use-game-effects.ts:144, 307` — both "stable props" rationale
- `src/renderer/src/hooks/use-game-network.ts:92` — same

**Proposed fix:**
- [ ] Per site, attempt the honest dep list: if it triggers a render loop, refactor the surrounding state to break the loop instead of suppressing
- [ ] Where the dep really is provably stable (e.g., a setter from `useState`), suppress with a more specific comment ("setter ref is stable per React docs")
- [ ] Add a vitest that exercises a state change that *should* re-run the effect and confirm it does

**Related files:** see list above.

---

### [2026-05-12] Component-level test coverage ≈ 42 % colocated — game-critical UI untested

- **Category:** debt, test
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28h

**Description:** `find src -name '*.tsx'` returns 638 component files; `find src -name '*.test.tsx'` returns 271. Of the 367 .tsx files without a colocated test, several are game-critical or user-facing:
- `src/renderer/src/components/lobby/ReadyButton.tsx`
- `src/renderer/src/components/lobby/CharacterSelector.tsx`
- `src/renderer/src/components/campaign/SessionZeroStep.tsx`
- many others (full list via the find command above)

Caveat: integration tests may exist for some flows; the raw component-test ratio is a proxy. Still, the lobby/onboarding path has zero unit cover.

**Proposed fix:**
- [ ] Run a coverage report (`npm run test:coverage`) to get the authoritative figure
- [ ] Prioritize: lobby/onboarding flow first (it gates session start), then character sheet, then game/* overlays
- [ ] Establish a per-PR convention: new .tsx ⇒ new .test.tsx (CI gate: knip / a small lint rule)

**Related entries:** SUGGESTIONS-LOG-DNDAPP `2026-04-24-network-store-barrel-circular` — the `TokenContextMenu.test.tsx` failures are blocked by that circular-dep fix.

**Related files:** see find output; high-priority: `lobby/`, `campaign/`.

---

### [2026-05-12] `bmo-config.ts` default hardcoded `http://bmo.local:5000` — override path unclear

- **Category:** config
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28c

**Description:** `src/main/bmo-config.ts:7` returns the default `http://bmo.local:5000`. The `applyBmoBaseUrlFromSettings` function (called from `index.ts:7`) presumably updates this from `settings.json`, but the override-via-env path isn't visible. Dev/test scenarios that want a fake BMO end up patching the default at the source.

**Proposed fix:**
- [ ] Document the override chain (env > settings > default) in JSDoc at the top of `bmo-config.ts`
- [ ] Add `BMO_PI_URL` env-var precedence if not already present (per ARCHITECTURE.md)
- [ ] Add a settings-UI surface for the base URL so the user can point at a Pi-on-a-different-IP without editing JSON

**Related files:** `src/main/bmo-config.ts`, `src/main/index.ts:7`.

---

## Low

### [2026-05-12] Lists rendered via `.map()` may need virtualization for long collections

- **Category:** performance
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28f

**Description:** Most list rendering uses plain `.map()`. Chat is virtualized (`ChatPanel.tsx` uses `@tanstack/react-virtual`), but other lists aren't. Today's lists are short (< 100 items: creature list, spell slots, encounter log, journal entries) so it's fine, but `EncounterLog` and chat history can grow across a long campaign. Worth verifying before lists hit the thousands.

**Proposed fix:**
- [ ] Profile a 500-entry encounter log and chat history with React DevTools
- [ ] If render time > 16 ms, virtualize using `useVirtualizer`
- [ ] Document the threshold ("if list can exceed 200 items, virtualize")

**Related files:** `src/renderer/src/components/game/sidebar/EncounterLog*.tsx`, journal components.

---

### [2026-05-12] `readBody()` in sync receiver buffers full request body unbounded — DoS vector

- **Category:** bug, performance
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit (security companion in `SECURITY-LOG.md`)
- **Phase:** 28a

**Description:** `src/main/bmo-bridge.ts:108-115` — `readBody` does `Buffer.concat(chunks)` after collecting all `'data'` events. No `request['max-content-length']` check; no early-abort if `chunks.reduce` total exceeds a cap. A LAN host posting megabytes blocks the main process.

**Proposed fix:**
- [ ] Add a `MAX_BODY_BYTES = 64_000` constant; abort + 413 on overflow
- [ ] Check `Content-Length` header up-front; reject if too large
- [ ] (Related security entry covers the broader DoS angle)

**Related entries:** SECURITY-LOG `[2026-05-12] dnd-app: BMO sync receiver has no max-body-size guard`.

**Related files:** `src/main/bmo-bridge.ts:108-115, 163-178`.

---

### [2026-05-12] `Date.now()`-based condition IDs — collision on rapid double-clicks

- **Category:** bug
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28d

**Description:** `src/renderer/src/components/game/overlays/PlayerHUDEffects.tsx:234, 300` build condition ids as `` `cond-${Date.now()}` ``. If a user clicks the death-save buttons twice in the same ms (or a script does), both new conditions get the same id. Downstream code that keys by id will see one entry instead of two. Same risk in any other place that uses `Date.now()` as an id source.

**Proposed fix:**
- [ ] Use `crypto.randomUUID()` for new entity ids
- [ ] Grep `\`cond-\${Date.now()` / similar templates across the renderer and replace
- [ ] Consider an `idFor(scope: string)` helper that wraps `crypto.randomUUID()` with a scope prefix

**Related entries:** "[2026-05-12] UUID truncation pattern audit needed" (same phase, broader id sweep).

**Related files:** `src/renderer/src/components/game/overlays/PlayerHUDEffects.tsx:234, 300`.

---

### [2026-05-12] UUID truncation pattern audit needed (40+ sites)

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28d

**Description:** A repo-wide grep finds ~40+ instances of `crypto.randomUUID().slice(0, 8)` style truncation. Most are fine — chat-message ids, dice-tray ids — humans don't need full 128-bit UUIDs for these. But any *game-state* id (token, condition, journal entry, save) should be a full UUID. The 8-hex-char window is ~32 bits — birthday collision around 65k entries.

**Proposed fix:**
- [ ] Enumerate every truncation site by purpose; cluster as "UI-ephemeral" (OK to truncate) vs "persistent game state" (full UUID required)
- [ ] Migrate the persistent-state sites
- [ ] Add an `ephemeralId()` vs `entityId()` helper pair to make intent explicit

**Related entries:** "[2026-05-12] Date.now()-based condition IDs" (same phase, related).

**Related files:** grep `crypto.randomUUID().slice` across the codebase.

---

### [2026-05-12] `console.warn` for validation failures continues processing — silent inconsistency

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28f

**Description:** Multi-site pattern:
- `src/renderer/src/stores/network-store/client-handlers.ts:67` — warns and continues
- `src/renderer/src/stores/network-store/host-handlers.ts:50, 62, 230` — same
Each `console.warn` is paired with falling through to a default code path. The validation surfaced something worth logging; falling through means the system ended up in an unknown state.

**Proposed fix:**
- [ ] Per site, decide: throw + caught upstream, OR silently fall through with a clearer comment ("safe to ignore because …")
- [ ] If thrown, surface as a renderer toast or addSysMsg() for user visibility

**Related files:** see list above.

---

### [2026-05-12] `JSON.parse` unguarded in `game-data-handlers.ts:29` (IPC boundary)

- **Category:** bug
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28a

**Description:** `src/main/ipc/game-data-handlers.ts:29` — `return JSON.parse(content)`. Wrapped by the outer `ipcMain.handle` try/catch so it won't crash main, but the renderer-side error reaching from "data file corrupted" looks identical to "channel doesn't exist". Hard to debug. Path traversal IS prevented (line 24). The data files come from packaged resources, so corruption only happens via filesystem tampering or partial-write — unlikely but possible.

**Proposed fix:**
- [ ] Wrap in a local try/catch that returns a typed error message (`'INVALID_JSON'` + path) so the renderer surfaces a useful UI
- [ ] (Optional) zod-validate the parsed shape against the expected per-file schema (depends on the SUGGESTIONS-LOG `schemas-content-mismatch` work)

**Related files:** `src/main/ipc/game-data-handlers.ts:29`.

---

### [2026-05-12] Two open `TODO` markers in production code

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28g

**Description:**
- `src/renderer/src/components/game/GameLayout.tsx:280` — "TODO: Could enhance to pre-select the specific item" (ItemModal pre-selection)
- `src/renderer/src/components/game/map/map-overlay-effects.ts:27` — "TODO: Add playing state management"

Both are enhancements that have been deferred. Either action them or convert to a dated note that makes the deferral visible.

**Proposed fix:**
- [ ] Decide on each: do, or replace with a dated `// FIXME: [2026-05-12] …` and let the issue log carry it
- [ ] If actioned, remove the comment; if deferred, dated comment + entry references this log line

**Related files:** see list above.

---

### [2026-05-12] peerjs reconnection logic absent on audited surface

- **Category:** bug
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28i

**Description:** During the multiplayer-coverage gap audit, no obvious reconnect-on-disconnect handler surfaced in `src/renderer/src/network/`. peerjs's `.on('disconnected')` callback may or may not be wired with `peer.reconnect()`. Worth confirming — a transient WiFi blip during a session today may kill multiplayer until manual rejoin.

**Proposed fix:**
- [ ] Read all `src/renderer/src/network/*.ts` for the disconnect handler
- [ ] If absent, add a reconnect with exponential backoff + max-attempts cap
- [ ] Surface the reconnect state in the lobby UI (greyed-out "reconnecting…" badge)

**Related entries:** Audit coverage gaps (SUGGESTIONS-LOG info entry).

**Related files:** `src/renderer/src/network/` (25 files).

---

### [2026-05-12] `electron-builder` files-allowlist may leak `docs/` into the packaged bundle

- **Category:** config, perf
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28g

**Description:** `dnd-app/package.json` `build.files` excludes `5.5e References/`, `bmo/`, `Tests/`, `.claude/`, `CLAUDE.md`, but doesn't mention `docs/`. `docs/` lives at the project root, not inside `dnd-app/`, so it's probably outside the build context anyway — but worth confirming. If it leaks, the packaged app ships with internal planning notes.

**Proposed fix:**
- [ ] Run `electron-builder --dir` and `ls dist/` to confirm what actually ships
- [ ] If `docs/` is present, add `!docs/**/*` to the files-allowlist
- [ ] Add an `audit:bundle` script that fails CI if forbidden paths slip in

**Related files:** `dnd-app/package.json` build section.

---

### [2026-05-12] Limited aria-* coverage — ~40 attrs across 637 components

- **Category:** UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28f

**Description:** Modal focus-trap and chat aria-live are correct (`Modal.tsx:32, 58`; `ChatPanel.tsx:185`). The rest of the renderer is sparse on aria. For a desktop VTT this is a low-priority concern, but adding aria-label / aria-describedby on the high-traffic surfaces (initiative tracker, action buttons, dice tray) would help screen-reader users and keyboard navigation.

**Proposed fix:**
- [ ] Sweep the top 20 user-traffic components for missing aria
- [ ] Add a per-feature rule of thumb (buttons → aria-label if icon-only; lists → aria-live for updates)
- [ ] Don't aim for 100% coverage; aim for "all interactive elements with non-text content"

**Related files:** broad — start with `src/renderer/src/components/game/`.

---

### [2026-05-12] `<div onClick>` anti-pattern present — should be `<button>`

- **Category:** UX, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28f

**Description:** Audit Agent flagged the pattern without enumerating. Run `grep -rn '<div[^>]*onClick' --include='*.tsx' src/renderer` to enumerate. Each one is a non-keyboard-navigable, non-screen-reader-friendly clickable. Most can become `<button type="button">` with no styling change (Tailwind classes preserve).

**Proposed fix:**
- [ ] Run the grep to get the list
- [ ] Replace each `<div onClick>` with `<button type="button" className="...">` (preserving styling)
- [ ] Where the div needs to remain (e.g., card with nested interactive children), add `role="button"` + `tabIndex={0}` + `onKeyDown` Enter/Space handler — but prefer the real button when possible

**Related entries:** "[2026-05-12] Limited aria coverage" (same phase, same a11y umbrella).

**Related files:** grep output, broad across `components/`.

---

### [2026-05-12] Silent `.catch()` blocks log to console but never surface to user

- **Category:** UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28f

**Description:** Multiple places swallow errors with `console.log` / `console.warn` and no UI feedback:
- `src/renderer/src/components/sheet/FeaturesSection5e.tsx:47, 55` — silent catch on data loads
- Other catches per Agent C survey (~10 sites)

If those data loads fail, the user sees a blank section with no indication that anything went wrong, and there's no way to trigger a retry.

**Proposed fix:**
- [ ] Per site, decide: is the failure user-actionable? If yes, show a toast or in-section error UI with retry; if no, log to file (`logToFile` in main) instead of `console`
- [ ] Add a `useErrorToast()` hook that wraps the common "show error toast + log" pattern

**Related files:** `src/renderer/src/components/sheet/FeaturesSection5e.tsx:47, 55`, plus the broader sweep.

---

### [2026-05-12] Color tokens not centralized — ~20-30 inline hex literals scattered

- **Category:** UX, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28f

**Description:** Tailwind centralizes the palette via `tailwind.config`, but ~20-30 inline `#hex` references in `.tsx` / `.css` files bypass it. Theme drift risk: a dark-mode pass or a contrast adjustment touches Tailwind but misses the inline literals.

**Proposed fix:**
- [ ] `grep -rn "#[0-9a-fA-F]\{3,6\}" --include='*.tsx' --include='*.ts' --include='*.css' src/renderer` to enumerate
- [ ] Triage: chart colors and dice-face palettes may be intentionally inline (their meaning is "rule of the chart"). Everything else → Tailwind token
- [ ] Where a new token is needed, add to `tailwind.config` + use `bg-primary` / `text-accent` etc.

**Related files:** grep output, broad.

---

### [2026-05-12] `z-[9999]` and other magic z-index — needs named layer convention

- **Category:** UX, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28f

**Description:** `src/renderer/src/components/sheet/PrintSheet.tsx:27, 67`, `Tooltip.tsx:78`, `LanguagesTab5e.tsx:65` use `z-[9999]`. Reasonable for top-layer overlays today, but as more overlays land (combat modal, screen-share, AI-narration banner) the implicit layer stack becomes hard to reason about.

**Proposed fix:**
- [ ] Define a layer convention in Tailwind: `z-app`, `z-modal-backdrop`, `z-modal`, `z-tooltip`, `z-toast`, `z-overlay-print`
- [ ] Replace magic numbers with semantic classes
- [ ] Document the layer order in `dnd-app/docs/UI-LAYERS.md` (new file)

**Related files:** see list above.

---

### [2026-05-12] Window minimum 1024×768 tight for VTT with sidebar + map + initiative

- **Category:** UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** comprehensive audit
- **Phase:** 28f

**Description:** `src/main/index.ts:38-41` — `minWidth: 1024, minHeight: 768`. A VTT showing sidebar + map + initiative + chat at 1024×768 ends up with a postage-stamp map. Worth verifying the layout doesn't collapse below ~1280 wide.

**Proposed fix:**
- [ ] At minimum size, manually test each panel layout (Game, Map editor, Character sheet)
- [ ] If layouts break, either: bump `minWidth` to 1280, OR add a "compact mode" toggle that hides sidebar
- [ ] Document the minimum supported viewport in `dnd-app/README.md`

**Related files:** `src/main/index.ts:38-41`.

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
