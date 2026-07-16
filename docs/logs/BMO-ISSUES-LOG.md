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

*(none currently logged)*

### [2026-07-15] Google Calendar integration down since Jul 8 — refresh token `invalid_grant`, auto-refresh cannot recover, monitor fires CRITICAL hourly

- **Category:** bug, config
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `bmo.service` journal Jul 8–15

**Description:**
Every Google Calendar cache refresh has failed since 2026-07-08 00:57 (first hit), continuously since 2026-07-11 23:56 — ~986 `[calendar] Cache refresh failed: Google Calendar refresh failed (token revoked or expired)` journal lines in the Jun 20–Jul 15 window, repeating every 5 minutes, plus a `[monitor][CRITICAL] google_calendar: Calendar token expired and auto-refresh is not happening` alert roughly hourly. Google is returning `invalid_grant` on the refresh call (`services/calendar/service.py:170-177`), which auto-refresh can never recover from — calendar features (agenda queries, calendar agent, event creation) have been dead for a week. `config/token.json` was last written 2026-06-29 02:11 in BOTH the deploy and dev checkouts.

**Reproduction (if bug):**
1. `journalctl -u bmo.service --since 2026-07-12 | grep google_calendar`
2. Observed: refresh failure every 5 min; CRITICAL monitor alert every ~60 min.

**Expected behavior:** Calendar cache refreshes succeed; a revoked token surfaces once as an actionable alert, not a week of 5-minutely journal noise.

**Hypothesis / root cause:** Google returned `invalid_grant`: the refresh token was revoked or expired server-side, not a code regression. Token minted Jun 29, died ~Jul 6–8 — consistent with the 7-day refresh-token lifetime Google imposes on OAuth apps whose consent screen is in **Testing** (unpublished) status (speculative — verify in the Google Cloud console). If that is the cause, weekly manual reauth recurs forever until the OAuth app is published (or moved to a flow without that limit).

**Proposed fix / improvement:**
- [ ] Owner: re-authorize via `services/reauth_calendar.py` run from the DEPLOY checkout (`/home/patrick/home-lab-deploy/bmo/pi`) to restore service now. (Human action — needs browser/code paste; agents cannot do this.)
- [ ] Check the OAuth consent-screen publishing status; if "Testing", publish the app so refresh tokens stop expiring every ~7 days.
- [ ] Back off the failure path: after N consecutive `invalid_grant` failures, stop retrying every 5 min (the outcome cannot change) and keep only the periodic monitor alert.
- [ ] Fix the error-message hint (`services/calendar/service.py:174-177`), which tells the operator to reauth in the DEV tree (`cd ~/home-lab/bmo/pi`) — the live token lives in the deploy checkout; reauthing in the dev tree would deepen the split-brain logged 2026-07-02.

**Blocked by:** human reauth (browser + credentials).

**Related files:** `bmo/pi/services/calendar/service.py:165-178,384`, `bmo/pi/services/reauth_calendar.py`, `bmo/pi/config/token.json` (deploy checkout), `bmo/pi/services/monitoring.py` (google_calendar check)

**Related entries:** [2026-07-02] "BMO_HOME never wired into the live units" (the dev-tree reauth hint is another symptom of the same dev-tree path assumption).

**Update [2026-07-15, bmo-errors]:** A re-auth attempt was observed FAILING today: the web UI's auth-status poller hit `/api/calendar/auth/status` every ~2 s from 18:17:11 to ~18:23 and every probe still returned `invalid_grant` — the token remains dead after the attempt (failures continue as of 19:42). Side-observation for the "back off the failure path" fix item: each status poll forces a live Google token-endpoint round trip (`api_calendar_auth_status` sets `calendar._service = None` then calls `get_next_event()`, `routes/calendar_api.py:408-425`) and logs a full two-part traceback, so one ~6-min wait window added ~180 Google OAuth hits + thousands of journal lines.

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

### [2026-07-15] Status board writes get rate-limited by Discord — 1,566 message-edit 429s in one night (Jul 12) and recurring ~8-min channel-topic 429 stalls; no debounce between health flaps and Discord PATCHes

- **Category:** bug, performance
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `bmo-social-bot.service` journal Jul 8–15 + `status_board_cog.py` read

**Description:**
Two related rate-limit patterns on the status-board channel (`1478859146810888242`):

