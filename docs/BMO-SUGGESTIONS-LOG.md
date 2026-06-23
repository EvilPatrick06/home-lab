# BMO Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — BMO-domain only.**
>
> Sibling logs:
>
> - dnd-app suggestions → `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`
> - BMO active bugs / debt → `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`
> - dnd-app active bugs / debt → `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`
> - Security concerns (global, any domain) → `[SECURITY-LOG.md](./SECURITY-LOG.md)` *(gitignored)*
> - Resolved BMO entries → `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`
>
> Logging templates + triage rules: `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`.

**Triage rule:** `Domain: bmo` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to BMO behavior → mirrored here AND in `SUGGESTIONS-LOG-DNDAPP.md` where cross-tooling rules touch dnd-app too.

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-22] Remove stale one-off `dev/patch_*.py` + `revert_power.py` app.py-mutating scripts

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/dev/` holds six throwaway, one-shot scripts that read `../app.py`, do string-replacement surgery on it, and write it back: `patch_debug.py`, `patch_keepalive.py`, `patch_retry.py`, `patch_revert.py`, `patch_wol.py`, and `revert_power.py`. They were all last touched 2026-04-24 to fix the (now-resolved) RCA-TV power/WoL endpoint, and the comments confirm they are single-use migrations ("Revert to POWER for everything - WAKEUP doesn't work on this RCA TV", "Add WoL fallback...", etc.). They are no longer referenced anywhere except the `pi/README.md` directory tree. Keeping live "edit app.py in place" scripts around is a footgun — a future agent could re-run one and silently corrupt `app.py`.

**Proposed fix / improvement:**
- [ ] Confirm the corresponding changes are already merged into `app.py` (they are — the TV power work is resolved).
- [ ] Delete the six scripts, or move them under `_archive/` if history is wanted.
- [ ] Drop their line from the `pi/README.md` directory tree.

**Related files:** `bmo/pi/dev/patch_debug.py`, `bmo/pi/dev/patch_keepalive.py`, `bmo/pi/dev/patch_retry.py`, `bmo/pi/dev/patch_revert.py`, `bmo/pi/dev/patch_wol.py`, `bmo/pi/dev/revert_power.py`, `bmo/pi/README.md`

---

### [2026-06-22] Consolidate scattered systemd `.service` units into one location

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
Four tracked systemd unit files live in two different directories. Three sit together in `bmo/pi/kiosk/` (`bmo-kiosk.service`, `bmo-dm-bot.service`, `bmo-social-bot.service`) alongside `install-kiosk.sh`, while a fourth — `bmo-ide.service` — sits off on its own in `bmo/pi/ide_app/`. There is no single place to look for "what units does this host run", and the kiosk installer can't pick up the IDE unit. Either co-locate all units (e.g. a `bmo/pi/kiosk/` or new `bmo/pi/systemd/` dir) or document why the IDE unit is intentionally separate.

**Proposed fix / improvement:**
- [ ] Pick a canonical home for unit files (likely `bmo/pi/kiosk/` since the installer is there, or a dedicated `systemd/` dir).
- [ ] Move `ide_app/bmo-ide.service` there (update any install script / docs that reference its path).

**Related files:** `bmo/pi/ide_app/bmo-ide.service`, `bmo/pi/kiosk/bmo-kiosk.service`, `bmo/pi/kiosk/bmo-dm-bot.service`, `bmo/pi/kiosk/bmo-social-bot.service`, `bmo/pi/kiosk/install-kiosk.sh`

---

### [2026-06-22] `dev/` benchmark layout is inconsistent (loose files vs `benchmarks/` subdir)

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/dev/` keeps four benchmarks as loose files at its root (`benchmark_audio.py`, `benchmark_full.py`, `benchmark_llm.py`, `benchmark_personality.py`) while two others live in a `dev/benchmarks/` subdir (`gemini_stream_probe.py`, `thinking_budget_sweep.py`). Diagnostics were already consolidated into `dev/diagnostics/` in a prior pass, so the half-migrated benchmark split is the odd one out. Moving the four loose `benchmark_*.py` into `dev/benchmarks/` would make `dev/` uniform (benchmarks/, diagnostics/, ai-temp/ + true dev tools at root).

**Proposed fix / improvement:**
- [ ] Move `dev/benchmark_*.py` into `dev/benchmarks/` (rename to drop the `benchmark_` prefix, or keep it — just be consistent).
- [ ] Update any docs/README tree references.

