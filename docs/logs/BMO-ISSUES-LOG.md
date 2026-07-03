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

### [2026-07-02] Plan agent design phase always crashes — `DESIGN_PROMPT.format()` KeyError `'state'` from unescaped braces in the 38e endpoint examples

- **Category:** bug
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — live journal 2026-07-02 19:00:52 and 19:01:21 (two identical failures minutes apart)

**Description:**
Every request that reaches the plan agent's DESIGN phase crashes before the LLM is even called. `agents/plan_agent.py:142` runs `DESIGN_PROMPT.format(task=..., scratchpad_context=...)`, but the "Examples (Round 3 #5, 2026-05-17)" block added to `DESIGN_PROMPT` contains **unescaped** literal braces — `{state:"breathing", color:"purple", brightness:40}` and `{scene:"movie"}` — so `str.format()` treats `{state:...}` as a replacement field and raises `KeyError: 'state'` 100% of the time. (The sibling `EXPLORE_PROMPT` correctly escapes its JSON example with `{{...}}`; this block was never escaped.) The orchestrator's per-agent exception handler (39a) catches it and the user just hears "I had trouble building that plan — try again", so the total breakage has been silent since it shipped. Confirmed twice in today's journal via the `plan` agent override (`Model override: flash (agent=plan)` → `Agent 'plan' failed` → `KeyError: 'state'` at `plan_agent.py:142`), and reproducible statically: `_design` cannot ever succeed with the current template.

**Reproduction (if bug):**
1. Trigger the plan agent with `phase: "design"` (any task; e.g. chat with agent override `plan` after an explore pass).
2. `DESIGN_PROMPT.format(...)` raises `KeyError: 'state'` at `agents/plan_agent.py:142`.
3. Orchestrator logs `Agent 'plan' failed`; user gets the generic "I had trouble building that plan" fallback.

**Expected behavior (if bug):** The design phase formats the prompt and produces an implementation plan.

**Hypothesis / root cause (confirmed):** Phase 38e (commit `eca94276`, 2026-05-17) added the "default to HTTP endpoints, not scripts" guidance with inline JSON payload examples but did not double the braces. Phase 39a then fixed the *symptom* the QA round caught (raw `KeyError: 'state'` leaking into chat) by catching agent exceptions in the orchestrator — the underlying format bug was never fixed, so the design phase has been fully broken since 2026-05-17 while looking like a friendly transient error. (The QA Round 4 "CRITICAL: 'state' KeyError raw in chat" entry in `BMO-RESOLVED-ISSUES.md` is this same defect; only the leak was resolved.)

**Proposed fix / improvement:**
- [ ] Escape the literal braces in the `DESIGN_PROMPT` examples (`{{state:"breathing", ...}}`, `{{scene:"movie"}}`) — or switch the template to `string.Template` / manual replacement so prose examples can't collide with format fields.
- [ ] Add a unit test that calls `PlanAgent._design`'s prompt build (or simply `DESIGN_PROMPT.format(task="x", scratchpad_context="")`) so an unescaped-brace regression fails CI.
- [ ] Audit the other agent prompt templates for the same pattern (`REDESIGN_PROMPT` is clean; check remaining agents).

**Blocked by:** none

**Related files:** `bmo/pi/agents/plan_agent.py:33-96,142` (`DESIGN_PROMPT` + `_design`), `bmo/pi/agents/orchestrator.py:145`

**Related entries:** BMO-RESOLVED-ISSUES 2026-05-17 "Phase 39 (BMO) — QA Round 4 bundle" (masked this), "Phase 38 (BMO) — QA Round 3 bundle" 38e (introduced this).

---

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

### [2026-07-02] `/api/camera/describe` missing the `camera is None` guard — background thread AttributeError leaks raw Python to the user

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — live journal 2026-07-02 19:03:21

