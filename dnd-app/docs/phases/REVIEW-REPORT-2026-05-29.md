# dnd-app — open backlog

Only open/actionable items: problems, errors, security concerns, suggestions, out-of-scope, future, deferred, undone. Each has file:line evidence + an action. Things already fixed are not here.

---

## 🚨 Problems / debt (open)

- **20g — renderer-side security events never reach the audit log.** `logSecurityEvent` (`security-log.ts`) is main-process only; renderer events (kick/ban in `network/host-manager.ts`, network-message Zod rejections in `network/host-message-handlers.ts`) have no path to it. No `LOG_SECURITY_EVENT` preload→main channel exists. *Action: add the channel + forward the two renderer sites.*
- **LOG-11 — Tiny-creature cover unimplementable.** `cover-calculator.ts` clamps creature cover to half but can't exclude Tiny creatures: `MapToken` (`types/map.ts:103-104`) has only `sizeX`/`sizeY` (footprint, min 1), no size category. *Action: add `sizeCategory` (or resolve from `monsterStatBlockId`) + skip Tiny.*
- **God-object files (oversized).** `PdfViewer.tsx` (1832), `GameLayout.tsx` (1360), `data-provider.ts` (1178), `library-service.ts` (1176), `DowntimeModal.tsx` (1131), `client-handlers.ts` (1120), `MapCanvas.tsx` (1118), `import-dnd-beyond.ts` (729), `build-character-5e.ts` (682). *Action: split per follow-up phases.*
- **15h legacy interfaces still live.** `SpellEntry` (~62 refs), `WeaponEntry` (~40), `ArmorEntry` (~34) in `character-common.ts` are still heavily live despite "removed in Phase 15c" boundary-allow comments; `MigrationReportModal` + orphan-detection unbuilt. Release-time (v3.0.0) work for the dormant v4 schema flip. (`FeatEntry` is already at 0 refs.) *Action: finish the removal sweep or drop the "removed" comments.*
- **17d/35 IPC sweep partial.** 4 raw `ipcMain.handle` sites still unwrapped by the `_safe` `handle()` / `withSchema` helper — all in `updater.ts` (`APP_VERSION`, `UPDATE_CHECK`, `UPDATE_DOWNLOAD`, `UPDATE_INSTALL`). *Action: route them through the wrapper.*

---

## 🔒 Security concerns (code-verified)

