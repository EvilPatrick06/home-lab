# Phase 35 — IPC handler zod validation sweep (every channel)

Phase 35 closes the IPC validation gap. Today `~9` of `~126` IPC channels validate their payload with zod (storage + ai families). The remaining `~117` accept payloads at face value — TypeScript types erased at runtime, malformed input crashing downstream handlers or silently corrupting persisted state.

This phase brings every `ipcMain.handle(...)` call through a `withSchema(channelName, schema, handler)` wrapper. Every channel has a zod schema in `src/shared/ipc-schemas.ts` (or a per-family file). A missing schema fails CI before merge.

Goal: structurally impossible to ship a new IPC handler without input validation.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 35 is entirely main-process (Electron main + the shared schemas surface). No renderer-side work, no Pi work.

**Files touched:**

| File / directory | Role |
|------------------|------|
| `src/shared/ipc-schemas.ts` | Existing schemas (3) + ~117 new ones added by the sweep |
| `src/shared/ipc-schemas/*.ts` *(new — per-family split if the single file grows past ~2k lines)* | Per-family schema modules (storage, audio, plugin, discord, cloud, etc.) |
| `src/main/ipc/withSchema.ts` *(new)* | `withSchema(channelName, schema, handler)` wrapper |
| `src/main/ipc/ai-handlers.ts` | Migrate ~50 channels |
| `src/main/ipc/storage-handlers.ts` | 7 already done; sweep remaining ~7 |
| `src/main/ipc/audio-handlers.ts` | ~5 channels |
| `src/main/ipc/plugin-handlers.ts` | 10 channels (incl. `plugin:install` — security-critical) |
| `src/main/ipc/discord-handlers.ts` | 4 channels (incl. bot tokens) |
| `src/main/ipc/cloud-sync-handlers.ts` | 4 channels |
| `src/main/ipc/game-data-handlers.ts` | 1 channel + 28a.5 JSON.parse work |
| `src/main/ipc/bmo-sync-handlers.ts` | All channels |
| `src/main/ipc/index.ts` | 9 channels |
| `src/main/updater.ts` | Updater channels |
| `src/main/ipc/book-handlers.ts`, `image-library-handlers.ts`, `map-library-handlers.ts`, `shop-template-handlers.ts` | Per-family sweeps |
| `scripts/audit/check-ipc-coverage.mjs` *(new)* | CI script asserting every `ipcMain.handle` call is wrapped |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

Per the SECURITY-LOG `[2026-04-24]` entry, every `ipcMain.handle(...)` site needs:
1. A zod schema for its payload (request).
2. A schema for its response (optional but recommended for the higher-traffic channels).
3. A pre-handler `safeParse` that returns a typed error before reaching the handler body.

Today 9 channels do this manually (storage handlers: 7; ai handlers: 2). Phase 35 generalizes via `withSchema` and sweeps every remaining channel.

### Sub-phase summary

| # | Sub-phase | Scope |
|---|-----------|-------|
| 35a | `withSchema` wrapper + storage sweep finish | Build the wrapper; migrate the 7 already-validated storage handlers + sweep the ~7 remaining (`*-versions`, `import`, `export`, etc.) |
| 35b | AI handlers (~50 channels) | The largest cluster; many sub-routes per provider |
| 35c | Audio handlers (~5 channels including `audio:upload-custom`) | Security-critical: writes user file paths to userData |
| 35d | Plugin handlers (10 channels incl. `plugin:install`) | Highest-risk surface: plugin install writes code to disk |
| 35e | Discord handlers (4 channels incl. bot tokens) | Carries credentials in payloads |
| 35f | Cloud sync handlers (4 channels) | Invokes remote `rclone` via BMO |
| 35g | Book handlers (~7 channels) | Loads/saves book data |
| 35h | Image library + map library + shop template handlers | ~3-4 channels each |
| 35i | Game data + BMO sync handlers | `game:load-json`, BMO sync handlers, JSON.parse containment from Phase 28a.5 absorbed here |
| 35j | FS handlers + updater + remaining `bmo:*` channels | `fs:read-file`, `fs:write-file`, updater channels, anything else |
| 35k | CI coverage script + verification | `check-ipc-coverage.mjs` walks every `ipcMain.handle` site, asserts it's wrapped by `withSchema`; fails CI if not |
| 35l | Tests + docs | Per-channel vitest specs for valid + invalid payloads; ADR documenting the convention |

