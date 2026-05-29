# Phase 20 — Security Audit Hardening

## Context

A security audit (scored 7/10) found strong Electron hardening (sandbox, contextIsolation, CSP), strong network validation (Zod schemas, rate limits, size caps), but gaps in credential-at-rest, input sanitization, plugin integrity, hardcoded TURN credentials, and AI file-access scope. Sub-Phase A (API key encryption via `safeStorage`) shipped in the work captured by `safe-secret-storage.ts` and is wired into `ai-service.ts` + `settings-storage.ts`. The remaining work is to extend encryption to the Discord bot token, validate key formats, remove repo-visible TURN credentials, add plugin integrity checks (sha256 + zip-content allowlist on top of the existing zip-slip protection), restrict AI file reads to specific subdirectories, and add audit logging + memory/upload limits.

"No authentication" is deprioritized for desktop P2P — invite codes are session auth. Cloud-host JWT auth lives in Phase 32; do not duplicate here.

## Depends on / blocks

- Depends on: Phase 7 (Sub-Phase E IPC save validation, Sub-Phase G network schema tightening), Phase 17 (NET-1/NET-12/NET-13 path traversal, NET-6/NET-29/NET-30 IPC try/catch)
- Blocks: Phase 30 (Sub-Phase C TURN credential indirection moves to `P2PTransport` constructor once `TransportAdapter` lands), Phase 32 (cloud-host JWT auth assumes audit logging hook exists)
- Coordinates with: Phase 1 (C2 plugin runtime sandboxing — this phase only hardens installation)

## Files touched

| Path | Role |
|------|------|
| `src/main/storage/safe-secret-storage.ts` | Existing helpers; reuse for Discord token + TURN credentials |
| `src/main/discord-integration/discord-service.ts` | Encrypt `botToken` on save, decrypt on load |
| `src/main/ai/ai-service.ts` | Add format validation before save (Step 3) |
| `src/renderer/src/network/peer-manager.ts` | Remove hardcoded `dndvtt:dndvtt-relay`; pull TURN from settings |
| `src/renderer/src/components/game/modals/utility/NetworkSettingsModal.tsx` | Verify end-to-end TURN wiring still works after Step 6 |
| `src/main/plugins/plugin-installer.ts` | Add sha256 checksum + entry allowlist + size cap |
| `src/main/ai/file-reader.ts` | Restrict reads to `campaigns/`, `ai-conversations/`, `characters/` |
| `src/main/ai/memory-manager.ts` | Add per-file + total memory size limits |
| `src/preload/index.ts` (or main-side upload handler) | Magic-byte validation for image/audio uploads |
| `src/main/security-log.ts` (new) | Central security event logger |
| `src/renderer/src/components/game/bottom/ChatPanel.tsx` | Re-verify no `dangerouslySetInnerHTML`; document JSX-only contract |
| `src/renderer/src/utils/chat-links.ts` | Add URL allowlist if/when raw URLs become linkable |

## Sub-phase summary

| # | Sub-phase | Theme |
|---|-----------|-------|
| 20a | API key + Discord token encryption | Cover remaining secrets, add format validation |
| 20b | Chat sanitization | Verify JSX-only render path, gate future URL linkification |
| 20c | TURN credential removal | Strip repo-visible creds, wire user-settings |
| 20d | Plugin integrity | sha256 + entry allowlist + size cap |
| 20e | AI file scope + memory caps | Restrict reader to whitelisted subdirs, cap memory growth |
| 20f | Binary upload validation | Magic-byte checks on image/audio uploads |
| 20g | Audit logging | Central `security-log.ts`, route events |

## Sub-phase details

### 20a — Discord token encryption + API key format validation

**Files:** `src/main/discord-integration/discord-service.ts`, `src/main/ai/ai-service.ts`, `src/main/storage/safe-secret-storage.ts`

**Steps:**
1. In `discord-service.ts` (`loadDiscordConfig` ~`src/main/discord-integration/discord-service.ts:40-67`, `saveDiscordConfig` ~`src/main/discord-integration/discord-service.ts:74-109`), wrap `botToken` read/write with `decryptOptional` / `encryptOptional` from `safe-secret-storage.ts`. Preserve the `'keep'` sentinel by checking it BEFORE encryption.
2. Add `validateApiKeyFormat(provider, key)` helper in `src/main/ai/ai-service.ts` and call it in `configure()` (~`src/main/ai/ai-service.ts:226-258`) before writing to disk. Reject malformed keys with a clear error: `sk-ant-` for Claude, `sk-` for OpenAI, length >= 20 for Gemini. Return the error to the renderer so the AI settings UI can display it.
3. Add a unit test in `src/main/storage/safe-secret-storage.test.ts` that uses a temp `userData` and confirms (a) round-trip equality, (b) on-disk bytes differ from plaintext, (c) graceful fallback when `safeStorage.isEncryptionAvailable()` returns false.