1. **Message-edit storm.** On Jul 12 00:06–~02:30 — the same window as the fish_audio outage/flap (168 monitor warnings + repeated down→RECOVERY cycles that night) — the board's pinned-message PATCH (`channels/<id>/messages/<id>`) drew **1,566 consecutive HTTP 429s**, one every ~6 s for ~2.5 h, each logging `We are being rate limited ... Retrying in ~2.5 seconds`. discord.py block-retried every time, so the bot spent the night in a self-sustaining 429→retry→429 cycle against the same message.
2. **Channel-topic stalls (ongoing).** `render_to_message()` also PATCHes the channel topic whenever the rendered count summary changes (`status_board_cog.py:1016`). Discord caps channel edits at ~2 per 10 min, so an extra change gets a 429 with `Retrying in ~480 s` — 10 such events on Jul 15 alone (09:38–18:23), 15 in the last 7 days. discord.py sleeps out that retry *inside* `await channel.edit(...)`, which runs under `self._lock` in `render_to_message()`, so for up to ~8 min per event the board message, critical-incident pings, and presence updates are all frozen.

**Reproduction (if bug):**
1. `journalctl -u bmo-social-bot.service --since 2026-07-12 --until 2026-07-13 | grep -c "rate limited"` → 1,570.
2. `journalctl -u bmo-social-bot.service --since -24h | grep "rate limited"` → topic-PATCH 429s with ~480 s retries.

**Expected behavior:** Health flapping reaches the board only at the rate Discord permits; a rate-limited topic update is skipped/deferred, never blocking the whole render path for minutes; no multi-hour 429 storms.

**Hypothesis / root cause:** `render_to_message()` (60 s `tasks.loop`) writes to Discord whenever its row-hash / topic string changes, with no debounce, no minimum interval, and no flap-damping between the monitor and the board. A flapping health check changes the hash nearly every cycle; sustained edit pressure exhausts Discord's buckets, and blocking retries plus the next cycle's edit keep the pressure on (storm mechanism inferred from journal timing — the Jul 11–12 fish_audio flap is the correlated trigger). Secondary suspect for the repeating topic 429s: the guard `channel.topic != topic` compares against discord.py's *cached* topic, which can go stale after a dropped/failed edit, making the loop re-attempt the same PATCH every cycle (speculative — needs a gateway-cache check).

