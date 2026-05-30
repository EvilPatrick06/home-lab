# dnd-app — open backlog

Only open/actionable items: problems, errors, security concerns, suggestions, out-of-scope, future, undone. Each has file:line evidence + an action. Things already fixed are not here. Scope: dnd-app + the dnd-app↔BMO protocol overlap; BMO-internal and Dungeon-Scholar items live in their own logs, not here.

> **✅ Shipped this run (v2.2.6–v2.2.10, code-verified 2026-05-30):** Phase 28 tail (28d/f/h/i), Phase 30 (TransportAdapter/GameAuthority + host/DM decouple + DM transfer), Phase 31 (shard broadcaster/applier + 10 feature migrations + permission filtering), Phase 32 (Pi-relayed cloud multiplayer), Phase 34 (i18n full sweep — 5,907 keys + check-keys CI gate), Phase 36 (opt-in Pi-hosted 5e library). Their plan files were deleted. The follow-ups those phases left open are folded into the sections below.

---

## 🚨 Problems / debt (open)

- **15h legacy interfaces — v3.0.0 removal still pending.** `SpellEntry` (~62 refs), `WeaponEntry` (~40), `ArmorEntry` (~34) in `character-common.ts` remain the LIVE character-sheet shape; the EntryRef/v4-schema migration that would retire them — plus the unbuilt `MigrationReportModal` + orphan-detection — is gated on the dormant v3.0.0 schema flip (`CURRENT_SCHEMA_VERSION` still 3). (The misleading "removed in Phase 15c" comments were corrected; `FeatEntry` is already at 0 refs.) *Action: do the removal sweep when v4 flips — not before, or the sheet breaks.*
- **Phase 31 — fog + drawings double-send.** Fog reveals + drawing-adds sync via BOTH the shard broadcaster (on store change) AND the still-live direct messages (`dm:fog-reveal` in `services/game-actions/visibility-actions.ts:22,37`; `dm:drawing-add` in `components/game/map/map-event-handlers.ts`). Converges (idempotent, no leak — the direct messages carry only the changed cells/one drawing), but redundant. *Action: drop the direct sends and let the shard carry it, or keep + document the redundancy.*
- **Phase 32 — cloud DM-transfer untested.** No test exercises DM-authority handoff over the relay when the host client disconnects — the core cloud failure mode. `index.cloud.test.ts` covers host/join/relay routing only. *Action: add a relay DM-transfer test (host drop → authority moves).*
- **Phase 34 — `rules` category bypasses the data-provider.** `library-service.ts` still raw-`fetch('/data/5e/rules/<f>.json')`s the rules files instead of going through `loadJson`, so they can't use the Phase 36 Pi remote-library / cache path. *Action: route rules through `loadJson` (or document why it's exempt).*
- **Phase 34 — `TranslationKeys = string` (no literal union).** By decision (a ~5,900-member union bloats compile; the runtime `check-keys` gate catches missing keys instead — see `i18n/README.md`). *Action: none unless compile-time key safety is later wanted.*
- **~84 lint warnings (Biome).** Includes ~12 `useExhaustiveDependencies` from the Phase 34 sweep adding `t` to dep arrays (`CharacterBuilder5e.tsx`, `use-map-background.ts`, `map-canvas-hooks.ts`) + pre-existing `useLiteralKeys`/`noUnusedImports`/`suppressions/unused`. All warnings (CI passes); several auto-fixable. *Action: `biome check --write` sweep + manual review of the dep-array ones.*

---

## 🧩 Suggestions / improvements

- **Inline style objects → CSS classes** (`ChatPanel`, `PdfViewer`, `GameLayout`, `LibraryItemList`, `EquipmentShop5e`).
- **14 eager static-JSON imports** → lazy `data-provider` loads for rarely-opened modals.
- **Limited `React.memo`** → memoize hot list rows (initiative, equipment/spell lists, token overlays).
- **~138 unused exports + ~10 unused files (knip)** → curate vs prune.
- **Scattered magic numbers** → `app-constants.ts` / domain modules.
- **Centralized color tokens** (Phase 28 tail remnant) — colors are scattered inline-Tailwind/CSS; no app-wide token layer (CSS custom properties / Tailwind theme) for theming consistency.
- **Repeated CRUD-modal pattern** (`SharedJournalModal`, `HandoutModal`, `RuleManager`, `LoreManager`, `NPCManager`) → generic `CRUDModal<T>` / `useCrudModal`.
- **Repeated async-data hook** → `useAsyncData<T>(loader, deps)` with cancellation + error state.
- **Inconsistent error handling (throw / null / `StorageResult` / silent-catch)** → pick one convention, migrate.
- **Color-only state indicators** (`MainMenuPage`, `HigherLevelEquipment5e`, `RuleManager`, `TurnEventsTab`, `MacroBar`) → pair color with text/icon/aria.
- **Mouse-only interactions** (`PdfDrawingOverlay`, `HandoutViewerModal`, `ResizeHandle`, `DiceTray`, `PlayerHUDOverlay`, `LanguagesTab5e`) → keyboard equivalents.
- **Form-validation announcements** (`StatBlockEditor`, `DiseaseCurseTracker`, `AiProviderSetup`) → `aria-invalid` / `aria-describedby`.
- **Test-coverage gaps** — `systems/dnd5e/` only `registry.test.ts`; no modal/form/keyboard-nav integration tests; thin `src/main/` coverage; no WebRTC-reconnection or a11y tests; **no cloud-relay integration test** (Phase 32's client uses an injected fake socket and the Pi uses its own unit tests — the live client↔Pi↔host loop is unexercised).
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

## 🚫 Out of scope (for dnd-app phase work)

- **Large public-dir assets** — `monsters.json` (~32k lines), 130+ MP3s under `public/sounds/`. CDN / lazy-download is a distribution decision, not a code fix.
- **Electron 40 EOL planning** — schedule an upgrade cadence before the 40.x line goes EOL.