**Description:**
Every other camera endpoint (`/api/camera/stream`, `/api/camera/snapshot`, `/api/camera/snapshot/last`) starts with `if not camera: return 503`. `/api/camera/describe` (`app.py` ~1404) does not — it returns `{"ok": true, "message": "Describing..."}` immediately and spawns `_do_describe`, which calls `camera.describe_scene(prompt)` with `camera = None` on the live box (picamera2 init path leaves it None). The thread raises `AttributeError: 'NoneType' object has no attribute 'describe_scene'`, and the Round-3 #9 failure-mode classifier has no branch for it, so the socket emits the raw-Python fallback `Vision failed: 'NoneType' object has no attribute 'describe_scene'` to the user — exactly the "no camera" case that classifier was built to message nicely.

**Reproduction (if bug):**
1. Run with camera unavailable (live Pi state today; or `BMO_DISABLE_CAMERA=1` w/o simulate).
2. `POST /api/camera/describe` → 200 "Describing...".
3. `vision_result` arrives with the raw NoneType text (journal 19:03:21 traceback at `app.py:1412`).

**Expected behavior (if bug):** Immediate 503 `Camera service not available` like the sibling endpoints (or a clean "Vision unavailable: camera hardware not detected" emission).

**Hypothesis / root cause (confirmed):** Guard simply omitted when the describe endpoint was added; the error classifier matches on message substrings ("no camera", "frame", ...) that a NoneType AttributeError never contains.

**Proposed fix / improvement:**
- [ ] Add `if not camera: return jsonify({"error": "Camera service not available"}), 503` at the top of `api_camera_describe` (mirror siblings).
- [ ] Optionally add a NoneType/AttributeError branch to the classifier as defense-in-depth.
- [ ] Test: describe endpoint returns 503 when camera service is absent.

**Blocked by:** none

**Related files:** `bmo/pi/app.py:1404-1435` (`api_camera_describe` / `_do_describe`), `bmo/pi/app.py:663-680` (camera init)

**Related entries:** BMO-RESOLVED-ISSUES 2026-05-17 Phase 38 "38d (camera): #9 describe error split by failure mode" (this case slips through that split).

---

### [2026-07-02] TTS playback via ffplay can hang to the full 120s static timeout — voice pipeline stalls, utterance dropped as "All TTS failed"

- **Category:** bug, performance
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — live journal 2026-07-02 19:21:05 → 19:23:05

**Description:**
At 19:21:05 the 30s-timer chime ("Beep boop! 30s is done!", 17,623-byte cached opus, ~2-3s of audio) started playing via ffplay and hung until `subprocess.run(..., timeout=120)` in `voice_pipeline._play_audio` (line ~1275) expired at 19:23:05. Consequences: (1) the timer announcement was never heard — the one job of a timer; (2) the `speak()` path blocked for a full 2 minutes; (3) the `TimeoutExpired` escapes `_play_audio`, is treated as a synthesis failure, and the pipeline logs `[ERROR] All TTS failed` with no re-play attempt. Second occurrence of `timed out after 120 seconds` in the 14-day journal window. VLC music playback was active at the time (music_service playing since 19:04), and playbacks *interleaved with music* succeeded at 19:19:32 — so device contention is plausible but not deterministic.

**Reproduction (if bug):** Not reliably reproducible — intermittent (2×/14d). Observed under concurrent VLC music playback.

**Expected behavior (if bug):** A ~3s clip either plays in ~3s or fails fast and is retried/fallback-played; the pipeline never blocks 120s on playback of an already-synthesized file.

**Hypothesis / root cause (speculative):** ffplay blocking on the ALSA output device (contention with VLC and/or a stale child process from an earlier service instance — see the left-over-process entry below dated the same day). The static 120s timeout, sized for long utterances, turns a stuck ffplay into a 2-minute pipeline stall; playback failure and synthesis failure are conflated so no recovery happens.