12 sub-phases. Each ends with the 4-gate suite. One release at end.

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: `withSchema` wrapper + storage sweep (35a)

**Step 1 — Author the wrapper**
- New file `src/main/ipc/withSchema.ts`:
  ```ts
  import type { ZodSchema } from 'zod'
  import type { IpcMainInvokeEvent } from 'electron'

  export function withSchema<TPayload, TResult>(
    channelName: string,
    schema: ZodSchema<TPayload>,
    handler: (event: IpcMainInvokeEvent, payload: TPayload) => Promise<TResult> | TResult
  ): (event: IpcMainInvokeEvent, payload: unknown) => Promise<{ ok: true; data: TResult } | { ok: false; error: string; issues?: unknown }> {
    return async (event, payload) => {
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        logToFile('WARN', `[ipc:${channelName}] payload validation failed`, parsed.error.issues)
        return { ok: false, error: 'INVALID_PAYLOAD', issues: parsed.error.issues }
      }
      try {
        const result = await handler(event, parsed.data)
        return { ok: true, data: result }
      } catch (err) {
        logToFile('ERROR', `[ipc:${channelName}] handler error`, err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  }
  ```
- All handlers move to `ipcMain.handle(channelName, withSchema(channelName, Schema, handler))`.

**Step 2 — Update preload to handle the new response envelope**
- Renderers expect `{ ok, data, error, issues }` instead of bare data. Update `src/preload/index.ts` API surface or maintain back-compat by stripping `{ ok: true, data }` to just `data` at the preload boundary.
- Recommend: keep the envelope visible — renderers explicitly check `result.ok` before using `result.data`. This makes validation failures explicit at every call site.

**Step 3 — Migrate the 7 already-validated storage handlers**
- Storage handlers currently do `safeParse` manually inside the handler body. Replace each with `withSchema(...)`.
- Files: `storage-handlers.ts` — `CharacterSaveSchema`, `CampaignSaveSchema`, `BastionSaveSchema`, `CustomCreatureSaveSchema`, `GameStateSaveSchema`, `HomebrewSaveSchema`, `AppSettingsSchema`.
- Net effect: no behavior change, just convention compliance.

**Step 4 — Sweep remaining storage handlers**
- The ~7 remaining storage channels (version listing, version restore, import, export) get schemas in `ipc-schemas.ts` and `withSchema` wrappers.

**Step 5 — Update renderer call sites**
- Every renderer call to storage IPC accepts the new envelope shape. Provide a typed helper in `src/renderer/src/services/storage-client.ts` (or wherever the storage IPC is wrapped) so component code reads cleanly.

**Acceptance:**
- All ~14 storage channels use `withSchema`.
- Vitest specs cover at least 2 channels with valid + invalid payloads.
- No regression in storage round-trip behavior.

---

### Sub-Phase B: AI handlers (35b)

**Step 6 — Inventory the AI surface**
- `src/main/ipc/ai-handlers.ts` is the largest single handler file. Catalogue every `ipcMain.handle(...)` call (the grep showed ~50 matches; many may be helper functions and not actual `.handle` sites — recount).
- Cluster by provider: claude, openai, gemini, ollama, bmo-bridge narration.

**Step 7 — Define schemas**
- For each handler: define request schema (`AiChatRequestSchema` exists; expand the family).
- Common payload shapes: `{ prompt: string, model: string, context?: ... }`, `{ messages: ChatMessage[], system: string }`, etc.
- Build a `ChatMessageSchema` shared across providers.

