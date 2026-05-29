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
