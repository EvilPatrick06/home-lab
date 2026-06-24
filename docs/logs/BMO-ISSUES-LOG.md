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


## Low

---

> dnd-app issues: `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`. BMO future ideas / design gotchas / observations: `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`. Security (any domain): `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO issues: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
