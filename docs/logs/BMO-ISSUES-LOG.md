# BMO Issues Log

> **Active BMO bugs / tech debt / broken config / perf — domain-scoped to the Pi voice assistant + DM engine + Discord bots (`bmo/`).** Includes Pi-side infra/tooling that BMO depends on (the venv, pip caches, Pi systemd, etc.) since this is the Pi's primary domain.
>
> Sibling logs:
>
> - dnd-app active bugs / debt → `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`
> - BMO future ideas / design gotchas / observations → `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`
> - Security concerns (any domain) → `[SECURITY-LOG.md](./SECURITY-LOG.md)` *(gitignored)*
> - Resolved BMO entries → `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`
>
> Logging templates + triage rules: `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`.

**Triage rule (BMO-domain entries):** Bug / debt / config / perf issues whose **Domain: bmo** (or Pi-side infra/tooling) → here. dnd-app entries → `ISSUES-LOG-DNDAPP.md`. `Domain: both` → mirror in both issue logs (small duplication is fine; one fix removes both). Security (any domain) → `SECURITY-LOG.md`. Design-gotcha / future-idea / info → `BMO-SUGGESTIONS-LOG.md`.

New entries go at the TOP of their severity section (newest first within each section).

**Process (read this):** This log is the **deferred** backlog, not a duplicate of every commit. Per `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`: if a bug is fixed in the same session / PR, we **do not** add a new entry here (the commit + moved archive entry are the record). That can make it look like the log "stopped" — it did not; it only tracks **outstanding** work. When an item is done, it moves to `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)` and is removed from here.

---

# Active BMO Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries became
> the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new BMO items below as they appear.

## Critical

*(none currently logged)*

## High

### [2026-07-02] BMO_HOME never wired into the live units — `services/paths.py` points 24 live modules at the dev tree, splitting runtime state across two checkouts and breaking sandboxed writes

- **Category:** bug, config
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — noticed the live app's MCP child running from `/home/patrick/home-lab` while every service runs from `/home/patrick/home-lab-deploy`

**Description:**
The paths centralization (`services/paths.py`, commit `4346536b`) defaulted `BMO_ROOT` to `~/home-lab/bmo/pi` "so existing installs are byte-for-byte unaffected", with an explicit checklist item to wire `BMO_HOME` through the systemd units. The deploy decoupling then moved all services to the dedicated checkout `/home/patrick/home-lab-deploy` — but `BMO_HOME` was never set anywhere: not in `/etc/systemd/system/bmo.service` (verified), not in the deploy checkout's `.env` (verified), not in the repo units. So every module importing `services.paths` (24 non-test modules: `services/chat_history.py`, `services/alert_service.py`, `services/notification_service.py`, `services/list_service.py`, `services/music_service.py`, `agents/memory.py`, `agents/settings.py`, `routes/chat_api.py`, `services/voice/voice_pipeline.py`, …) resolves `DATA_DIR` to the **dev tree**, while cwd/module-relative code (e.g. `services/monitoring.py` `_PI_ROOT`) uses the **deploy checkout**. Three observed consequences on the live box:

