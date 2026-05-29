# dnd-app / bmo — open backlog

**Last updated:** 2026-05-29 (post v2.2.2)
**Master tip:** see `git log -1`.

Action-oriented backlog from the phase-plan audit. Only things that still need a fix, a decision, or finishing are listed — shipped/working items are not. Format:
> **Tag — title.** What's wrong/missing. *file:line.* **Action.**

---

## ✅ Fixed in v2.2.2 (no longer open)

The 2026-05-29 fix pass closed every Critical/High/Medium item from the prior audit, plus four new user-reported items. For the record:

- **P17-LOG-2** crit-damage `doubleDiceInFormula` `g`-flag (multi-die crits now double every group) + tests flipped.
- **P26f** `executeLoadEncounter` honours pre-positioned `startX/startY` (`EncounterPreset.monsters[].startX/startY` added).
- **P27e** `/sound ambient` chat command now sends `volume`.
- **P28a.2/.3/.4** BMO sync receiver: loopback `SYNC_BIND`, body cap, token-bucket rate limit, Zod payload validation, Bearer auth.
- **P28b** Anthropic SDK `0.78 → 0.100.1` (there is **no 1.x** on npm; 0.100 is latest). Cache-control + model-aware max_tokens already present.
- **P29e** `role === 'host'` / `isCoDM` permission-gate sweep + **P29h** migration (permissions injected on load; `resolvePeerRoleId` fallback covers ephemeral peers).
- **P23f** attunement counter verified correct (both panels read `getEffectiveMagicItems(...).filter(mi => mi.attuned)`).
- **P23c** dual-write contract documented + made structurally divergence-proof (single `character` const).
- **P14g** 13 renderer-only libs moved to `devDependencies` (verified: none imported in `src/main`; `electron-vite build` bundles them).
- **P14i** Linux update-channel decision documented in `dnd-app/docs/RELEASE.md` (in-app `AppImageUpdater`).
- **P17d/P35** IPC handlers wrapped via `_safe.handle` / `withSchema`; `validate:content` (P33h) wired into `dnd-app-ci.yml`, schemas pass (0 errors).
- **P25a/P25d** `.dndhomebrew` `schemaVersion`, import-collision prompt (Replace/Copy/Skip), modal save-time validation.
- **P22d** `removeConversation` cascade test.
- **P19d** `signAndEditExecutable`/`sign` removed (electron-builder 26 fix; preserves installer icon/metadata).
- **CI** `ci.yml` (biome) + `dnd-app-ci.yml` (grep-on-binary) both green again.
- **New:** Reset All Data now wipes file-based saves (`WIPE_ALL_DATA` IPC + in-memory store clear + broadened localStorage); Ollama **Start** button added; `vunknown` badge hidden when version unresolved.
- **Phase 37** (BMO Pi 5 fan tuning) 37a–37e landed; **37f is a Pi-side deploy the owner runs** (see below).

---

## 🟡 Open — deferred architectural phases (correctly staged, blocked in a chain)

These are large rewrites, each blocked on the previous. Not bugs — staged work.

| Phase | What | Blocker |
|---|---|---|
| **30** Player-as-Host | `GameAuthority` extraction (30a), `P2PTransport`/`MemoryTransport` wrap (30b.2+), host/DM decouple + transfer (30c–f), persistence (30g), tests (30h), migration (30i). Only the `TransportAdapter` interface stub exists. | none — ready to start |
| **31** Live-state sync | Broadcaster (31c) + applier (31d) + per-shard descriptors (31e–i) + sequence/replay (31k) + cleanup (31l). `Shard`/`diff` foundations exist. | Phase 30 `GameAuthority` |
| **32** Cloud host (Pi) | Pi `game_server.py`/`game_authority.py` + `websocket-transport.ts` + CampaignWizard toggle + admin tab. Nothing built. | Phases 30 + 31 |
| **36** Pi-hosted library | seed bundle + Pi library API + remote-loader + cache. Nothing built; `bmoPiBaseUrl` setting orphaned. | Phase 32 |