**Proposed fix / improvement:**
- [ ] Size the ffplay timeout dynamically (decoded duration + ~10s grace) instead of a flat 120s.
- [ ] Catch `TimeoutExpired` inside `_play_audio`, kill the ffplay process group, and retry once before surfacing failure; log playback failure distinctly from "All TTS failed" (synthesis).
- [ ] While debugging, capture which process holds the ALSA device when it recurs (`fuser -v /dev/snd/*`).

**Blocked by:** none

**Related files:** `bmo/pi/services/voice/voice_pipeline.py:1072` (`speak` cached path), `:1244-1285` (`_play_audio`), `bmo/pi/services/music_service.py` (VLC co-tenant)

**Related entries:** [2026-06-29] "Intermittent Fish Audio TTS timeouts" (different failure mode: that is synthesis/API; this is local playback). [2026-07-02] left-over-process entry (Low) — possible device-holder.

---

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

### [2026-07-02] `bmo.service` stop still leaves child processes behind after the KillMode fix — stale `adb` server survives three restarts and lives in the current cgroup

- **Category:** config, bug
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — journal for today's three service restarts (18:20, 18:32, 18:34)

**Description:**
The 2026-06-29 fix removed `KillMode=process` so control-group reaping would clean up children on stop (resolved entry "`bmo.service` `KillMode=process` leaked orphan children"). Today's journal shows reaping is still incomplete: at the 18:20:09 stop systemd reported `Unit process 2006/2036 (python3) and 2038 (adb) remains running after unit stopped`; at 18:32:26 the **18:20-started instance's** children (python3 12487, 12640) again survived their stop, plus the same adb. The orphaned python3 processes eventually exited on their own, but the `adb -L tcp:5037 fork-server server` (pid 2038, spawned by the pre-18:20 instance) is **still alive right now inside the live `bmo.service` cgroup**, having survived three stops. The installed unit *does* now have `KillMode=control-group` (verified via `systemctl show`) and `TimeoutStopSec=20`, yet "Deactivated successfully" was declared within the same second as the stop request while children remained — behavior that looks like `KillMode=process`, not control-group.

Impact: journal noise (`Found left-over process ... Ignoring` × 7 lines today), a stale cross-instance adb daemon, and a plausible mechanism for the ALSA-device hang logged today (Medium ffplay entry) — the prior KillMode entry already noted orphaned audio children can hold the capture device.

**Hypothesis / root cause (speculative — needs verification):** Either (a) the fixed unit was only installed/daemon-reloaded partway through today's restart sequence, so the earlier stops ran under stale config (the 18:34:04 stop *did* reap the python children — only adb survived — consistent with the fix engaging by then), or (b) control-group reaping engages but the adb fork-server is somehow abandoned rather than SIGKILLed. Next clean restart should disambiguate: if python children are reaped and only adb persists, the remaining bug is adb lifecycle, not KillMode.

**Proposed fix / improvement:**
- [ ] On the next approved restart, verify no `remains running after unit stopped` lines appear for python children; confirm the KillMode fix is actually in effect.
- [ ] Manage adb's lifecycle explicitly: run `adb kill-server` in the TV worker's shutdown path (or `ExecStopPost=`), or start adb outside the unit's cgroup, so a fork-server never straddles service instances.
- [ ] One-time cleanup of the current stale pid 2038 next restart window.

**Blocked by:** restart gating (verification requires a service restart — observe, don't trigger).

**Related files:** `bmo/pi/systemd/bmo.service`, `bmo/pi/services/tv_worker.py` (adb spawner), `bmo/pi/scripts/deploy.sh` (unit install / daemon-reload ordering)

**Related entries:** BMO-RESOLVED-ISSUES [2026-06-29] "`bmo.service` `KillMode=process` leaked orphan children" (this is its follow-up: fix present but not observed effective). [2026-07-02] ffplay 120s playback hang (Medium) — possible consumer of the leaked device handle. [2026-06-29] TV/ADB startup connection failure (source of the adb process).

---

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
