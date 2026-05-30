# dnd-app — open backlog

Only open/actionable items: problems, errors, security concerns, suggestions, out-of-scope, future, deferred, undone. Each has file:line evidence + an action. Things already fixed are not here.

---

## 🚨 Problems / debt (open)

- **15h legacy interfaces — v3.0.0 removal still pending.** `SpellEntry` (~62 refs), `WeaponEntry` (~40), `ArmorEntry` (~34) in `character-common.ts` remain the LIVE character-sheet shape; the EntryRef/v4-schema migration that would retire them — plus the unbuilt `MigrationReportModal` + orphan-detection — is gated on the dormant v3.0.0 schema flip (`CURRENT_SCHEMA_VERSION` still 3). (The misleading "removed in Phase 15c" comments were corrected; `FeatEntry` is already at 0 refs.) *Action: do the removal sweep when v4 flips — not before, or the sheet breaks.*

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

**Phase 28 tail — DONE** (shipped this run): 28d (Character5e pipeline typing to `src/shared/types/`, save-queue + short-rest fixes, UUID audit, `as unknown as` sweep 195→123 with the rest documented as boundary casts), 28f (all 74 `<div onClick>` made keyboard-accessible — backdrops got `role=presentation` + Escape via `useEscapeKey`, button-like got `<button>`/role+keydown), 28h (BrowserWindow security regression spec + real LobbyPage flow test + coverage-floor gate in CI), 28i (9 coverage-gap suites = 115 tests for untested `src/main` modules). Only open 28-tail remnant: **centralized color tokens** (open design item — also under Suggestions).

---

## 🚫 Out of scope (for dnd-app phase work)

- **Large public-dir assets** — `monsters.json` (~32k lines), 130+ MP3s under `public/sounds/`. CDN / lazy-download is a distribution decision, not a code fix.
- **Electron 40 EOL planning** — schedule an upgrade cadence before the 40.x line goes EOL.
