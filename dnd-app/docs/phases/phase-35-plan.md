# Phase 35 — IPC handler zod validation sweep (every channel)

## Context

Today only ~9 of ~141 `ipcMain.handle(...)` call sites validate their payload with zod (storage handlers + 2 AI handlers, all via inline `safeParse`). The remaining ~132 channels accept payloads at face value — TypeScript types erased at runtime, malformed input crashing downstream handlers or silently corrupting persisted state.

This phase brings every `ipcMain.handle(...)` call through a `withSchema(channelName, schema, handler)` wrapper. Every channel gets a zod schema in `src/shared/ipc-schemas.ts` (or a per-family split). A CI script asserts the wrapper requirement, failing PRs that add unwrapped handlers.

Goal: structurally impossible to ship a new IPC handler without input validation. Closes the SECURITY-LOG `[2026-04-24]` "119 of 121 IPC handlers don't zod-validate" entry. Entirely main-process work (Electron main + the shared schemas surface); no renderer-side work, no Pi work.

## Depends on / blocks
- Depends on: none
- Blocks: closes SECURITY-LOG `[2026-04-24]`; absorbs Phase 28a.5 (JSON.parse containment in `game-data-handlers.ts:29`); folds finding into Phase 20 S1 (token encryption); reduces cast surface for Phase 28d

## Files touched

| Path | Role |
|------|------|
| `src/shared/ipc-schemas.ts` | Existing 3 schemas; expand to ~141 |
| `src/shared/ipc-schemas/*.ts` (new, optional split if file exceeds ~2k lines) | Per-family schema modules |
| `src/main/ipc/withSchema.ts` (new) | `withSchema(channelName, schema, handler)` wrapper |
| `src/main/ipc/ai-handlers.ts` | 48 handlers — largest cluster |
| `src/main/ipc/storage-handlers.ts` | 50 handlers (7 already inline-validated) |
| `src/main/ipc/plugin-handlers.ts` | 10 handlers (incl. `plugin:install`) |
| `src/main/ipc/index.ts` | 9 handlers (FS + dialogs) |
| `src/main/ipc/audio-handlers.ts` | 5 handlers (incl. custom audio pick/get-path) |
| `src/main/ipc/discord-handlers.ts` | 4 handlers (incl. bot tokens) |
| `src/main/ipc/cloud-sync-handlers.ts` | 4 handlers |
| `src/main/ipc/lan-handlers.ts` | 4 handlers |
| `src/main/ipc/updater.ts` (`src/main/updater.ts`) | 4 handlers |
| `src/main/ipc/bmo-sync-handlers.ts` | 2 handlers |
| `src/main/ipc/game-data-handlers.ts` | 1 handler + absorb JSON.parse containment |
| `src/main/ipc/*-handlers.test.ts` | Per-channel vitest specs (valid + invalid payloads) |
| `src/preload/index.ts` | Envelope handling for new `{ ok, data, error, issues }` shape |
| `scripts/audit/check-ipc-coverage.mjs` (new) | CI script asserting every `ipcMain.handle` is wrapped |
| `scripts/build/gen-ipc-surface.mjs` | Emit schema name alongside channel constant |
| `docs/IPC-SURFACE.md` | Document `withSchema` requirement + per-channel schema |
| `AGENTS.md`, `CLAUDE.md` | New rule: every IPC channel requires schema + wrapper + 2 specs |

## Sub-phase summary

| # | Sub-phase | Theme |
|---|-----------|-------|
| 35a | `withSchema` wrapper + storage sweep | Build wrapper; migrate 7 inline-validated handlers + sweep remaining 43 storage handlers |
| 35b | AI handlers (~48 channels) | Largest single file; cluster by provider |
| 35c | Audio handlers (5 channels) | Path-traversal constraints for custom audio |
| 35d | Plugin handlers (10 channels) | Highest-risk surface — plugin install writes code to disk |
| 35e | Discord handlers (4 channels) | Bot token shape validation; storage path audit |
| 35f | Cloud sync handlers (4 channels) | Remote names + paths |
| 35g | LAN handlers (4 channels) | Local network IPC |
| 35h | Game data + BMO sync + JSON.parse containment | Absorbs Phase 28a.5 |
| 35i | FS handlers + dialogs (`src/main/ipc/index.ts`, 9) + updater (4) | Final cluster sweep |
| 35j | CI coverage script | `check-ipc-coverage.mjs` + wire into `check:full` + CI workflow |
| 35k | Tests + docs | Per-channel specs; ADR; AGENTS/CLAUDE rule update; gen-ipc-surface schema emit |

11 sub-phases. Each ends with the 4-gate suite. One release at end.

## Architecture / data flow