**Step 8 — Migrate handlers**
- Each `ipcMain.handle(channelName, async (event, payload) => ...)` becomes `ipcMain.handle(channelName, withSchema(...))`.
- The 2 already-validated channels (`AI_CONFIGURE`, `AI_CHAT_STREAM`) drop their inline `safeParse` calls — `withSchema` covers them.

**Step 9 — Update streaming channels**
- AI streaming uses `event.sender.send(streamChannel, chunk)` pattern. `withSchema` validates the initial request payload; streaming chunks are out-bound and don't go through the wrapper.

**Step 10 — Vitest specs**
- Per channel family: valid payload + missing-field payload + wrong-type payload. Ensure each fails with `INVALID_PAYLOAD` not a downstream crash.

**Acceptance:**
- Every AI handler is wrapped.
- AI streaming + one-shot flows still work end-to-end.

---

### Sub-Phase C: Audio handlers (35c)

**Step 11 — Schemas**
- `audio:play-sfx`, `audio:play-ambient`, `audio:stop-custom`, `audio:upload-custom`, `audio:list-custom`.
- `audio:upload-custom` is security-critical — payload includes a `filePath` that the handler reads from disk. Schema must constrain `filePath` shape (no absolute paths outside the allowed dir, no `..` traversal).

**Step 12 — Migrate handlers**
- Each `ipcMain.handle(channelName, ...)` wrapped with `withSchema`.

**Step 13 — Path validation tests**
- Specifically for `audio:upload-custom`: spec confirms a `filePath` with `..` is rejected by the schema before reaching the handler.

**Acceptance:**
- 5 audio channels wrapped; upload-custom path traversal closed at the schema layer.

---

### Sub-Phase D: Plugin handlers (35d)

**Step 14 — Schemas (highest-risk surface)**
- `plugin:install` — payload includes the plugin ZIP path or buffer; signature TBD per Phase 20 S4.
- `plugin:list`, `plugin:enable`, `plugin:disable`, `plugin:uninstall`, etc. — simpler payloads (plugin id).
- 10 channels per the grep.

**Step 15 — Migrate handlers**
- Each wrapped. `plugin:install` schema enforces structural validation of the install payload.

**Step 16 — Coordinate with Phase 20 S4**
- Phase 20 S4 (plugin signature verification) is a separate concern; Phase 35 only adds payload validation. Future integrity check stacks on top.

**Acceptance:**
- 10 plugin channels wrapped.
- Plugin install rejects malformed payloads at schema, not handler logic.

---

### Sub-Phase E: Discord handlers (35e)

**Step 17 — Schemas**
- `discord:configure`, `discord:send-message`, `discord:get-status`, `discord:disconnect`.
- Payloads include `botToken` strings — schemas constrain length / format if known.
- Bot tokens themselves are secrets; schema doesn't validate the secret value, just the shape.

**Step 18 — Migrate handlers**
- Each wrapped.

**Step 19 — Discord-service token storage check (from SUGGESTIONS-LOG info entry)**
- Per the deferred verification: confirm whether `botToken` is stored via `safeStorage` or in plaintext settings. If plaintext, coordinate with Phase 20 S1 (encrypt secrets); validate the schema accepts both encrypted blob and decrypted string forms.

**Acceptance:**
- 4 discord channels wrapped.
- Token storage path documented (verifies + folds into Phase 20 S1).

---

### Sub-Phase F: Cloud sync handlers (35f)

**Step 20 — Schemas**
- `cloud:list-remotes`, `cloud:sync-up`, `cloud:sync-down`, `cloud:status`.
- Payloads include remote names + paths; constrain accordingly.

**Step 21 — Migrate handlers**
- 4 channels wrapped.

**Acceptance:**
- 4 cloud sync channels wrapped.

