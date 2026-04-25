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

## Critical

*(none currently logged)*

---

## High

*(none currently logged)*

---

## Medium

### [2026-04-24] PeerJS host-handlers cast 18 of 20 message payloads without zod validation — malicious peer can corrupt state

- **Category:** bug, security
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** PeerJS host validation audit

**Description:** `src/renderer/src/stores/network-store/host-handlers.ts` registers handlers for 20 incoming peer message types: `player:ready`, `player:character-select`, `chat:message`, `chat:file`, `player:color-change`, `chat:whisper`, `game:dice-roll`, `player:buy-item`, `player:sell-item`, `player:turn-end`, `combat:reaction-response`, `player:trade-request`, `player:trade-response`, `player:trade-cancel`, `player:journal-add`, `player:journal-update`, `player:journal-delete`, `player:roll-result`, `player:inspect-request`, `player:haggle-request`, plus `pong`. **Only 2 (`player:buy-item`, `player:sell-item`) call `safeParse` against a zod schema** (lines 130, 159). The remaining 18 cast directly:

```ts
const readyPayload = message.payload as { isReady?: boolean }
const payload = message.payload as { characterId: string | null; characterName: string | null }
const payload = message.payload as { timestamp?: number }
```

**Threat model:** Unlike the IPC-zod-gap entry (where the trust boundary is "same process renderer — sandboxed via Electron"), peers are **unrelated machines on a LAN or over PeerJS's relay**. A malicious / buggy peer can send `{ payload: { isReady: ['array','instead','of','bool'] } }` and the host treats `.isReady ?? true` as truthy and mutates state. More dangerous payloads: `player:journal-update` could write attacker-supplied content as another player's journal entry; `chat:whisper` could spoof the sender; `player:character-select` lets a peer assert any character ID and have the host accept it.

The existing `noAssignInExpressions` lint warnings (per the existing Biome lint debt entry) cluster in this exact file — it's a concentration of partially-validated runtime trust.

**Impact:** Multi-player session data integrity. A malicious player can:
- Spoof other players' journal entries (`player:journal-add/update/delete`)
- Send unbounded chat messages (no length cap — DoS the chat UI)
- Claim any character ID (`player:character-select` with `characterId: 'someone-elses-id'`)
- Invalid trade-request structures crashing the host

**Reproduction:**
```bash
grep -B1 -A3 "as\s*{[^}]*}" src/renderer/src/stores/network-store/host-handlers.ts | head -60
# 18 of 20 case branches cast without validation
```

**Proposed fix:**
- [ ] Add a `PeerMessageSchema` (zod discriminated union over `type`) in `src/renderer/src/network/message-types.ts` (where the types already live)
- [ ] At the top of every case branch, `const r = XPayloadSchema.safeParse(message.payload); if (!r.success) { logger.warn(...); return }`
- [ ] Length caps on string fields (chat content, journal text, character names) — currently unbounded
- [ ] Reject messages where `senderId` doesn't match `fromPeerId` (anti-spoofing)
- [ ] Add unit tests with adversarial payloads per handler

**Related files:** `src/renderer/src/stores/network-store/host-handlers.ts`, `src/renderer/src/stores/network-store/client-handlers.ts`, `src/renderer/src/network/message-types.ts`

**Related entries:** `SECURITY-LOG.md` "PeerJS host accepts unvalidated peer messages" entry (mirrored from security angle).

---

### [2026-04-24] Three.js dice geometries created per-roll, never disposed — long sessions leak GPU memory

- **Category:** performance, bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** Pixi/Three leak audit

**Description:** `src/renderer/src/components/game/dice3d/dice-generators.ts` and `dice-meshes.ts` create new `THREE.TetrahedronGeometry`, `BoxGeometry`, `OctahedronGeometry`, etc. per-call:

```ts
// dice-generators.ts — createD4 (and 6/8/10/12/20/100 siblings)
export function createD4(colors, isHidden, solidOnly = false): DieDefinition {
  const geo = new THREE.TetrahedronGeometry(radius)
  geo.computeVertexNormals()
  ...
}
```

Per-file balance:

| File | `new THREE.*()` | `.dispose()` |
|---|---|---|
| `dice-generators.ts` | 43 | 0 |
| `dice-meshes.ts` | 22 | 0 |
| `dice-physics.ts` | 4 | 0 |
| `dice-textures.ts` | 6 | 0 |
| `DiceRenderer.tsx` | 9 | 1 |

Total: **84 `new THREE.*()` vs 1 `dispose()`**. `DiceRenderer.tsx`'s lone dispose is the WebGLRenderer dispose on unmount — that's correct for the renderer itself, but each die's geometry/material/texture is **not** disposed.

`createDie()` is called per dice roll (not once at module load — verified — `dice-meshes.ts` calls `createD4(colors, isHidden, solidOnly)` inside a per-roll function). Each roll allocates fresh GPU resources; `THREE.Scene.remove(mesh)` removes it from the scene but does **not** free its underlying `BufferGeometry` / `Material` / `Texture` — those need explicit `.dispose()`.

