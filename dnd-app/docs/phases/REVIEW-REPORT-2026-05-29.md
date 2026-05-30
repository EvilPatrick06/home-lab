# dnd-app — open backlog

Only open/actionable items: problems, errors, security concerns, suggestions, out-of-scope, future, undone. Each has file:line evidence + an action. Things already fixed are not here. Scope: dnd-app + the dnd-app↔BMO protocol overlap; BMO-internal and Dungeon-Scholar items live in their own logs, not here. Figures re-verified against code 2026-05-30 (post dependency modernization).

> **✅ Shipped recently (v2.2.6–v2.3.0, code-verified 2026-05-30):** Phase 28 tail (28d/f/h/i), Phase 30 (TransportAdapter/GameAuthority + host/DM decouple + transfer), Phase 31 (shard broadcaster/applier + 10 feature migrations + permission filtering), Phase 32 (Pi-relayed cloud multiplayer), Phase 34 (i18n full sweep — 5,907 keys + check-keys CI gate), Phase 36 (opt-in Pi-hosted 5e library), and a full **dependency modernization** (electron 40→42, TypeScript 6, i18next 26 + react-i18next 17, pdfjs 6, three 0.184, bonjour 1.4, biome 2.4.16, knip 6, dpdm 4, react-router 7.16, + ~27 in-range bumps; all GitHub Actions on Node-24 majors). Plan files deleted; remaining follow-ups folded in below.

---

## 🚨 Problems / debt (open)

- **15h legacy interfaces — v3.0.0 removal still pending.** `SpellEntry` (~97 refs across 21 files), `WeaponEntry` (~53), `ArmorEntry` (~42) in `src/shared/types/character-common.ts` remain the LIVE character-sheet shape; the EntryRef/v4-schema migration that would retire them — plus the unbuilt `MigrationReportModal` (no source file exists; only doc mentions) + orphan-detection — is gated on the dormant v3.0.0 schema flip (`CURRENT_SCHEMA_VERSION` still 3 in `migrations.ts:7`). `FeatEntry` is already at 0 refs. *Action: do the removal sweep when v4 flips — not before, or the sheet breaks.*
- **vite 8 + @vitejs/plugin-react 6 — HELD (external blocker).** The single dependency we could NOT safely bump: `electron-vite@5.0.0`'s vite peerDep tops out at `^7`, and there is no stable `electron-vite` that allows Vite 8 (only `6.0.0-beta`). Adopting Vite 8 would mean running a pre-release build tool on the release pipeline. *Action: re-evaluate when `npm view electron-vite dist-tags` shows a 6.x on `latest`; then it's a bump-with-testing (Rolldown/Oxc output differs — full app + 6-asset-release verification). (dungeon-scholar already runs Vite 8 — it has no electron-vite.)*
- **Electron 42 GUI runtime smoke-test pending.** v2.3.0 shipped electron 40→42 (Chromium ~144→148) and `release.yml` validated *packaging* on Win+Linux, but no static gate covers the *runtime* of a 2-major Chromium jump under the heavy WebGL surface (PixiJS 8.18 map, Three 0.184 dice). *Action: install the v2.3.0 build and smoke-test map/dice render, AI streaming, P2P + cloud multiplayer, NSIS auto-update before relying on it.*
- **Phase 31 — fog + drawings double-send.** Fog reveals + drawing-adds sync via BOTH the shard broadcaster (on store change) AND the still-live direct messages (`dm:fog-reveal` at `services/game-actions/visibility-actions.ts:22,37`; `dm:drawing-add` at `components/game/map/map-event-handlers.ts:544`). Idempotent, no leak (`FogRevealPayloadSchema` carries only `{cells, reveal}`, no mapId), but redundant. *Action: drop the direct sends and let the shard carry it, or document the redundancy.*
- **Phase 32 — cloud DM-transfer / host-drop untested + no live integration test.** No test exercises DM-authority handoff over the relay when the host client drops (`cloud-session.ts` has no host-left handler), and the live client↔Pi↔host loop is only exercised with injected fakes on each side, never end-to-end. *Action: add a relay DM-transfer test + a real integration test.*
- **Phase 34 — `rules` category bypasses the data-provider.** `src/renderer/src/services/library-service.ts:515` raw-`fetch('/data/5e/rules/<f>.json')`s the 8 rules files instead of going through `loadJson`, so they can't use the Phase 36 Pi remote-library / cache path. *Action: route rules through `loadJson` (or document why exempt).*
- **Phase 34 — `TranslationKeys = string` (no literal union).** By decision (a ~5,900-member union bloats compile; the runtime `check-keys` CI gate catches missing keys instead — see `i18n/README.md:57`). *Action: none unless compile-time key safety is later wanted.*
- **122 Biome lint warnings (was ~84 — grew after the biome 2.4.16 bump).** Breakdown: `useExhaustiveDependencies`=78 (concentrated in `map-canvas-hooks.ts` ×17, `use-map-background.ts` ×10; `CharacterBuilder5e.tsx` only ×2), `useOptionalChain`=39 (**fully auto-fixable**), `useLiteralKeys`=3, `noUnusedFunctionParameters`=2, plus a handful of others. All warnings (CI passes). *Action: `biome check --write` clears the 39 useOptionalChain instantly; the dep-array 78 need manual review (some are intentional).*
- **knip findings (dead-code, continue-on-error in CI).** (1) `factoryResetAllSettings` in `SettingsPage.tsx` is a dead re-export alias of `resetAllData` (0 callers) — safe to delete. (2) `multicast-dns` is used via `require()` but is NOT a declared dependency — it's only present as a transitive of `bonjour-service`; a future bonjour bump could drop it and silently break `bmo.local` mDNS resolution. *Action: declare `multicast-dns` explicitly.* (3) `i18next-resources-to-backend` is a declared dependency with no import (i18n loads bundled resources). *Action: prune, or wire it up if/when lazy locales land.* (4) ~123 unused exports + ~200 unused exported types (0 unused files) — curate vs prune.
- **18 circular import cycles (dpdm, tolerated).** The `circular` script is configured to exit 0 on these (mostly barrel-file `index.ts` + store cross-imports). Non-blocking but a latent init-order / tree-shaking hazard. *Action: chip away at the worst cycles over time.*

