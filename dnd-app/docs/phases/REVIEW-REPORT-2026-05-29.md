# dnd-app — open issues, suggestions, and unfinished work

**Last updated:** 2026-05-29
**Master tip:** updated each push (see `git log -1`)
**Latest release:** v2.2.0 (2026-05-29) — see GitHub Releases.

This is an action-oriented backlog assembled from a deep audit of every phase plan against the codebase. Items that have shipped and are working are NOT listed. Items here either need to be fixed, decided on, or finished.

Format per item:
> **Tag — short title.** What's wrong / what's missing. *File:line evidence.* **Action:** what to do, rough effort.

---

## 🚨 Critical — live behaviour bugs

### P17-LOG-2 — multi-die crit damage under-rolls (live bug)

`attack-helpers.ts:53–58` exports `doubleDiceInFormula(formula)` using `formula.replace(/(\d*)d(\d+)/, …)` **without** the `g` flag. `attack-resolver.ts:25` imports it; `attack-resolver.ts:38` re-exports it. `attack-helpers.test.ts:91–94` pins the broken behaviour with the comment *"only doubles the first dice group (per regex behavior)."* A corrected `g`-flag copy exists at `combat-resolver.ts:909–916` stamped *"Phase 17c (LOG-2)"*, but it's a private `function`, never exported.
**Impact:** Sneak Attack, Divine Smite, magic weapons that add their own die — only the first dice group doubles on a crit. Real player-visible damage under-roll.
**Action:** delete `attack-helpers.ts` copy, re-export from `combat-resolver.ts`, flip the test to assert `'1d8+1d6' → '2d8+2d6'`. ~15 min.

### P26f — `executeLoadEncounter` ignores pre-positioned monsters

`services/game-actions/creature-actions.ts:660–700` builds the token list with no `entry.startX/startY` consultation and runs **every** monster through `smartPlaceTokens`. Plan §26f explicitly required honouring pre-set coords.
**Impact:** any encounter preset with explicit `startX/startY` gets re-spread on load.
**Action:** add a branch — extract monsters with explicit coords, place at exact position, pass the remainder through `smartPlaceTokens`. ~30 min.

### P27e — `/sound ambient` chat command drops volume

`services/chat-commands/commands-dm-sound.ts:85` sends `sendMessage('dm:play-ambient', { ambient: fullName })`. The DM panel sends `{ ambient, volume: ambientVol / 100 }`.
**Impact:** clients hear default loudness when DM uses chat instead of the panel.
**Action:** include `volume: useAudioStore.getState().ambientVolume / 100` in the chat command's payload. ~5 min.

---

## 🟠 High — security gaps and contract drift

### P28a.3 — BMO sync receiver: raw `JSON.parse`, no Zod

`bmo-bridge.ts:165, 175` parse incoming sync payloads with raw `JSON.parse`. CORS was tightened by commit `6ecaf3e` (`'*'` → `'http://127.0.0.1'`), but the receiver still trusts whatever JSON shape lands.
**Action:** define `SyncEventSchema` + `InitiativeSyncSchema` in `ipc-schemas.ts` and `safeParse` at receiver entry. Return `400 { error, issues }` on failure. ~1 hr.

### P28a.4 — BMO sync receiver: no Bearer auth

No `getBmoApiKey` exists in `bmo-config.ts`. Receiver accepts unauthenticated POSTs to `/api/sync` and `/api/sync/initiative`.
**Action:** read `BMO_API_KEY` (env > settings), require `Authorization: Bearer <key>`, 401 on mismatch. Coordinate token shape with Phase 32 JWT. ~1 hr.

### P28a.2 — BMO sync receiver: missing rate limit, body cap, 415 reject

`SYNC_BIND` env-var for loopback default not implemented; no body-size cap; no per-IP token-bucket rate limit; no `Content-Type` 415 reject.
**Action:** wire them. ~1.5 hr.

### P28b.2 — `@anthropic-ai/sdk` still on `^0.78.0`