When 30 starts: also wire a `MemoryTransport` consumer so the `TransportAdapter` interface stops being inert (the "foundation-only" risk). 31's `diff.ts` hardcodes `sequence: 0` — the broadcaster must assign monotonic per-shard sequence numbers.

---

## 🟡 Open — Phase 34 i18n sweep (large, deferred)

34a foundation shipped (i18next wired, `defaultNS: 'translation'` locked). Remaining: 34b–34j string sweeps across every screen, 34k lint rule + key-type generator, 34l docs. High-churn; do per-area. No `useT()` consumers exist yet.

---

## 🟡 Open — Phase 28 tail (tech debt / polish / docs / coverage)

Phase 28's security + AI + network groups are done. Remaining sub-phases are non-blocking debt:
- **28d** type-the-character-pipeline (`stat-mutations.ts` still `Record<string,unknown>`); `as unknown as` sweep (~185 sites); save-queue dead-cleanup; UUID-truncation audit; migrateData return-value contract.
- **28f** UI polish: `<div onClick>` → `<button>` (~74 sites); centralized color tokens; window min-size; long-list virtualization.
- **28g** docs: plugin trust model, IPC-SURFACE regeneration discipline.
- **28h** test coverage: baseline gate, lobby/onboarding flow tests, BrowserWindow security regression spec.
- **28i** 9 narrow coverage-gap audits.

**Recommendation:** split this tail into themed phases (28-debt / 28-ux / 28-docs / 28-coverage) so "PARTIAL" stops being ambiguous.

---

## 🟢 Open — small / hygiene