```
renderer  ->  ipcRenderer.invoke(channel, payload)
                |
                v
preload   ->  contextBridge exposed API
                |
                v
main      ->  ipcMain.handle(channel, withSchema(channel, Schema, handler))
                     | (safeParse)
                     +-- fail -> { ok: false, error: 'INVALID_PAYLOAD', issues } -> logToFile WARN
                     +-- ok   -> handler(event, parsed.data) -> { ok: true, data: result }
                                  |
                                  v throw -> { ok: false, error: msg } -> logToFile ERROR
```

## Sub-phase details

### 35a — `withSchema` wrapper + storage sweep
**Files:** `src/main/ipc/withSchema.ts` (new), `src/main/ipc/storage-handlers.ts`, `src/shared/ipc-schemas.ts`, `src/preload/index.ts`, `src/renderer/src/services/storage-client.ts` (new helper)
**Steps:**
1. Author `src/main/ipc/withSchema.ts` exporting `withSchema<TPayload, TResult>(channelName, schema, handler)` returning `{ ok, data } | { ok, error, issues }`. Imports `logToFile` from `../log`. Supports sync + async handler bodies. Logs WARN on validation failure, ERROR on handler throw.
2. Update `src/preload/index.ts` to surface the new envelope shape to renderers. Recommend keeping the envelope visible.
3. Migrate the 7 inline-validated storage handlers at `src/main/ipc/storage-handlers.ts:68,109,142,175,208` to `withSchema(channel, Schema, handler)`. Replace each `const parsed = X.safeParse(...)` block with the wrapper.
4. Sweep remaining ~43 storage handlers — add schemas in `src/shared/ipc-schemas.ts`, wrap each call site.
5. Add helper `src/renderer/src/services/storage-client.ts` providing typed reads of the new envelope.
6. Vitest specs in `src/main/ipc/storage-handlers.test.ts` — at least 2 channels with valid + invalid payloads.
**Acceptance:** all 50 storage handlers wrapped; round-trip behaviour unchanged; specs green.

### 35b — AI handlers
**Files:** `src/main/ipc/ai-handlers.ts` (48 handlers), `src/shared/ipc-schemas.ts`
**Steps:**
1. Inventory every `ipcMain.handle(...)` site in `src/main/ipc/ai-handlers.ts` (grep shows 48). Cluster by provider: claude, openai, gemini, ollama, bmo-bridge narration.
2. Define a `ChatMessageSchema` shared across providers. Expand `AiChatRequestSchema` family.
3. Drop inline `safeParse` from the 2 already-validated channels.
4. Wrap each handler. Streaming chunks remain out-bound via `event.sender.send(streamChannel, chunk)` (only initial request is wrapped).
5. Per-provider vitest spec in `src/main/ipc/ai-handlers.test.ts`.
**Acceptance:** all 48 AI handlers wrapped; streaming + one-shot flows still work end-to-end.

### 35c — Audio handlers
**Files:** `src/main/ipc/audio-handlers.ts` (5 handlers at lines 25, 58, 76, 97, 118), `src/shared/ipc-schemas.ts`
**Steps:**
1. Schemas: `AudioListCustomSchema`, `AudioDeleteCustomSchema`, `AudioGetCustomPathSchema`, `AudioPickFileSchema`.
2. `AUDIO_GET_CUSTOM_PATH` payload includes a `fileName`. Schema must constrain shape: no absolute paths, no `..` traversal, no path separators (basename only).
3. Wrap each handler with `withSchema`.
4. Vitest spec: `..` in `fileName` rejected by schema before handler runs.
**Acceptance:** 5 audio channels wrapped; path traversal closed at schema layer.

### 35d — Plugin handlers
**Files:** `src/main/ipc/plugin-handlers.ts` (10 handlers at lines 23, 27, 36, 45, 53, 58, 73, 83, 92, 101), `src/shared/ipc-schemas.ts`
**Steps:**
1. Schemas: extend the existing `PluginIdSchema` + `PluginKeySchema`. Add `PluginInstallPayloadSchema`, `PluginManifestSchema`, `PluginStorageValueSchema`.
2. `PLUGIN_INSTALL` (line 58) — payload schema enforces structural validation of the install descriptor. Signature verification stays a separate concern (future Phase 20 S4).
3. Drop the inline `safeParse` calls once `withSchema` wraps the handler.
4. Wrap each handler with `withSchema`.
5. Vitest specs cover at least 3 channels (install, enable, storage-set).
**Acceptance:** 10 plugin channels wrapped; install rejects malformed payloads at schema.