**Related files:** `bmo/pi/dev/benchmark_audio.py`, `bmo/pi/dev/benchmark_full.py`, `bmo/pi/dev/benchmark_llm.py`, `bmo/pi/dev/benchmark_personality.py`, `bmo/pi/dev/benchmarks/`

---

### [2026-06-22] Aggregate voice-pipeline stage latency into an exported metrics endpoint

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of the voice pipeline + monitoring stack

**Description:**
`services/voice_pipeline.py` already takes ad-hoc per-stage timestamps (`_t_stt0`, `_t_chat0`, the `record` elapsed log) and `services/bmo_logging.py` can emit JSON, but STT/LLM/TTS stage durations and agent-routing time are only written as scattered log lines — never aggregated or exported. `services/monitoring.py` tracks a per-service health-check `response_time`, but that is liveness latency, not the user-perceived "wake -> spoken reply" budget. There is no `/api/metrics` (or Prometheus text) endpoint and no rolling p50/p95 for the voice path, so latency regressions are invisible until BMO subjectively "feels slow."

**Proposed fix / improvement:**
- [ ] Add a small in-process metrics collector (counters + histograms / ring buffer) fed by the existing `_t_*` timers, recording each stage duration and the chosen agent route.
- [ ] Expose it at `/api/metrics` (JSON, or Prometheus text for scraping) and optionally surface p50/p95 inside `/api/health/full`.

**Related files:** `services/voice_pipeline.py`, `services/monitoring.py`, `app.py`, `services/bmo_logging.py`

### [2026-06-22] Mock-hardware "simulator" run mode for off-Pi development

- **Category:** portability
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of init_services() + hardware/ adapters

**Description:**
Off-Pi, `init_services()` wraps each hardware service (LED, OLED, camera, mic/voice) in try/except and simply SKIPs it on `ImportError`; CANARY mode is import-only. A contributor on a laptop can boot Flask but cannot exercise the LED ring, OLED face, camera, or the wake -> STT -> TTS flow at all — those subsystems are absent, not simulated. There is no functional-stub layer (virtual LED/OLED state surfaced to the web UI, file/synthetic mic input, canned camera frames) to develop or UX-test the full experience off-device.

**Proposed fix / improvement:**
- [ ] Add a `BMO_SIMULATE=1` mode providing stub hardware adapters that implement the same interfaces with fake-but-observable behavior (LED/OLED state pushed to the existing web UI; mic fed from a wav file or injected text; camera returns a static/sample frame).
- [ ] Document it in `DEPLOY.md` / `bmo/pi/README.md` so off-Pi end-to-end UX testing is a first-class path.

**Related files:** `app.py` (`init_services`), `hardware/led_controller.py`, `hardware/oled_face.py`, `hardware/camera_service.py`, `services/voice_pipeline.py`

### [2026-06-22] Periodic synthetic voice-path canary wired into monitoring + Discord alerts

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of dev/ benchmarks + monitoring

**Description:**
`dev/benchmark_full.py` / `benchmark_audio.py` / `benchmark_llm.py` already exercise the STT -> LLM -> TTS path, but they are manual one-off dev tools. `services/monitoring.py` and the cron health check only probe liveness/HTTP status, not the real end-to-end voice path. A regression that leaves `/health` green but breaks actual STT/TTS quality or latency (model swap, cloud API change, mic config drift) goes unnoticed until a human talks to BMO. Recorded wake clips already exist under `wake/clips` (`record_wake_clips.py`).

**Proposed fix / improvement:**
- [ ] Wrap a lightweight synthetic run (feed a known clip -> assert transcript approximately matches + TTS produced + stage latency under budget), building on `benchmark_full.py` rather than duplicating it.
- [ ] Run it on a slow cadence (cron / systemd timer) and feed pass/fail + latency into `monitoring.py` so the existing Discord alert path fires on regression.

**Related files:** `dev/benchmark_full.py`, `services/monitoring.py`, `services/voice_pipeline.py`, `wake/clips`, `health_check.sh`

### [2026-06-22] Pin one Node version for the whole monorepo (.nvmrc / engines) instead of repeating `node-version: 22`

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`node-version: 22` is hardcoded in 7 places across 5 workflows (`dnd-app-ci`, `security-audit`, `dnd-app-validate-5e`, `release` ×3, `deploy`). There is no root `.nvmrc`, no `engines.node` field in any package.json (`dnd-app` / `dungeon-scholar` / `oracle-worker`), and no Volta pin. Local contributors can build on any Node, and bumping the toolchain means hand-editing every workflow.