Plan wants `^1.0.0`. Breaking-change risk needs deliberate sequencing alongside cache + streaming validation.
**Action:** bump + run AI provider integration tests + verify `cache_control: ephemeral` still works. ~1 hr.

### P29e — literal `role === 'host'` / `isCoDM` sweep is incomplete

After commit `991a791`, 21 files still contain `role === 'host'` and 17 still contain `isCoDM` (e.g., `network-store/index.ts`, `lobby/PlayerCard.tsx`, `lobby/PlayerList.tsx`, `sheet/5e/HitPointsBar5e.tsx`, `sheet/5e/DeathSaves5e.tsx`).
**Impact:** the new permission system runs in parallel with the literals. A new feature could gate via `hasPermission` while old code gates via `role === 'host'` — they could disagree under custom roles.
**Action:** sweep each remaining site to `hasPermission(peer, key, campaign)`. ~3 hr.

### P29h — explicit migration from `isCoDM` to `role-codm` not written

`resolvePeerRoleId:17` derives `role-codm` from `isCoDM:true` as a fallback. Plan asked for an explicit migration step that writes `peer.roleId = 'role-codm'` once, so the `isCoDM` field can eventually be removed.
**Action:** write the migration in `use-campaign-store.ts` load path. ~30 min.

### P23f — attunement counter may use the wrong predicate

`MagicItemsPanel5e.tsx:57` checks `mi.attunement` (array flag) while `:59` filters `mi.attuned` (boolean) — the "Attuned: X/3" label can display stale counts. (Earlier audit flagged this; needs confirmation on a running app.)
**Action:** change the count to `getEffectiveMagicItems(character).filter(mi => mi.attuned).length`. ~5 min.

### P23c — `dm:character-update` dual-writes silently

`client-handlers.ts:925–945` writes to BOTH the canonical character store AND legacy `lobbyStore.setRemoteCharacter`. Reasonable as a transition, but no comment, no divergence detection.
**Action:** add a comment near the call site stating that the two stores must stay in sync until 23c-full lands. Add a vitest that asserts the post-call state matches across stores. ~30 min.

---

## 🟡 Medium — known incomplete work

### P14g — `dependencies` → `devDependencies` move (the headline size lever)