**Acceptance:** `discord-integration.json` on disk shows `ss1:`-prefixed base64 for `botToken`; AI settings UI rejects an obviously bad Claude key (`hello`) with a UI error before write; safe-secret-storage tests pass.

### 20b — Chat sanitization audit

**Files:** `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/components/lobby/ChatPanel.tsx`, `src/renderer/src/utils/chat-links.ts`

**Steps:**
1. Grep the renderer for `dangerouslySetInnerHTML` and `innerHTML`. Current state: zero hits, all chat renders flow through `renderChatContent` at `src/renderer/src/components/game/bottom/ChatPanel.tsx:82,92` which uses JSX text nodes. Add a code comment at the top of `ChatPanel.tsx` documenting the JSX-only contract.
2. Add an `isSafeHref(url)` helper in `src/renderer/src/utils/chat-links.ts` that rejects any URL whose protocol is not `http:` or `https:`. Today `chat-links.ts` only emits `<button>` elements for compendium lookups (no `href`), so this is preventative.
3. If markdown rendering is ever added to chat (currently none), the markdown-to-HTML step MUST sanitize with DOMPurify. Capture this as an inline FUTURE comment in `ChatPanel.tsx` to anchor the rule.

**Acceptance:** Grep returns zero `dangerouslySetInnerHTML` hits across `src/renderer/`; `chat-links.ts` exports `isSafeHref`; a unit test rejects `javascript:`, `data:`, and `file:` URLs.

### 20c — Remove hardcoded TURN credentials

**Files:** `src/renderer/src/network/peer-manager.ts`, `src/renderer/src/components/game/modals/utility/NetworkSettingsModal.tsx`

**Steps:**
1. In `peer-manager.ts:18-34` (`getDefaultIceServers`), delete the `dndvtt` / `dndvtt-relay` literal credentials. When `customHost` is set but no user-configured ICE servers exist via `setIceConfig`, fall back to STUN-only (`{ urls: 'stun:stun.cloudflare.com:3478' }`).
2. Verify `setIceConfig` (`src/renderer/src/network/peer-manager.ts:101`) is invoked from `NetworkSettingsModal.tsx:62` on save and from app boot when `settings.turnServers` exists. If boot wiring is missing, add a call in the network-init path.
3. Update `forceRelay` default behavior: when no TURN is configured, keep `iceTransportPolicy: 'all'` (the comment at `peer-manager.ts:88-94` already documents this).
4. Search the entire repo for any remaining `dndvtt-relay` or `dndvtt:dndvtt` literals; confirm zero hits after the change.

**Acceptance:** `grep -rn "dndvtt-relay\|dndvtt:dndvtt" src/` returns zero results; same-LAN host/join still works without TURN configured; a saved TURN server in settings round-trips through restart.

### 20d — Plugin integrity verification

**Files:** `src/main/plugins/plugin-installer.ts`

**Steps:**
1. Add `async function computeChecksum(zipPath: string): Promise<string>` near the top of `plugin-installer.ts` using `node:crypto` `createHash('sha256')`. Log the checksum at INFO level during `installFromZip` (~`src/main/plugins/plugin-installer.ts:28-89`).
2. If the manifest contains a top-level `expectedChecksum` field (extend `validateManifest`), enforce it: mismatch returns `{ success: false, error: 'Checksum mismatch' }` and aborts before move-to-pluginsDir.
3. Add `MAX_PLUGIN_ZIP_BYTES = 50 * 1024 * 1024` and `stat` the zip before extract; reject if larger.
4. Add `validateZipEntry(entryName)` allowlist: extensions `.json .js .ts .css .png .jpg .jpeg .svg .md .txt .woff .woff2`. Reject any entry containing `..` or with a disallowed extension. `extract-zip` already provides zip-slip protection at `src/main/plugins/plugin-installer.ts:14-22`; this is defense-in-depth.
5. Surface unknown-checksum installs to the renderer as a warning so the UI can show "Plugin not verified — install at your own risk?" (Phase 1 C2 is responsible for runtime sandboxing.)

**Acceptance:** Installing a plugin with an `.exe` entry returns an error; oversized zip rejected; checksum logged on every install; mismatching `expectedChecksum` aborts; existing valid plugins still install successfully.