**Proposed fix / improvement:**
- [ ] Debounce Discord writes: minimum interval between `msg.edit()` calls (≥60 s) and between `channel.edit(topic=…)` calls (≥10 min — Discord's own cap), coalescing intermediate changes.
- [ ] Move the topic PATCH out of the lock-held render path (own task + cooldown) so a 429 retry can never stall board renders / critical pings.
- [ ] Add flap-damping upstream (skip re-render for a check that flipped >N times in M minutes) or render only damped severity into the topic.
- [ ] After K consecutive 429s on the board message, skip edits for a cool-off window instead of letting discord.py block-retry indefinitely.

**Blocked by:** none

**Related files:** `bmo/pi/bots/social/status_board_cog.py:963-1024` (loop / `render_to_message` / topic edit), `bmo/pi/services/status_board.py:528-549` (`render_topic`), `bmo/pi/services/monitoring.py` (flap source)

**Related entries:** BMO-RESOLVED [2026-06-22] "Location provider order wastes a guaranteed-failing request (ipapi 429)" — same "no backoff against a known-limited endpoint" class.

---

### [2026-07-15] Python 3.11→3.14 bump landed for CI/Docker but the Pi cannot follow — no `python3.14` on the host, live venvs still 3.11.2, `install-venv.sh` default now fails

- **Category:** config, debt
- **Severity:** medium
- **Domain:** bmo (Pi infra)
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — follow-up on commit `ed0717e7` (Jul 3)

**Description:**
Commit `ed0717e7` bumped `bmo/pi/.python-version` to 3.14 and the Docker base image to `python:3.14-slim-bookworm`, and `bmo-pi-pytest.yml` reads `python-version-file: bmo/pi/.python-version` — so CI now tests ONLY Python 3.14. But the Pi host has no `python3.14` binary (system python is 3.11.2; `which python3.14 python3.12` both empty), and both live venvs (deploy checkout + dev tree) still run **3.11.2**, with `requirements.txt` still headed "autogenerated by pip-compile with Python 3.11". Consequences:

1. **Test/prod interpreter skew:** CI green no longer says anything about the interpreter production actually runs; a 3.11-only or 3.14-only breakage is invisible until it hits the live box.
2. **Broken rebuild path:** `scripts/install-venv.sh` defaults `PY="${1:-python3.14}"` — a documented venv rebuild on the Pi now dies at `python3.14: command not found` unless the operator remembers to pass `python3.11` (which silently re-cements the skew).
3. **Stale lockfile compile target:** environment markers in the 3.11-compiled lockfile may resolve differently under 3.14, so the CI/Docker install is not exactly the pinned set that was compiled.

**Expected behavior:** the interpreter CI tests, the Docker image, the lockfile compile target, and the live Pi venv agree — or the transition plan explicitly covers the Pi host half.

**Hypothesis / root cause:** the bump was driven by the Docker/CI side (unblocking the base-image update by dropping abandoned `tflite-runtime`); the Pi-host half of the migration — getting a 3.14 interpreter onto bookworm (uv / source build; bookworm apt has no 3.12+), rebuilding the venv, recompiling requirements under 3.14 — was never scheduled.

**Proposed fix / improvement:**
- [ ] Owner decision: install Python 3.14 on the Pi (uv or source build) + rebuild venv + `pip-compile` under 3.14; OR keep the Pi on 3.11 and make CI test 3.11 too (matrix, or revert `.python-version`), keeping 3.14 for the Docker image only.
- [ ] Until then, make `install-venv.sh` fall back to the newest available `python3.x` instead of hard-defaulting to a binary the Pi does not have.

**Blocked by:** owner decision on the upgrade path.

**Related files:** `bmo/pi/.python-version`, `bmo/pi/scripts/install-venv.sh:6`, `bmo/pi/requirements.txt:2`, `.github/workflows/bmo-pi-pytest.yml:42`, `bmo/docker/Dockerfile:2`

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
- [x] Cap local-inference concurrency / thread count, or use a smaller/quantized local model, to bound peak CPU heat. *(done 2026-07-02 — see update below)*
- [ ] Re-tune the fan curve to reach 255 duty earlier (before 80°C) *(done 2026-06-22, `2ebb90e1` — full duty at 75°C; the Jun 28–29 alerts show that curve already saturated)*, and/or verify heatsink/airflow *(hardware — still open)*.
- [ ] Investigate the recurring Gemini 503s (see fallback trigger) so local fallback isn't entered as often. *(partly addressed — see update below)*

**Update [2026-07-02, thermal resolver]:** Software side implemented on `auto/bmo-thermal`:
- **Ollama thread cap** — Pi-side `OLLAMA_OPTIONS` / `OLLAMA_PLAN_OPTIONS` in `agent.py` now set `num_thread: 3` (of the Pi's 4 cores; override `BMO_LOCAL_NUM_THREAD`), so a local-fallback burst can no longer peg every core — bounding peak package heat and keeping the voice pipeline/monitoring responsive during fallback.
- **Thermal admission gate** — new `bmo/pi/services/thermal_gate.py`, applied in `agent._local_chat` immediately before inference: if the SoC is already ≥ 80°C (the monitoring CRITICAL threshold) it waits up to 20 s for the fan to pull the temp below 76°C before starting; if still hot after the bounded wait it clamps `num_predict` to 256 so the burst is short instead of sustained. It never refuses a request and is a strict no-op when the thermal zone is unreadable (dev/CI). Env knobs `BMO_THERMAL_GATE_C` / `RESUME_C` / `MAX_WAIT_S` / `POLL_S` / `HOT_NUM_PREDICT` / `ZONE`, escape hatch `BMO_THERMAL_GATE_DISABLE=1`. Tests: `bmo/pi/tests/test_thermal_gate.py` (11 green).
- **Gemini 503s** — the cloud path already retries transient 5xx (`_post_with_retry`, 3 attempts with backoff, `services/cloud_providers.py`) and supports opt-in cross-vendor failover via `BMO_LLM_FAILOVER_MODEL` (currently unset). Setting that env to a Claude/Groq model would cut local-fallback entries substantially — left as an owner config decision, not code.

**Kept Active (hardware remains):** the cooling solution itself is saturated (fan already at full duty by 75°C) — verifying heatsink contact / case airflow is a hardware task for Gavin. The software changes take effect via the normal auto-deploy (no manual service restart performed). Close once a sustained local-fallback episode passes with no `pi_cpu_temp` CRITICAL / `THROTTLED NOW` alert — or downgrade to low if the gate + thread cap hold it to brief warnings.

**Update [2026-07-15, bmo-errors]:** Still recurring post-mitigation, but milder: single `pi_cpu_temp` CRITICAL at 81.5°C on Jul 15 09:36, and **zero** `THROTTLED NOW` alerts in the Jul 5–15 journal (vs Jun 28–29's 84.8°C + active throttle) — the thread cap + thermal gate appear to be holding it below the throttle point. Keeping open per the close criterion; the hardware airflow/heatsink check remains outstanding.

**Related files:** `bmo/pi/hardware/fan_control.py`, `bmo/pi/services/monitoring.py`, local-LLM/agent inference path (`bmo/pi/agents/`), `bmo/pi/systemd/bmo-fan.service`, `bmo/pi/agent.py`, `bmo/pi/services/thermal_gate.py`

---


## Low

### [2026-07-15] New board-decision runtime files not gitignored — `data/board_decisions_outbox.jsonl` + `data/nudges/` leave the deploy checkout permanently dirty

- **Category:** config
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `git status` of `/home/patrick/home-lab-deploy`

**Description:**
The board-approval bridge / nudge work writes `bmo/pi/data/board_decisions_outbox.jsonl` and `bmo/pi/data/nudges/` at runtime, but `.gitignore` does not cover them (it enumerates specific data files; the sibling `vtt_sync_outbox.jsonl` has an entry at `.gitignore:124`, these do not). Both currently show as untracked (`??`) in the deploy checkout. Consequences: the deploy checkout is never `git status`-clean (dirty-tree checks/canaries can false-positive), any `git clean -fd` in either checkout would DELETE live runtime state (pending board decisions / nudges), and an agent could accidentally commit runtime data.

**Proposed fix / improvement:**
- [ ] Add `bmo/pi/data/board_decisions_outbox.jsonl` and `bmo/pi/data/nudges/` to `.gitignore` (mirror the `vtt_sync_outbox.jsonl` pattern).

**Related files:** `.gitignore:124`, `bmo/pi/data/board_decisions_outbox.jsonl` (runtime), `docs/BOARD-APPROVAL-BRIDGE.md`

**Update [2026-07-15, bmo-errors]:** The class is growing — the deploy checkout now also shows untracked `bmo/pi/data/board_decisions_cursor.<agent-id>` (×7, written by the outbox consumers, all active today) and a `bmo/pi/data/dm_session_state.json.pre-reconcile-20260715` backup from today's DM-state reconcile. Whatever ignore fix lands should cover `board_decisions_cursor.*` and `*.pre-reconcile-*` too.

---

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

**Update [2026-07-02, bmo-resolver]:** Code side landed on `auto/bmo-resolver`: `bmo/pi/systemd/bmo.service` now has `ExecStopPost=-/bin/sh -c "command -v adb >/dev/null 2>&1 && adb kill-server || true"` so the TV worker's adb fork-server is torn down after every stop instead of straddling instances (best-effort — never fails the unit). Takes effect after the unit file is installed + daemon-reloaded on the next approved restart window (covered by the existing `restart-bmo` board item), which is also when the KillMode verification and the one-time stale pid cleanup can happen. Kept open pending that restart-window verification.

**Blocked by:** restart gating (verification requires a service restart — observe, don't trigger).

**Related files:** `bmo/pi/systemd/bmo.service`, `bmo/pi/services/tv_worker.py` (adb spawner), `bmo/pi/scripts/deploy.sh` (unit install / daemon-reload ordering)

**Related entries:** BMO-RESOLVED-ISSUES [2026-06-29] "`bmo.service` `KillMode=process` leaked orphan children" (this is its follow-up: fix present but not observed effective). [2026-07-02] ffplay 120s playback hang (Medium) — possible consumer of the leaked device handle. [2026-06-29] TV/ADB startup connection failure (source of the adb process).

---

### [2026-07-03] `test_ram_floor_blocks_and_never_launches` is timing-flaky — intermittently reddens master pushes

- **Category:** test / flaky (timing-sensitive)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** integrator
- **During:** daily integration (2026-07-03 run) — the same tree passed on `auto/integrator` CI, then failed on the `master` push CI minutes later under machine load

**Description:**
`bmo/pi/tests/test_run_check.py::test_ram_floor_blocks_and_never_launches` asserts `elapsed >= 2` against `RUN_CHECK_TIMEOUT_S=2` with `RUN_CHECK_POLL_INTERVAL_S=1`. The wall-clock margin is zero, so on a loaded runner the measured `time.monotonic()` delta can land a few ms under 2.0 and the assert fails with "gate should have waited for the full timeout before giving up" (1 failed, 1539 passed). It is non-deterministic: green on the branch run, red on the master push run for the identical commit tree. Not a regression from the 2026-07-03 integrator merge (that merge only touched a dnd-app test file + two READMEs, nothing near run-check).

**Root cause:** brittle exact-boundary timing assertion (`elapsed >= 2` with a 2 s timeout and 1 s poll) has no tolerance for scheduler jitter / process-startup overhead measurement skew under CPU pressure.

**Proposed fix / improvement (bmo owner):**
- [ ] Loosen the lower-bound assertion to allow small negative jitter (e.g. `elapsed >= TIMEOUT_S - 0.25`) or raise `RUN_CHECK_TIMEOUT_S` for this test and keep a comfortable margin.
- [ ] Optionally assert the timeout upper bound too (did not run *and* returned promptly after the timeout) rather than an exact floor.

**Related files:** `bmo/pi/tests/test_run_check.py` (`test_ram_floor_blocks_and_never_launches`), `bmo/pi/scripts/run-check.sh`

---
