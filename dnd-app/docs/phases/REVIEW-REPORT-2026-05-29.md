# dnd-app — open backlog

Open/actionable items ONLY: problems, deferred, out-of-scope, future, suggestions, and standing design decisions — each with file evidence + an action. **Completed work is NOT logged here** (commit messages + the GitHub releases are the record). Scope: dnd-app + the dnd-app↔BMO protocol overlap; BMO-internal and Dungeon-Scholar items live in their own logs. Verified against code 2026-05-31.

---

## 🚨 Problems / debt (open)

- **Release pre-create breaks the auto-updater during the build window (debt).** `cut.mjs` pre-creates the GitHub release (with notes) at tag-push time, so the new tag becomes the repo's "latest release" BEFORE the build matrix uploads its assets (~8–10 min later). During that window electron-updater queries the latest release, finds no `latest.yml`, reports "up to date", and does NOT fall back to the previous fully-published release — so users can't update at all mid-build, and a FAILED build leaves an asset-less "latest" that breaks updates until the next successful release. (This is why a user on 2.4.2 couldn't fetch 2.4.3 once 2.4.4 had been cut-but-not-built.) *Fix: create the release as a `--draft` in `cut.mjs`, and have the release.yml "Publish + verify assets" job run `gh release edit "$TAG" --draft=false` only AFTER the 6 assets verify. electron-updater ignores drafts, so the last good release stays "latest" until the new one is fully built.*
- **Electron 42 + vite-8 GUI runtime smoke-test pending.** v2.3.0+ ship electron 40→42 (Chromium ~144→148) and 2.4.0 added the vite-8/Rolldown build. `release.yml` validates *packaging* on Win+Linux, but nothing covers *runtime* of a 2-major Chromium jump under the heavy WebGL surface (PixiJS 8.18 map, Three 0.184 dice). *Action: install a recent build and smoke-test map/dice render, AI streaming, P2P + cloud multiplayer, and NSIS auto-update before relying on it.*
- **20 circular import cycles (dpdm, tolerated).** `circular` exits 0 (non-blocking; latent init-order / tree-shaking hazard only). Deliberately left: (a) the combat-resolver triad is a barrel re-export wired for knip; (b) lobby/campaign barrel cycles are pure import-churn to break; (c) the 5 `*-shard`→`network-store` cycles mirror the established `fog-shard` pattern (permissionFilters need campaign/peer state). *Action: chip away opportunistically when already editing these files — not worth a dedicated churn pass.*
- **`TranslationKeys = string` (no literal union).** By decision — a ~5,900-member union bloats compile; the runtime `check-keys` + `locale-parity` CI gates catch missing keys instead (`i18n/README.md`). *Action: none unless compile-time key safety is later wanted.*

---

## 🧩 Suggestions / improvements

- **`deepMergeObjects` lacks cycle detection (defensive hardening).** `services/library/merge.ts` recurses to merge entry overrides with no visited-set; reached from `effective-character-5e.hydrate()` → `getEffectiveFeats/Classes` on every sheet render. NOT a known live bug (JSON can't persist cycles, and a real cycle would stack-overflow + log — distinct from the fixed `useEquipmentData` async-loop freeze), but a runtime-introduced cycle would recurse unbounded. *Action: thread a `WeakSet` visited-guard (default param, backward-compatible) — return base on a repeat object. Surfaced by the CS-freeze loop-hunt workflow.*
- **Off-LAN Pi/cloud access — architecture (info / standing).** All Pi features must work on AND off LAN with zero per-user setup. On-LAN: mDNS → direct `http://pi:5000`. Off-LAN: the `https://bmo.mybmoai.work` Cloudflare Tunnel, which is gated by a Cloudflare Access app. Wiring: (a) `/api/library/*` has a **public Access Bypass** (read-only data; renderer fetches it directly — BMO sends `Access-Control-Allow-Origin: *`); (b) `/api/games*` is already public (multiplayer relay; P2P signaling :9000 is NOT tunnel-proxied, so off-LAN multiplayer uses the relay); (c) `/api/rclone/*` (cloud backup, sensitive) is reached with a **Cloudflare Access service token** baked into the MAIN bundle at build time (`electron.vite.config` `main.define` ← `CF_ACCESS_CLIENT_ID/SECRET` GitHub Actions secrets) and sent only from main-process fetches (cloud-sync, bmo-bridge) — never the renderer. Empty token in unconfigured builds → no headers (on-LAN unaffected). *Action: none — documented so future changes keep the token out of the renderer + only send it to the BMO base.*
- **Inline style objects → CSS classes** (~60 files / ~116 occurrences; the print-sheet `fontSize` cluster is already converted). *Not a clean headless win — many are genuinely dynamic (PixiJS sizing, drag offsets, runtime colors) and correctness is **visual** (no static gate). Do opportunistically, one file at a time, behind a GUI smoke-test.*
- **Rolldown config residual.** Migrate `build.rollupOptions.manualChunks` → `build.rolldownOptions.output.codeSplitting` (rolldown honors the compat shim; the build only warns). Cosmetic.
- **~28 eager static-JSON imports → lazy `data-provider` loads.** Partly intentional (some pair an eager sync default WITH an async loader). Defer unless a bundle-size target is set. (`monsters.json` is already lazy via the data-provider.)
- **Remaining knip findings (~187, non-blocking, `continue-on-error`).** The 87 safe-delete items were pruned; what remains is the 229 keep-intentional (public-API / barrels / `@internal` knip-wired re-exports) + 6 unsure. *Action (optional): add a `knip` ignore config for the intentional set so the dead-code check reads clean.*
- **`DmAction` full discriminated union (typed-debt).** `action-validator.ts` casts are typed via an `ActionFields` registry, but the global `DmAction` union (retiring the boundary cast entirely) is a 22-file, protocol-shaped change — `DmAction` is parsed from AI/LLM + BMO output (producer boundary genuinely `unknown`). *Do only with BMO-side protocol coordination.*
- **`useAsyncData<T>` adoption.** The hook exists + 3 sites migrated; ~39 other ad-hoc loaders can migrate incrementally (don't big-bang).
- **Scattered magic numbers → `app-constants.ts`.** The file exists (~30 constants) but only 2 files import it. No objective oracle for "is this a magic number" (D&D rule constants/indices shouldn't be hoisted) — high-surface, opportunistic only.
- **Semantic color tokens.** Palette theming works (`theme-manager.ts`, 4 themes); a semantic layer (`--color-surface`/`--color-danger`) = a design-taxonomy decision + ~9,600 className migrations + 4-theme visual verification. Future design proposal, not an implementable item.
- **Error-handling convention (documented + lint-guarded).** main/persistence → `StorageResult<T>`; renderer best-effort → return null/empty with a commented catch; user-facing → throw/surface. Lint guard 28e.8 bans bare empty `catch {}`. *A blanket migration across the ~294 intentional renderer catches is NOT warranted; escalate only if a specific surface needs different behavior.*
- **Color-only state indicators** (`MainMenuPage`, `HigherLevelEquipment5e`, `RuleManager`, `TurnEventsTab`, `MacroBar`) → pair color with text/icon/aria.
- **Form-validation a11y — final AT pass needs a human.** `AiProviderSetup` is labelled + `aria-invalid` + announced; `StatBlockEditor`/`DiseaseCurseTracker` have no validation UI to make accessible. A real screen-reader pass is the residual.
- **No cloud-relay live integration test.** `use-network-store` cloud tests + the host-migration tests stub the socket, so each side is faked; a real client↔Pi↔host test needs `game_relay.py` running on the Pi (needs-user / multi-machine).
- **`oxlint`/`jscpd`/`type-coverage` back the manual `tools/run-audit.js` harness (kept, not in CI).** Decision (2026-05-30): keep — deleting user-built audit tooling for a 3-devDep saving isn't worth it; wiring into CI would spam duplicates. Revisit only to remove the harness.
- **Doc residuals.** TypeDoc is an optional headless add; Storybook needs a GUI (defer).
- **Package `overrides` (9 entries)** documented in `docs/DEPENDENCIES.md`. *Action: recheck/prune on dep bumps.*
- **`throttle` util is opt-in** — zero production call-sites (candidate for removal, or a first consumer).
- **`userData` dir keyed on app name.** Defaults to `app.getName()` (`dnd-vtt` in dev, `D&D Virtual Tabletop` packaged). Renaming either orphans saves. *Standing advisory: never rename; if forced, add a dir-move migration.*

---

## 🔭 Future work / not-yet-decided

- **Real human-language translation of the ~5,900 i18n keys** (product decision). The picker + `en` + the `en-XA` pseudo-locale + `npm run i18n:gen-pseudo` + the `locale-parity` gate are all in place; a real second language is the open product call.

---

## 🚫 Out of scope (for dnd-app phase work)

- **Large public-dir assets** — `monsters.json` (~35k lines), ~130 MP3s under `public/sounds/`. CDN / lazy-download is a distribution decision, not a code fix.
- **Electron upgrade cadence** — EOL pressure resolved (E42 supported through ~2026-10-20); cadence + bump procedure documented in `docs/DEPENDENCIES.md`. Residual is only a recurring calendar reminder to bump before EOL — external housekeeping.