1. **Split-brain runtime state.** Dev tree `data/` holds the newer `recent_chat.json` (Jun 30), `lists.json`/`notes.json` (Jun 29), `alert_history.json` (Jul 2 — written by unsandboxed callers such as the notify-board CLI / agent sessions), while the deploy checkout holds the live `monitor_state.json` / `location_cache.json` (Jul 2). Neither tree has a complete current state set, and `bmo-backup.service` (ExecStart in the deploy checkout) backs up only one of them.
2. **Sandboxed writes fail silently.** `bmo.service` runs `ProtectSystem=strict` with `ReadWritePaths=` covering only the deploy checkout's `data/`+`config/` (+`~/.cache`), so live in-process writes to dev-tree paths are blocked. Journal 2026-06-30 10:54 (under bmo.service): `notify.sh`/`notify-sms.sh` repeatedly hit `Read-only file system` on `notify.log` and `pending.txt` — i.e. the monitor's SMS/alert delivery path fails from inside the service.
3. **Deploy-isolation violation (live code from the dev tree).** The live app (deploy checkout, pid 834157) spawns its MCP child from the dev tree: `python3 /home/patrick/home-lab/bmo/pi/mcp_servers/dnd_data_server.py` (pid 834213, ppid 834157) — `agents/settings.py:100` builds the path from `BMO_ROOT`, and `mcp_servers/mcp_settings.json` hardcodes `/home/patrick/home-lab/...` absolute paths. Integrator/agent churn in the shared dev tree therefore changes code the LIVE assistant executes — exactly what the deploy decoupling (`docs/BMO-DEPLOY.md`) exists to prevent. `dnd_data_server.py:27-37`'s expanduser defaults likewise read the dev tree's 5e/RAG data.

**Expected behavior:** All live services and their children resolve every code and data path inside `/home/patrick/home-lab-deploy`; the dev tree is never read or executed by live services.

**Hypothesis / root cause (confirmed):** The 2026-06-24 "BMO root path hardcoded" resolution shipped `paths.py` + call-site migration + CI ratchet but the final checklist step — "Wire `BMO_HOME` through the Docker image and systemd unit `Environment=`" — was never done. The later deploy-checkout migration silently turned the "unaffected" default into a wrong-tree default.

**Proposed fix / improvement:**
- [ ] Set `Environment=BMO_HOME=/home/patrick/home-lab-deploy/bmo/pi` in `bmo/pi/systemd/bmo.service`, `bmo-dm-bot.service`, `bmo-social-bot.service` (and any unit importing app code), and have deploy.sh install the updated units (or write `BMO_HOME` into the deploy `.env`).
- [ ] Make `mcp_servers/mcp_settings.json` paths derive from `BMO_ROOT` (or template them at deploy time); replace `dnd_data_server.py`'s expanduser defaults with `services.paths`.
- [ ] One-time reconcile of the two `data/` trees into the canonical (deploy) one so chat history / lists / notes / alert history are whole again; confirm `bmo-backup` targets the canonical tree.
- [ ] Add a health/canary assertion that `BMO_ROOT` sits inside the running checkout, to catch this drift class permanently.
- ⏳ NOTE: the unit-file/env fix needs a service restart to take effect — restart stays gated per the workflow (needs-restart approval).

**Blocked by:** none

**Related files:** `bmo/pi/services/paths.py:13`, `bmo/pi/agents/settings.py:100,111`, `bmo/pi/mcp_servers/mcp_settings.json`, `bmo/pi/mcp_servers/dnd_data_server.py:27-37`, `bmo/pi/systemd/bmo.service`, `bmo/pi/scripts/deploy.sh`, `docs/BMO-DEPLOY.md`

**Related entries:** BMO-RESOLVED-ISSUES 2026-06-24 "BMO root path `~/home-lab/bmo/pi` is hardcoded across ~40 Python files" (this is its unfinished final step, now load-bearing).

**Update [2026-07-02, bmo-resolver]:** Code + config landed on `auto/bmo-resolver` (integrator merges): `services/paths.py` now defaults `BMO_ROOT` to the checkout the code actually runs from (`Path(__file__).parent.parent`) instead of a fixed `~/home-lab/bmo/pi`, structurally removing the split-brain when `BMO_HOME` is unset; `Environment=BMO_HOME=/home/patrick/home-lab-deploy/bmo/pi` added to `bmo.service`, `bmo-dm-bot.service`, `bmo-social-bot.service`; `mcp_servers/dnd_data_server.py` standalone defaults now derive from its own location; and `app.py` gained a boot-time drift guard (hard-fails the canary, warns a live boot) asserting `BMO_ROOT` equals the running checkout. `mcp_settings.json` left as-is — it is NOT loaded at runtime (only a doc-comment reference; the live MCP config is generated by `agents/settings.py` from `services.paths`), so its stale absolute paths are inert; flagged as a removal candidate. **Still gated / OPEN:** the systemd-unit change needs a `bmo.service` (+ bots) restart to take effect (board `restart-bmo`), and the one-time reconcile of the two `data/` trees plus `bmo-backup` target confirmation are operational follow-ups. Kept open until the restart + reconcile land.

