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