---

### Sub-Phase G: Book handlers (35g)

**Step 22 — Schemas**
- `book:list`, `book:read-file`, `book:read-page`, `book:get-metadata`, `book:save-bookmark`, `book:list-bookmarks`, `book:import`.
- 7 channels.

**Step 23 — Migrate handlers**
- Each wrapped.

**Acceptance:**
- 7 book channels wrapped.

---

### Sub-Phase H: Image library + map library + shop template handlers (35h)

**Step 24 — Schemas for image library**
- `image-library:list`, `image-library:upload`, `image-library:delete`. ~3-4 channels.

**Step 25 — Schemas for map library**
- `map-library:list`, `map-library:save`, `map-library:load`, `map-library:delete`. ~3-4 channels.

**Step 26 — Schemas for shop template**
- `shop-template:list`, `shop-template:save`, `shop-template:load`. ~3 channels.

**Step 27 — Migrate handlers**
- Each wrapped.

**Acceptance:**
- ~10 channels across the 3 families wrapped.

---

### Sub-Phase I: Game data + BMO sync handlers + JSON.parse containment (35i)

**Step 28 — Schemas**
- `game:load-json` — payload is a relative path within the data dir. Schema constrains the path shape.
- BMO sync handlers (per `bmo-sync-handlers.ts`).

**Step 29 — Absorb JSON.parse containment (Phase 28a.5 work)**
- `src/main/ipc/game-data-handlers.ts:29` currently has bare `JSON.parse(content)`. As part of Phase 35 wrapping, add a try/catch returning `'INVALID_JSON'` on failure.
- Coordinate: Phase 28a.5 may not need to ship separately if 35i covers it. Strike 28a.5 from Phase 28 scope.

**Step 30 — Migrate handlers**
- Each wrapped. JSON.parse containment integrates.

**Acceptance:**
- Game data + BMO sync handlers wrapped.
- JSON.parse failures surface as typed `INVALID_JSON` errors, not silent crashes.

---

### Sub-Phase J: FS handlers + updater + remaining channels (35j)

**Step 31 — FS handlers**
- `fs:read-file`, `fs:write-file` — both gated on `isPathAllowed` already, but schemas were missing for the content/path payloads.

**Step 32 — Updater channels**
- Whatever `src/main/updater.ts` exposes as IPC handlers.

**Step 33 — Anything missed**
- Run `grep -rE 'ipcMain\\.handle\\(' src/main/` and cross-reference against the per-family lists above. Anything not yet wrapped gets a schema + `withSchema`.

**Acceptance:**
- Zero `ipcMain.handle(...)` calls outside `withSchema(...)`.

---

### Sub-Phase K: CI coverage script + verification (35k)

**Step 34 — Author the coverage script**
- New file `scripts/audit/check-ipc-coverage.mjs`:
  - Parses every `src/main/ipc/*.ts` file for `ipcMain.handle(...)` calls.
  - Each call site must be either `ipcMain.handle(channelName, withSchema(...))` or carry a `// ipc-allow-unsafe: <reason>` comment with a documented reason.
  - Fails (exit 1) if any unsafe handler is found.

**Step 35 — Wire into CI**
- Add to `check:full` script + `dnd-app-ci.yml` workflow.

**Step 36 — Documentation**
- Add a section to `docs/IPC-SURFACE.md` describing the `withSchema` requirement.
- New ADR `docs/decisions/ADR-001-ipc-validation.md` (or wherever the project keeps decision records) documenting why every channel must be validated.

**Step 37 — Verify**
- Sample PR with an unwrapped `ipcMain.handle(...)` fails CI.
- `npm run check:full` passes on master.

**Acceptance:**
- CI gate prevents new unwrapped handlers from landing.
- Documentation captures the rule.

---

### Sub-Phase L: Tests + docs (35l)

