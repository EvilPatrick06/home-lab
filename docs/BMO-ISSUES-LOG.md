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

### [2026-06-22] Discord DM + Social bots swallow startup crashes and exit 0 — `Restart=on-failure` never fires; bots stay down indefinitely

- **Category:** bug
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (read-only journal review + code read)

**Description:**
Both Discord bots catch any startup exception in their top-level run coroutine, log it, and return normally instead of re-raising. Because the process then exits 0, systemd `Restart=on-failure` does not trigger, so a single startup crash takes the bot down until a human restarts it. Observed live: both `bmo-dm-bot` and `bmo-social-bot` crashed at the 2026-06-20 00:45 boot and have been `inactive (dead)` for 2+ days (`systemctl is-active` returns `inactive` for both; no process running).

**Reproduction (if bug):**
1. Cause `await _bot.start(...)` to raise on startup (e.g. a transient network/TLS failure at boot).
2. The `except Exception as e:` block logs "DM bot crashed" / "Social bot crashed" and the coroutine returns.
3. `asyncio.run(...)` / `run_until_complete(...)` completes; process exits 0.
4. Observed: systemd logs `Deactivated successfully` (status=0/SUCCESS); `Restart=on-failure` does not restart; bot stays down.

**Expected behavior (if bug):** an unexpected startup crash should exit non-zero so `Restart=on-failure` + `RestartSec=10` brings the bot back (or the bot should retry internally with backoff). Only `discord.LoginFailure` (a real config error) should exit 0.

**Hypothesis / root cause:** the broad `except Exception` was meant to log crashes cleanly, but combined with `Restart=on-failure` it defeats auto-recovery. The crash handler should re-raise / `raise SystemExit(1)` for generic exceptions while keeping LoginFailure as a clean exit.

**Proposed fix / improvement:**
- [ ] After logging a non-LoginFailure crash, `raise` / `raise SystemExit(1)` so systemd restarts.
- [ ] Or add internal reconnect/backoff for transient failures.
- [ ] Consider `Restart=always` for these transient-tolerant services.

**Related files:** `bmo/pi/bots/discord_dm_bot.py` (`_run_dm_bot`, ~line 2041; `__main__` ~2076), `bmo/pi/bots/discord_social_bot.py` (`_run_social_bot`, ~line 6949; `__main__` ~6978)

**Related entries:** [2026-06-22] Bot services start before NTP clock sync at boot


## Medium

### [2026-06-22] Calendar monitor reports a long-expired token as transient "waiting for refresh" forever — never escalates, re-alerts every monitor cycle

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` journal review + monitoring.py / calendar_service.py read)

**Description:**
On the live Pi, `config/token.json` has been expired since 2026-06-20T06:57Z (~66h at scan time) and has NOT been rewritten since 2026-06-19 23:58 (its mtime). The health monitor emits `google_calendar: 📅 Calendar token expired — waiting for refresh` (Severity.WARNING, status `degraded`) on EVERY monitor cycle — 154+ identical lines, one per ~60s — yet no auto-refresh ever occurs and there is not a single `[calendar]` refresh-loop log line in the whole boot. Calendar features are effectively down, but the only signal is a perpetual transient-looking WARNING.

Two distinct problems combine here:
1. **No escalation:** `_check_calendar_token` (services/monitoring.py ~1559-1582) treats "expiry in the past AND a refresh_token is present" as `degraded` / "waiting for auto-refresh" indefinitely. It never verifies the refresh actually happened, so a genuinely stuck/revoked token (per the 2026-04-23 resolved entry, recovery can require a *manual* `reauth_calendar.py`) is permanently misclassified as a benign transient instead of an actionable `down`/CRITICAL.
2. **Breaker bypass / log spam:** the resolved-issue circuit-breaker (#6) only backs off statuses `down`/`unknown` (see the `finally` block feeding the breaker). The `degraded` "waiting" branch is excluded, so this exact warning re-fires every single monitor cycle forever — re-introducing the alert/log spam the breaker was added to stop.

**Reproduction (if bug):**
1. Let the calendar access token expire while a refresh_token is present but auto-refresh does not run (observed: poll loop never rewrites token.json; zero `[calendar]` lines).
2. Watch `journalctl -u bmo.service`: `Calendar token expired — waiting for refresh` repeats every ~60s with no resolution.

**Expected behavior (if bug):** after the token has been expired beyond a refresh cycle (e.g. > a few minutes / N consecutive checks) with no successful refresh, escalate to `down`/CRITICAL with the actionable reauth hint, and apply the circuit-breaker backoff to the `degraded` path so it does not re-alert every cycle.

**Hypothesis / root cause:** the `degraded` "waiting for auto-refresh" branch assumes the refresh is imminent and self-healing; it has no time/attempt budget and is excluded from the breaker. The underlying refresh itself also appears not to be happening (token.json untouched, no `[calendar]` lines) — likely the refresh token is invalid and needs manual reauth (cf. resolved 2026-04-23), which is exactly the actionable state the monitor fails to surface.

**Proposed fix / improvement:**
- [ ] Track first-seen-expired time (or a consecutive-expired counter); after a threshold with no successful refresh, set status `down` + Severity.CRITICAL with the reauth command.
- [ ] Feed the `degraded` path into the circuit-breaker (or rate-limit the WARNING) so it does not log every ~60s.
- [ ] Optionally have the monitor (or a watchdog) trigger / verify an actual `creds.refresh()` rather than only reading the file.

**Related files:** `bmo/pi/services/monitoring.py` (`_check_calendar_token`, ~1495-1620), `bmo/pi/services/calendar_service.py` (`_get_credentials`, `_poll_loop`)

**Related entries:** resolved 2026-04-23 "Google Calendar `invalid_grant`"; resolved monitoring #6 circuit-breaker

### [2026-06-22] System timezone auto-sync permanently fails — `sudo -n timedatectl` blocked by `NoNewPrivileges=yes`; system stays on wrong TZ + logs error every refresh

- **Category:** config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` journal review + location_service.py read)