---

## 🔒 Security (also in `docs/SECURITY-LOG.md`, gitignored)

- **DM-only regions/drawings broadcast unfiltered on the wire** (low). `SceneRegion.visibleToPlayers` / `DrawingData.visibleToPlayers` are enforced ONLY at the PixiJS render surface; `network/sync/shards/regions-shard.ts` + `drawings-shard.ts` declare NO `permissionFilter`, so the full DM-only set reaches every client over the network. Predates Phase 31i (behavior-preserving). *Action: mirror `tokens-shard.ts`'s `permissionFilter` for regions + drawings.*

---

## 🧩 Suggestions / improvements

- **Inline style objects → CSS classes** (`ChatPanel`, `PdfViewer`, `GameLayout`, `LibraryItemList`, `EquipmentShop5e`; ~61 files use inline `style={{…}}`).
- **~25 eager static-JSON imports** (was ~14) → lazy `data-provider` loads for rarely-opened modals.
- **Limited `React.memo`** (only 4 files) → memoize hot list rows (initiative, equipment/spell lists, token overlays).
- **~123 unused exports + ~200 unused exported types (knip; 0 unused files)** → curate vs prune (bulk are type re-exports).
- **Scattered magic numbers** → `app-constants.ts` / domain modules.
- **Centralized color tokens** (Phase 28 tail remnant) — no app-wide semantic token layer for theming consistency.
- **Repeated CRUD-modal pattern** (`SharedJournalModal`, `HandoutModal`, `RuleManager`, `LoreManager`, `NPCManager`) → generic `CRUDModal<T>` / `useCrudModal`.
- **Repeated async-data hook** → `useAsyncData<T>(loader, deps)` with cancellation + error state.
- **Inconsistent error handling (throw / null / `StorageResult` / silent-catch)** → pick one convention, migrate.
- **Color-only state indicators** (`MainMenuPage`, `HigherLevelEquipment5e`, `RuleManager`, `TurnEventsTab`, `MacroBar`) → pair color with text/icon/aria.
- **Mouse-only interactions** (`PdfDrawingOverlay`, `HandoutViewerModal`, `ResizeHandle`, `DiceTray`, `PlayerHUDOverlay`, `LanguagesTab5e`) → keyboard equivalents.
- **Form-validation announcements** (`StatBlockEditor`, `DiseaseCurseTracker`, `AiProviderSetup`; only 1 `aria-invalid` repo-wide) → `aria-invalid` / `aria-describedby`.
- **Test-coverage gaps** — `systems/dnd5e/` only `registry.test.ts`; no modal/form/keyboard-nav integration tests; thin `src/main/` coverage; no WebRTC-reconnection or a11y tests; **no cloud-relay live integration test** (each side faked).
- **Orphaned dev tooling.** `oxlint` (1.67 — a whole second linter), `jscpd` (copy-paste detector), `type-coverage` are installed but have **no script/CI/hook call site** (masked from knip's unused-dependency check by its `ignoreDependencies` list). *Action: wire them into CI or drop them.*
- **Doc gaps** — no TypeDoc/Storybook; no `GameSystemPlugin` developer guide.
- **Package `overrides` (9 entries)** — ✅ now documented in `docs/DEPENDENCIES.md` (each override's consumer + reason: CVE-floor vs dedup/pin). *Remaining action: recheck/prune on dep bumps per that doc.*
- **5e shared-JSON sync has no CI gate.** Five files duplicated dnd-app↔`bmo/pi/data/5e/`, kept in sync only by manually running `bmo/pi/scripts/sync-shared-5e-json.sh`. *Action: CI check that fails if the two trees diverge.*
- **CI workflow proliferation.** FOUR workflows trigger on `dnd-app/**` (`ci.yml`, `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, + `security-audit.yml`); `ci.yml` and `dnd-app-ci.yml` both run lint + both tsc configs every push. *Action: merge/dedupe or document why each exists.*
- **22k `throttle` utility is opt-in** — zero production call-sites.
- **No automatic backup / no in-app nudge.** Saves live in `userData/{campaigns,characters,…}`; all backup paths are manual/opt-in (Export All Data, cloud "Backup Now", git). *Action (if wanted): an on-quit / scheduled backup nudge.*
- **`userData` dir keyed on `package.json` `name`.** If `name` changes, existing installs orphan their saves. *Action: never rename `name`; if forced, add a dir-move migration.*

---

## 🔭 Future work / not-yet-decided

- **i18n is English-only despite the 5,907-key sweep.** Phase 34 built the full key infrastructure + check-keys gate, but the app ships one locale, language is hardcoded, and there's no language picker — so there's no end-user i18n benefit yet. *Action (if wanted): add a second locale file + a picker; the loader already supports it.*
- **Discord→VTT relay has no delivery guarantee** (protocol overlap). `bmo/pi/agents/vtt_sync.py:134–147` `_post_to_vtt` is fire-and-forget, logs-and-drops on failure — no retry/queue/dedup. A Discord roll is silently dropped if VTT `:5001` is down. *Action: bounded retry + an event id the VTT can dedup on.*
- **BMO↔dnd-app HTTP endpoints are unversioned** (`grep -c api/v1 app.py` = 0). A breaking change to `/api/games` or the `:5001` callback would break older in-session clients silently. *Action: add `/api/v1/…` before the next breaking change.*
- **`bmo-peerjs` :9000 (optional self-hosted signaling).** No health surface in dnd-app if the container is down (public PeerJS cloud is the fallback). *Action: surface its health if you rely on the self-hosted path.*

---

## 🚫 Out of scope (for dnd-app phase work)

- **Large public-dir assets** — `monsters.json` (~35k lines), ~260 MP3s under `public/sounds/`. CDN / lazy-download is a distribution decision, not a code fix.
- **Electron upgrade cadence** — immediate EOL pressure resolved (40→42 in v2.3.0; E42 supported through ~2026-10-20). ✅ Cadence + bump procedure now documented in `docs/DEPENDENCIES.md`. *Remaining action: set a recurring reminder to bump before the running major's EOL.*