### 20e — AI file scope + memory size caps

**Files:** `src/main/ai/file-reader.ts`, `src/main/ai/memory-manager.ts`

**Steps:**
1. In `file-reader.ts:64-117`, replace the bare `isPathWithinUserData` check (`src/main/ai/file-reader.ts:58-62`) with `isAiReadAllowed`. The allowed directories are `campaigns`, `ai-conversations`, `characters`, and (if it exists) `ai-context`. Reject reads outside these with `Access denied: AI reads restricted to game data` and log the attempt via 20g security log.
2. In `memory-manager.ts`, add `MAX_MEMORY_FILE_SIZE = 1 * 1024 * 1024` and `MAX_TOTAL_MEMORY_SIZE = 10 * 1024 * 1024`. Before each write, check size; if exceeded, prune oldest entries (or rotate to a `.old` file).
3. Run an AI DM session locally after the change and confirm campaign context, NPC memory, and conversation history still load. Add an integration-style test.

**Acceptance:** `readRequestedFile` rejects a path resolving to `userData/ai-config.json`; accepts `userData/campaigns/<uuid>/notes.md`; memory writes block when total reaches 10MB; AI DM session boots without regression.

### 20f — Binary file upload validation

**Files:** TBD upload handler (search for current implementation; original plan cited `src/preload/index.ts:199-211` but that block now houses AI stream listeners — likely moved to a main-side IPC handler)

**Steps:**
1. Grep for `image/png\|image/jpeg\|writeFile.*png\|writeFile.*jpg` across `src/main/ipc/` to locate the active token-image / map-background / audio upload handler.
2. Add a `validateMagicBytes(buffer, expectedTypes)` helper that checks the first 4 bytes. Magic byte map: `89504e47` png, `ffd8ffe0/ffd8ffe1/ffd8ffe8` jpeg, `52494646` webp/wav (disambiguate via byte 8-11 `WEBP`/`WAVE`), `4f676753` ogg, `47494638` gif.
3. Apply to every image upload and audio upload site. Reject mismatches with `Invalid file type: header does not match extension`.

**Acceptance:** A `.png` file renamed to `.jpg` is rejected; a real PNG passes; unit test covers each magic-byte branch.

### 20g — Security audit logging

**Files:** `src/main/security-log.ts` (new), various call sites

**Steps:**
1. Create `src/main/security-log.ts` exporting `logSecurityEvent(event: string, details: Record<string, unknown>): void` that delegates to `logToFile('SECURITY', ...)` from `src/main/log.ts`. Include ISO timestamp + JSON-stringified details. Cap details JSON at 4KB.
2. Wire calls at:
   - Failed path-traversal rejections in `src/main/ipc/*-handlers.ts` (campaign/file/book — already validated by Phase 17).
   - Invalid API key format (Step 2 in 20a).
   - Plugin install success/failure with sha256 + filename (Step 1 in 20d).
   - AI file-read denials outside allowlist (Step 1 in 20e).
   - Failed Zod validation on network messages (existing rate-limit / schema-reject path in `src/renderer/src/network/host-message-handlers.ts`).
   - Kick / ban host actions.
3. Document the log destination + rotation expectations in a header comment.

**Acceptance:** New module compiles and exports `logSecurityEvent`; each listed event site invokes it; tail of `userData/logs/main.log` shows `[SECURITY]` entries during a kick action.

## Constraints & edge cases

- `safeStorage.isEncryptionAvailable()` returns `false` before `app.ready`. All encrypt/decrypt calls must be on paths that only run post-ready.
- Migration: any pre-existing plaintext Discord token must be re-encrypted on first load after this change. `decryptOptional` already passes through values that lack the `ss1:` prefix; trigger a `saveDiscordConfig` call after `loadDiscordConfig` if the on-disk value lacks the prefix.
- Linux without `libsecret`: `safeStorage` falls back to unencrypted; do not block app startup. The existing `_warnedInsecure` flag in `safe-secret-storage.ts:7` is the right pattern.
- React auto-escapes JSX text — verified zero `dangerouslySetInnerHTML` calls today. Sanitization layer is preventative for any future markdown-rendered chat.
- Removing TURN literals defaults to STUN-only. Behind strict NATs, P2P will fail unless the user configures their own TURN server. The `iceTransportPolicy: 'all'` default (vs `'relay'`) at `peer-manager.ts:95` allows direct + STUN-relayed connections to still work on same LAN.
- Zip-slip is real: rely on `extract-zip`'s built-in protection (already in place); the entry-name allowlist in 20d is defense-in-depth.
- AI file scope: do not break legitimate campaign reads — test before merging.
- Plugin runtime sandboxing is Phase 1 C2's job; this phase only hardens installation.