**Impact:**
- Short sessions: imperceptible.
- Long sessions (an evening's play with hundreds of rolls): GPU memory grows. Eventually browser shows "WebGL out of memory" or the app stalls.
- The 30 failing tests include `token-sprite.test.ts` ("`container.removeChildren is not a function`") which is the matching Pixi-side issue — `clearDice()` and similar paths in `DiceRenderer` may share root cause.

**Proposed fix:**
- [ ] In `clearDice()` (`DiceRenderer.tsx`) — for each die in the scene, call `mesh.geometry.dispose()`; for each material in `mesh.material` (which is an array), `material.dispose()`; for each material's `map`, `material.map?.dispose()`
- [ ] Or: cache the per-die-type geometries at module load (one `TetrahedronGeometry` per d4, not per roll) and reuse — only materials + meshes change per-roll
- [ ] Add an instrumentation test: log `THREE.WebGLRenderer.info.memory.geometries` count before and after 50 rolls; assert it stops growing
- [ ] Pair with the Pixi-side audit (existing token-sprite vitest failures may share root cause)

**Related files:** `src/renderer/src/components/game/dice3d/dice-generators.ts`, `dice-meshes.ts`, `dice-textures.ts`, `dice-physics.ts`, `DiceRenderer.tsx`

**Related entries:** "30 failing vitest tests" (medium) — `token-sprite.test.ts` failures may have similar root cause on the Pixi side.

---

### [2026-04-24] `scripts/schemas/*.ts` zod schemas don't validate `public/data/5e/` content — schemas are dead documentation

- **Category:** debt, docs
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** schema-vs-content drift validation (added `scripts/audit/validate-content-vs-schemas.ts`)

**Description:** The 9 schemas in `scripts/schemas/` (`backgrounds`, `bestiary`, `classes`, `equipment`, `feats`, `mechanics`, `species`, `spells`, `world`) are written for **single-record shapes**, but the matching content in `src/renderer/public/data/5e/` is either bare arrays or wrapper objects with extra metadata. Spot-check (10 file/schema pairs) found **0 passes / 6 fails / 4 file-not-found**:

| Schema | Content path | Drift |
|---|---|---|
| `SpellsSchema` (object wrapper) | `spells/spells.json` | content is `Spell[]` (array of 395) |
| `BestiarySchema` (object wrapper) | `dm/npcs/monsters.json` | content is `Monster[]` (array of 379) |
| `BestiarySchema` | `dm/npcs/creatures.json` | array of 99 |
| `BestiarySchema` | `dm/npcs/npcs.json` | array of 44 |
| `ClassSchema` (single class) | `character/classes.json` | content is `{ chapter, classes: [...] }` |
| `BackgroundSchema` (single background) | `character/backgrounds.json` | content is `{ section, description, total_count, backgrounds, cross_references, structural_patterns }` |

`.cursorrules` describes `scripts/schemas/` as "schemas (shared by extract/)" — but in their current form, they cannot validate any of the actual content. Effect: schemas are documentation-only, with no runtime enforcement, and any drift between content and intended shape goes undetected.

**Reproduction:**
```bash
cd dnd-app && ./node_modules/.bin/tsx scripts/audit/validate-content-vs-schemas.ts
# → 0 PASS / 6 FAIL / 4 SKIP (file not found)
```

**Proposed fix:**
- [ ] **Option A (preferred):** rewrite the schemas to match content shape. e.g.:
  - `export const SpellsContentSchema = z.array(SpellSchema)` (or `z.union([z.array(SpellSchema), z.object({ spells: z.array(SpellSchema) })])` for back-compat)
  - `export const ClassesContentSchema = z.object({ chapter: z.string(), classes: z.array(ClassSchema) })`
- [ ] **Option B:** rewrite the content. Costly because content was hand-shaped over many sessions.
- [ ] After Option A: wire validation into the existing `scripts/audit/validate-content-vs-schemas.ts` and add `npm run validate:5e`. Run in `npm run check:full` (proposed in SUGGESTIONS).
- [ ] Regenerate the chunk index after any schema-driven content fix to make sure derived index data stays in sync.

**Related files:** `dnd-app/scripts/schemas/*.ts`, `dnd-app/src/renderer/public/data/5e/`, new `dnd-app/scripts/audit/validate-content-vs-schemas.ts`

**Related entries:** "magic-items duplicates" (medium, existing) — same root family of "5e content has no enforced contract."

---

### [2026-04-24] `isolated-vm` is in production deps but unused — plugins run with full renderer privileges

- **Category:** debt, security
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** plugin sandbox security review

**Description:** `package.json` lists `"isolated-vm": "^5.0.4"` in `dependencies`. `isolated-vm` is a V8-context sandbox commonly used to run untrusted JS without exposing the host process. **Zero references to `isolated-vm` exist anywhere in `src/`.** Plugin code is loaded via:

```ts
// src/renderer/src/services/plugin-system/plugin-registry.ts:77
const moduleUrl = `plugin://${id}/${manifest.entry}`
const module = await import(/* @vite-ignore */ moduleUrl)
```

— a normal renderer-process dynamic import. The plugin runs in the renderer with full access to the React tree, every zustand store (game state, characters, AI keys-in-memory), all 146 IPC channels, and the entire DOM. The dependency suggests a sandbox; the implementation provides none.

The plugin protocol *file-system* access is correctly scoped (path-traversal protection works), but once the JS executes, there's no isolation.

**Impact:**
1. The `isolated-vm` dep is dead bundle/install weight — it pulls a native build (~MB) every install.
2. The plugin trust model is "trust on install" but the deps suggest "sandboxed" — future contributors will reason wrongly about the threat surface.
3. If plugins are ever loaded from untrusted sources (e.g., a future plugin marketplace), this is a critical security hole.

**Reproduction:**
```bash
cd dnd-app
grep -rn "isolated-vm" src/        # → 0 results
node -e "console.log(require('isolated-vm'))"   # → loads (so it IS installed)
```

**Proposed fix (pick one):**
- [ ] **Drop the dep:** remove from `package.json` + run `npm install`. Update `dnd-app/docs/PLUGIN-SYSTEM.md` to clearly document "trust-on-install" model. Remove any references to "sandbox" in plugin docs.
- [ ] **Implement the sandbox:** use `isolated-vm` to run plugin entry-point JS in an isolate; expose only the deliberate `PluginAPI` surface as bridge functions; reject direct DOM/store access. Substantial work (~1 week), but proper.

**Related files:** `dnd-app/package.json`, `src/renderer/src/services/plugin-system/plugin-registry.ts`, `dnd-app/docs/PLUGIN-SYSTEM.md`

**Related entries:** `SUGGESTIONS-LOG-DNDAPP.md` "DO NOT trust isolated-vm" (design-gotcha); `SECURITY-LOG.md` "Plugins run with full renderer privileges" entry.

---

### [2026-04-24] 119 of 121 IPC handlers don't run zod validation on payloads — defense-in-depth gap

- **Category:** debt, security
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** IPC zod-validation audit

**Description:** `src/shared/ipc-schemas.ts` exposes 3 zod schemas: `AiConfigSchema`, `ActiveCreatureSchema`, `AiChatRequestSchema`. Across `src/main/`, **only 2 `ipcMain.handle` calls invoke any of these** — `AI_CONFIGURE` (line 71) and `AI_CHAT_STREAM` (line 155) of `ai-handlers.ts`. The other 119 handlers (registered in storage-handlers, audio-handlers, plugin-handlers, bmo-sync-handlers, cloud-sync-handlers, discord-handlers, game-data-handlers, updater, ipc/index, etc.) accept payloads at face value — TypeScript types are erased at runtime.

`src/shared/ipc-channels.ts` has 146 declared channels. The asymmetry says: the team established the zod-at-boundary pattern but never extended it past the AI-config flow.

**Impact (defense-in-depth):**
- Today, payloads come from a same-process renderer with `contextIsolation: true` + `sandbox: true` — the practical attack surface is limited to a malicious 3rd-party plugin (which already has unsandboxed access — see `isolated-vm` entry above) or a renderer compromise.
- Any single zod-less handler is a candidate for type-confusion bugs that show up later as crashes or unintended writes (e.g., `storage-handlers.ts` writes character/campaign/bastion JSON; an unvalidated payload can save data the renderer never intended).
- An unvalidated `audio:upload-custom` (audio-handlers.ts) accepts user paths and writes files — there's manual sanitization there but it's not schema-driven.

**Proposed fix:**
- [ ] Add schemas for the next-most-trusted boundaries first: `storage:save-{character,campaign,bastion,...}` (these write to disk), `audio:upload-custom`, `plugin:install` (this one already writes plugin code to userData)
- [ ] Pattern: add `XSchema` to `src/shared/ipc-schemas.ts`, change handler to:
   ```ts
   ipcMain.handle(IPC_CHANNELS.X, async (_e, raw) => {
     const r = XSchema.safeParse(raw)
     if (!r.success) return { success: false, error: r.error.issues[0]?.message }
     // ... existing logic with r.data
   })
   ```
- [ ] Add a unit test per schema (round-trip) and an integration test that bad payloads error rather than corrupt storage
- [ ] Long-term: a runtime guard wrapper `withSchema(IPC_X, schema, handler)` to enforce the convention

**Related files:** `src/shared/ipc-schemas.ts`, `src/shared/ipc-channels.ts`, all `src/main/ipc/*-handlers.ts`

**Related entries:** `SECURITY-LOG.md` "IPC zod-validation gap" entry (mirrored, defense-in-depth).

---

### [2026-04-24] `npm run build` emits 14+ rollup warnings — broken dynamic-import code-splitting + chunk-circular `useNetworkStore`

- **Category:** bug, debt, performance
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** dnd-app deep scan — production build (`npm run build` → captured rollup output)

**Description:** A clean `npm run build` exits with code 0 but emits two classes of warnings that are silently passing review:

**1. Dynamic + static import collisions (4 modules)** — code-splitting intent isn't taking effect:

```
(!) src/main/ai/claude-client.ts is dynamically imported by ai-handlers.ts
    but also statically imported by provider-registry.ts,
    dynamic import will not move module into another chunk.
(!) src/main/ai/gemini-client.ts ... (same)
(!) src/main/ai/openai-client.ts ... (same)
(!) src/main/bmo-bridge.ts is dynamically imported 4× by ai-handlers.ts
    but also statically imported by bmo-sync-handlers.ts ... (same)
```

The four `await import('./ai/claude-client')`-style calls in `ai-handlers.ts` were presumably added to defer loading large provider SDKs until a model is actually selected. But because `provider-registry.ts` imports them statically, rollup keeps them in the eager main bundle and the dynamic import becomes a no-op.

**2. `useNetworkStore` chunk-circular (12 importers)** — production-build manifestation of one of the dpdm-flagged cycles:

```
Export "useNetworkStore" of "stores/network-store/index.ts" was reexported
through "stores/use-network-store.ts" while both modules are dependencies
of each other and will end up in different chunks ...
will likely lead to broken execution order.
```

Listed importers that route through the cycle: `JoinGamePage.tsx`, `JournalPanel.tsx`, `TimerModal.tsx`, `WhisperModal.tsx`, `ItemTradeModal.tsx`, `SharedJournalModal.tsx`, `PartyInventoryModal.tsx`, `DMAudioPanel.tsx`, `RestModal.tsx`, `RollerQuickDice.tsx`, `DMRollerModal.tsx`, `DMShopModal.tsx`. Each writes the same warning. Rollup explicitly says this can cause runtime ordering bugs.

**Impact:** (1) Production bundle is larger than intended; the dynamic-import gating has no effect — every renderer ships every provider SDK. (2) Rollup explicitly warns about likely broken execution order from the chunk cycle — usually manifests as `useNetworkStore() === undefined` on first call in some specific load order. Combined with the existing 30 vitest failures around `selectedTokenIds undefined`, this is a candidate root cause.

**Reproduction:**
```bash
cd dnd-app && npm run build 2>&1 | grep -E "^\(\!\)|reexported through"
```

**Proposed fix:**
- [ ] **Dynamic-import collision**: either drop the `await import(...)` in `ai-handlers.ts` (admit the deferral isn't happening) OR remove the static imports from `provider-registry.ts` (lazy-init the registry)
- [ ] **`useNetworkStore` chunk cycle**: per the rollup hint, "change the import in [importer] to point directly to the exporting module" — codemod the 12 listed files to import from `stores/network-store/index.ts` directly instead of the `use-network-store.ts` re-export shim. Then either delete `use-network-store.ts` or keep it only as a back-compat alias with a deprecation comment.
- [ ] Add a CI step that fails on any new rollup warning (`npm run build 2>&1 | grep -E '^\(\!\)|reexported through' && exit 1`)

**Related files:** `src/main/ipc/ai-handlers.ts`, `src/main/ai/provider-registry.ts`, `src/main/ai/{claude,gemini,openai}-client.ts`, `src/main/bmo-bridge.ts`, `src/main/ipc/bmo-sync-handlers.ts`, `src/renderer/src/stores/network-store/index.ts`, `src/renderer/src/stores/use-network-store.ts`, the 12 importer files listed above

**Related entries:** "13 circular dependencies in src/" (medium) — cycle #5/#6 is the same one rollup flags here.

---

### [2026-04-24] Renderer bundle: 8 chunks > 500 KB — `InGamePage` 1.1 MB, `ViewCharactersPage` 634 KB, vendor-pixi 1.4 MB, vendor-three 1.06 MB

- **Category:** performance, debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** dnd-app deep scan — production build size review

**Description:** `npm run build` produces a renderer bundle whose largest chunks are heavy enough to noticeably impact first-paint:

| Size | Chunk | Notes |
|---|---|---|
| 1.42 MB | `vendor-pixi-*.js` | 2D map renderer |
| 1.10 MB | `InGamePage-*.js` | single route — combat + map view |
| 1.06 MB | `vendor-three-*.js` | 3D layer / lighting |
| 788 KB | `vendor-tiptap-*.js` | rich-text editor (campaign notes) |
| 646 KB | `vendor-pdfjs-*.js` | rulebook viewer |
| 634 KB | `ViewCharactersPage-*.js` | single route — character browser |
| 592 KB | `index-*.js` | main entry |
| 555 KB | `vendor-react-*.js` | React + ReactDOM |
| 398 KB | `CharacterSheet5ePage-*.js` | single route — character sheet |
| 360 KB | `index.es-*.js` | likely html2canvas peer |
| 349 KB | `html2canvas.esm-*.js` | screenshot for AI map analysis |

`InGamePage` (1.1 MB) and `ViewCharactersPage` (634 KB) are route-level pages — most of their content should be lazy-loaded via dynamic import. Vendor-three (1.06 MB) is loaded eagerly even when the user is on a 2D-only campaign.

**Impact:** Cold start on slower machines (and especially the Pi 5 if testing the renderer locally) takes seconds to first paint. `out/` is 130 MB total — the NSIS installer ships all of this.

**Proposed fix:**
- [ ] Audit `InGamePage.tsx` (already 1104 lines — see "Six source files exceed 1000 lines") for sub-route lazy-load opportunities (token-sprite, drawing-tools, dm-screen)
- [ ] Audit `ViewCharactersPage` for character-card lazy mounting + virtualized list
- [ ] Lazy-load `vendor-three` only when a 3D asset is referenced (most game tables are 2D-only)
- [ ] Lazy-load `vendor-pdfjs` only when the rulebook viewer modal opens
- [ ] Add bundle-size CI guard via `rollup-plugin-visualizer` (already in devDeps) — fail if any chunk grows by >10% or new chunks > 500 KB appear
- [ ] Cross-check with `electron.vite.config.ts` `manualChunks` config — some splits are deliberate for caching across releases; balance accordingly

**Related files:** `dnd-app/electron.vite.config.ts` (manualChunks), `src/renderer/src/pages/InGamePage.tsx`, `ViewCharactersPage.tsx`, `CharacterSheet5ePage.tsx`, `BastionPage.tsx`

---

### [2026-04-24] 13 circular dependencies in src/ — `dpdm` flags chains in main, stores, services, and barrel files

- **Category:** debt, bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** dnd-app deep scan — running `dpdm` (replacement for the broken `madge`)

**Description:** Replaced the broken `npm run circular` with `npx dpdm@3.14.0 --transform --extensions ts,tsx --exit-code circular:1 src/main/index.ts src/renderer/src/main.tsx`. dpdm reports **13 circular dependency chains**:

| # | Cycle (root → ... → root) |
|---|---|
| 1 | `main/ai/ollama-client.ts` ↔ `main/ai/ollama-manager.ts` |
| 2 | `services/data-provider.ts` ↔ `data/class-resources.ts` |
| 3 | `services/data-provider.ts` ↔ `data/moderation.ts` |
| 4 | `services/data-provider.ts` ↔ `data/species-resources.ts` |
| 5 | `stores/use-lobby-store.ts` → `use-network-store.ts` → `network-store/index.ts` → `network-store/client-handlers.ts` (→ back) |
| 6 | same chain via `network-store/host-handlers.ts` |
| 7 | `stores/builder/slices/save-slice-5e.ts` ↔ `build-character-5e.ts` |
| 8 | `components/campaign/index.ts` ↔ `CampaignWizard.tsx` (barrel cycle) |
| 9 | `components/lobby/index.ts` ↔ `ChatPanel.tsx` (barrel) |
| 10 | `components/lobby/index.ts` ↔ `LobbyLayout.tsx` (barrel) |
| 11 | `components/lobby/index.ts` ↔ `PlayerList.tsx` (barrel) |
| 12 | `services/combat/attack-resolver.ts` ↔ `damage-resolver.ts` |
| 13 | `services/combat/damage-resolver.ts` ↔ `combat-resolver.ts` |

**Impact:** Cycles can cause module-load-order bugs (one half of the cycle gets `undefined` for an import while bundling). The combat-resolver chain (#12-13) is particularly suspicious because runtime resolution in tests has been flaky around mounts/grapple/initiative — see existing Vitest entry. The barrel cycles (#8-11) are usually low-impact but make refactoring brittle. The `data-provider ↔ data/*` cycles (#2-4) explain why those data files have so many one-line re-exports — the provider re-exports them and they re-import via the provider.

**Reproduction:**
```bash
cd dnd-app && npx dpdm@3.14.0 --transform --extensions ts,tsx --exit-code circular:1 src/main/index.ts src/renderer/src/main.tsx
# → exit 1 with the 13 cycles printed above
```

**Proposed fix:**
- [ ] Replace madge with dpdm in `package.json`: `"circular": "dpdm --no-warning --no-tree --transform --extensions ts,tsx --exit-code circular:1 src/main/index.ts src/renderer/src/main.tsx"` (dovetails with the separate "madge broken" entry — same fix resolves both)
- [ ] Cycle 1 (ollama): split shared types into a `ollama-types.ts` and have both client + manager import from it
- [ ] Cycles 2-4 (data-provider): inline the small `data/*-resources.ts` files into the provider, or move shared types to `data/types.ts`
- [ ] Cycles 5-6 (network-store): the barrel file shouldn't be re-imported by its members — switch members to import directly from siblings
- [ ] Cycle 7 (save vs build slices): shared zustand slice types belong in a `slice-types.ts`
- [ ] Cycles 8-11 (barrel files): convention — barrel files import siblings, but siblings should NEVER import the barrel; sweep with a codemod
- [ ] Cycles 12-13 (combat): `combat-resolver` should compose `attack-resolver` and `damage-resolver`, not be imported by them — invert the dependency

**Related files:** `dnd-app/package.json` (script), all files listed above

**Related entries:** `[2026-04-24] npm run circular broken` (low) — same fix unblocks both.

---

### [2026-04-24] 81.5 MB of map PNGs tracked in regular git, not LFS

- **Category:** debt, performance, config
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** dnd-app deep scan — large-file audit (`find src -size +1M`)

**Description:** `src/renderer/public/data/5e/maps/` holds **15 PNG map images totaling 81.5 MB**. The biggest individual files:

```
7.8 MB  volcanic-caves.png
6.9 MB  crossroads-village.png
6.5 MB  mine.png
6.5 MB  underdark-warren.png
6.3 MB  caravan-encampment.png
6.2 MB  dungeon-hideout.png
5.7 MB  barrow-crypt.png
5.6 MB  dragons-lair.png
5.4 MB  keep.png
5.2 MB  manor.png
5.1 MB  spooky-house.png
5.1 MB  farmstead.png
5.0 MB  wizards-tower.png
4.6 MB  roadside-inn.png
4.5 MB  (others)
```

The repo's `.gitattributes` only LFS-tracks `*.pdf`, `*.PDF`, `*.asar`, `*.blockmap` — every PNG is in regular git. `git lfs ls-files` shows only PDFs from `5.5e References/`.

**Impact:** Every fresh clone pulls the full 81.5 MB blob set even though most contributors don't need the maps. Each map edit (artist iterates) bloats the pack file forever. `git log` / `git rebase` operations on the maps directory carry the binary diff cost.

**Reproduction:**
```bash
cd /home/patrick/home-lab
du -sh dnd-app/src/renderer/public/data/5e/maps    # → 82M
git lfs ls-files | grep -c "\.png$"                 # → 0
```

**Proposed fix:**
- [ ] Add `*.png filter=lfs diff=lfs merge=lfs -text` to repo-root `.gitattributes` (or restrict to `dnd-app/src/renderer/public/data/5e/maps/*.png` if narrower scope is preferred)
- [ ] Migrate existing PNGs into LFS via `git lfs migrate import --include="*.png" --everything` (one-time history rewrite — coordinate with any open branches first)
- [ ] Document in `docs/SETUP.md` that contributors need `git lfs pull` to get maps (already mentioned for PDFs, just extend to PNGs)
- [ ] Optional: provide a downscaled `maps-thumb/` directory with 1024px versions for UI previews to keep the heavy originals on-demand

**Related files:** `.gitattributes`, `dnd-app/src/renderer/public/data/5e/maps/*.png`, `docs/SETUP.md`

---

### [2026-04-24] dnd-app deps stale — Vite 7→8 likely fixes the high-severity advisories; Electron / pdfjs / TypeScript a major behind

- **Category:** debt, config, security
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** `npm outdated`

**Description:** `npm outdated` lists 38 deps with newer versions, of which several are major-version bumps that likely close the open security advisories tracked in `SECURITY-LOG.md`:

| Package | Current | Latest | Notes |
|---|---|---|---|
| `vite` | 7.3.1 | 8.0.10 | Security advisories GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583 likely fixed in 8.x |
| `electron` | 40.6.1 | 41.3.0 | Security patches accumulate per major; track v8 support gaps |
| `pdfjs-dist` | 4.10.38 | 5.6.205 | API breaking; the `PdfViewer.tsx` worker shim assumes v4 ESM layout |
| `typescript` | 5.9.3 | 6.0.3 | Major — review `noUncheckedIndexedAccess` / new strict flags before bumping |
| `isolated-vm` | 5.0.4 | 6.1.2 | Plugin sandbox runtime; check API stability for our `plugins/runner.ts` |
| `@anthropic-ai/sdk` | 0.78.0 | 0.91.1 | Several Claude API features (tool use, prompt caching, batches) added since 0.78 |
| `npm-check-updates` | 19.6.3 | 21.0.3 | Two majors behind |
| `knip` | 5.85.0 | 6.6.3 | Major — config schema changes |
| `oxlint` | 1.50.0 | 1.61.0 | Possible additional rules our code now violates |
| `react-router` | 7.13.1 | 7.14.2 | Patch / minor — safe |
| `vitest` | 4.0.18 | 4.1.5 | Minor — safe |
| `react` / `react-dom` | 19.2.4 | 19.2.5 | Patch — safe |

(Full list of 38 in `npm outdated` output.)

**Impact:** The combination of holding back several majors leaves three concrete consequences: (a) the Vite advisory chain stays open until at least `npm audit fix` or v8 — see SECURITY-LOG.md "19 npm advisories"; (b) Electron support window for v40 is short; (c) bumping all at once becomes hazardous because each major drift compounds.

**Proposed fix:**
- [ ] Phase 1 — non-breaking minors/patches: `npm update` (covers tiptap, react/react-dom, react-router, vitest, fuse.js, biome, etc.); rerun `npm test`
- [ ] Phase 2 — security-critical bumps: `vite` to latest 7.x via `npm audit fix`, then plan Vite 8 migration separately with a feature branch; verify dev server still hot-reloads + production build still chunks correctly
- [ ] Phase 3 — Electron 41 + pdfjs 5: try in a feature branch; pdfjs ESM API may need shim updates in `PdfViewer.tsx` and the `postinstall` copy step in `package.json`
- [ ] Phase 4 — TypeScript 6, isolated-vm 6, knip 6: each is its own audit; isolated-vm in particular runs plugin code so an API change there is risk-bearing

**Related files:** `dnd-app/package.json`, `dnd-app/package-lock.json`, all major-bump targets above

**Related entries:** `SECURITY-LOG.md` "19 npm advisories" (high) — Vite bump is the practical resolution

---

### [2026-04-23] `dnd-app/src/renderer/public/data/5e/equipment/magic-items/` — 13 content-duplicate pairs + ~20 same-name-different-content collisions

- **Category:** bug, debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** deep cleanup scan — content hash pass across source files

**Description:** SHA-256 hashing inside `public/data/5e/` reveals two data-integrity issues in the magic-items subtree:

1. **13 groups of byte-identical JSON files that represent *different* items.** Example: `potion-of-heroism.json` has the exact same bytes as `potions-of-healing.json`. Other examples include `mace-of-smiting.json` = `mace-of-disruption.json`, and a 5-file group covering `robe-of-useful-items.json`, `robe-of-eyes.json`, `robe-of-stars.json`, `robe-of-the-archmagi.json`, `nature-s-mantle.json`. These are almost certainly templating / copy-paste errors — the app will display wrong data for whichever item the "winning" file's content doesn't match.

2. **~20+ same-name, different-content files** across the `magic-items/{permanent/wondrous,legendary,rare,uncommon,common,other}/` subfolders. Examples: `cubic-gate.json`, `apparatus-of-kwalish.json`, `hammer-of-thunderbolts.json`, `belt-of-giant-strength.json`, `enspelled-armor.json`, `enspelled-weapon.json`, `staff-of-flowers.json`, `deck-of-illusions.json`, `headband-of-intellect.json` — each exists in 2 (sometimes 3) locations with divergent content. Which copy is canonical is unclear. Also noticed: `mule.json` exists in 3 places (mount / companion / beast) with 3 different contents, and `shadow-demon.json` exists at both `.../fiends/shadow-demon.json` and `.../fiends/demons/shadow-demon.json`.

**Impact:** Library lookups by slug/name are nondeterministic — depends on which loader path wins. Users can't trust item entries in this subtree.

**Reproduction:**
```bash
cd /home/patrick/home-lab
find dnd-app/src/renderer/public/data/5e/equipment/magic-items -name '*.json' -exec sha256sum {} + \
  | sort | uniq -d -w64 | head
```

**Proposed fix:**
- [ ] Treat each dup group as a data bug: open each file, find the canonical source (the old 5e reference PDFs, or a spell-compendium), re-author each identical file with the correct content.
- [ ] For the name-collision set, pick one canonical path convention (permanent/wondrous/ vs rarity/) and delete or redirect the other. Decide as a design rule.
- [ ] Add a build-time check (`tools/validate-5e-data.ts`?) that errors on duplicate content hashes and duplicate slugs.

**Related files:** `dnd-app/src/renderer/public/data/5e/equipment/magic-items/**`, `dnd-app/src/renderer/src/services/data-provider.ts`, `dnd-app/src/renderer/src/services/library/content-index.ts`

---

### [2026-04-23] dnd-app Biome lint debt: 60 errors + 192 warnings across ~4500 files

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** `pnpm lint` (health pass)

**Description:** `pnpm lint` exits 1 with 60 errors + 192 warnings + 1 info. Top offending rules:

| Count | Rule |
|---|---|
| 89 | `lint/suspicious/noArrayIndexKey` |
| 31 | `lint/correctness/useHookAtTopLevel` |
| 23 | `lint/suspicious/noExplicitAny` |
| 18 | `lint/complexity/noUselessFragments` |
| 11 | `lint/suspicious/noAssignInExpressions` |
| 10 | `lint/correctness/useNotnpmUnusedFunctionParameters` |
| 5 | `lint/correctness/useExhaustiveDependencies` |
| 4 | `lint/suspicious/noImplicitAnyLet` |

Worst files by count: `PlayerHUDOverlay.tsx` (11), `utils/chat-links.ts` (8), `services/io/import-export.ts` (7), `MonsterStatBlockView.tsx` (6).

**Impact:** CI (if wired) would stay red; dev signal-to-noise degraded; `useHookAtTopLevel` in particular is a correctness smell (may cause render bugs).

**Proposed fix:**
- [ ] Sweep `useHookAtTopLevel` and `noAssignInExpressions` first (correctness) — a handful of PRs
- [ ] Convert `useHookAtTopLevel` violations one at a time (many are conditional hook calls that need restructuring)
- [ ] `noArrayIndexKey` is mostly low-risk; a search-and-replace PR with code review
- [ ] `noExplicitAny` — audit each; some may need the `// biome-ignore` with justification per CLAUDE.md policy

**Related files:** `dnd-app/biome.json` (rules config), top offenders listed above

---

### [2026-04-24] dnd-app Vitest: 30 failing tests (633 files / 6137 tests)

- **Category:** test
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Cursor agent
- **During:** post-cleanup `npm test` on Raspberry Pi

**Description:** Full suite ends with **9 failed files**, **30 failed tests** (examples: `token-sprite.test.ts` Pixi container mock; `TokenContextMenu.test.tsx` `selectedTokenIds` undefined in test harness).

**Reproduction:** `cd dnd-app && npm test`

**Expected behavior:** 0 failures.

**Note:** Failures appear unrelated to 2026-04-24 archive moves (no imports of archived paths). Likely pre-existing mock / SSR harness gaps.

---

## Low

### [2026-04-24] 278 duplicate code clones (4477 lines / 2.3% of source) — jscpd

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** dnd-app deep scan — `npx jscpd@4.0.5 --min-tokens 50 --min-lines 8 --threshold 1 src/`

**Description:** jscpd detects **278 exact-clone pairs** spanning **4477 duplicated lines** across **194 844 source lines (≈ 2.3%)**. Highlights:

| Lines | Files |
|---|---|
| 24 | `HandoutModal.tsx:171-194` ↔ `SharedJournalModal.tsx:180-195` |
| 15 | `EndOfSessionModal.tsx:60-74` ↔ `SharedJournalModal.tsx:120-134` |
| 13 | `map-editor-handlers.ts:156-168` ↔ same file `:112-123` (intra-file copy) |
| 12 | `PartyInventoryModal.tsx:169-180` ↔ same file `:153-164` |
| 12 | `CreateMapModal.tsx:222-233` ↔ `ResizeMapModal.tsx:52-63` |
| 10 | `ItemModal.tsx:95-104` ↔ same file `:70-79` |
| 10 | `map-editor-handlers.ts:90-99` ↔ same file `:61-70` |
| 9  | `InfluenceModal.tsx:44-52` ↔ `HelpModal.tsx:122-131` |
| 9  | `SentientItemModal.tsx:5-13` ↔ `CharacterInspectModal.tsx:5-13` |
| 9  | `DmScreenPanel.tsx:71-79` ↔ `RollTableModal.tsx:206-214` |

**Impact:** Mostly modal scaffolding (header/close button, form rows) that's tempting to copy-paste between modals. Not a correctness issue, but a maintenance burden — fixing a UX bug in one modal frequently misses the cloned twin.

**Reproduction:**
```bash
cd dnd-app
npx jscpd@4.0.5 --min-tokens 50 --min-lines 8 --threshold 1 --reporters json --output /tmp/jscpd-report --gitignore --ignore "**/*.test.ts,**/*.test.tsx,**/node_modules/**,**/public/data/**" src/
cat /tmp/jscpd-report/jscpd-report.json | jq '.statistics.total'
```

**Proposed fix:**
- [ ] Extract a `<ModalScaffold>` component (header, close button, footer slot) to remove the 9-line modal-shell duplications
- [ ] Same-file dups (#3, #4, #6, #7) are pure copy-paste — extract local helpers within each file
- [ ] Add `npm run dup-check` script: `jscpd --threshold 1.5 src/` and wire into the same lint sweep PR
- [ ] Re-run jscpd after each PR to ensure no regression

**Related files:** all listed above; `dnd-app/package.json` (script)

---

### [2026-04-24] `bmo:sync-event` IPC channel uses string literal instead of `IPC_CHANNELS.BMO_SYNC_EVENT`

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** IPC channel hygiene audit (cross-ref `IPC_CHANNELS.*` declarations vs usages)

**Description:** `src/shared/ipc-channels.ts:192` declares:
```ts
BMO_SYNC_EVENT: 'bmo:sync-event',
```

But `src/main/bmo-bridge.ts:166` and `:184` send the event using the literal string:
```ts
forwardToRenderer('bmo:sync-event', event)
forwardToRenderer('bmo:sync-event', { ... })
```

Every other ipc usage in `src/main/` references `IPC_CHANNELS.X` — this one slipped through. The header comment at the top of `ipc-channels.ts` explicitly says: *"All IPC channel strings are defined here as constants to prevent typos and enable type-safe channel references across the Electron boundary."* — that promise is currently broken for one channel.

**Impact:** A typo in the literal would compile (no compile-time check); rename of the channel constant would silently miss this site.

**Proposed fix:**
- [ ] In `src/main/bmo-bridge.ts`, import `IPC_CHANNELS` and replace both literals with `IPC_CHANNELS.BMO_SYNC_EVENT`
- [ ] Add a biome lint rule (or simple grep-based pre-commit hook) banning string literals matching `(/^[a-z-]+:[a-z-]+$/)` outside of `ipc-channels.ts`

**Related files:** `src/main/bmo-bridge.ts:166,184`, `src/shared/ipc-channels.ts:192`

---

### [2026-04-24] `ANALYZE=1 npm run build` fails — `rollup-plugin-visualizer@7` is ESM-only but `electron.vite.config.ts` uses CJS `require()`

- **Category:** bug, debt, config
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** bundle analyzer attempt for the chunk-size audit

**Description:** `electron.vite.config.ts` declares an `analyzePlugin()` factory that's gated on `process.env.ANALYZE === '1'`. The factory uses CJS:

```ts
const { visualizer } = require('rollup-plugin-visualizer') as typeof import('rollup-plugin-visualizer')
```

But `rollup-plugin-visualizer@7.0.0` (the installed version) ships ESM only — its `package.json` has no `main` field; `exports` only declares `import: './dist/plugin/index.js'` with no `require:` counterpart. `require('rollup-plugin-visualizer')` therefore throws:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
  /home/patrick/home-lab/dnd-app/node_modules/rollup-plugin-visualizer/package.json
```

`ANALYZE=1 npm run build` exits non-zero before any chunk renders. Build still runs without `ANALYZE` because the factory short-circuits on the env check.

**Reproduction:**
```bash
cd dnd-app && ANALYZE=1 npm run build 2>&1 | head -10
```

**Proposed fix:**
- [ ] Switch `analyzePlugin` to `await import('rollup-plugin-visualizer')` and update its surrounding type signatures (`Promise<Plugin | null>`); make the relevant `defineConfig` lambda async if needed
- [ ] Or pin `rollup-plugin-visualizer@^6` (last CJS-supporting major) — quicker, but accumulates more upgrade-debt
- [ ] Pairs with the suggestion in `SUGGESTIONS-LOG-DNDAPP.md` "Bundle-size CI guard via rollup-plugin-visualizer"

**Related files:** `dnd-app/electron.vite.config.ts`, `dnd-app/package.json`

**Related entries:** "madge / ts-prune broken on Node 22" (low) — same family of "CJS↔ESM transition pain."

---

### [2026-04-24] Backup format has version field + version check, but no migration of older backups

- **Category:** debt, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** backup format versioning audit

**Description:** `src/renderer/src/services/io/import-export.ts` defines `BACKUP_VERSION = 3` and a version gate at line 342:

```ts
if (!payload || typeof payload !== 'object' || !payload.version || payload.version > BACKUP_VERSION) {
  return null
}
```

So future-version backups (`payload.version > 3`) are correctly rejected. But **older backups (`v1` or `v2`) are accepted as-is** — the import path just runs `Array.isArray(payload.fieldName)` checks and gets empty arrays for fields the older format didn't have:

```ts
// v1 backups don't have these fields
const creatures = Array.isArray(payload.customCreatures) ? payload.customCreatures : []
const hb = Array.isArray(payload.homebrew) ? payload.homebrew : []

// v3 fields
const gameStates = Array.isArray(payload.gameStates) ? payload.gameStates : []
const aiConvos = Array.isArray(payload.aiConversations) ? payload.aiConversations : []
// ...
```

There's no v1→v2→v3 migrator. Field shapes that *changed* between versions (rather than just being added) silently drop or coerce data. Compare with `src/main/storage/migrations.ts` which does have a `MIGRATIONS` table for character/campaign on-disk schemas — backups have no equivalent.

**Impact:** A user restoring an old backup loses any v1/v2 data whose shape changed in v3. No error or warning. Minor today (small user base, recent backups), but the longer this is unfixed the more "cliff" gets baked in.

**Proposed fix:**
- [ ] Define a `BACKUP_MIGRATIONS: Record<number, (raw) => raw>` table mirroring the storage `MIGRATIONS` pattern
- [ ] Run migrations bottom-up before the field-extraction block
- [ ] Add unit tests with synthetic v1/v2 payloads
- [ ] Surface a UI warning when an older-version backup is detected (informational, not blocking)

**Related files:** `src/renderer/src/services/io/import-export.ts:133-360`, `src/main/storage/migrations.ts` (mirror pattern)

---

### [2026-04-24] `master` branch is not protected on GitHub — solo workflow gap

- **Category:** config
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** GitHub branch-protection audit (`gh api repos/EvilPatrick06/home-lab/branches/master/protection`)

**Description:** `gh api repos/EvilPatrick06/home-lab/branches/master/protection` returns **404 Branch not protected**. The repo is private so the blast radius is small, but anything that pushes to `master` (incl. accidental commits, GitHub web edits, force-pushes) lands without:

- Required PR reviews
- Required status checks (CI)
- Required signed commits
- Restriction on force-push or deletion

Combined with the absence of any `.github/workflows/*` (no CI to require), the practical effect today is "anything in `master` is by convention only". For a solo project this is acceptable, but enabling minimal protection (e.g., disallow force-push + require linear history) is a 2-minute hardening that catches future hand-slips.

**Proposed fix:**
- [ ] `gh api -X PUT repos/EvilPatrick06/home-lab/branches/master/protection -f required_status_checks=null -f enforce_admins=false -f required_pull_request_reviews=null -f restrictions=null -f allow_force_pushes=false -f allow_deletions=false`
- [ ] Add a CI workflow (the existing `audit:ci` script + `npm test` + `tsc --noEmit`); then expand the protection rule to require it as a status check
- [ ] Optional: require signed commits via `-f required_signatures=true`

**Related files:** none in repo; configuration lives in GitHub settings

**Related entries:** `SECURITY-LOG.md` "No dependency audit in CI" (low) — same gap, different angle.

---

### [2026-04-24] `import-export.ts:433` writes arbitrary localStorage keys from imported backup payloads — no key allowlist

- **Category:** debt, security
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** localStorage usage audit

**Description:** `src/renderer/src/services/io/import-export.ts:433`:

```ts
localStorage.setItem(key, value)
```

This sits inside an import-loop that restores user-chosen settings from a JSON backup file. Today's renderer trust model accepts user-imported backups as "trusted" (the user clicked the file dialog), so this isn't an immediate exploit. But:

1. There's no key allowlist — any `key` in the backup is written. A handcrafted backup could overwrite settings keys the import flow didn't intend (e.g., feature flags, recent-files lists, accessibility prefs).
2. `import-export.ts` is also the path where corrupt or malicious backup data enters; we don't currently zod-validate the backup file format.
3. localStorage doesn't exceed a few MB but is renderer-process-shared — write loops can incrementally fill the quota.

**Impact:** Limited (user has to import a malicious file). But it's a low-effort hardening: zod-validate the backup payload + only restore keys from a known list.

**Reproduction:**
```bash
grep -n "localStorage\.setItem(key" src/renderer/src/services/io/import-export.ts
# → line 433
```

**Proposed fix:**
- [ ] Define a `BackupPayloadSchema` in `src/renderer/src/services/io/` (zod) with an allowlisted `localStorage` keys map
- [ ] In the import path, `safeParse` first; reject the import on failure with a user-visible error
- [ ] Restrict the loop to only write keys that match `SETTINGS_KEYS` (already a constants object)

**Related files:** `src/renderer/src/services/io/import-export.ts:433`, `src/renderer/src/constants/settings-keys.ts` (or wherever `SETTINGS_KEYS` lives)

---

### [2026-04-24] `tools/*.js` scripts reference the old `Tests/` directory in 11 places — pre-rename leftovers

- **Category:** docs, debt, portability
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** dnd-app deep scan — grepping `tools/` for stale paths

**Description:** During the reorg, `Tests/` (the legacy CLI-tools directory, NOT the test suite) was renamed to `tools/`. Several scripts inside still reference the old path in their comments + console output:

| File | Line | Stale text |
|---|---|---|
| `tools/run-audit.js` | 3 | ` * Usage: node Tests/run-audit.js` |
| `tools/run-audit.js` | 929 | `'Rename camelCase ... Run \`node Tests/rename-to-kebab.js\`'` |
| `tools/run-audit.js` | 1025 | `'## Automation Scripts (Tests/)'` |
| `tools/run-audit.js` | 1028-1031 | docs table inside generated report says `Tests/` for 4 commands |
| `tools/run-audit.js` | 1085 | `console.log('Report written to: Tests/TestAudit.md')` |
| `tools/knip-summary.js` | 1 | `JSON.parse(require('fs').readFileSync('Tests/knip-report.json', 'utf8'))` |
| `tools/rename-to-kebab.js` | 9-10 | usage doc says `node Tests/rename-to-kebab.js` |
| `tools/replace-console-logs.js` | 13-15 | usage doc says `node Tests/replace-console-logs.js` |

`Tests/` no longer exists; running these scripts as documented would fail (`No such file or directory`). The internal logic uses `__dirname`-based paths so the scripts themselves still work, but `tools/knip-summary.js` actually reads `Tests/knip-report.json` literally — that path is broken at runtime, not just in docs.

**Additional secondary issue (same file family):** `tools/run-audit.js:22` hardcodes `PATH: 'C:\\Program Files\\nodejs;' + process.env.PATH`. On Linux/macOS this is a no-op (the prepended Windows path doesn't exist) but it's misleading — and on a Pi-developer-machine workflow it documents an incorrect assumption.

**Reproduction:**
```bash
cd dnd-app
node tools/knip-summary.js                 # → Error: ENOENT: ... 'Tests/knip-report.json'
grep -n "Tests/" tools/*.js                # → 11 stale references
```

**Proposed fix:**
- [ ] Search-replace `Tests/` → `tools/` in all `tools/*.js` files (literal text; safe)
- [ ] Fix `tools/knip-summary.js:1` to read from `tools/knip-report.json` or generate the report on-the-fly
- [ ] Drop the Windows-only `PATH` prepend in `tools/run-audit.js:22` (or wrap it in `process.platform === 'win32'`)
- [ ] Decide whether `tools/knip-summary.js` is still needed — `npm run dead-code` (which uses `npx knip`) is now the documented workflow; this helper may be redundant

**Related files:** `dnd-app/tools/run-audit.js`, `dnd-app/tools/knip-summary.js`, `dnd-app/tools/rename-to-kebab.js`, `dnd-app/tools/replace-console-logs.js`

---

### [2026-04-24] 4 services in `services/` lack colocated tests

- **Category:** debt, test
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** source-to-test mapping (`802 src TS files / 633 test files`)

**Description:** `dnd-app/src/renderer/src/services/` is largely well-tested (78.9% file-level test coverage across the whole `src/`), but four service files have no adjacent `.test.ts`:

```
src/renderer/src/services/library-sort-filter.ts
src/renderer/src/services/plugin-system/plugin-registry-data.ts
src/renderer/src/services/io/ai-memory-sync.ts
src/renderer/src/services/io/combat-log-export.ts
```

These are pure-function-style modules, well-suited to unit tests. Each is small (≤ 200 lines) so writing tests is cheap.

**Impact:** Regressions in sort/filter, plugin discovery, AI memory sync, or combat-log export wouldn't be caught by the suite.

**Proposed fix:**
- [ ] Add a colocated `.test.ts` for each (one PR per file, ~20 lines of tests each)
- [ ] Update `CONTRIBUTING.md` "When to add tests" to call out: every file in `services/` that exports a function must have a colocated test

**Related files:** the four service files listed

---

### [2026-04-24] `madge@8.0.0` AND `ts-prune@0.10.3` both broken on Node 22 — same `commander` API mismatch

- **Category:** bug, debt, config
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** dnd-app health scan (running every documented `npm` script + every devDep CLI)

**Description:** Two devDependencies fail to launch on Node 22.22.2 with the same root cause — they call `commander` API methods that were removed in `commander` v8+:

**`madge` (used by `npm run circular`):**
```
$ ./node_modules/.bin/madge --version
node_modules/madge/bin/cli.js:14
program.storeOptionsAsProperties();
        ^
TypeError: program.storeOptionsAsProperties is not a function
```

**`ts-prune` (orphan devDep — no script wires it up but it ships in `node_modules/.bin/`):**
```
$ ./node_modules/.bin/ts-prune
node_modules/ts-prune/lib/configurator.js:31
        .allowUnknownOption()
         ^
TypeError: commander_1.default.allowUnknownOption is not a function
```

Both are unmaintained / behind on commander. Other devDeps (`vitest`, `tsc`, `biome`, `knip`, `dpdm`, `jscpd`, `oxlint`) run cleanly on the same Node — only these two are broken.

`dnd-app/README.md` ("Run `npm run circular` before big refactors") and `docs/COMMANDS.md` reference `npm run circular` — those instructions are silently broken. `ts-prune` has no script so its breakage is purely "extra dead bytes in node_modules".

**Reproduction:**
```bash
cd dnd-app
./node_modules/.bin/madge --version    # → TypeError
./node_modules/.bin/ts-prune            # → TypeError
```

**Proposed fix:**
- [ ] Replace `madge` with `dpdm` (proven working in same Node — see "13 circular dependencies" entry which used it). Update `package.json`: `"circular": "dpdm --no-warning --no-tree --transform --extensions ts,tsx --exit-code circular:1 src/main/index.ts src/renderer/src/main.tsx"` and the devDep accordingly.
- [ ] Drop `ts-prune` entirely. `knip` (also installed, version 5.85.0) covers unused-export detection — no need for both. Remove from `devDependencies`.
- [ ] Update `dnd-app/README.md` + `docs/COMMANDS.md` to reflect the new tooling.

**Related files:** `dnd-app/package.json` (devDep + script), `dnd-app/README.md`, `docs/COMMANDS.md`

**Related entries:** "13 circular dependencies" (medium) — same fix unblocks both; "111 unused exports + 113 unused exported types (knip)" (low) — confirms knip already covers what ts-prune was supposed to do.

---

### [2026-04-24] `@renderer` path alias declared but used nowhere (0 usages); 949 deep relative imports

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** dnd-app health scan (alias-usage grep)

**Description:** Both `electron.vite.config.ts` (renderer.resolve.alias) and `tsconfig.web.json` (paths) declare `@renderer/*` → `./src/renderer/src/*`, and `dnd-app/README.md` documents it as a path alias to use. But `grep -rn "from\s*['\"]@renderer\b" src/` returns **0 hits**. The renderer instead uses 949 relative imports with three or more `../` segments (and 265 with four or more), e.g. `../../../../utils/chat-links` etc.

Sister alias `@data/*` is used 24 times — the underuse is specific to `@renderer`.

**Impact:**
- Code references break-on-move: any restructure of `renderer/src/components/` triggers a wave of relative-path edits.
- Documented convention (README + AGENTS rules) doesn't match practice — new contributors don't know which to follow.
- Deep `../../../../` imports are hard to scan-read in code review.

**Proposed fix:**
- [ ] Codemod sweep: rewrite imports with ≥3 `../` levels to `@renderer/...` (jscodeshift or sed-based, then `tsc --noEmit` to verify)
- [ ] Add a biome rule (or eslint rule via biome-eslint shim) banning ≥3 levels of `../` relative imports
- [ ] If the team prefers relative imports, drop `@renderer` from the configs + docs to remove drift

**Related files:** `dnd-app/electron.vite.config.ts`, `dnd-app/tsconfig.web.json`, `dnd-app/README.md`, `src/renderer/src/**`

---

### [2026-04-24] Six source files exceed 1000 lines — refactor candidates

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** dnd-app health scan (size audit `find src -name '*.ts*' -size +30k`)

**Description:** Six source files in `dnd-app/src/` are over 1000 lines and growing — likely accumulating mixed responsibilities:

| Lines | File |
|---|---|
| 1832 | `src/renderer/src/components/library/PdfViewer.tsx` |
| 1511 | `src/renderer/src/pages/SettingsPage.tsx` |
| 1162 | `src/renderer/src/services/data-provider.ts` |
| 1130 | `src/renderer/src/components/game/modals/mechanics/DowntimeModal.tsx` |
| 1121 | `src/renderer/src/services/library-service.ts` |
| 1104 | `src/renderer/src/components/game/GameLayout.tsx` |

(`json-schema.test.ts` at 1027 lines is OK — large test files are normal.)

**Impact:** None of these are broken, but each is now hard to navigate, reviews on these files routinely touch unrelated concerns, and the `useHookAtTopLevel` lint correctness errors (see Biome lint debt entry, medium severity) cluster in files this size — that rule fires when conditional hooks slip in, which is easier to do in long components.

**Proposed fix (per file, do as separate PRs):**
- [ ] `PdfViewer.tsx` — extract worker-loading, page rendering, search, and annotation flows into sibling files
- [ ] `SettingsPage.tsx` — split by tab/section into colocated components
- [ ] `DowntimeModal.tsx` / `GameLayout.tsx` — extract per-feature subcomponents
- [ ] `data-provider.ts` / `library-service.ts` — split by content type (spells / items / monsters / etc.)
- [ ] Consider adding a biome / lint rule for max-file-size as a soft cap

**Related files:** listed above

---

### [2026-04-23] dnd-app: 111 unused exports + 113 unused exported types (knip)

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** `pnpm knip` run (knip.json already configured)

**Description:** Zero fully-unused files, zero unused dependencies, zero unlisted imports — the manifest is clean. But knip flags 111 unused exports across 77 files and 113 unused exported types. Top offenders (exports per file):

```
17  src/renderer/src/network/index.ts
11  src/renderer/src/services/combat/damage-resolver.ts
 6  src/renderer/src/services/combat/attack-resolver.ts
 6  src/renderer/src/network/peer-manager.ts
 5  src/renderer/src/services/combat/combat-resolver.ts
 5  src/renderer/src/pages/library/LibraryFilters.tsx
```

**Impact:** Public API surface drift — `export` declarations that no consumer uses. Adds autocomplete noise; makes refactoring harder (can't tell what's intentional extension API vs. forgotten dead surface).

**Proposed fix:**
- [ ] Sweep per-file: downgrade `export` → local, or delete with a test run after
- [ ] For public facade files like `network/index.ts`, audit whether the facade exists for external consumers (plugin API?) or was just a re-export left over from refactor
- [ ] Run `pnpm knip` in CI after cleanup, fail on new regressions

---

### [2026-04-23] 30+ JSON `public/data/5e/` files too large — lazy-load chunks needed

- **Category:** performance
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Phase22 audit (preexisting, re-flagging post-reorg)
- **During:** structure review

**Description:** `dnd-app/src/renderer/public/data/5e/` has 3096 JSON files. Eagerly loading all of them on character builder / library pages would be bad UX. `resources/chunk-index.json` exists for lazy loading but may be underused.

**Proposed fix:**
- [ ] Audit which pages eagerly import `@data/5e/*` — should use dynamic import + chunk-index
- [ ] Profile library page load time, confirm no regression
- [ ] Add size budget check in CI (alert if bundle exceeds N MB)

**Related files:** `dnd-app/src/renderer/public/data/5e/`, `dnd-app/resources/chunk-index.json`, `dnd-app/src/renderer/src/services/library/`

---

### [2026-04-23] Workspace health scan: Pi dev env incomplete + cleanup scan blocked

- **Category:** config, debt, tooling
- **Severity:** low
- **Domain:** both *(also mirrored in [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md) — fix once, remove from both)*
- **Discovered by:** Cursor agent
- **During:** root workspace deep scan + system health check (aggressive cleanup prep; no moves executed)

**Description:**
Full automated cleanup pass **blocked** on this host because primary tooling is not runnable.

1. **`dnd-app/`: `node_modules` directory absent** — `npm ls` reports unmet dependency `zustand@^5.0.11`; `npm run lint` fails (`biome: not found`); `npx tsc` resolves wrong package (`tsc@2.0.4` stub) because local TypeScript is not installed. `npm run build` / `npm test` not validated.
2. **System Node = `v18.20.4` (`/usr/bin/node`)** — ad-hoc `npx knip@latest` fails: `node:util` has no `styleText` (needs newer Node for current knip). Project stack (electron-vite, etc.) expected on dev machines is typically **Node 20+**; this Pi is below that for modern nested tooling.
3. **`bmo/pi/venv/`: `bin/` missing** (only `include/`, `lib/`) — `./venv/bin/python` does not exist. **Cannot** run `pytest` or `pip check`. Venv is corrupt or manually stripped; 312M under `bmo/pi` includes this tree.
4. **Bytecode cache:** `find` shows **~1345** `__pycache__` dirs under `bmo/pi/venv` (expected for installed packages) and **11** `__pycache__` dirs under `bmo/pi` **excluding** `venv/` (safe to clear — regenerated on import).
5. **Duplicate-file pass:** `fdupes` / `jdupes` / `rdfind` not in PATH; no full binary duplicate report. Duplicate **code** (jscpd) not run — requires working `dnd-app` install.
6. **Large space (not auto-archived in this pass):** `.git` ~1.8G (includes **~1.6G** `git lfs`); `5.5e References/` ~1.6G — user reference assets; not classified as deletable bloat without explicit rule.
7. **Runtime logs:** `bmo/pi/data/logs/dm-bot.log`, `social-bot.log` — active; not cleanup targets.

**Proposed fix:**
- [ ] On this machine: `cd dnd-app && npm ci` (or `npm install`) after upgrading to **Node 20+** (nvm, nodesource, or official binary).
- [ ] Recreate BMO venv: `cd bmo/pi && rm -rf venv && python3.11 -m venv venv && ./venv/bin/pip install -r requirements.txt` (adjust Python version to match Pi).
- [ ] Re-run: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx knip`, `./venv/bin/python -m pytest`, `./venv/bin/pip check`.
- [ ] Optional: install `fdupes` or use `rdfind` for duplicate PDF/asset audit under `5.5e References/`.

**Related files:** `dnd-app/package.json`, `bmo/pi/requirements.txt`, `bmo/pi/venv/`

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
