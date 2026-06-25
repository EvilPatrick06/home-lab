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

### [2026-06-24] `/api/music/*` + `/api/calendar/events` 500-storm — lazy service accessors deref `None` after a swallowed init failure (no guard, no retry)

- **Category:** bug
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan of bmo.service runtime logs (journal)

**Description:**
On the current `bmo.service` boot (start 2026-06-23 16:07:06 MDT, `NRestarts=0`), both the music and calendar services failed to initialize and were left as `None`, and the read endpoints that depend on them now raise an unhandled `AttributeError` on **every** poll. In the last 24h the journal shows ~**9,305** `Exception on /api/music/state [GET]` plus a handful on `/api/music/devices`, `/api/music/most-played`, `/api/music/history`, and **65** `Exception on /api/calendar/events [GET]`. The kiosk/web UI polls `/api/music/state` roughly every 2s, so this is a continuous 500-storm that floods the journal (hastening rotation — the original init-time exception has already rotated away) and leaves the music + calendar panels broken for the whole uptime.

**Reproduction:**
1. Cause (or simulate) a `MusicService` / calendar init failure at app startup (`app.py` swallows it: `except Exception: log.exception("Music: SKIPPED")`, leaving module-global `music = None`; calendar analogous).
2. Hit `GET /api/music/state` (or let the kiosk poll it).
3. Observed: `AttributeError: 'NoneType' object has no attribute 'get_state'` at `routes/music_api.py:135` → Flask 500. Same shape at `routes/calendar_api.py:35` (`'NoneType' object has no attribute 'get_upcoming_events'`).

**Expected behavior:** A read endpoint for an unavailable service should degrade gracefully — e.g. return `{"available": false, ...}` (HTTP 200) or a clean `503`, not an unhandled 500 on every poll. Init failure should be surfaced (e.g. on `/health`) rather than only visible as endpoint 500s.

**Hypothesis / root cause (two layers):**
- **Proximate:** `_music()` (`routes/music_api.py:20-22`, `return app.music`) and `_calendar()` (`routes/calendar_api.py:26-27`, `return app.calendar`) return `None` when the service failed to init, and the handlers deref the result with no None-guard (`routes/music_api.py:135` `_music().get_state()`; `routes/calendar_api.py:35`). The `music_api.py` module docstring even calls this out as deliberate "pre-extraction behavior" — but a 500 on a hot poll loop is a defect, not a feature.
- **Contributing:** `app.py:664-670` (and the calendar equivalent) catch *all* init exceptions and continue with the service set to `None`, with **no retry and no health-surfaced degradation**. A transient boot-ordering race (audio sink / network / OAuth not ready when `MusicService.__init__` runs `vlc.Instance(...)` / `YTMusic()`, or an expired Google token for calendar) therefore **permanently** disables the feature until a manual restart. Verified the deps themselves are healthy *now*: live venv has `python-vlc 3.0.21203` + `ytmusicapi 1.12.0`, `import vlc` / `YTMusic()` ctor both succeed, `vlc`/`cvlc` binaries present — so this was an init-time/transient failure, not a missing dependency. (Exact boot exception unrecoverable: the 500-storm flooded the journal past rotation. NOT canary mode — confirmed no `BMO_CANARY` in the unit env or `.env`.)

**Proposed fix / improvement:**
- [ ] Guard the lazy accessors / handlers: when `app.music` / `app.calendar` is `None`, return a degraded JSON payload (`available:false`) or `503`, never deref `None`. Apply across all `/api/music/*` and `/api/calendar/*` read handlers (and any other `routes/*.py` that does `return app.<svc>` then derefs — `routes/ide.py:56` `return app.agent` is the same shape).
- [ ] Surface failed service init on `/health` (degraded), so monitoring/alerts fire instead of the failure being visible only as endpoint 500s.
- [ ] Add a bounded re-init/retry (or lazy re-construct on first use) so a transient boot-race self-heals instead of staying dead for the whole uptime.