- **🟠 Game-discovery registry auth is opt-in and OFF by default.** `bmo/pi/app.py`: `GET /api/games` (`:4937`) + `GET /api/games/stream` (`:5000`) have no auth (open for discovery, CORS `*` `:76`). Mutations POST/PATCH/DELETE/heartbeat (`:4944–4998`) call `_registry_authorized()` (`:4906`) which **returns `True` when `BMO_REGISTRY_API_KEY` is unset** (default) — so by default anyone reaching the Pi can register/patch/deregister games (only 30/min + 4 KB cap). *Action: set `BMO_REGISTRY_API_KEY` before any external exposure.*
- **🟠 App-wide Flask auth gate is also opt-in.** `_bmo_optional_api_key()` (`app.py:245–266`) allows all requests when `BMO_API_KEY` is unset (`:254`). The Cloudflare tunnel (`bmo.mybmoai.work` → `:5000`) thus exposes `/api/chat`, `/api/discord/*` to anyone **unless** `BMO_API_KEY` is set or Cloudflare Access JWT is on. *Action: set `BMO_API_KEY` and/or enable Access JWT before exposing the tunnel.*
- **🟡 20g (above)** is also a security gap (kick/ban + rejected-message events aren't audit-logged).

---

## 🧩 Suggestions / improvements

- **Inline style objects → CSS classes** (`ChatPanel`, `PdfViewer`, `GameLayout`, `LibraryItemList`, `EquipmentShop5e`).
- **14 eager static-JSON imports** → lazy `data-provider` loads for rarely-opened modals.
- **Limited `React.memo`** → memoize hot list rows (initiative, equipment/spell lists, token overlays).
- **~138 unused exports + ~10 unused files (knip)** → curate vs prune.
- **Scattered magic numbers** → `app-constants.ts` / domain modules.
- **Repeated CRUD-modal pattern** (`SharedJournalModal`, `HandoutModal`, `RuleManager`, `LoreManager`, `NPCManager`) → generic `CRUDModal<T>` / `useCrudModal`.
- **Repeated async-data hook** → `useAsyncData<T>(loader, deps)` with cancellation + error state.
- **Inconsistent error handling (throw / null / `StorageResult` / silent-catch)** → pick one convention, migrate.
- **Color-only state indicators** (`MainMenuPage`, `HigherLevelEquipment5e`, `RuleManager`, `TurnEventsTab`, `MacroBar`) → pair color with text/icon/aria.
- **Mouse-only interactions** (`PdfDrawingOverlay`, `HandoutViewerModal`, `ResizeHandle`, `DiceTray`, `PlayerHUDOverlay`, `LanguagesTab5e`) → keyboard equivalents.
- **Form-validation announcements** (`StatBlockEditor`, `DiseaseCurseTracker`, `AiProviderSetup`) → `aria-invalid` / `aria-describedby`.
- **Test-coverage gaps** — `systems/dnd5e/` only `registry.test.ts`; no modal/form/keyboard-nav integration tests; thin `src/main/` coverage; no WebRTC-reconnection or a11y tests.
- **Doc gaps** — no TypeDoc/Storybook; no `GameSystemPlugin` developer guide.
- **Package `overrides` (7 entries)** — document why each is pinned; recheck on dep bumps.
- **5e shared-JSON sync has no CI gate.** Five files duplicated dnd-app↔`bmo/pi/data/5e/`, kept in sync only by manually running `bmo/pi/scripts/sync-shared-5e-json.sh` (canonical rule in `bmo/docs/DESIGN-CONSTRAINTS.md`). *Action: CI check that fails if the two trees diverge.*
- **CI workflow duplication.** `ci.yml` (Phase 21) and `dnd-app-ci.yml` (Phase 28e.2) both run on every `dnd-app/**` push and overlap. *Action: merge or document why both exist.*
- **22k `throttle` utility is opt-in** — no call-site conversions yet.
- **No automatic backup / no in-app nudge.** Saves live in `userData/{campaigns,characters,…}`. Backup paths exist but are all manual/opt-in: "Export All Data" (`AboutPage.tsx`), cloud-via-Pi "Backup Now" (`SettingsPage.tsx`, gated on Pi reachability), and git (`docs/BACKUP.md`). Nothing proactively prompts the user (no on-quit/scheduled reminder). *Action (if wanted): an in-app backup nudge.*
- **`userData` dir keyed on `package.json` `name`.** If `name` changes, existing installs orphan their saves. *Action: never rename `name`; if forced, add a dir-move migration.*

---

## 🔭 Future work / not-yet-decided

- **Discord→VTT relay has no delivery guarantee.** `bmo/pi/agents/vtt_sync.py:134–147` `_post_to_vtt` is fire-and-forget on a daemon thread, returns `True` immediately, logs-and-drops on failure — no retry/queue/dedup (payloads have a `timestamp` but no event id, `:150–181`). A Discord roll is silently dropped if the VTT `:5001` is down. *Action (if it matters): bounded retry + an event id the VTT can dedup on.*
- **BMO↔dnd-app HTTP endpoints are unversioned** (`grep -c api/v1 app.py` = 0). A breaking change to `/api/games` or the `:5001` callback shape would break older in-session clients silently. *Action: add `/api/v1/…` before the next breaking change.*
- **`bmo-peerjs` :9000 (optional self-hosted signaling).** `bmo/setup-bmo.sh:197–202` runs a PeerJS container; dnd-app can point WebRTC signaling at it (not a hard dependency — public PeerJS cloud also works). If self-hosted and the container is down, that path fails with no health surface. *Action: surface its health if you rely on it.*

---

## ⏸️ Deferred — whole phases (blocked in a chain)

| Phase | What's left | Blocker |
|---|---|---|
| **30** Player-as-Host | `GameAuthority` extraction (30a), `P2PTransport`/`MemoryTransport` wrap, host/DM decouple + transfer (30c–f), persistence (30g), tests (30h), migration (30i). Only the `TransportAdapter` interface stub exists. | none — ready to start |
| **31** Live-state sync | broadcaster (31c) + applier (31d) + per-shard descriptors (31e–i) + sequence/replay (31k) + cleanup (31l). `Shard`/`diff` foundations exist; `diff.ts` hardcodes `sequence: 0` (broadcaster must assign). | Phase 30 |
| **32** Cloud host (Pi) | `game_server.py`/`game_authority.py` + `websocket-transport.ts` + CampaignWizard toggle + admin tab. Nothing built. | 30 + 31 |
| **36** Pi-hosted library | seed bundle + Pi library API + remote-loader + cache. Nothing built. (`bmoPiBaseUrl` is **not** orphaned — it's already wired through `registry-client`/`bmo-config`/Settings, but only for the Phase 29 game registry, not a library.) | 32 |
| **34** i18n sweep | 34a foundation shipped; 34b–34j string sweeps, 34k lint+key-gen, 34l docs remain. No `useT()` consumers yet. | none — large per-area churn |

**Phase 28 tail** (security/AI/network/docs groups done; these remain):
- **28d** type the character pipeline (`stat-mutations.ts` still `Record<string,unknown>`); `as unknown as` sweep (~194 non-test sites); save-queue dead no-op (`save-queue.ts:41-50`); UUID-truncation audit (~20 sites). *(migrateData return-value contract already done.)*
- **28f** UI polish: `<div onClick>` → `<button>` (74 sites); centralized color tokens. *(window min-size + long-list virtualization already done.)*
- **28h** test coverage: baseline gate, lobby/onboarding flow tests, BrowserWindow security regression spec. *(Current `LobbyPage.test.tsx` is import-smoke only; `vitest.config.ts` coverage scoped to `services/**`+`data/**`, no thresholds.)*
- **28i** 9 narrow coverage-gap audits.

*Recommendation: split the 28 tail into themed phases (28-debt / 28-ux / 28-coverage). (28g docs landed.)*

---

## 📋 Undone — owner action

- **Phase 37f — activate the Pi fan-tuning** (code is on master):
  ```bash
  cd ~/home-lab && git pull
  bash bmo/setup-bmo.sh          # rewrites /boot/firmware/config.txt (fan_temp3_speed=255)
  sudo systemctl daemon-reload && sudo systemctl restart bmo-fan
  sudo reboot                    # config.txt only applies at boot
  ```
  Note: `vcgencmd get_throttled` on this Pi reports `0xe0000` (sticky under-voltage/throttle history) — `health_check.sh` now surfaces that; it's intended, not a regression.
- **Pi venv not yet updated to the pinned `zeroconf` 0.149.7** (the pin is in `bmo/pi/requirements.txt:454`; the installed venv version is runtime state not visible in the repo — run the install to apply it):
  ```bash
  cd ~/home-lab && git pull && bmo/pi/venv/bin/pip install -r bmo/pi/requirements.txt
  ```

---

## 🚫 Out of scope (for dnd-app phase work)

- **Large public-dir assets** — `monsters.json` (~32k lines), 130+ MP3s under `public/sounds/`. CDN / lazy-download is a distribution decision, not a code fix.
- **Electron 40 EOL planning** — schedule an upgrade cadence before the 40.x line goes EOL.
- **BMO / Dungeon-Scholar `/docs` entries** — separate domains; not tracked here.
