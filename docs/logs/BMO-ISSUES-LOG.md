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

## Medium

### [2026-06-29] Calendar service shares one non-thread-safe `httplib2` connection across WS `on_connect` + poll loop -> `ResponseNotReady` / reentrant `BufferedReader` read

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan -- `bmo.service` journal (Jun 29 13:01:18)

**Description:**
`[ws] Calendar init failed` fired with a two-stage traceback: `http.client.ResponseNotReady: Request-sent`, and while handling it a second exception, `RuntimeError: reentrant call inside <_io.BufferedReader name=26>` (raised from `conn.close()` inside httplib2). This is a concurrency fault, NOT the already-logged OAuth token-revoked issue -- it is a different failure mode on the same calendar path.

**Reproduction (race -- intermittent):**
1. A WebSocket client (re)connects; `realtime_ws.py:on_connect` (line 170) calls `a.calendar.get_next_event()`.
2. The background `_poll_thread` (`_poll_loop` -> `_refresh_cache` -> `get_upcoming_events`) is simultaneously issuing a calendar API call.
3. Both go through `_with_service_retry` -> the shared `self._service` built once in `_get_service` (service.py:184), which wraps a single persistent `httplib2.Http` connection.
4. Two in-flight requests interleave on the one connection -> `ResponseNotReady`, then a reentrant read on the shared `BufferedReader` during cleanup.

**Expected behavior:** Concurrent calendar reads should be serialized (or each use its own connection) so the shared HTTP connection is never re-entered mid-request.

**Hypothesis / root cause:** `googleapiclient` + `httplib2.Http` are not thread-safe, and the calendar service reuses one cached `self._service` for every caller. The class HAS a `threading.Lock` (`self._cache_lock`, service.py:60) but it only guards the in-memory `self._cache` list (service.py:357/372/380) -- it does NOT wrap the actual API call in `_with_service_retry` (service.py:200-219) or `get_upcoming_events`/`get_next_event`. So the HTTP connection is unprotected, giving a false sense of thread-safety. Aggravated by the app running under **gevent** (`gevent.monkey.patch_all()`, see DESIGN-CONSTRAINTS.md): a blocking socket read yields to other greenlets mid-request, so the WS handler and poll greenlet interleave on the same connection.

**Proposed fix / improvement:**
- [ ] Serialize calendar API calls: wrap the `call(service)` execution (both attempts) in `_with_service_retry` under a dedicated lock (reuse `_cache_lock` or add `_api_lock`), OR
- [ ] Build a fresh `Http`/service per call (thread-local), OR pass a new `http=` to each `.execute()` so connections are never shared.
- [ ] Add a regression test exercising two concurrent `get_*` calls against a stubbed service.

**Related files:** `bmo/pi/services/calendar/service.py` (`_get_service` 124-185, `_with_service_retry` 200-219, `_cache_lock` 60), `bmo/pi/routes/realtime_ws.py:170`

**Related entries:** [2026-06-29] Google Calendar OAuth token revoked/expired (same path, different cause)

---

### [2026-06-29] `bmo.service` uses `KillMode=process` -> orphan child processes leak across every restart

- **Category:** config
- **Severity:** medium
- **Domain:** bmo (Pi infra)
- **Discovered by:** bmo-errors
- **During:** scheduled error scan -- `bmo.service` journal + unit file (Jun 29, multiple restarts)

**Description:**
Every stop/restart of `bmo.service` leaves child processes alive, and the next start logs them as left-overs. Sampled from Jun 29:

```
Jun 29 15:16:02 bmo systemd[1]: bmo.service: Unit process 1991 (adb) remains running after unit stopped.
Jun 29 15:16:02 bmo systemd[1]: bmo.service: Unit process 590088 (python3) remains running after unit stopped.
Jun 29 15:16:02 bmo systemd[1]: bmo.service: Unit process 590150 (python3) remains running after unit stopped.
...
Jun 29 15:16:02 bmo systemd[1]: bmo.service: Found left-over process ... in control group while starting unit. Ignoring.
```

This recurred at 02:48, 03:30, 04:11, 12:09, 15:16, 16:11, 17:43 on Jun 29 alone (~7 restarts), each leaking 2+ orphan `python3` workers plus a persistent `adb` (PID 1991).

**Expected behavior:** Stopping the unit should reap the whole process group, leaving no orphans for the next start to inherit.