**Related files:** `bmo/pi/routes/music_api.py` (`_music`, `:135`), `bmo/pi/routes/calendar_api.py` (`_calendar`, `:35`), `bmo/pi/app.py` (`:660-670` music init swallow; calendar init), `bmo/pi/routes/ide.py:56` (same accessor pattern), `bmo/pi/services/music_service.py`.


### [2026-06-23] `bmo / deploy` red on master — health-gated deploy aborts on dirty live checkout (Gate 3) due to concurrent dev-tree writes

- **Category:** infra / CI (deploy reliability)
- **Severity:** high
- **Domain:** bmo (Pi infra/tooling)
- **Discovered by:** ci-failure-triage (2026-06-23 ~08:30Z run)
- **Failed runs:** `28012173813` (target `a349ea7b`, 08:14Z) and `28012662356` (target `dfdc76e2`, 08:23Z) — both `bmo / deploy` on master.

**Root cause:**
`bmo/pi/scripts/deploy.sh` Gate 3 (`git status --porcelain` non-empty → `fail "working tree is dirty; commit/clean before deploying (never auto-stashed)"`, line 157) aborted before any mutation. The Pi's deploy target `/home/patrick/home-lab` is also the shared **dev tree** (deploy.sh explicitly never stashes/clobbers it). At deploy time the tree was dirty from in-flight automation: the `docs/logs/` migration (commit `dfdc76e2`) was still mid-flight — staged deletions of the old-path bridge files `docs/*-LOG.md` / `docs/RESOLVED-*.md` plus unstaged edits to `.gitattributes`, `.gitignore`, and `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`. Confirmed live during triage: the tree flipped clean→dirty within minutes, so it is an **ongoing race**, not a one-off. Not a code defect in deploy.sh — a contention problem between the health-gated deploy and concurrent agents editing the live checkout. Last successful deploy was `88c5f7e5` (07:58Z); master HEAD `717f07a6` is currently **undeployed**.