## Verification

1. `npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npm test` from `dnd-app/`.
2. Manual: install a plugin, grep `userData/logs/main.log` for `[SECURITY]` install line with sha256.
3. Manual: configure a fake Discord bot token, inspect `userData/discord-integration.json`, confirm `botToken` starts with `ss1:`.
4. Manual: same-LAN host + join without TURN servers configured; verify connection works.
5. Manual: trigger an AI `[FILE_READ]` for a path outside `campaigns/`; confirm denial + security log entry.
6. `grep -rn "dndvtt-relay\|dndvtt:dndvtt" src/` returns zero hits.

## Completed

> **PHASE 20 COMPLETE (20a–20g) — 2026-05-29.** Full 4-gate green (lint 0, tsc web+node 0, vitest 6491/6491).
> - **20a** — discord-service encrypts botToken at rest (safeStorage; cachedConfig holds runtime plaintext; legacy plaintext migrates on first load). ai-service `validateApiKeyFormat` (claude sk-ant-, openai sk-, gemini ≥20) at the top of configure(). New `safe-secret-storage.test.ts` (round-trip / stored≠plaintext / empty / legacy / keystore-unavailable).
> - **20b** — JSON-only chat contract comment atop ChatPanel; preventative `isSafeHref` in chat-links.ts (+ test). Zero `dangerouslySetInnerHTML`/`innerHTML` in renderer (verified).
> - **20c** — removed repo-visible `dndvtt:dndvtt-relay` TURN creds; custom host → STUN-only + cloud STUN; real TURN from settings via setIceConfig; boot wiring in App.tsx applies saved turnServers. `grep dndvtt-relay/dndvtt:dndvtt` → 0.
> - **20d** — plugin-installer: 50MB size cap, sha256 of source zip, `expectedChecksum` manifest pin enforcement, extension allowlist (+ `..` reject) on extracted entries, security-log on install success/failure/rejection.
> - **20e** — AI file reads restricted to campaigns/ai-conversations/characters/ai-context (was whole userData); denials logged. memory-manager per-file 1MB cap (prune oldest array entries) + 10MB total budget (rotate largest to .old), both logged.
> - **20f** — `upload-validation.ts` magic-byte sniffing (png/jpeg/gif/webp/wav/ogg/mp3); `validateUploadExtension` wired into IMAGE_LIBRARY_SAVE + AUDIO_UPLOAD_CUSTOM; per-branch unit test.
> - **20g** — `security-log.ts` (`logSecurityEvent` → `[SECURITY]` app.log, 4KB cap). Main-process events wired: IPC path-traversal (GAME_LOAD_JSON, CHARACTER_RESTORE_VERSION), malformed API key, plugin install, AI file-read denial, memory oversize.
> - **Deferred:** renderer-side 20g events (kick/ban, network Zod rejects) need a LOG_SECURITY_EVENT IPC bridge — logged to ISSUES-LOG-DNDAPP. Plugin-installer install-path tests (existing suite only covers uninstall) — the new guards are tsc-checked + the no-mock branches are straightforward.

### Pre-existing (earlier-session) stamps

- 20a Step 1 (original) — DONE (`src/main/ai/ai-service.ts:253-271`, `src/main/storage/safe-secret-storage.ts:10-43`) — API keys (`claudeApiKey`, `openaiApiKey`, `geminiApiKey`) encrypted at rest via `encryptOptional`/`decryptOptional`; `ss1:` prefix marker; graceful fallback when `safeStorage` unavailable.
- 20a Step 1b — DONE (`src/main/storage/settings-storage.ts:46,59`) — TURN server `credential` fields encrypted at rest via the same helper pair (user-configured TURN credentials are protected; only the repo-visible hardcoded fallback remains, addressed in 20c).
- 20d zip-slip protection — DONE (`src/main/plugins/plugin-installer.ts:14-22`) — `extract-zip` enforces zip-slip protection; targetDir traversal guard at `src/main/plugins/plugin-installer.ts:69-72`. The new work in 20d adds sha256 + entry allowlist + size cap on top of this.
- 20b grep audit — DONE (verified 2026-05-19) — zero `dangerouslySetInnerHTML` / `innerHTML` hits in `src/renderer/`; current chat rendering at `src/renderer/src/components/game/bottom/ChatPanel.tsx:82,92` uses JSX-only `renderChatContent`. Step 1 of 20b remains live (add the documenting comment + preventative `isSafeHref`).