**Step 38 — Per-channel vitest specs**
- For every family, at least one spec covering: valid payload (handler runs, response shape correct), missing-field payload (rejected with `INVALID_PAYLOAD`), wrong-type payload (rejected).
- Target: every wrapped channel has at least 2 specs.

**Step 39 — Update IPC-SURFACE.md generation**
- The doc generator (`scripts/gen-ipc-surface.mjs` or similar) should now emit each channel's schema name alongside its constant name.

**Step 40 — AGENTS.md + CLAUDE.md**
- New rule: "When adding a new IPC channel: define schema in `src/shared/ipc-schemas.ts`, wrap handler with `withSchema`, add at least 2 vitest specs (valid + invalid)."

**Acceptance:**
- Test coverage of IPC validation is exhaustive.
- Future contributors can't ship unwrapped handlers without explicit allowlist comment + reason.

---

## ⚠️ Constraints & Edge Cases

### Wrapper design
- **`withSchema` envelope.** Returning `{ ok, data, error, issues }` makes validation failures explicit at every call site. Renderers must check `result.ok` before reading `result.data`. Don't strip the envelope at the preload boundary; the explicitness is the point.
- **Logging on validation failure.** Every rejection logs to `logToFile('WARN', ...)` with channel name + issues. Don't swallow validation failures silently.
- **Async handlers.** The wrapper supports both sync and async handler bodies. Streaming handlers stay outside the wrapper for chunks (only the initial request is wrapped).

### Schema discipline
- **Schemas are sources of truth.** TypeScript types are inferred from schemas via `z.infer<typeof Schema>`; the schema is the single declaration.
- **Allow extra fields by default with `.passthrough()`** OR require strict shapes with `.strict()` — pick consistently per channel based on whether forward compatibility matters. Document choice in the schema.
- **Don't validate secrets' values.** A bot token's value is a secret; the schema validates that the field is a string of expected length, not the secret content itself.

### Plugin install (35d) caveats
- **Schema validates the install payload shape, not the plugin code.** Future Phase 20 S4 work adds signature verification AFTER schema check passes.
- **The plugin's own runtime privileges are unchanged.** Once installed, plugins still have full renderer access (per SUGGESTIONS-LOG gotcha). Schema validation is the boundary check, not the trust model.

### Audio upload (35c) caveats
- **Path validation in schema.** Refuse `..` traversal at the schema, before the handler touches the file system.
- **MIME / file-size limits.** Schema can encode minimum/maximum bytes for the path's resolved file; coordinate with Phase 28a's body-size work.

### Discord handlers (35e) caveats
- **Bot token in payload.** When the renderer sends a new bot token to configure Discord, the schema accepts a string. Storage encryption is Phase 20 S1.

### CI script edge cases
- **Allowlist must reference a reason.** `// ipc-allow-unsafe: legacy channel pending migration to v2 in Phase X` not bare `// ipc-allow-unsafe`.
- **Allowlist count must be tracked.** Target: zero unsafe channels post-Phase-35.

---

## 🎯 Verification — end-to-end test plan

After **35a**: 14 storage channels wrapped; vitest specs cover valid + invalid; storage round-trip still works.

After **35b**: ~50 AI channels wrapped; AI streaming + one-shot flows work.

After **35c**: 5 audio channels wrapped; upload-custom rejects path traversal at schema.

After **35d**: 10 plugin channels wrapped; install rejects malformed payloads.

After **35e**: 4 discord channels wrapped; token storage path documented.

After **35f**: 4 cloud sync channels wrapped.

After **35g**: 7 book channels wrapped.

After **35h**: ~10 channels across image/map/shop families wrapped.

After **35i**: game data + BMO sync wrapped; JSON.parse containment from Phase 28a.5 absorbed.

After **35j**: FS + updater + any remaining wrapped.

After **35k**: CI coverage script gates new handlers; sample unwrapped PR fails.

After **35l**: per-channel vitest specs comprehensive; docs updated.