All 13 listed renderer-only libs still in `dependencies`: `pixi.js`, `three`, `pdfjs-dist`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/pm`, `peerjs`, `jspdf`, `cannon-es`, `fuse.js`, `@msgpack/msgpack`, `@tanstack/react-virtual`, `dotenv`.
**Impact:** v2.2.0 shipped at 228 MB (Windows installer); the §A2 win was projected to drop this further.
**Action:** move + run packaged feature-by-feature smoke: AI providers, PDF view/export, 3D dice + physics, tiptap editor, virtualized lists, msgpack P2P transport. ~half-day if any lib `require`s itself at runtime.

### P14i — differential delta benchmark + Linux update channel

Not run. `compression: normal` was picked from §C1 reasoning, not measurement. The plan asked for an N→N+1 delta benchmark at `normal` vs `store` and an explicit decision on whether Linux update goes through in-app `AppImageUpdater` or via re-running `install-linux.sh`.
**Action:** cut a `2.2.1-rc.1` build, install, build `2.2.1-rc.2` with a single-byte change, measure the delta in-app updater pulls. Compare against the same at `compression: store`. Choose; document in `docs/RELEASE.md`. ~1 hr.

### P17d NET-6/29/30 — IPC `safeHandler` sweep is partial

~32 raw `ipcMain.handle` sites still in `game-data-handlers.ts`, `audio-handlers.ts`, `index.ts`, and other handler files. Phase 17 stamp claims this is complete; it isn't.
**Action:** pair with Phase 35's per-channel sweep — every `ipcMain.handle` site adopts `handle(channel, withSchema(channel, ZodSchema, fn))`. ~half-day.

### P33h — content-schema validator failing with 20 errors, not in CI

`scripts/audit/validate-content-vs-schemas.ts` reports 20 errors across `backgrounds.json`, `classes.json`, `monsters.json`, `npcs.json` — wrapper-object root vs the validator's single-record schemas.
**Action:** add wrapper schemas (`BackgroundsFileSchema = z.object({ section, description, total_count, backgrounds: z.array(BackgroundSchema) })` and similar for classes/bestiary/npcs/feats/mechanics/species/world). Wire `validate:content` into `package.json` + `dnd-app-ci.yml`. ~1 hr.

### P34a — i18n `defaultNS` mismatch (will bite once sweeps start)

Plan says `defaultNS: 'common'`. Code is `defaultNS: 'translation'` at `i18n/index.ts:11`. Test passes by namespace-default coincidence. Once 34b's sweep starts populating `common.*` keys, lookups will diverge.
**Action:** decide one of `'common'` or `'translation'`; align plan + code. ~5 min decision; ~15 min if locale paths need rewriting.

### P25a Step 3 — homebrew import collision is silent

`homebrew-storage.ts:47–50` silently auto-generates a new UUID. Plan asked for a "Replace existing? / Import as copy" prompt.
**Action:** show a modal on collision; default to copy. ~1 hr.

### P25a Step 4 — `schemaVersion: 1` missing on `.dndhomebrew` payload

`entity-io.ts:100–106` only has top-level `version: 1`. Without an inner `schemaVersion`, future field-addition migrations have no fallback.
**Action:** add `schemaVersion: 1` to the wrapped data payload. ~5 min.

### P25d — modal save bypasses validation

`HomebrewCreateModal.tsx:127–148` save path does not call `validateHomebrew`. Import path does.
**Action:** run validation on save; show errors inline. ~30 min.

### P22d — `removeConversation` cascade is untested

`ai-service.ts:406–409` evicts the map; `campaign-storage.ts:150` triggers the cascade via dynamic import. Plan asked for a unit spec.
**Action:** add one. ~15 min.

### "FOUNDATION LANDED" — 4 interfaces with no consumers

- Phase 30b: `TransportAdapter` interface at `network/transport/transport-adapter.ts:1–29` — no `P2PTransport` wrap, no `MemoryTransport`. Architecturally inert.
- Phase 31a/b: `Shard<T>`, `Delta<T>`, `structuralDiff`, `applyDelta` — broadcaster/applier never landed.
- Phase 34a: i18n config — sweeps deferred.
- Phase 35a: `withSchema` wrapper — zero call-sites in production.
**Risk:** bit-rot. The interfaces were validated only at landing time; nothing tests them ongoing.
**Action:** either (a) write a single consumer per interface to keep them exercised, or (b) accept the foundation-only status and re-validate at next consumer phase.

---

## 🟢 Suggestions / hygiene

- **CI workflow duplication.** `ci.yml` (`name: CI`, Phase 21) and `dnd-app-ci.yml` (`name: dnd-app CI`, Phase 28e.2) both run on every push to `dnd-app/**`. They overlap. Decide: merge into one, or document why both exist.
- **Phase 28 is overscoped.** 45 sub-phases across 9 groups under one phase number. The PARTIAL stamp is meaningless. Recommend splitting future bundles by theme (28-sec, 28-ai, 28-debt, 28-ci, 28-ux, 28-docs).
- **Plan stamps lag reality.** Phase 17c "PHASE 17 COMPLETE" misses LOG-2 still being a live bug; Phase 27 "PHASE 27 COMPLETE" misses 27e ambient volume; Phase 26 "PHASE 26 PARTIAL" misses 26f. Recommend a "verify-before-stamp" pass — run a 60-second grep for the headline behaviour before flipping the stamp.
- **Add a regression spec for `autoInstallOnAppQuit`** (Phase 14f). The "silent on quit" bug was that `autoUpdater.autoInstallOnAppQuit = true` was set in the auto-flow. The post-fix state has it false in 4 places; a unit spec asserting it stays false after every `autoUpdater.on(...)` callback would prevent reintroduction.
- **Phase 16c CreatureModal float-deferral** — intentional, but if the modal grows further, the lookup/summon dual-purpose will bake in. Worth a one-line note in the modal file.
- **Phase 22k throttle utility is opt-in.** Existing throttles are still bespoke. Either convert at least one site to validate ergonomics, or delete the utility until a real consumer wants it.
- **`bmoPiBaseUrl` orphan** (Phase 32 carryover). Setting visible at `SettingsPage.tsx:665–687`; nothing consumes the value yet. A user setting it today does nothing. Either gate the UI behind a feature flag until Phase 32 lands, or wire the value into `bmoPiFetch`.

---

## ⏸ Deferred — entire phases waiting for an architectural dependency

These are correctly deferred per the dependency chain. Listing them so they aren't forgotten.

| Phase | Status | Blocker |
|---|---|---|
| **30** Player-as-Host | 30b interface stub only; 30a + 30c–i pending | Phase 29e literal sweep completion |
| **31** Live-state sync overhaul | 31a/b foundations landed; 31c–n pending | Phase 30 GameAuthority extraction |
| **32** Cloud host (Pi-as-host) | Entirely absent from codebase | Phase 30 + 31 |
| **36** Pi-hosted library + offline cache | Entirely absent; `bmoPiBaseUrl` orphaned setting exists | Phase 32 |

Within partially-landed phases, the per-sub-phase deferrals are:

| Phase | Deferred sub-phases | Why |
|---|---|---|
| 14 | 14g devDeps move; 14i benchmark + Linux update channel | Need packaged-build verification + a tagged release |
| 15 | 15h legacy interface deletion; `MigrationReportModal` + orphan detection | Release-time work for v3.0.0 schema flip |
| 17 | 17g medium/low catalogue (LOG-16..25, NET-21..50, GUI-12..44, RUN-10..21, TYP-5..7) | Opportunistic cleanup |
| 17 | 17d NET-6/29/30 partial; 17e GUI-4 partial (dice-textures / dice-physics) | See P17d above |
| 23 | 23a virtualization; 23c-full `remoteCharacters` removal; 23d conflict banner; 23e section memo; 23g optimistic save; 23i editor hook standardization; 23n condition sync + QuickActions | Need running app + 2-tab tests |
| 25 | 25a Step 3 collision UI; Step 4 schemaVersion; Acceptance round-trip; 25d modal save validation | See P25a/P25d items above |
| 26 | 26a IPC + 30s timeout + monster auto-roll; 26d/26e some UI deferrals; 26f pre-position | See P26f above |
| 27 | 27e volume + 27h spec | See P27e above |
| 28 | 36 of 45 sub-phases (28d/28e mostly, 28f/28g/28h/28i entirely) | Overscoped phase |
| 29 | 29e completion; 29h explicit migration | See P29e/P29h |
| 33 | 33c ModalScaffold extraction; 33d bundle-size guard; 33h validator wrapper | See P33h above |
| 34 | 34b–34j sweeps; 34k lint + CI gate; 34l docs + key narrowing | Sweep-heavy churn |
| 35 | 35b–35i per-channel migrations; 35j CI gate; 35k ADR | See P17d / Phase 35 above |

---

## 📌 Notes for future audit passes

These aren't action items, but flag them at the start of the next audit so we don't repeat them:

- The prior audit retracted four findings that turned out to be wrong: 22l log files DO exist on disk; 18j `screenReaderModeSet` persists via an inferred-load pattern at `use-accessibility-store.ts:99`; 17e `RulingApprovalModal` exists at `components/game/modals/utility/`; 24j `atMax` uses `>= 20` not `=== 20`. Don't re-flag these.
- The v2.2.0 release needed a hotfix at the electron-builder step because Phase 19d shipped `build.win.sign: "./scripts/sign.mjs"` and `build.win.signAndEditExecutable: false` — both removed/incompatible in electron-builder 26.x. The hotfix at `cf0cb1b` removed both; the fix simultaneously closed the Phase 14 §A6 ↔ Phase 19d contradiction. Future releases should NOT reintroduce either field.