**Proposed fix:**
- [x] **Immediate (DONE 2026-06-23 ~08:40Z, ci-failure-triage):** migration committed (master HEAD `9dc2e615`, tree clean, no in-flight agents), re-dispatched `bmo / deploy` via `workflow_dispatch` on `9dc2e615` → run `28013620616` **succeeded**; master deploy is green and `9dc2e615` is now deployed (prev last-good was `88c5f7e5`). Original note: once the in-flight `docs/logs` migration is committed and `git status --porcelain` on the Pi is empty, re-dispatch `bmo / deploy` (`gh workflow run "bmo / deploy"`, default target = `origin/master` HEAD) so master lands green and `717f07a6` actually deploys. (Not done by triage: committing/cleaning the tree would have clobbered another agent's half-staged migration.)
- [ ] **Structural:** make deploy independent of the shared dev tree — deploy from a clean ephemeral checkout (dedicated `git worktree` / fresh clone to a deploy-only path), OR have the deploy gate retry/back-off on a *transient* dirty tree (re-poll `status --porcelain` for N seconds before failing) so concurrent agent edits can no longer turn the deploy red.
- [ ] Optionally serialize live-tree-mutating agents against deploys via the existing `home-lab-locks/` lock convention.

**Note (benign, no action):** cancelled run `28012396581` (dnd-app CI, `91096a31`) was a concurrency supersede — the next master push `dfdc76e2` ran dnd-app CI green (`28012454736`).
*(none currently logged)*


## Medium

### [2026-06-24] Calendar token never re-persisted after in-memory refresh — monitoring fires a perpetual false CRITICAL “auto-refresh is not happening” while the calendar is actually working

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — journal showed 8× CRITICAL `google_calendar: Calendar token expired and auto-refresh is not happening — run reauth_calendar.py` on the current `bmo.service` uptime

**Description:**
On every `bmo.service` uptime, ~1h after boot the calendar monitor escalates to a CRITICAL alert telling the user to re-authorize the calendar — but the calendar is fully functional. Verified live: `GET /api/calendar/events` returns real upcoming events (200), yet `config/token.json` still has its boot-time `expiry` (`2026-06-24T23:06:22Z`) and an mtime frozen at process start (`16:06:23`), i.e. it has not been rewritten in the >2.5h since the access token expired. So the on-disk token looks permanently expired even though the live client keeps refreshing in memory. The result is an actionable-looking CRITICAL that is a false positive, plus on-disk token drift.

**Reproduction:**
1. Start `bmo.service` with a valid `token.json` (valid `refresh_token`, ~1h access-token lifetime).
2. Wait past the access-token `expiry` (+10 min monitor grace).
3. Observed: `services/monitoring.py::_check_calendar_token` emits `Severity.CRITICAL google_calendar: “auto-refresh is not happening — run reauth_calendar.py”`, while `/api/calendar/events` still returns events and `token.json` mtime/expiry never advance.

**Expected behavior:** When the live client successfully auto-refreshes, the new access token + expiry should be persisted to `token.json` so the file-based monitor sees a fresh token; the CRITICAL should only fire when refresh genuinely fails (revoked / `invalid_grant` / missing `refresh_token`).

**Hypothesis / root cause (confirmed):** Two decoupled layers.
- `services/calendar_service.py::_get_service()` caches the built client in `self._service` (`:98-99`) and only runs the refresh-and-persist block (`creds.refresh(Request())` → `_write_token_json(creds.to_json())`, `:121-125`) on the **cold-build** path when `self._service is None`. After the first successful build, every later call returns the cached client. The underlying `google` `Credentials` object auto-refreshes **in memory** on API calls (so the feature keeps working), but that refreshed token is never written back to `token.json` — `_write_token_json` is not called again for the life of the process.
- `services/monitoring.py::_check_calendar_token` (`:1562-1615`) decides health purely from the on-disk `token.json` `expiry`. Because of the above, the on-disk expiry is permanently stale, so after the 10-min grace (`expired_for > 600`) it always escalates to CRITICAL even though refresh is happening (just not persisted). The monitor and the live client are looking at two different sources of truth.

**Proposed fix / improvement:**
- [ ] Persist the refreshed credentials after a successful in-memory refresh — e.g. register a refresh callback / re-`_write_token_json(creds.to_json())` after API calls, or have `_with_service_retry` write the token when `creds.expiry` advances, so `token.json` tracks the live token.
- [ ] Have the monitor consult the live credential state (or a status the calendar service publishes after a successful refresh) rather than the file `expiry` alone, so a working auto-refresh does not read as CRITICAL.
- [ ] (Optional) Suppress/downgrade the CRITICAL when a recent successful calendar API call is observed, to stop alert fatigue.

**Related files:** `bmo/pi/services/calendar_service.py` (`_get_service` `:98-146`, `_write_token_json` `:79`, `_with_service_retry` `:148-160`), `bmo/pi/services/monitoring.py` (`_check_calendar_token` `:1491-1655`), `bmo/pi/config/token.json` (runtime, gitignored).

**Related entries:** see the [2026-06-24] `/api/music/*` + `/api/calendar/events` 500-storm entry above — that covers None-deref 500s on init failure; this is a distinct defect where the service inits fine but refresh persistence + the monitor disagree.


### [2026-06-24] `bmo-voice-canary.service` ExecStart points at stale module path `services.voice_canary` — unit fails every run since the `services/voice/` refactor

- **Category:** bug, config
- **Severity:** medium
- **Domain:** bmo (Pi infra/tooling)
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `systemctl --failed` showed `bmo-voice-canary.service` failed

**Description:**
`bmo-voice-canary.service` is in a **failed** state and has failed on every scheduled run (timer cadence 06:30 / 18:30; last failure 2026-06-24 06:34:27 MDT). The synthetic STT/voice-path regression canary therefore never runs, so the safety net it provides — detecting a real voice-path regression while `/health` stays green — is effectively dead and the failure is silent (only visible via `systemctl --failed`).

**Reproduction:**
1. `systemctl status bmo-voice-canary.service`
2. Observed: `python: No module named services.voice_canary` → `status=1/FAILURE`.

**Expected behavior:** The oneshot runs `services.voice.voice_canary` successfully and writes its pass/fail status file for `services/monitoring.py`.

**Hypothesis / root cause (confirmed):** Commit `7ff69808` ("refactor(bmo): group 9 voice/audio modules into services/voice/ subpackage") moved `voice_canary.py` from `services/` to `services/voice/`, so the importable module is now `services.voice.voice_canary`. The unit's `ExecStart` was not updated and still runs `-m services.voice_canary`. The repo unit file (`bmo/pi/systemd/bmo-voice-canary.service:10`) and the installed `/etc/systemd/system/bmo-voice-canary.service` are byte-identical (no drift) — both carry the stale path, so this is a real bug in the tracked unit, not installed-vs-repo drift. `bmo/docs/SYSTEMD.md:22` documents the same stale `-m services.voice_canary`.

**Proposed fix / improvement:**
- [ ] Update `ExecStart` in `bmo/pi/systemd/bmo-voice-canary.service` to `... -m services.voice.voice_canary`.
- [ ] Update the matching reference in `bmo/docs/SYSTEMD.md` (and `bmo/pi/README.md` if it carries the same string).
- [ ] Reinstall/`daemon-reload` the unit on the Pi after the doc/unit fix lands (deploy step).

**Related files:** `bmo/pi/systemd/bmo-voice-canary.service`, `bmo/pi/services/voice/voice_canary.py`, `bmo/docs/SYSTEMD.md`, `bmo/pi/README.md`.

**Update [2026-06-24] (bmo-errors):** This entry’s “byte-identical (no drift)” claim is now STALE — the live box was hand-patched but the repo was not. The **installed** `/etc/systemd/system/bmo-voice-canary.service` now reads `ExecStart=... -m services.voice.voice_canary` (correct — unit no longer in `systemctl --failed`, now `inactive dead` waiting on its timer), while the **repo** `bmo/pi/systemd/bmo-voice-canary.service:10` still carries the stale `-m services.voice_canary`. So there is now real **installed-vs-repo config drift**: the repo unit is still broken and a redeploy/reinstall (which treats the repo as source of truth) would re-break the canary. The repo fix in the checklist above is still required to make the box and source agree.


## Low

### [2026-06-24] `init_tv_remote` blocks startup ~5s and logs an ERROR traceback every boot when the TV is unreachable (`adb connect` timeout)

- **Category:** bug, performance
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — journal shows `[ERROR] [bmo] [tv] ADB connect failed` + a `subprocess.TimeoutExpired` traceback on every `bmo.service` boot

**Description:**
At startup `init_tv_remote()` runs `subprocess.run(["adb", "connect", f"{TV_IP}:5555"], timeout=5)` synchronously on the app init path. When the TV is off/unreachable (the normal case much of the day) this blocks for the full 5s and then raises `subprocess.TimeoutExpired`, which is caught but logged via `log.exception` — so a full traceback at ERROR level lands in the journal on every boot. Observed alongside the boot-time `monitoring: Expected ports not listening: BMO Flask (:5000)` warning, i.e. the 5s adb timeout delays the Flask bind. Functionally harmless (it is caught, and a 60s background reconnect thread exists), but it is recurring log noise rated ERROR for an expected condition, plus avoidable startup latency.

**Reproduction:**
1. Power off / disconnect the TV at `TV_IP`.
2. Restart `bmo.service`.
3. Observed: ~5s stall, then `[tv] ADB connect failed` ERROR + `TimeoutExpired: Command [adb, connect, 10.10.20.194:5555] timed out after 5 seconds` traceback at `routes/tv_api.py:133`.

**Expected behavior:** A TV that is simply off should not produce an ERROR-level traceback or block startup. Log it at INFO/DEBUG (“TV not reachable, will retry in background”) and/or move the initial `adb connect` off the synchronous startup path into the existing `_tv_bg_reconnect` thread.

**Hypothesis / root cause:** `routes/tv_api.py::init_tv_remote` (`:128-146`) does the blocking `adb connect` inline and uses `log.exception("[tv] ADB connect failed")` in its `except`, which always emits a traceback at ERROR even for the benign “TV is off” timeout.

**Proposed fix / improvement:**
- [ ] Downgrade the caught-timeout log from `log.exception` (ERROR+traceback) to `log.info`/`log.debug` for the expected unreachable case.
- [ ] Move the initial `adb connect` into the background reconnect thread so startup (and Flask bind) is not delayed by an unreachable TV.

**Related files:** `bmo/pi/routes/tv_api.py` (`init_tv_remote` `:128-146`, `_tv_bg_reconnect` `:160+`).


### [2026-06-24] Pi hit the soft thermal limit (`get_throttled=0x80000`) — CPU peaked 82°C under load and the fan duty curve caps below max

- **Category:** performance
- **Severity:** low
- **Domain:** bmo (Pi infra/tooling)
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `bmo.service` journal logged 2× `[CRITICAL] pi_cpu_temp: CPU temperature critical` (82.0°C, 81.5°C) in 24h

**Description:**
`vcgencmd get_throttled` returns `0x80000` (bit 19 = “soft temperature limit has occurred”), and the monitor recorded CPU spikes to 82.0°C / 81.5°C (CRITICAL) plus several 73–79°C elevated readings over 24h. At scan time the Pi was idle/cool (49°C) and not actively throttling (no bits 0–3 set), so this is intermittent under load (e.g. local LLM inference — `gemma3:4b` is warmed in-process). The fan controller (`bmo-fan.service`) is running and responding, but its duty observed capping around `227/255` even at ~75°C rather than ramping to full 255, so peak load can still cross the soft limit before the fan saturates.

**Reproduction:**
1. Drive sustained CPU load (e.g. Ollama inference) on the Pi.
2. Observe `journalctl -u bmo.service | grep "temperature critical"` and `vcgencmd get_throttled` (`0x80000`).

**Expected behavior:** Under sustained load the fan should reach full duty early enough to keep the SoC below the soft thermal limit, and ideally the system should avoid recurring CRITICAL temp events.

**Hypothesis / root cause (speculative):** The fan duty curve in `hardware/fan_control.py` tops out below 255 (or ramps too gently) relative to the thermal load of in-process LLM inference, so worst-case load briefly outruns cooling. Could also be a heatsink/airflow limitation. Needs measurement before tuning.

**Proposed fix / improvement:**
- [ ] Review the duty curve in `bmo/pi/hardware/fan_control.py` — allow full 255 duty (and an earlier/steeper ramp) above ~75°C.
- [ ] Consider capping/queuing concurrent LLM inference, or verify heatsink/airflow, if the soft limit keeps recurring.

**Related files:** `bmo/pi/hardware/fan_control.py`, `bmo/pi/services/monitoring.py` (`pi_cpu_temp` check).


### [2026-06-24] aiohttp `NotAppKeyWarning` in `dm_bot_control.py` — string `app["bot"]` keys instead of `web.AppKey` (24 warnings in the test run)

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — full `pytest` run (1281 passed, 6 skipped) emitted 24× `NotAppKeyWarning` from `bmo/pi/bots/dm_bot_control.py`

**Description:**
The DM bot control plane stores and reads its bot handle on the aiohttp app via the string key `app["bot"]` (set at `dm_bot_control.py:365`; read at `:59,119,160,180,190,200,213,247,287,303,…`). aiohttp now recommends typed `web.AppKey` instances and emits `NotAppKeyWarning` for plain-string keys; string keys are slated for eventual deprecation. No functional impact today — just forward-compat debt and test-output noise.

**Proposed fix / improvement:**
- [ ] Define a module-level `BOT_KEY = web.AppKey("bot", commands.Bot)` (or appropriate type) and switch the set/read sites to it.

**Related files:** `bmo/pi/bots/dm_bot_control.py` (`:365` set; reads at `:59,119,160,180,190,200,213,247,287,303`).


---

> dnd-app issues: `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`. BMO future ideas / design gotchas / observations: `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`. Security (any domain): `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO issues: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