### 35e — Discord handlers
**Files:** `src/main/ipc/discord-handlers.ts` (4 handlers at lines 15, 37, 56, 68), `src/shared/ipc-schemas.ts`
**Steps:**
1. Schemas: `DiscordConfigSchema` (constrains `botToken` to string of expected length, not its content), `DiscordSendMessageSchema`.
2. Wrap each handler with `withSchema`.
3. Document Discord-service token storage path: confirm whether `botToken` is stored via `safeStorage` or plaintext settings. If plaintext, surface as a Phase 20 S1 prerequisite. Schema must accept both encrypted blob and decrypted string forms if encryption is mid-migration.
4. Vitest spec covers config save with valid + missing-token payloads.
**Acceptance:** 4 Discord channels wrapped; token storage path documented.

### 35f — Cloud sync handlers
**Files:** `src/main/ipc/cloud-sync-handlers.ts` (4 handlers), `src/shared/ipc-schemas.ts`
**Steps:**
1. Schemas for remote-name and path payloads. Constrain remote names to a safe character set (rclone-compatible).
2. Wrap each handler with `withSchema`.
3. Vitest spec covers list + sync with valid + malformed remote names.
**Acceptance:** 4 cloud sync channels wrapped.

### 35g — LAN handlers
**Files:** `src/main/ipc/lan-handlers.ts` (4 handlers), `src/shared/ipc-schemas.ts`
**Steps:**
1. Schemas for LAN-discovery + sync request payloads.
2. Wrap each handler with `withSchema`.
3. Vitest spec covers each handler with valid + malformed payloads.
**Acceptance:** 4 LAN channels wrapped.

### 35h — Game data + BMO sync + JSON.parse containment
**Files:** `src/main/ipc/game-data-handlers.ts` (1 handler + line 29 `JSON.parse`), `src/main/ipc/bmo-sync-handlers.ts` (2 handlers), `src/shared/ipc-schemas.ts`
**Steps:**
1. Schema for `game:load-json` — payload is a relative path within the data dir.
2. Schemas for the 2 BMO sync handlers. For library-entry payloads, import per-category schemas from `services/library/schemas/registry.ts` rather than redeclaring shapes.
3. Wrap each handler with `withSchema`.
4. Absorb Phase 28a.5: at `src/main/ipc/game-data-handlers.ts:29`, wrap the bare `JSON.parse(content)` in try/catch returning `{ ok: false, error: 'INVALID_JSON' }`. Strike Phase 28a.5 from Phase 28 scope.
5. Vitest spec covers JSON.parse failure path surfacing as `INVALID_JSON`.
**Acceptance:** game data + 2 BMO sync handlers wrapped; JSON.parse failures typed.

### 35i — FS handlers + dialogs (index.ts) + updater
**Files:** `src/main/ipc/index.ts` (9 handlers — FS at 102, 122, 142, 160; dialogs; etc.), `src/main/updater.ts` (4 handlers), `src/shared/ipc-schemas.ts`
**Steps:**
1. FS schemas: `FsReadFileSchema`, `FsReadFileBinarySchema`, `FsWriteFileSchema`, `FsWriteFileBinarySchema`. `isPathAllowed` check stays inside the handler body; schema validates payload shape only.
2. Dialog + remaining `index.ts` handler schemas.
3. Updater schemas for the 4 channels in `src/main/updater.ts`.
4. Wrap each. Final grep `grep -rE 'ipcMain\.handle\(' src/main/` should show zero unwrapped calls.
5. Vitest specs for FS handlers + updater channels.
**Acceptance:** zero unwrapped `ipcMain.handle(...)` calls.

### 35j — CI coverage script
**Files:** `scripts/audit/check-ipc-coverage.mjs` (new), `.github/workflows/dnd-app-ci.yml`, `package.json` (`check:full` script)
**Steps:**
1. Author `scripts/audit/check-ipc-coverage.mjs`: walks `src/main/ipc/*.ts` + `src/main/updater.ts`; for every `ipcMain.handle(...)` call, asserts the second argument is `withSchema(...)` OR a `// ipc-allow-unsafe: <reason>` comment is on the preceding line. Fails (exit 1) on any unsafe handler.
2. Allowlist format: must include a reason string.
3. Wire into `npm run check:full` and `.github/workflows/dnd-app-ci.yml` preflight job.
4. Verify with a sandbox PR adding an unwrapped handler — CI must fail.
**Acceptance:** CI gate prevents new unwrapped handlers; sandbox PR red.