**Description:**
`LocationService._sync_system_timezone` (services/location_service.py ~481-509) shells out `sudo -n timedatectl set-timezone <tz>` to align the Pi clocks timezone to the detected location. But `bmo.service` runs with `NoNewPrivileges=yes` (confirmed via `systemctl show bmo.service -p NoNewPrivileges`), which forbids any setuid escalation, so the call fails every time: `[location] Could not set system timezone to America/Chicago: sudo: The "no new privileges" flag is set, which prevents sudo from running as root.` Net effect: the system timezone is never updated by this path (it detects `America/Chicago` but the Pi stays on its default `America/Denver`), and the failure is logged on every location refresh (~every 30 min, `BMO_LOCATION_REFRESH_SECONDS=1800`). `AUTO_SYSTEM_TIMEZONE` is enabled, so the doomed attempt runs each cycle.

This may also cause a real correctness gap: calendar event creation hardcodes `timeZone: "America/Denver"` (calendar_service.py `create_event`) while location reports `America/Chicago` — a stuck system TZ keeps these inconsistent.

**Reproduction (if bug):**
1. Run BMO under a unit with `NoNewPrivileges=yes` (as deployed).
2. Trigger a location refresh that detects a TZ != current system TZ.
3. Observe `[location] Could not set system timezone ...: sudo: The "no new privileges" flag is set ...` and the system TZ unchanged.

**Expected behavior (if bug):** either the timezone is actually applied, or the service does not repeatedly attempt a privileged action it can never perform (and does not log an error every 30 min).

**Hypothesis / root cause:** `NoNewPrivileges=yes` (a hardening setting on the unit) is fundamentally incompatible with `sudo`. A sudoers NOPASSWD rule will NOT help under NoNewPrivileges. timedatectl set-timezone needs either polkit (via DBus, not sudo) or the privilege drop relaxed.

**Proposed fix / improvement:**
- [ ] Use the DBus/polkit path (e.g. `busctl`/`timedatectl` via system bus with a polkit rule) instead of `sudo`, which works under NoNewPrivileges.
- [ ] OR gate the attempt behind a capability probe and disable `AUTO_SYSTEM_TIMEZONE` (or log once, not every cycle) when escalation is unavailable.
- [ ] Verify the intended deployment TZ vs the hardcoded `America/Denver` in `create_event`.

**Related files:** `bmo/pi/services/location_service.py` (`_sync_system_timezone` ~481), the `bmo.service` unit (NoNewPrivileges), `bmo/pi/services/calendar_service.py` (`create_event` hardcoded timeZone)

**Related entries:** [2026-06-22] Location provider order wastes a guaranteed-failing request (ipapi 429)

### [2026-06-22] Bot services start before NTP clock sync at boot — TLS "certificate is not yet valid" crash

- **Category:** config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (journal review of the 2026-06-20 boot)

