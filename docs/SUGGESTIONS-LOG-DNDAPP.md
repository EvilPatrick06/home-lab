# dnd-app Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dnd-app domain only.**
>
> Sibling logs:
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dnd-app` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dnd-app behavior → mirrored here AND in `BMO-SUGGESTIONS-LOG.md`. Cross-tooling rules that touch dnd-app contributors → here (and mirror in BMO file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-04-24] Add React.memo to ~10 heaviest tree-rendered components

- **Category:** future-idea, performance
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** React memoization audit
- **Effort estimate:** 2–4 hours

**Description:** Across `src/renderer/src/components/`, **0 files use `React.memo` / `memo()`** (verified via grep). The codebase has **376 `useMemo` / `useCallback` calls** — but those only matter if their consumers are memoized; otherwise the parent re-renders and the memoized prop's reference equality buys nothing.

This is a "memoization is half-broken" pattern. Some components benefit substantially from `memo`:

- Token sprite list (`MapCanvas` and children) — re-renders on every cursor move if not memoized
- `SpellCard` / `MonsterStatBlockView` — heavy DOM, frequently in lists
- `PlayerHUDOverlay`, `CombatTracker`, `InitiativeBar` — high render frequency on game state mutations
- `ChatMessage` (in `LobbyChat` / `GameChat`) — list items; without memo, sending one message re-renders all

**What to do:**
- [ ] Profile with React DevTools "Highlight updates" to confirm which components actually re-render hot
- [ ] Wrap the top ~10 in `memo()` with a custom `arePropsEqual` where shallow equality won't suffice (e.g., for stores delivered via prop drilling)
- [ ] Re-run profiler; expect 30–70% fewer re-renders on common interactions
- [ ] Document the convention in `docs/CONTRIBUTING.md` (when to memo, how to choose)

**Related files:** `src/renderer/src/components/game/*`, `src/renderer/src/components/sheet/*`, `src/renderer/src/components/library/*`

---

### [2026-04-24] Backup format migration framework (v1/v2 → v3+)

- **Category:** future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Effort estimate:** 1 hour

**Description:** Mirror `src/main/storage/migrations.ts` for the `import-export.ts` backup format. See the related `ISSUES-LOG-DNDAPP.md` entry "Backup format has version check but no migration" for the gap; this is the framework idea.

```ts
const BACKUP_MIGRATIONS: Record<number, (raw: any) => any> = {
  2: (raw) => { raw.customCreatures ??= []; raw.homebrew ??= []; return raw },
  3: (raw) => { /* v2 → v3 field renames if any */ return raw },
}
function migrateBackup(raw: any): BackupPayload {
  let v = raw.version ?? 1
  while (v < BACKUP_VERSION) {
    v += 1
    raw = BACKUP_MIGRATIONS[v]?.(raw) ?? raw
  }
  raw.version = BACKUP_VERSION
  return raw
}
```

Then call `migrateBackup(payload)` before the existing field extraction. Surface a one-line UI toast: "Backup format upgraded from v1 to v3."

**What to do:**
- [ ] Add `BACKUP_MIGRATIONS` table beside `BACKUP_VERSION`
- [ ] Insert `migrateBackup()` call before line 346 of `import-export.ts`
- [ ] Unit tests for v1, v2, v3 sample payloads
- [ ] (Optional) UI surface a "backup migrated" toast on success

---

### [2026-04-24] i18n readiness — wrap user-visible strings in a translation function

- **Category:** future-idea
- **Severity:** low (info today)
- **Domain:** dnd-app
- **Effort estimate:** large (8–16 hours initial sweep + ongoing discipline)

**Description:** Zero i18n libraries in `package.json` (no `i18next`, `react-intl`, `formatjs`, etc.). All UI strings are hardcoded English. Sample (renderer):
```
"Waiting for AI DM to prepare scene..."
"Waiting for players..."
"No characters found"
"Run the game without a player character"
```

Realistically, i18n is overkill for a solo D&D project — but the cost of adding it later is much higher than wrapping strings in a `t('key')` function as new strings are added today. Even without an actual translation pipeline, a `t()` placeholder makes future i18n a mechanical sweep instead of an archaeology project.

**What to do (low-cost first step):**
- [ ] Add a no-op `t(key: string, values?: Record<string,unknown>)` helper that returns the English string
- [ ] Establish convention in `docs/CONTRIBUTING.md`: any new user-visible string goes through `t()`
- [ ] Don't sweep existing strings unless/until i18n becomes a real requirement

This is "make the future easier" not "fix the present."

---

### [2026-04-24] Encrypt persisted secrets with Electron `safeStorage` API

- **Category:** future-idea, security
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** secrets-on-disk audit
- **Effort estimate:** 2 hours

**Description:** All persisted secrets live in plaintext JSON in `userData/`:
- `userData/ai-config.json` — `claudeApiKey`, `openaiApiKey`, `geminiApiKey` (logged in `SECURITY-LOG.md`)
- `userData/settings.json` — `turnServers[].credential` (TURN server creds for WebRTC; logged in `SECURITY-LOG.md`)

Electron's `safeStorage` API (https://www.electronjs.org/docs/latest/api/safe-storage) wraps the OS-native keystore: Keychain on macOS, DPAPI on Windows, libsecret on Linux. `safeStorage.encryptString(plain)` → `Buffer`, `safeStorage.decryptString(buf)` → `string`. Should replace the plain `JSON.stringify` write paths in `src/main/ai/ai-service.ts:244-255` and `src/main/storage/settings-storage.ts`.

**What to do:**
- [ ] Wrap secret fields with `safeStorage.encryptString` before write; `decryptString` on read
- [ ] Migrate existing files: detect plaintext keys on first load and re-encrypt
- [ ] Fall back gracefully if `safeStorage.isEncryptionAvailable()` is false (Linux without secret service)
- [ ] Add a unit test using a temp `userData` and confirming round-trip + that the on-disk bytes are not the plain key

**Related entries:** `SECURITY-LOG.md` "API keys persisted in plaintext..." entry (medium)

---

### [2026-04-24] Replace broken `madge`+`ts-prune` with working `dpdm`+`knip`

- **Category:** future-idea, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** scan that found both tools broken on Node 22
- **Effort estimate:** 30 minutes

**Description:** Two devDeps fail on Node 22 with the same `commander` API mismatch (logged in `ISSUES-LOG-DNDAPP.md`). The replacements are already verified working:

- `dpdm@3.14.0` finds the same circular deps + the rollup chunk-cycle warnings (used to file the existing 13-cycle issue entry)
- `knip@5.85.0` is already installed + wired (`npm run dead-code`) — covers everything `ts-prune` was used for

Update `package.json`:
```diff
-  "circular": "npx madge --circular --extensions ts,tsx src/"
+  "circular": "dpdm --no-warning --no-tree --transform --extensions ts,tsx --exit-code circular:1 src/main/index.ts src/renderer/src/main.tsx"
```
And remove `madge` + `ts-prune` from `devDependencies`.

**What to do:** see "[2026-04-24] `madge@8.0.0` AND `ts-prune@0.10.3` both broken" in `ISSUES-LOG-DNDAPP.md` for the exact diff.

---

### [2026-04-24] Extract `<ModalScaffold>` component to remove 9-line modal-shell duplication

- **Category:** future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Effort estimate:** 1 hour

**Description:** jscpd surfaced ~10 modal files sharing identical 9–24-line scaffolding (header row + close button + footer slot). Extracting a single `<ModalScaffold title onClose footer>` would (a) drop the duplicate-clone count visibly, (b) make UX changes (e.g., adding ESC-to-close globally) one-PR instead of N. Sample clones flagged: `HandoutModal`/`SharedJournalModal` (24 lines), `EndOfSessionModal`/`SharedJournalModal` (15), `CreateMapModal`/`ResizeMapModal` (12), `SentientItemModal`/`CharacterInspectModal` (9), `DmScreenPanel`/`RollTableModal` (9).

**What to do:**
- [ ] Add `dnd-app/src/renderer/src/components/ui/ModalScaffold.tsx` (header + close + slot)
- [ ] Replace one modal as a proof
- [ ] Sweep the rest in batches, run `jscpd` after each batch and confirm clones drop

**Related entries:** "278 duplicate code clones (4477 lines / 2.3% of source) — jscpd" in `ISSUES-LOG-DNDAPP.md`

---

### [2026-04-24] Add `npm run check:full` aggregate script

- **Category:** future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Effort estimate:** 15 minutes

**Description:** Right now contributors must remember `npm run lint && npx tsc --noEmit && npm test` (per `dnd-app/README.md`). Add an aggregate:

```json
"check:full": "npm run lint && tsc --noEmit && npm test && npm run circular && npm run dead-code && npm run audit:ci"
```

Catches more drift in one command. Wire to the PR checklist in `docs/CONTRIBUTING.md`. Pairs nicely with the `dpdm`/`knip` migration above.

---

### [2026-04-24] Bundle-size CI guard via rollup-plugin-visualizer (after fixing the CJS import)

- **Category:** future-idea, performance
- **Severity:** low
- **Domain:** dnd-app
- **Effort estimate:** 1 hour

**Description:** `rollup-plugin-visualizer@7` is already in `devDependencies` and `electron.vite.config.ts` plumbs `ANALYZE=1` to enable it — but the config uses CJS `require(...)` which v7 (ESM-only) rejects. After switching to dynamic `import()`, add a CI step that fails when any chunk grows >10% or new chunks > 500 KB appear (using the visualizer's `--json` output).

This catches the kind of regression flagged in "Renderer bundle: 8 chunks > 500 KB" before it reaches main.

**What to do:**
- [ ] In `electron.vite.config.ts`, replace the CJS require with `await import('rollup-plugin-visualizer')` (the surrounding `analyzePlugin()` already returns a Promise-friendly type)
- [ ] Add a small `scripts/audit/check-bundle-size.mjs` that compares the new visualizer JSON against a baseline checked into the repo
- [ ] Wire into `npm run check:full`

**Related entries:** `ISSUES-LOG-DNDAPP.md` "Renderer bundle: 8 chunks > 500 KB" + "`ANALYZE=1 npm run build` fails — `rollup-plugin-visualizer@7` ESM-only" (the latter is being added now).

---

# Design gotchas (warnings for future agents)

### [2026-04-24] `IPC-SURFACE.md` lists channel names, not request/response contracts

- **Category:** design-gotcha, docs
- **Severity:** low
- **Domain:** dnd-app

**Context:** The "Defined channels" section of `dnd-app/docs/IPC-SURFACE.md` is **generated** from `src/shared/ipc-channels.ts` via `npm run gen:ipc-surface` — constant names and wire strings stay in sync.

**What the doc does *not* include:** per-channel request/response TypeScript types, zod shapes, or which are `handle` vs one-way `send`. Those are only in the handler modules and `ipc-schemas.ts` (where used).

**What to do instead:** For behavior and payloads, read the relevant `src/main/ipc/*-handlers.ts` and `src/shared/ipc-schemas.ts`. After editing `ipc-channels.ts`, run `npm run gen:ipc-surface` and commit `docs/IPC-SURFACE.md`.

---

### [2026-04-24] DO NOT update `migrateData` to return new objects instead of mutating in place — the call sites discard return values

- **Category:** design-gotcha
- **Severity:** medium
- **Domain:** dnd-app

**Why it's tempting:** The `MIGRATIONS` table in `src/main/storage/migrations.ts` defines migrations like `(data) => { data.foo = []; return data }`. A future contributor (or AI) refactoring to immutable style would write `(data) => ({ ...data, foo: [] })`.

**Why it's wrong:** `migrateData()` line 33 calls `migration(record)` and **discards the return value** — it relies entirely on in-place mutation of `record`. An immutable-style migration would silently no-op (returns a new object that nobody captures). The bug is invisible until users with old-version data try to load and find their schema didn't migrate.

**What to do instead:** Either (a) keep the mutation contract and document it at the top of the file, OR (b) refactor `migrateData` to capture each migration's return value and pass it forward (`record = migration(record)`). The capture form is cleaner; pick one and stick with it.

**Related files:** `src/main/storage/migrations.ts:33`

---

### [2026-04-24] DO NOT use Three.js `scene.remove(mesh)` and assume it freed GPU memory — it doesn't

- **Category:** design-gotcha, performance
- **Severity:** medium
- **Domain:** dnd-app

**Why it's tempting:** `scene.remove(mesh)` reads like the inverse of `scene.add(mesh)` — symmetry suggests cleanup. The dice clear flow probably uses it.

**Why it's wrong:** `scene.remove` only detaches the mesh from the scene graph. The underlying `BufferGeometry` / `Material` / `Texture` are still on the GPU and JS heap until you explicitly call `geometry.dispose()`, `material.dispose()`, and `material.map?.dispose()`. Across `dice3d/`, currently 84 `new THREE.*()` allocations vs 1 `dispose()` call — long sessions accumulate GPU memory.

**What to do instead:** Wrap the cleanup pattern:
```ts
function disposeDie(die: THREE.Mesh) {
  die.geometry.dispose()
  const mats = Array.isArray(die.material) ? die.material : [die.material]
  for (const m of mats) {
    m.map?.dispose()
    m.dispose()
  }
}
```
Call it from `clearDice()` for every removed mesh.

**Related entries:** `ISSUES-LOG-DNDAPP.md` "Three.js dice geometries created per-roll" (medium)

---

### [2026-04-24] DO NOT add new dynamic `await import('./ai/foo-client')` calls without removing the static import in `provider-registry.ts`

- **Category:** design-gotcha
- **Severity:** high
- **Domain:** dnd-app

**Why it's tempting:** `ai-handlers.ts` already uses `await import('./ai/claude-client')` patterns to "lazy-load" the heavy provider SDKs only after a provider is selected. New AI provider added? Mirror the pattern.

**Why it's wrong:** `provider-registry.ts` statically imports all four provider clients (claude, gemini, openai, plus `bmo-bridge` for narration). Rollup bundles statically-imported modules into the eager chunk regardless of any other dynamic-import call elsewhere — it explicitly emits the warning *"dynamic import will not move module into another chunk"* at build time. The dynamic imports become no-ops; the bundle is the same size as if they weren't there.

**What to do instead:** Pick ONE pattern per module:
- If you want the SDK to be lazy: drop the static import in `provider-registry.ts`, register the provider through a setter the first time `ai-handlers.ts` imports it.
- If you want the SDK to be eager: drop the `await import(...)` in `ai-handlers.ts` and use a normal top-level import.

Mixing the two layers is the trap.

**Related entries:** `ISSUES-LOG-DNDAPP.md` "`npm run build` emits 14+ rollup warnings" (medium)

---

### [2026-04-24] DO NOT import `useNetworkStore` from `stores/use-network-store.ts` — import from `stores/network-store/index.ts` directly

- **Category:** design-gotcha
- **Severity:** high
- **Domain:** dnd-app

**Why it's tempting:** `use-network-store.ts` exists, advertises a `useNetworkStore` export, and most of the codebase already uses it. Looks like a stable indirection.

**Why it's wrong:** It's a barrel that **imports from `network-store/index.ts` and re-exports back into a module that `network-store/index.ts` depends on**. dpdm flags it as a circular dep; rollup explicitly warns *"will produce a circular dependency between chunks and will likely lead to broken execution order"* once per importer (12 importers seen in the current build).

The most likely runtime symptom is `useNetworkStore() === undefined` on first call in some specific load order — which is plausibly the latent cause of the `selectedTokenIds undefined` failures in `TokenContextMenu.test.tsx` (see vitest 30-failures entry).

**What to do instead:**
- New code: `import { useNetworkStore } from '@renderer/stores/network-store'` (or the equivalent relative path).
- Existing 12 importers: codemod-rewrite. Then either delete `use-network-store.ts` or keep it as a 1-line `export { useNetworkStore } from './network-store'` alias with a deprecation comment.

**Related entries:** `ISSUES-LOG-DNDAPP.md` "13 circular dependencies" (cycle #5/#6) + "rollup warnings" (medium).

---

### [2026-04-24] DO NOT use CJS `require()` for ESM-only deps in `electron.vite.config.ts`

- **Category:** design-gotcha
- **Severity:** medium
- **Domain:** dnd-app

**Why it's tempting:** The current config uses both `import` and `require()` (top of `electron.vite.config.ts` literally creates a `require` via `createRequire`). It works for everything currently in `devDependencies`. Adding a new tool? `require(...)` looks like the existing pattern.

**Why it's wrong:** Modern packages are dropping CJS exports. The current `rollup-plugin-visualizer@7.0.0` ships ESM only — `require('rollup-plugin-visualizer')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, which is exactly why `ANALYZE=1 npm run build` fails today (entry in `ISSUES-LOG-DNDAPP.md`).

**What to do instead:** Use `await import(...)` in any plugin factory that may load an ESM-only dep. The existing `analyzePlugin()` shape supports this — just await it in the caller.

```ts
async function analyzePlugin() {
  if (process.env.ANALYZE !== '1') return null
  const { visualizer } = await import('rollup-plugin-visualizer')
  return visualizer({ open: true, filename: 'bundle-stats.html', gzipSize: true })
}
```

(Vite/Rollup config can be `defineConfig(async () => ({ ... }))`.)

**Related entries:** `ISSUES-LOG-DNDAPP.md` `rollup-plugin-visualizer` ESM entry (low) + `madge`/`ts-prune` broken entries — same family of "outdated devDep tooling".

---

### [2026-04-24] DO NOT use `scripts/schemas/*.ts` to validate the public/data/5e content files as-is

- **Category:** design-gotcha, debt
- **Severity:** medium
- **Domain:** dnd-app

**Why it's tempting:** The `scripts/schemas/` directory has zod schemas (`SpellsSchema`, `BestiarySchema`, `ClassSchema`, `BackgroundSchema`, `FeatSchema`, `MechanicsSchema`, `SpeciesSchema`, `WorldSchema`) that look like they should validate `public/data/5e/...` JSON files of matching name. `.cursorrules` even calls them "schemas (shared by extract/)".

**Why it's wrong:** Empirically, **none of the obvious pairings validate**. The schemas are written for **single-record shapes**, but the content files are either (a) bare arrays (`spells.json` is `Spell[]`, `monsters.json` is `Monster[]`) or (b) wrapper objects with metadata fields the schema doesn't allow (`backgrounds.json` has `{section, description, total_count, backgrounds, cross_references, structural_patterns}`). Quick spot-check (10 file/schema pairs, see `dnd-app/scripts/audit/validate-content-vs-schemas.ts`) shows 6 fails / 4 file-not-found / 0 passes.

**What to do instead:**
- If you want runtime validation, pair the schema with a wrapper: `z.array(SpellSchema)` or `z.object({ spells: z.array(SpellSchema) })`.
- If you're treating the schemas as documentation, mention that explicitly — a future contributor will assume they're enforceable.
- A real fix is to either rewrite the schemas to match the content shape (recommended; data was presumably hand-shaped) or rewrite the content to match the schemas (large data migration).

**Related entries:** `ISSUES-LOG-DNDAPP.md` "5e content vs `scripts/schemas/` mismatch" entry (medium debt — being added now). The validator script `scripts/audit/validate-content-vs-schemas.ts` is the reproduction tool.

---

### [2026-04-24] DO NOT trust the `isolated-vm` dependency to mean plugins are sandboxed — they aren't

- **Category:** design-gotcha, security
- **Severity:** medium
- **Domain:** dnd-app

**Why it's tempting:** `isolated-vm@5.0.4` is in `dependencies` (not devDependencies). The plugin system's docs (`dnd-app/docs/PLUGIN-SYSTEM.md`, `.cursorrules`) imply plugin code runs in a sandbox.

**Why it's wrong:** **`isolated-vm` is imported nowhere in `src/`.** Plugins load via `await import(\`plugin://${id}/${manifest.entry}\`)` (`src/renderer/src/services/plugin-system/plugin-registry.ts:77`) — a normal renderer-process dynamic import. Plugin code has full access to:
- Every zustand store (game state, characters, AI configs in memory)
- The full `PluginAPI` (`createPluginAPI` at line 83) which exposes mutation hooks
- All 146 IPC channels (most of which lack zod input validation — see security log entry)
- Renderer DOM, including any opened modals/HUDs

The `isolated-vm` dep is misleading code archaeology — leftover from an abandoned sandbox attempt. Either implement the sandbox or drop the dependency to keep the threat model honest.

**What to do instead:** When reasoning about plugin trust, assume **plugin code runs with full renderer privileges**. The current mitigation is "user must explicitly enable a plugin via plugin-config" + "no plugin marketplace exists" — that's a *trust-on-install* model, not a *sandbox* model. Document accordingly in `dnd-app/docs/PLUGIN-SYSTEM.md`.

**Related entries:** `SECURITY-LOG.md` "Plugins run with full renderer privileges" entry.

---

### [2026-04-23] DO NOT leave task-list items as `pending` / `in_progress` at session end

- **Category:** design-gotcha, docs
- **Severity:** medium
- **Domain:** tooling *(applies to any AI session — mirrored in [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md))*

**Why it's tempting:** Once you're deep in execution, updating `TodoWrite` state feels like bookkeeping overhead — "I'll flip them all in the wrap-up message." Or you use `merge: true` and forget that drifted IDs from earlier calls are still accumulating in Cursor's aggregate view.

**Why it's wrong:** Cursor's UI counts status literally. A session that actually finished 43 of 43 tasks but only flipped 24 IDs to `completed` displays as "25/43 completed" — the user can't tell whether 18 tasks were genuinely skipped or just unrecorded. Observed in transcript `39e39f59-584b-4ec9-bbfe-1e1747217aa9` (the DnD→home-lab reorg): 17 items ended `pending`, 2 ended `in_progress`, despite the final summary + commit log showing the work was done (commits `030be55`, `c8909c5`, `6b2fc53`, `a234242` prove it).

**What to do instead:** Follow the Task List Discipline section in `AGENTS.md`. Key points:
- Flip status immediately when a task finishes (don't batch).
- Only ONE `in_progress` at a time.
- Before the final summary, walk every non-`completed` ID and reconcile it: mark `completed` (with evidence), `cancelled` (with reason), or flag as genuine user follow-up.
- When splitting a parent task into sub-phases, mark the parent `cancelled` with "split into Xa-Xf" — don't leave it `pending` alongside its children.

**Related entries:** Noted in session `[Cursor project dir cleanup](11f4ff15-afbc-46ab-aa3e-56a4645775ad)` while cleaning up the old `home-patrick-DnD/` Cursor project dir and investigating the 25/43 count.

**Related files:** `AGENTS.md` (§ Task List Discipline)

---

### [2026-04-23] DO NOT restructure `dnd-app/src/{main,preload,renderer,shared}/`

- **Category:** design-gotcha
- **Severity:** high
- **Domain:** dnd-app

**Why it's tempting:** Internal layout inside each process can be improved (feature-based grouping within `renderer/src/components/`, etc.). That's fine. But the TOP-LEVEL `src/main`, `src/preload`, `src/renderer`, `src/shared` — tempting to merge, split, or rename.

**Why it's wrong:** `electron-vite` (the build tool) hardcodes these directory names. Renaming = instant build breakage.

**What to do instead:** Keep the 4 top-level subdirs. Reorganize FREELY inside each of them.

---

# Info / Observations

### [2026-04-24] Electron security base config is correctly hardened — XSS sinks pruned

- **Category:** info, security
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** Electron BrowserWindow + sink audit

**Description:** Worth recording the things the codebase has *right*, so a refactor doesn't accidentally regress them. As of this scan:

- `src/main/index.ts` BrowserWindow `webPreferences`: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` — all 3 correctly set
- CSP set per-response on `webContents.session.webRequest.onHeadersReceived` (production policy locks down `default-src 'self'`)
- `setWindowOpenHandler` denies all `window.open` calls and routes `http(s)` URLs through `shell.openExternal` instead — correct
- Single-instance lock requested on app start (`requestSingleInstanceLock`)
- `uncaughtException` + `unhandledRejection` handlers route to `logToFile` instead of crashing silently
- `app.getPath('userData')` is the storage root for everything
- Zero `innerHTML` / `dangerouslySetInnerHTML` / `eval` / `new Function` usages in src/ — XSS sinks are absent
- Storage uses `atomic-write.ts` (temp file + rename) across game-state/campaign/bastion/homebrew/character/conversation modules
- `electron-updater` defaults preserved (signature verification on Windows + macOS); `autoDownload = false` requires explicit user click before any download
- Plugin protocol path-traversal protection works correctly (`resolvedPath.startsWith(resolvedBase)` after `resolve(join(...))`)
- IPC `FS_READ` / `FS_WRITE` gated on `isPathAllowed` (dialog-selected paths with TTL OR userData subtree)

**Why useful to future agents:** When a refactor or major dep bump risks any of these — for instance, switching CSP to a meta tag, or removing the dialog-allowed-path TTL — flag in the PR explicitly. These mitigations were paid for.

**Related entries:** `SECURITY-LOG.md` open issues for the gaps that *aren't* covered (CSP IP, plugin sandbox, IPC zod, plaintext keys).

---

### [2026-04-24] `atomic-write.ts` is the canonical storage write — use it, not bare `writeFile`

- **Category:** info, design-gotcha
- **Severity:** info
- **Domain:** dnd-app

**Description:** All major storage modules write through `src/main/storage/atomic-write.ts` (`writeFile` to a `.tmp` then `rename` to the destination — atomic on same-volume on POSIX + NTFS). Used by: `game-state-storage`, `campaign-storage`, `bastion-storage`, `homebrew-storage`, `character-storage`, `ai-conversation-storage`, `settings-storage`. The only direct `writeFile` call in storage/ is *inside* `atomic-write.ts` itself (writing the temp file).

**Why useful to future agents:** New storage module → use `atomicWriteFile`. Don't introduce bare `writeFile` (race risk: a crash mid-write truncates the destination). The existing pattern is uniform; preserve it.

**Related files:** `src/main/storage/atomic-write.ts`, all `*-storage.ts` files in `src/main/storage/`

---

### [2026-04-24] License audit clean — 222 prod deps, all permissive

- **Category:** info
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** `license-checker --production --summary`

**Description:** Production deps are all permissive (no GPL/AGPL/LGPL): MIT × 192, ISC × 11, Apache-2.0 × 6, BSD-3-Clause × 4, BSD-2-Clause × 2, Python-2.0 × 1, MPL-2.0 OR Apache-2.0 × 1, MIT OR WTFPL × 1, MIT AND Zlib × 1, BSD-2-Clause OR MIT OR Apache-2.0 × 1, BlueOak-1.0.0 × 1, MIT* × 1 (no LICENSE file in source — inferred). All compatible with the project's ISC license.

**Why useful to future agents:** When adding a new prod dep, run `npx license-checker --production --summary` to confirm no copyleft sneaks in. The ISC project license can be kept as-is.

---

### [2026-04-23 → 2026-04-25] Domain: both — five duplicated 5e JSONs + HTTP-only data ownership

- **Category:** design-gotcha, docs *(was mirrored in [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md))*
- **Severity:** info
- **Domain:** both

**2026-04-25 update:** Full write-ups live in [`DATA-FLOW.md`](./DATA-FLOW.md) (five-file table + `bash bmo/pi/scripts/sync-shared-5e-json.sh`, ownership rules) and [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md). BMO-side archive: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) → **"BMO suggestions log — full sweep"**.

---

> BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md). dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Security: [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md).