End-to-end: `npm run check:full` passes; `grep -rE 'ipcMain\\.handle\\(' src/main/` returns 0 unwrapped handlers (or only allowlisted with reasons).

---

## 🧭 Execution order

1. **35a first** — the wrapper must exist before any other sub-phase.
2. **35b–35j in any order** — independent channel families.
3. **35k after at least half the sweep lands** — CI gate enforces what's wrapped; don't ship the gate before consumers exist.
4. **35l last** — tests + docs reflect the final state.

Recommended order: 35a → 35d (highest-risk: plugin install) → 35c (audio path traversal) → 35e (discord tokens) → 35i (game data, absorbs JSON.parse work) → 35b (AI, the biggest cluster) → 35f → 35g → 35h → 35j → 35k → 35l.

---

## 📜 Commit cadence

```
35a — feat(ipc): withSchema wrapper + storage handlers full sweep (14 channels)
35b — feat(ipc): AI handlers full sweep (~50 channels including streaming)
35c — feat(ipc): audio handlers full sweep (5 channels; upload-custom path constraints)
35d — feat(ipc): plugin handlers full sweep (10 channels; install payload validation)
35e — feat(ipc): discord handlers full sweep (4 channels; bot token shape validation)
35f — feat(ipc): cloud sync handlers full sweep (4 channels)
35g — feat(ipc): book handlers full sweep (7 channels)
35h — feat(ipc): image library + map library + shop template sweep (~10 channels)
35i — feat(ipc): game data + BMO sync sweep + JSON.parse containment (absorbs Phase 28a.5)
35j — feat(ipc): FS handlers + updater + any remaining channels
35k — feat(ipc): CI coverage script (check-ipc-coverage.mjs) + IPC-SURFACE.md update
35l — test+docs(ipc): per-channel vitest specs + AGENTS.md + ADR
```

Each must pass:
```
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

One release at end of Phase 35.

---

## 🔗 Plans superseded or modified by Phase 35

| Plan | Item | Disposition |
|------|------|-------------|
| Phase 20 S1 (API keys plaintext) | Bot token discovery | Phase 35e Step 19 verifies the token storage path and folds findings into Phase 20 S1 |
| Phase 28a.3 (sync receiver zod) | sync receiver validation | Phase 35 does NOT cover the inbound HTTP sync receiver (separate transport, not `ipcMain.handle`). Phase 28a.3 stays as-is |
| Phase 28a.5 (JSON.parse containment in game-data-handlers.ts:29) | Add try-catch | Phase 35i absorbs this — strike 28a.5 from Phase 28 scope |
| Phase 28d (`as unknown as` casts) | Type safety pass | Phase 35 reduces the cast surface — the unsafe `Record<string, unknown>` payload types become typed via schema inference. Re-scope 28d after 35 lands |
| SECURITY-LOG `[2026-04-24] 119 of 121 IPC handlers don't zod-validate` | Active high-debt entry | Phase 35 absorbs entirely. Log entry cleared after Phase 35 lands |

---

## ⏱️ Estimated scope

12-15 working sessions. The largest sub-phase by far is 35b (AI handlers, ~50 channels) — split into 2-3 commits if needed. The other sub-phases are smaller (5-10 channels each) and faster.

The CI gate (35k) is small but high-leverage: once it lands, the validation requirement is enforced by construction for all future IPC channels.

---

## ✅ Final state after Phase 35

- Every `ipcMain.handle(...)` call site uses `withSchema(channelName, schema, handler)`.
- Every channel has a typed schema in `src/shared/ipc-schemas.ts`.
- CI fails when a new unwrapped handler lands.
- The SECURITY-LOG "119 of 121 don't validate" entry is closed.
- New AI / plugin / audio / discord / cloud / book / FS channels added in future phases (29, 30, 31, 32, etc.) inherit the requirement via the wrapper + CI gate.