- **CI workflow duplication.** `ci.yml` (Phase 21) and `dnd-app-ci.yml` (Phase 28e.2) both run on every `dnd-app/**` push and overlap. Merge or document why both exist.
- **17e GUI-4** Three.js disposal audit in `dice-textures.ts` / `dice-physics.ts` still partial (`CanvasTexture.dispose()` / cannon-es geometry).
- **15h** legacy interfaces (`SpellEntry`/`WeaponEntry`/… in `character-common.ts`) still referenced by ~30 files; `MigrationReportModal` + orphan-detection are release-time (v3.0.0) work for the dormant v4 schema flip.
- **22k** `throttle` utility is opt-in; no call-site conversions.
- **core_books wipe.** Reset All Data deliberately does NOT delete `userData/core_books` (the user's multi-GB reference PDFs). If a future "nuke everything including PDFs" is wanted, add a second opt-in checkbox.

---

## 📌 Pi-side deploy still owed by the owner — Phase 37f

The fan-tuning code (37a–37e) is on master. To activate it on the Pi:

```bash
cd ~/home-lab && git pull
bash bmo/setup-bmo.sh                       # rewrites /boot/firmware/config.txt (fan_temp3_speed=255)
sudo systemctl daemon-reload && sudo systemctl restart bmo-fan
journalctl -u bmo-fan -n 30 --no-pager      # expect "interpolated curve" banner
sudo reboot                                 # config.txt only applies at boot
```

After reboot, sanity-check both cooling loops (`vcgencmd measure_temp`, `vcgencmd get_throttled`, `i2cget -y 1 0x21 0xf9/0xfa`, `cat /sys/devices/platform/cooling_fan/hwmon/hwmon*/pwm1`). **Note:** `vcgencmd get_throttled` on this Pi currently reports `0xe0000` (sticky under-voltage/throttle history since boot) — `health_check.sh` now surfaces that, which is the intended behaviour, not a regression.

---

## Method note

Three audit passes folded every `phase-*-plan.md` into this file (originals deleted; only `INSTRUCTIONS.md` + this report remain in `dnd-app/docs/phases/`). The v2.2.2 fix pass discovered a large body of prior uncommitted work in the tree (BMO hardening, 29e sweep, IPC sweep, content schemas) that implemented much of the High/Medium backlog — it was incorporated, made green, and shipped.

---

## 🗂 From `home-lab/docs` audit (folded in 2026-05-29, verified against code)

Consolidated here from the dnd-app entries scattered across `docs/ISSUES-LOG-DNDAPP.md`, `docs/SUGGESTIONS-LOG-DNDAPP.md`, `docs/SECURITY-LOG.md`, and a stray `docs/fail.txt`. Each was re-verified against current code; stale ones are listed as resolved so they don't get re-fixed. (BMO and Dungeon-Scholar entries were out of scope and left untouched.)

### Problems / debt (verified still open)

- **20g — renderer-side security events never reach the main audit log.** `security-log.ts` (`logSecurityEvent` → `[SECURITY]` in `userData/logs/app.log`) is main-process only. Main-side events are wired, but renderer-side ones (kick/ban host actions in `network/host-manager.ts`, network-message Zod rejections in `network/host-message-handlers.ts`) need a `LOG_SECURITY_EVENT` preload→main channel. **Verified: no such channel exists.** *Action: add the IPC channel + forward the two renderer event sites.*
- **LOG-11 — Tiny-creature cover exclusion unimplementable.** `cover-calculator.ts` excludes downed/allied creatures and clamps creature cover to half, but PHB also says Tiny creatures grant no cover. `MapToken` (`types/map.ts:103-104`) carries only `sizeX`/`sizeY` (grid footprint, min 1), no size *category*. **Verified: still no `sizeCategory`.** *Action: add `sizeCategory` (or resolve from `monsterStatBlockId`) + skip Tiny in the cover loop.*
- **God-object files (still oversized, growing).** `PdfViewer.tsx` (1832), `GameLayout.tsx` (1360, ↑ from 1030), `client-handlers.ts` (1120, ↑ from 879), `data-provider.ts` (1178), `DowntimeModal.tsx`, `library-service.ts`, `MapCanvas.tsx`, `import-dnd-beyond.ts`, `build-character-5e.ts`. *Action: split per follow-up phases.*

### Errors

- **`docs/fail.txt` — React #185 ("max update depth exceeded") crash, v2.1.10.** Stack: `forceStoreRerender → updateStoreInstance → commitHookEffectListMount → ReadyButton → LobbyPage`. Signature of an unstable zustand `useSyncExternalStore` selector in `ReadyButton` (a selector returning a fresh object/array every render drives an infinite re-render loop). From an old build (2.1.10; current 2.2.2) and not reproducible from a minified trace, but the pattern is real. *Action: audit `ReadyButton`/`LobbyPage` selectors for unstable references; not yet confirmed fixed.*

### Security concerns (dnd-app)

- Only the 20g item above. `docs/SECURITY-LOG.md`'s dnd-app side is empty by design (absorbed into phase plans; the app-side audit shipped in Phase 20 and the BMO bridge hardening shipped in v2.2.2). All remaining active SECURITY-LOG entries are Dungeon-Scholar (out of scope here).

### Suggestions / Improvements / Future work (verified still applicable)

- **Inline style objects → CSS classes** (`ChatPanel`, `PdfViewer`, `GameLayout`, `LibraryItemList`, `EquipmentShop5e`).
- **14 eager static-JSON imports** → lazy `data-provider` loads for rarely-opened modals.
- **Limited `React.memo`** → memoize hot list rows (initiative, equipment/spell lists, token overlays).
- **~138 unused exports + ~10 unused files (knip)** → curate vs prune.
- **Scattered magic numbers** → `app-constants.ts`/domain modules.
- **Repeated CRUD-modal pattern** (`SharedJournalModal`, `HandoutModal`, `RuleManager`, `LoreManager`, `NPCManager`) → generic `CRUDModal<T>`/`useCrudModal`.
- **Repeated async-data hook** → `useAsyncData<T>(loader, deps)` with cancellation + error state.
- **Inconsistent error handling (4 patterns: throw / null / `StorageResult` / silent-catch)** → pick one convention and migrate.
- **Color-only state indicators** (`MainMenuPage`, `HigherLevelEquipment5e`, `RuleManager`, `TurnEventsTab`, `MacroBar`) → pair with text/icon/aria.
- **Mouse-only interactions** (`PdfDrawingOverlay`, `HandoutViewerModal`, `ResizeHandle`, `DiceTray`, `PlayerHUDOverlay`, `LanguagesTab5e`) → keyboard equivalents.
- **Form-validation announcements** (`StatBlockEditor`, `DiseaseCurseTracker`, `AiProviderSetup`) → `aria-invalid`/`aria-describedby`.
- **Doc gaps** — no TypeDoc/Storybook; no `GameSystemPlugin` developer guide.
- **Test-coverage gaps** — `systems/dnd5e/` only `registry.test.ts`; no modal/form/keyboard-nav integration tests; limited `src/main/` coverage; no WebRTC-reconnection or a11y tests.
- **Package `overrides` (7 entries)** — document why each is pinned; re-check on dep bumps.

### Out of scope (for the dnd-app phase work)

- **Large public-dir assets** — `monsters.json` (~32k lines), 130+ MP3s under `public/sounds/`. CDN / lazy-download is a distribution decision, not a code fix.
- **Electron 40 EOL planning** — tracking-only; schedule an upgrade cadence before the 40.x line goes EOL.
- **i18n full sweep** — owned by Phase 34 (already tracked above).
- **BMO / Dungeon-Scholar `/docs` entries** — separate domains, not touched.

### Resolved since logged (do NOT re-fix — verified fixed in code)

- **Phase 23f attunement "3 competing sources."** Now consistent: `MagicItemCard5e.tsx` writes the canonical `state.magicItemAttuned[instanceId]`; both `AttunementTracker5e` and `MagicItemsPanel5e` derive their count from `getEffectiveMagicItems(...).filter(mi => mi.attuned)`. The legacy `attunement[]` array is no longer the source.
- **Multi-floor "never affects visibility/rendering."** `currentFloor` is now wired into `MapCanvas.tsx`, `occlusion-layer.ts`, `region-layer.ts`, and `map-token-slice.ts`.
- **Positional audio emitters "never updated."** `updateEmitters` is called at `map-overlay-effects.ts:401`.
- **IPC channel↔schema gap ("~100 channels vs 3 schemas").** Phase 35's `withSchema`/`withArgsSchema` sweep + the storage Zod schemas closed most of it.
- **`Math.random` / secure-randomness dual pattern.** Phase 28a.1 sweep + forbidden-patterns lint.

---

## 🔗 Cross-domain & shared-docs overlap affecting dnd-app (folded in 2026-05-29)

Second `/docs` pass: scanned every shared doc (`ARCHITECTURE`, `DATA-FLOW`, `BACKUP`, `SECURITY`, `SETUP`, `CONTRIBUTING`, `GLOSSARY`, `COMMANDS`, `CHANGELOG`, `LOG-INSTRUCTIONS`) and the other-domain logs (BMO + Dungeon-Scholar) for dnd-app content, misfiling, and overlap. Findings below were verified where checkable.

### Verified — overlap / debt that touches dnd-app

- **🟠 5e JSON shared-data sync has no CI gate (operational debt).** Five 5e JSON files are duplicated between `dnd-app/src/renderer/public/data/5e/` (source of truth) and `bmo/pi/data/5e/` (copy), kept in sync only by manually running `bmo/pi/scripts/sync-shared-5e-json.sh`. **Verified: the script exists; no `.github/workflows/*` references it.** A contributor who edits the dnd-app 5e JSON and forgets to run it leaves BMO's DM agent on stale data, silently. *Action: add a CI check (or a release step) that fails if the two trees diverge.* (`docs/DATA-FLOW.md:33–42`)
- **🟡 `CONTRIBUTING.md` self-contradicts on file naming.** Line 113 says "kebab-case (… not `ChatPanel.tsx`)"; line 114 says "Wait — actually our codebase uses PascalCase for component files (`CharacterSheet5ePage.tsx`). Match what's there." **Verified verbatim.** Confusing for new dnd-app contributors. *Action: delete the kebab-case line; state PascalCase-components / kebab-non-components as the rule biome enforces.*
- **🟡 Campaign/character data is not backed up by default.** dnd-app writes saves to `userData/{campaigns,characters,…}`; the only backup path is the opt-in cloud backup via the Pi (`bmoPiBaseUrl` + rclone). A laptop loss = data loss unless the user set that up. *Action: surface a one-time "set up backup?" nudge, or document the manual `userData` backup path in-app.* (`docs/BACKUP.md`)
- **🟡 `userData` directory is keyed on `package.json` `name`.** `app.getPath('userData')` → `<appData>/dnd-vtt`. If `name` ever changes, existing installs orphan their saves. *Action: never rename `name`; if it must change, add a migration that moves the old dir.* (`docs/DATA-FLOW.md:56`)

### Documented concerns (not code-verified this pass — flag for owner)

- **🟠 Game-discovery registry CORS is `*` (security).** `/api/games*` on the Pi is LAN-public by design for dnd-app's LAN discovery, with wide-open CORS and only an optional `BMO_REGISTRY_API_KEY`. If the Pi is ever internet-exposed (port-forward / tunnel misconfig), active game sessions leak. The docs say "no public internet exposure by default" but don't warn about user tunnel error. (`docs/SECURITY.md:33–35`, `docs/ARCHITECTURE.md:76–79`)
- **🟡 mDNS discovery falls back silently.** BMO URL precedence is `settings.bmoPiBaseUrl > mDNS-discovered > $BMO_PI_URL > http://bmo.local:5000`, with a 3 s mDNS timeout. On firewall-restricted/cross-subnet networks dnd-app can silently land on the hardcoded default and fail with no surfaced reason. (`docs/ARCHITECTURE.md:81–87`)
- **🟡 BMO↔dnd-app HTTP endpoints are unversioned.** No `/api/v1/…` prefix; a breaking change to `/api/games` (or the `:5001` callback shape) would break older in-session VTT clients silently. Endpoint versioning is deferred. (`docs/ARCHITECTURE.md:208`)
- **🟡 Discord↔VTT relay is not atomic.** DM→BMO→Discord→BMO→VTT initiative/roll relay has no transaction log or dedup; a BMO crash mid-relay can post a Discord roll that never reaches the VTT (or vice-versa). (`docs/DATA-FLOW.md:95–184`)
- **🟢 `SETUP.md:44` `build:cross` needs `wine`** on a Linux host — accurate only for the *local* cross-compile; the actual release uses the CI matrix (separate Win/Linux runners, no wine). Minor: clarify that wine is local-only.

### Verified clean / now-confirmed

- **BMO logs:** no open `Domain: both` bugs; the BMO↔dnd-app integration items (`/api/dnd/load` path-jail + rate-limit, `vtt_sync.py` `:5001` callback, `BMO_API_KEY` Bearer) are all **resolved**. No dnd-app behaviour misfiled as BMO.
- **Dungeon-Scholar logs:** no dnd-app content misfiled in them.
- **Previously-"suspicious" resolved claims now CONFIRMED by the real releases:** the RESOLVED-ISSUES-DNDAPP entries that hedged on "Linux AppImage untested" and "release pipeline" are proven good — v2.2.0/2.2.1/2.2.2 built + published the AppImage + NSIS + all 6 assets successfully.
- **`builder-debug.yml` no longer ships** — v2.2.2 published exactly the 6 expected assets (the `release.yml` glob fix worked).