---

## Medium

### [2026-06-29] social-bot YouTube playback failing — `HTTP 403 Forbidden` + "Video unavailable" (likely yt-dlp staleness)

- **Category:** bug, config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `bmo-social-bot.service` journal (Jun 29)

**Description:**
The social bot's music playback is repeatedly failing to extract/stream YouTube audio — 32 failures on Jun 29 alone — with a mix of `yt-dlp extract failed: ERROR: [youtube] <id>: Video unavailable. This video is not available` and, on the media fetch, `[https @ 0x...] HTTP error 403 Forbidden`. The recurring **403 Forbidden** on the CDN fetch is the classic signature of a yt-dlp version lagging behind a YouTube signature/throttling change, rather than the videos genuinely being gone.

**Hypothesis / root cause:** `yt-dlp` is pinned at `2026.6.9` (bmo/pi/requirements.txt:453, requirements-ci.txt:397) — ~20 days old as of this scan. YouTube ships breaking extractor changes frequently; an out-of-date yt-dlp commonly produces exactly this 403/"unavailable" pattern. (Caveat: some of the "This video is not available" hits may be legitimately removed/region-locked videos — verify against a known-good public video before assuming it's 100% staleness.)

**Proposed fix / improvement:**
- [ ] Bump the `yt-dlp` pin to the latest release and redeploy; re-test a known-good public video.
- [ ] Consider a looser pin / scheduled auto-bump for `yt-dlp` specifically, since it breaks on YouTube's cadence rather than the repo's.


**Update [2026-06-29, bmo-resolver]:** yt-dlp is ALREADY at the latest published release — `pip index versions yt-dlp` reports `2026.6.9` as both INSTALLED and LATEST, with no newer version available — so the staleness-bump fix is not currently actionable. The 403 / "Video unavailable" pattern is therefore most likely legitimately removed / region-locked videos, or a YouTube-side change with no upstream yt-dlp fix shipped yet. Kept open; re-evaluate (and bump) once a newer yt-dlp release exists.

**Update [2026-07-02, bmo-resolver]:** Re-checked — `pip index versions yt-dlp` still reports `2026.6.9` as both INSTALLED and LATEST (no newer release published). Not actionable this run; kept open pending an upstream release.

**Related files:** `bmo/pi/requirements.txt:453`, `bmo/pi/requirements-ci.txt:397`, `bmo/pi/bots/discord_social_bot.py`, `bmo/pi/bots/social/`

---

### [2026-06-29] Pi thermally throttles during local-LLM fallback (84.8°C, `THROTTLED NOW`)

- **Category:** performance
- **Severity:** medium
- **Domain:** bmo (Pi infra)
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `bmo.service` monitoring alerts (Jun 29 03:13–03:14)

**Description:**
When the cloud LLM is unreachable and BMO falls back to local inference, the Pi overheats and hardware-throttles even with the fan driven to max:

```
Jun 29 03:12:58 [agent] Cloud LLM failed (503 ...gemini...), falling back to local
Jun 29 03:13:48 [monitor][CRITICAL] pi_cpu_temp: CPU temperature critical: 84.8°C
Jun 29 03:13:48 [monitor][CRITICAL] pi_power: THROTTLED NOW — CPU frequency reduced | ARM frequency capped NOW (flags: 0xe0006)
```

`pi_cpu_temp` critical alerts recur across days (Jun 28 12:02 / 19:15, Jun 29 01:39 / 03:13), and `bmo-fan.service` was already ramping to duty 209–225/255 earlier — i.e. the cooling solution is saturated and still cannot hold the local-LLM load below the throttle point. Throttling slows every local-fallback response and risks long-term thermal wear.

**Hypothesis / root cause:** Local LLM (Ollama) inference is CPU-bound and pegs all cores; the case fan curve tops out before it can dissipate that sustained load, so the SoC hits 85°C and `vcgencmd` reports active throttling (flags `0xe0006` = under-volt + currently-throttled + freq-capped bits). Aggravated by the recurring cloud-LLM 503s forcing more local fallbacks than usual.

**Proposed fix / improvement:**
- [ ] Cap local-inference concurrency / thread count, or use a smaller/quantized local model, to bound peak CPU heat.
- [ ] Re-tune the fan curve to reach 255 duty earlier (before 80°C), and/or verify heatsink/airflow.
- [ ] Investigate the recurring Gemini 503s (see fallback trigger) so local fallback isn't entered as often.

**Related files:** `bmo/pi/hardware/fan_control.py`, `bmo/pi/services/monitoring.py`, local-LLM/agent inference path (`bmo/pi/agents/`), `bmo/pi/systemd/bmo-fan.service`

---


## Low

### [2026-06-29] TV/ADB integration fails to connect on every startup (`[tv] Connection failed -- try pairing via the TV tab`)

- **Category:** config
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan -- `bmo.service` journal (16x in the retained ~7-day window, ~1 per startup)

**Description:**
On essentially every boot, the TV controller logs `[tv] Connection failed:  -- try pairing via the TV tab` (occasionally `Need to pair again`). It degrades gracefully (just no TV control) but recurs on every startup and is the source of the long-lived `adb` process that the `KillMode=process` issue then orphans.

**Hypothesis / root cause:** The ADB pairing/token with the TV is not persisted across reboots (or has lapsed), so the startup connect attempt always fails until someone re-pairs via the TV tab. Operational state, not necessarily a code bug -- but if pairing is expected to persist, the token store/reconnect path is broken.

**Proposed fix / improvement:**
- [ ] Confirm whether TV pairing is meant to persist; if so, fix the ADB key/token persistence + auto-reconnect. If the TV is intentionally unpaired, lower this log line below WARNING so it stops looking like an error each boot.

**Related files:** TV/ADB controller under `bmo/pi/services/` or `bmo/pi/` (search `[tv]` / `adb`)

**Related entries:** [2026-06-29] `bmo.service` uses `KillMode=process` (the orphaned `adb` process)

---

### [2026-06-29] Intermittent Fish Audio TTS timeouts raise CRITICAL monitor alerts (no voice output while firing)

- **Category:** config, performance
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan -- `bmo.service` monitor alerts (Jun 29 13:52, 13:53, 15:00)

**Description:**
The health monitor fired `[CRITICAL] fish_audio_api: Fish Audio API (text-to-speech) is not responding (timed out after 5s)` three times on Jun 29. When it fires, the primary TTS path is unavailable, so BMO produces no spoken output until it recovers. Clustered on a single day so far -- may be a transient upstream/network incident rather than a standing problem, but the user-facing impact (silent assistant) warrants visibility.

**Hypothesis / root cause:** Transient Fish Audio API/network latency exceeding the 5s health-probe timeout. Verify whether the same timeout also aborts real TTS requests (vs. just the probe), and whether there is a local/offline TTS fallback when Fish Audio is down.

**Proposed fix / improvement:**
- [ ] Confirm whether a TTS fallback engine engages when Fish Audio times out; if not, add one (or a retry/backoff) so the assistant is not silent.
- [ ] Consider dedup/rate-limiting the CRITICAL alert and/or raising the probe timeout if 5s is too tight for this endpoint.

**Related files:** `bmo/pi/services/voice/voice_pipeline.py` (Fish Audio TTS path), `bmo/pi/services/monitoring.py` (`fish_audio_api` check)

---
### [2026-06-29] onnxruntime GPU device-discovery warnings spam wake-model loads on the Pi

- **Category:** debt
- **Severity:** low
- **Domain:** bmo (Pi infra)
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `bmo.service` journal (recurring, Jun 29)

**Description:**
Every wake-word / voice-model load logs a pair of onnxruntime warnings trying to enumerate non-existent GPUs on the headless Pi:

```
[W:onnxruntime:Default, device_discovery.cc:283 GetGpuDevices] Failed to detect devices under "/sys/class/drm/card1": ... Failed to open file: ".../device/vendor"
```

Harmless (CPU execution provider is used regardless) but it recurs on every model init and clutters the journal, making real errors harder to spot.

**Hypothesis / root cause:** onnxruntime's default device discovery probes `/sys/class/drm/cardN` which don't exist on the Pi. Suppressible by lowering onnxruntime's log severity (e.g. `SessionOptions.log_severity_level = 3`) or setting the provider explicitly to CPU.

**Proposed fix / improvement:**
- [ ] Set onnxruntime session log severity to ERROR (or pin CPUExecutionProvider) where the wake/openwakeword models are created.

**Related files:** `bmo/pi/services/voice/` (wake detector / model init), `bmo/pi/wake/`

---

### [2026-06-29] `auto/bmo-phase-maker` (tip `2b41551c`) won't merge — duplicate PHASE-14/15 re-authored from the same QA report

- **Category:** integration / merge-conflict (duplicate work)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** integrator
- **During:** daily branch integration (2026-06-29 run)

**Description:**
A first `auto/bmo-phase-maker` run was merged to `master` earlier this same integration pass, adding `PHASE-14-ide-font-csp-and-redirect-doc-truth.md` + `PHASE-15-chat-transcript-management.md` and their `PHASE-INDEX.md` rows. A **second** `auto/bmo-phase-maker` branch (tip `2b41551c`) then appeared and authored the **same two phases from the same source** (`QA/QA-report-2026-06-28-3.md`) under different slugs — `PHASE-14-ide-csp-and-tab-doc-truth.md` + `PHASE-15-chat-history-hygiene.md` — so it no longer merges: `bmo/docs/phases/PHASE-INDEX.md` conflicts (duplicate PHASE-14/15 rows + provenance block). Both cover the identical findings (the `/ide` Google-Fonts CSP violation + chat-history hygiene/clear-chat affordance); the second run's framing is slightly more specific (CSP fix = serve fonts from the allowlisted `cdn.jsdelivr.net`; backend `DELETE /api/chat/history`).

**Root cause:** Two phase-maker runs raced over the same QA report and produced overlapping PHASE-14/15 plans with different filenames; the first landed, so the second is a redundant re-authoring rather than a mechanical conflict. Not fixed-forward by the integrator because choosing which PHASE-14/15 wording is canonical (or discarding the branch as duplicate) is a bmo-domain decision, not a mechanical merge.

**Proposed fix / improvement (bmo phase-maker owner):**
- [ ] Decide canonical PHASE-14/15: keep the merged pair, OR replace with the `2b41551c` versions (the CSP-via-jsdelivr + `DELETE /api/chat/history` framing is arguably better — port any improvements into the merged docs).
- [ ] Delete `auto/bmo-phase-maker` (tip `2b41551c`) once reconciled; it has no unique code, only the duplicate phase docs.
- [ ] Optional: have the phase-maker check `PHASE-INDEX.md` for an existing plan covering the same QA report before authoring, to avoid duplicate-number races.

**Related files:** `bmo/docs/phases/PHASE-INDEX.md`, `bmo/docs/phases/PHASE-14-*.md`, `bmo/docs/phases/PHASE-15-*.md`, branch `auto/bmo-phase-maker` (tip `2b41551c`)

---