**Proposed fix / improvement:**
- [ ] Add a root `.nvmrc` (e.g. `22`).
- [ ] Add a matching `engines.node` to each project package.json.
- [ ] Switch workflows to `node-version-file: .nvmrc` so the version lives in one place.

**Related files:** `.github/workflows/*.yml`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] No PR-time CI gate for dungeon-scholar or oracle-worker

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`dnd-app` has a dedicated CI gate (lint + forbidden-patterns + tsc + tests + build smoke + circular + audit). `dungeon-scholar` runs `npm run test` ONLY as a precondition of the Pages deploy (`deploy.yml`, push to main) — there is no `pull_request`-triggered test/build gate, so a PR merges green and only fails later at deploy time. `oracle-worker` has a `test` script but zero workflows reference it, so its tests never run in CI.

**Proposed fix / improvement:**
- [ ] Add `dungeon-scholar-ci.yml` (path-filtered test + build on push + PR).
- [ ] Add `oracle-worker-ci.yml` (npm ci + test).
- [ ] Optionally factor the shared setup-node / npm-ci steps into a composite action reused by all JS-project workflows.

**Related files:** `.github/workflows/deploy.yml`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] Local pre-commit hook gates only dnd-app; `.githooks/` dir is now orphaned

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`.husky/pre-commit` does `cd dnd-app` then runs biome + tsc on that project only. Commits touching `dungeon-scholar`, `oracle-worker`, or repo-root tooling get no local lint/typecheck/test pre-flight (dungeon-scholar`s first gate is the deploy workflow; oracle-worker has none). Separately, `.githooks/pre-commit` is now redundant — its gitleaks shim was folded into `.husky/` per that hook`s own comment, yet the old dir remains and can confuse anyone setting `core.hooksPath`.

**Proposed fix / improvement:**
- [ ] Make the hook detect which project(s) have staged changes and run each one`s lint/typecheck (at minimum add dungeon-scholar test/build).
- [ ] Delete the orphaned `.githooks/` directory once `.husky` is confirmed authoritative.

**Related entries:** `ISSUES-LOG-DNDAPP.md` [2026-06-16] pre-commit `--staged` no-op (distinct dnd-app-only bug).
**Related files:** `.husky/pre-commit`, `.githooks/pre-commit`

### [2026-06-22] Four hand-maintained agent-instruction files will drift (AGENTS / CLAUDE / GEMINI / copilot)

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
The repo carries four overlapping AI-assistant guides — `AGENTS.md` (12.8K), `CLAUDE.md` (11.3K), `GEMINI.md` (5.2K), `.github/copilot-instructions.md` (4.6K) — each maintained by hand. They cover much of the same ground (repo layout, conventions, logging rules) and will drift out of sync as the repo evolves.

**Proposed fix / improvement:**
- [ ] Designate one canonical source (e.g. `AGENTS.md`); generate or symlink the others from it, or add a sync check that flags when shared sections diverge.
- [ ] At minimum, have each file link to the canonical one for shared sections instead of duplicating them.

**Related files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

> **2026-06-10 — Backlog consolidated.** All previously-open entries (the app.py
> blueprint-refactor remainder, flask-talisman, the gevent ThreadPoolExecutor /
> requests-vs-httpx gotchas, and the venv/threading observations) became
> the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new BMO items below as they appear.

*(none active)*

---

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

### [2026-06-22] Misspelled static asset filename `PrimeVIdeo.png`

- **Category:** debt
- **Severity:** info
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
The TV-app launcher image `bmo/pi/web/static/img/PrimeVIdeo.png` has a capitalization typo (`VIdeo` instead of `Video`). It works today because `web/templates/index.html:1163` references it with the exact same misspelling, but the inconsistent casing is a small naming smell next to its siblings (`Netflix.png`, `YouTube.png`, `Plex.png`, etc.) and is a portability hazard on case-sensitive vs case-insensitive filesystems. Low priority — only worth fixing alongside other `index.html` asset churn (rename file + update the one `<img src>`).

**Related files:** `bmo/pi/web/static/img/PrimeVIdeo.png`, `bmo/pi/web/templates/index.html`

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