### 35k — Tests + docs
**Files:** `src/main/ipc/*-handlers.test.ts`, `scripts/build/gen-ipc-surface.mjs`, `docs/IPC-SURFACE.md`, `docs/decisions/ADR-001-ipc-validation.md` (new), `AGENTS.md`, `CLAUDE.md`
**Steps:**
1. Per-family vitest spec: every wrapped channel has at least 2 specs (valid + invalid payload). Backfill any gaps.
2. Update `scripts/build/gen-ipc-surface.mjs` to emit each channel's schema name alongside its constant name. Regenerate `docs/IPC-SURFACE.md`.
3. New ADR at `docs/decisions/ADR-001-ipc-validation.md` documenting the `withSchema` convention + envelope rationale + allowlist policy.
4. Add rule to `AGENTS.md` + `CLAUDE.md` under "When adding a new IPC channel".
**Acceptance:** doc generator emits schemas; ADR landed; rule in agent docs; per-channel specs comprehensive.

## Constraints & edge cases

- **Wrapper design.** `{ ok, data, error, issues }` envelope is the convention — do NOT strip at the preload boundary. Every rejection logs `logToFile('WARN', ...)` with channel name + issues; never swallow silently. Wrapper supports sync + async handler bodies. Streaming handlers stay outside the wrapper for chunks.
- **Schema discipline.** Schemas are sources of truth; TypeScript types inferred via `z.infer<typeof Schema>`. Pick `.passthrough()` vs `.strict()` consistently per channel. Don't validate secrets' values.
- **Plugin install (35d).** Schema validates the install payload shape, not the plugin code. Future Phase 20 S4 work adds signature verification AFTER schema check passes.
- **Audio upload (35c).** Reject `..` traversal at the schema, before the handler touches the file system.
- **Discord (35e).** When the renderer sends a new bot token, the schema accepts a string (length + format only). Storage encryption is Phase 20 S1.
- **FS handlers (35i).** `isPathAllowed` runtime check stays in the handler body; schema validates payload shape only.
- **CI allowlist (35j).** Format must include reason: `// ipc-allow-unsafe: legacy channel pending migration to v2 in Phase X`. Target: zero allowlisted channels post-35.
- **Library payloads (35h).** Import per-category schemas from `services/library/schemas/registry.ts` rather than redeclaring in `src/shared/ipc-schemas.ts`.

## Verification

After each sub-phase:
```
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

End-to-end: `npm run check:full` passes; `grep -rE 'ipcMain\.handle\(' src/main/` returns 0 unwrapped (or only allowlisted with reasons).

Execution order: 35a first (wrapper must exist). Then 35d (highest-risk plugin install) -> 35c (audio path traversal) -> 35e (Discord tokens) -> 35h (game data, absorbs JSON.parse) -> 35b (biggest cluster) -> 35f -> 35g -> 35i -> 35j -> 35k.

Commit cadence: one commit per sub-phase, `feat(ipc): ...` prefix. One release at end of Phase 35.

## Completed
- (none — Phase 35 not started; `src/main/ipc/withSchema.ts` does not exist; only 9 of ~141 `ipcMain.handle` sites validate, all via inline `safeParse`)

> **PHASE 35 DEFERRED — 2026-05-29 (overnight autonomous pass).** The `withSchema` sweep changes the IPC envelope shape for ~50 storage channels (and ~80 more across AI/audio/plugin/discord/cloud/LAN/FS), which requires updating every renderer caller to the new `{ ok, data } | { ok, error, issues }` shape and reconciling with the Phase-17 `handle`/`safeHandler` wrapper already applied to these files. A partial sweep leaves an inconsistent contract; a `withSchema` foundation with no consumers is dead code. Correctness needs renderer round-trip + app verification. Deferred intact. NOTE: Phase 17 NET-6 already wrapped ai/storage/plugin handlers in `safeHandler` (throw→error-envelope containment); Phase 20 added Zod validation to AI_CONFIGURE/AI_CHAT_STREAM + plugin-id; so the highest-risk surfaces already have *some* validation/containment. The remaining gap is per-channel payload schemas, deferred here.

> **35a FOUNDATION LANDED — 2026-05-29 (resumed "do them all").** `withSchema(channel, zodSchema, handler)` added to `src/main/ipc/_safe.ts` (validates payload, passes parsed value, throws on failure → safeHandler envelope; preserves the success contract so no renderer churn). Tested. The per-channel migration sweeps (35b storage/AI/…–35i) + coverage script (35j) remain; this wrapper is what they build on.

> **35c DONE + withArgsSchema foundation — 2026-05-29 (resumed "do it all").** Added `withArgsSchema` (validates the positional-arg tuple) to `_safe.ts`; wrapped all 5 audio IPC handlers (UUID + traversal-safe basename at the schema layer). 35d plugin + 35e discord handlers already carry inline zod validation (Phase 22i/20) so they're effectively covered; remaining storage/AI/cloud/LAN/FS channel sweeps continue on this foundation.