**Description:**
At the 2026-06-20 00:44 boot, both bots started ~5s later and immediately failed connecting to `gateway.discord.gg:443` with `SSLCertVerificationError: certificate is not yet valid`. This is a clock-skew-at-boot symptom: the Pi clock was behind real time before `systemd-timesyncd` corrected it, so Discord's TLS cert looked "not yet valid". The bot units order only on `network-online.target`, not on time sync, so they can start before the clock is correct. (`timedatectl` now shows the clock synchronized — the failure window is boot-time only.) This SSL failure is the trigger that then hits the swallow-and-exit-0 bug above, leaving the bots down for days. The surfaced crash text was `'NoneType' object has no attribute 'sequence'` — discord.py's gateway/reconnect path NPEs after the TLS handshake fails, and the bots report it as a generic crash.

**Reproduction (if bug):**
1. Boot the Pi with the clock behind real time (no/empty RTC seed, before timesyncd corrects).
2. Bot services start on `network-online.target` before time sync.
3. TLS to `gateway.discord.gg` fails: "certificate is not yet valid".

**Expected behavior (if bug):** bots should not attempt to connect until the clock is sane.

**Hypothesis / root cause:** missing `After=time-sync.target` + `Wants=time-sync.target` ordering (and/or no fake-hwclock seeding) means `network-online.target` precedes a correct clock.

**Proposed fix / improvement:**
- [ ] Add `After=time-sync.target` and `Wants=time-sync.target` to both bot unit `[Unit]` sections.
- [ ] Verify fake-hwclock / RTC seeding so the boot clock is not wildly behind.
- [ ] Combine with internal connect retry/backoff (see related bug).

**Related files:** `bmo/pi/kiosk/bmo-dm-bot.service`, `bmo/pi/kiosk/bmo-social-bot.service`

**Related entries:** [2026-06-22] Discord DM + Social bots swallow startup crashes and exit 0


## Low

### [2026-06-22] Location provider order wastes a guaranteed-failing request each refresh — ipapi.co returns HTTP 429 every cycle

- **Category:** config
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` journal review + location_service.py read)

**Description:**
`_PROVIDERS` (services/location_service.py ~97) lists `https://ipapi.co/json/` FIRST, then `https://ipwho.is/`. On this Pi, ipapi.co returns `429 Too Many Requests` on every refresh (observed every ~30 min: `[location] Provider failed (https://ipapi.co/json/): 429 ...`). The loop then falls through to ipwho.is, which succeeds — so location still works, but every refresh cycle pays one guaranteed-failing HTTP request (up to an 8s timeout window) + a log line before falling back. The free ipapi.co tier is evidently over quota / blocked for this IP, so it will keep 429-ing.

Not blocking (fallback works), but pure waste + recurring log noise. Logging per the "log even minor things" directive.

**Proposed fix / improvement:**
- [ ] Reorder `_PROVIDERS` to put a working provider (ipwho.is) first, OR
- [ ] Add a short-lived negative cache / backoff for a provider that returns 429 so it is skipped for a while.
- [ ] Optionally downgrade the repeated 429 log to debug once a fallback has succeeded.

**Related files:** `bmo/pi/services/location_service.py` (`_PROVIDERS` ~97, provider loop ~384-398)

**Related entries:** [2026-06-22] System timezone auto-sync permanently fails (NoNewPrivileges)

### [2026-06-22] Ruff lint backlog: 357 errors across bmo/pi (mostly tests)

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (`ruff check . --statistics`)

**Description:**
`ruff check .` in `bmo/pi` reports 357 errors (198 auto-fixable): 120 F841 unused-variable, 93 F541 f-string-missing-placeholders, 62 E702 multiple-statements-on-one-line-semicolon, 45 E402 module-import-not-at-top, 21 F811 redefined-while-unused, 7 F401 unused-import, 6 E741 ambiguous-variable-name, plus minor. Concentrated in `tests/` (e.g. unused `mock_q` / `mock_thread` mocks in `tests/test_voice_pipeline.py`). Mostly cosmetic, but the F811 redefinitions and F841 unused mocks can hide real test bugs (a patched mock that is never asserted on). Not blocking — lint is evidently not gating CI or these would fail there.

Note: ruff also reports 1 invalid-syntax in a non-source file (a `def f[T](...)` PEP 695 fixture string under a path outside the tracked source set) — not a real source bug; all git-tracked `bmo/**/*.py` compile cleanly under Python 3.11.

**Proposed fix / improvement:**
- [ ] Run `ruff check bmo/pi --fix` for the 198 safe fixes, review the diff.
- [ ] Manually address F811 / F841 in tests (may reveal unasserted mocks).

**Related files:** `bmo/pi/tests/test_voice_pipeline.py`, and others across `bmo/pi`


---

> dnd-app issues: `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`. BMO future ideas / design gotchas / observations: `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`. Security (any domain): `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO issues: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