**Hypothesis / root cause:** The unit sets `KillMode=process` (`bmo/pi/systemd/bmo.service:20`). With `Type=simple`, systemd then signals only the main `python app.py` process on stop and never the children it spawned (audio/worker subprocesses, the `adb` helper). The default `KillMode=control-group` would terminate the entire cgroup. Likely tied to the recurring `PortAudioError: Error querying device -1` failures: an orphaned audio worker from the previous run can keep the ALSA/Pulse capture device open, so the fresh run cannot enumerate it (device -1). Worth checking before assuming the two are independent.

**Proposed fix / improvement:**
- [ ] Remove `KillMode=process` (let it default to `control-group`), or set it explicitly, and add a `TimeoutStopSec`. If a specific child must outlive the unit, isolate it in its own unit rather than relaxing KillMode for everything.
- [ ] Verify the PortAudio device-enumeration failures stop once orphans are reaped.

**Related files:** `bmo/pi/systemd/bmo.service:20`

**Related entries:** [2026-06-29] `_follow_up_loop` crashes with uncaught `PortAudioError: Error querying device -1`

---
### [2026-06-29] `_follow_up_loop` crashes with uncaught `PortAudioError: Error querying device -1`

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `bmo.service` journal (Jun 29 03:10:13)

**Description:**
The voice pipeline's wake-word loop is properly guarded against a missing/transiently-unenumerable capture device (`_await_input_device()` / `_input_device_available()` slow-poll, voice_pipeline.py:297-330), but the **follow-up / conversation path is not**. When device enumeration fails mid-conversation, `_follow_up_loop` → `_wait_for_speech` → the sounddevice input stream raises `PortAudioError: Error querying device -1`, which is uncaught in the daemon thread, killing conversation mode:

```
Jun 29 03:10:13 bmo python[405106]: Exception in thread Thread-38 (_follow_up_loop):
Jun 29 03:10:13 bmo python[405106]: sounddevice.PortAudioError: Error querying device -1
```

**Expected behavior:** A device hiccup during follow-up should degrade quietly (same as the wake-word loop) and fall back to wake-word mode, not throw an unhandled exception that tears down the follow-up thread.

**Hypothesis / root cause:** The `_input_device_available()` gate added to `_wake_word_loop` (and `_await_input_device`) was never applied to `_follow_up_loop` (voice_pipeline.py:555+) or `_wait_for_speech`. The conversation thread started at voice_pipeline.py:394 (`start_conversation`) has no try/except around the stream open, so a PortAudio failure escapes the thread. Note: a regression test for the *wake-loop* variant already exists (tests/test_voice_pipeline.py:611), but there is no follow-up-loop equivalent.

**Proposed fix / improvement:**
- [ ] Gate `_wait_for_speech` / `_follow_up_loop` on `_input_device_available()`, or wrap the follow-up thread body in a try/except that logs once and returns to wake-word mode.
- [ ] Add a regression test mirroring tests/test_voice_pipeline.py:611 for the follow-up path.

**Related files:** `bmo/pi/services/voice/voice_pipeline.py` (`_follow_up_loop` ~555, `_wait_for_speech` ~607, `start_conversation` ~388), `bmo/pi/tests/test_voice_pipeline.py:611`

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

### [2026-06-29] Google Calendar OAuth token revoked/expired — calendar agent erroring until manual re-auth

- **Category:** config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `bmo.service` journal (Jun 29 01:13)

**Description:**
Calendar operations are failing with a recurring `google.auth.exceptions.RefreshError: invalid_grant: Token has been expired or revoked.`, re-raised as the app's `RuntimeError: Google Calendar refresh failed (token revoked or expired)`. The code degrades gracefully and surfaces a clear re-auth instruction, but the calendar agent is **non-functional until someone re-authorizes** — so this is current broken behavior, not just a transient blip.

**Note (operational, not a code bug):** this is an expired/revoked OAuth refresh token, which a code resolver cannot fix — it needs a human to re-run the re-auth flow. Logged so the broken state is visible and actioned.

**Proposed fix / improvement:**
- [ ] Re-authorize: `cd ~/home-lab/bmo/pi && ./venv/bin/python services/reauth_calendar.py` (paste code), or run `services/authorize_calendar.py` in a browser session.
- [ ] Optional hardening: have monitoring raise a single dedup'd alert (not repeated tracebacks) when the calendar token is revoked, and consider a proactive expiry warning before it lapses.

**Related files:** `bmo/pi/agents/calendar_agent.py`, `bmo/pi/services/reauth_calendar.py`, `bmo/pi/services/authorize_calendar.py`, `bmo/pi/services/calendar/`

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
