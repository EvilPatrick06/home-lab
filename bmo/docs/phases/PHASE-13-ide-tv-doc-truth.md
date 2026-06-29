# PHASE-13 — bmo IDE working-copy consistency, TV worker timeout & service-doc truth

> Authored 2026-06-29 from `bmo/docs/phases/QA/QA-report-2026-06-28-2.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Fix the **backend/infrastructure** correctness findings from the second 2026-06-28 QA pass (run 2, live process `655a930f` / `origin/master@a2d87c53`) that the frontend round (PHASE-12) cannot reach:

1. **TV pairing hangs ~30s with the request blocked** because the worker round-trip (`_tv_cmd`) reads the worker's stdout with **no timeout** — when the TV is off, `/pair/start` and `/pair/finish` block until something upstream gives up, instead of returning a fast "TV unreachable";
2. the **IDE terminal opens in a different working copy than the IDE editor/explorer** — the file API/explorer are rooted at the dev tree `~/home-lab`, but the PTY inherits the app's cwd (the deploy checkout `~/home-lab-deploy/bmo/pi`), so editing a file and running git/commands act on **different checkouts**;
3. the **IDE terminal pane renders blank until the first keypress** (no initial prompt painted on open); and
4. the **service docs misrepresent the live IDE** — `bmo/docs/SERVICES.md` (and the `bmo-ide.service` unit description) present the `:5001` `ide_app` as the IDE, when the production IDE is `/ide` served in-process on `:5000` and `bmo-ide.service` is inactive/experimental.

This phase is **server-side Python** (`bmo/pi/routes/tv_api.py`, `bmo/pi/dev/terminal_service.py`, `bmo/pi/routes/ide.py`) plus a **docs** reconciliation (`bmo/docs/SERVICES.md`, `bmo/pi/systemd/bmo-ide.service`). The two genuinely operational/owner items run 2 raised (the calendar refresh-token reauth; the missing `GOOGLE_VISION_API_KEY`) are **not** code phases — they are owner actions / log entries (see Out of scope).

PLANNING/AUTHORING ONLY. The executer does **not** restart the live Pi, pair a TV, or run a terminal on the device (rule 6). The TV-timeout change is covered by `bmo-pi-pytest.yml`; the terminal/IDE changes are verified by a focused pytest where a harness exists and by surgical diff otherwise.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base verified against `origin/master@af795b36` (HEAD at authoring; the report tested live `655a930f` / `origin/master@a2d87c53` — line numbers re-anchored to current HEAD, INSTRUCTIONS.md rule 3).
- **TV timeout (13A) pairs with PHASE-11 11D + PHASE-12 12D.** 13A makes the worker round-trip fail fast (a short `_tv_cmd` timeout → a quick `503 "TV unreachable"`); 11D pre-flights reachability before showing the PIN; 12D gives the in-flight UI affordance + maps the 503/error to friendly copy. Together: no 30s hang, an immediate affordance, and a clear message. 13A touches `tv_api.py` (and possibly `dev/tv_worker.py` only if the read-side needs a co-operative flush — prefer leaving the worker untouched); 11D may also touch `tv_api.py` — **coordinate**: 11D adds a reachability branch to `/pair/start`, 13A adds the read timeout to `_tv_cmd` they both call; keep edits in distinct functions.
- **IDE doc reconciliation (13D) extends PHASE-11 11F.** 11F corrects `bmo/README.md`; 13D corrects `bmo/docs/SERVICES.md` + the `bmo-ide.service` unit description. **Different files** → no conflict; 13D cross-references the same `DESIGN-CONSTRAINTS.md` "Two IDE implementations coexist" section (lines ~47-58) 11F cites.
- **The IDE terminal/deploy-checkout split is adjacent to a tracked item.** `docs/logs/BMO-ISSUES-LOG.md` already tracks the deploy-isolation path work (`~/home-lab-deploy`, commit `655a930f`) for the bots' data dirs; the IDE-terminal-cwd split (13B) is the **IDE-surface manifestation** of the same dev-tree-vs-deploy-checkout split and is **not** otherwise tracked — fix it here, don't re-log it.
- **Live-Pi boundary (rule 6):** no `systemctl` (no `bmo-ide.service` enable/disable), no TV pairing on the device, no terminal run on the Pi. Code + tests only; the integrator/owner deploy verifies live.

## Verified findings

All citations verified 2026-06-29 against `origin/master@af795b36`. TV routes: `bmo/pi/routes/tv_api.py`; terminal PTY: `bmo/pi/dev/terminal_service.py`; IDE blueprint + socket handlers: `bmo/pi/routes/ide.py`.

### F1 — `_tv_cmd` reads the worker's stdout with no timeout, so a TV-off pairing round-trip blocks ~30s

**Status: confirmed.** `_tv_cmd(action, **kwargs)` writes the command to the worker's stdin then does `line = _tv_proc.stdout.readline()` (`tv_api.py:116`) with **no timeout** on the read. `api_tv_pair_start` calls `_tv_cmd("pair_start")` (`tv_api.py:332`) and `api_tv_pair_finish` calls `_tv_cmd("pair_finish", pin=pin)` (`tv_api.py:349`); when the TV is off the worker's pairing handshake blocks waiting for the device, so `readline()` (and thus the whole Flask request) blocks until the worker eventually errors out — the report's "stays pending ~30s". The status endpoint's `_tv_cmd("connect_test")` (`tv_api.py:311`) has the same unbounded read. Note the codebase already knows short timeouts elsewhere: `_adb_connect` uses `subprocess.run(..., timeout=5)` (`tv_api.py:139`) and the media-title probes use `timeout=3` (`tv_api.py:219,263`) — only the long-lived-worker `readline()` is unbounded. The docstring history even records a prior worker-path bug where "`_tv_cmd` hung on `readline()` of the empty [stream]" (`tv_api.py:67-69`), i.e. the unbounded read is a known failure mode.

```bash
sed -n '102,127p' bmo/pi/routes/tv_api.py                     # _tv_cmd: stdin.write + stdout.readline() — NO timeout
sed -n '329,357p' bmo/pi/routes/tv_api.py                     # pair_start / pair_finish → _tv_cmd, return 500 on error
sed -n '135,144p' bmo/pi/routes/tv_api.py                     # _adb_connect already uses subprocess timeout=5 (the pattern)
```

### F2 — The IDE terminal inherits the app's cwd (deploy checkout) while the explorer/file API are rooted at the dev tree

**Status: confirmed.** The IDE file API is jailed to `_IDE_ALLOWED_ROOTS`, whose primary root is `~/home-lab` (`ide.py:74`); `/tree` defaults to `~` (`ide.py:265`) and resolves under those roots, so the explorer/editor show and edit the **dev tree** (`/home/patrick/home-lab`). The terminal PTY, however, is spawned by `TerminalSession.start_pty` which `os.fork()`s and `os.execvp("/bin/bash", ["/bin/bash","--login"])` (`terminal_service.py:39-49`) with **no `os.chdir()`**, so the child inherits the **parent (app) process cwd** — the deploy checkout `~/home-lab-deploy/bmo/pi` (the running service's `WorkingDirectory`), which is exactly the prompt the report saw (`patrick@bmo:~/home-lab-deploy/bmo/pi $`). `open_terminal` (`terminal_service.py:124`) and the `terminal_open` socket handler (`ide.py:1403-1419`) pass no cwd. Result: a file edited in the IDE (dev tree) and a `git`/command run in the IDE terminal (deploy checkout) act on **different working copies** — confusing and error-prone.

```bash
sed -n '69,79p'     bmo/pi/routes/ide.py                      # _IDE_ALLOWED_ROOTS — primary root ~/home-lab (dev tree)
sed -n '263,290p'   bmo/pi/routes/ide.py                      # /tree default path "~", resolved under the roots
sed -n '29,55p'     bmo/pi/dev/terminal_service.py           # start_pty: fork + execvp bash, NO os.chdir → inherits app cwd
sed -n '124,146p'   bmo/pi/dev/terminal_service.py           # open_terminal: no cwd param
sed -n '1403,1419p' bmo/pi/routes/ide.py                     # on_terminal_open: passes no cwd
```

### F3 — A freshly-opened IDE terminal paints blank (no prompt) until the first keypress

**Status: confirmed (timing).** `on_terminal_open` (`ide.py:1404`) calls `mgr.open_terminal(...)` and returns; nothing nudges the new PTY, so until the user types (which `on_terminal_input` writes, `ide.py:1423-1431`) the pane shows only a cursor — the bash `--login` prompt isn't repainted into the freshly-attached xterm. The reader thread is live (`_start_reader`, `terminal_service.py:56-78`) and forwards any PTY output via the `terminal_output` emit, so an initial nudge (a redraw signal, or a harmless newline) makes the first prompt appear on open. (The report flags this as **info/unverified** — partly confounded by screenshot-capture timeouts during the run — so the fix is a light, safe nudge, not a rewrite.)

```bash
sed -n '1403,1432p' bmo/pi/routes/ide.py                     # terminal_open returns without nudging; terminal_input writes keystrokes
sed -n '56,99p'     bmo/pi/dev/terminal_service.py           # reader thread + write() (forwards PTY output as it arrives)
```

### F4 — `SERVICES.md` and the `bmo-ide.service` description present `:5001` `ide_app` as the IDE; the live IDE is `/ide` on `:5000`

**Status: confirmed.** `bmo/docs/SERVICES.md` lists "`5001 | ide_app/ide_app.py | Embedded web IDE (optional)`" in the ports table (`SERVICES.md:88`) and, in its IDE section, "`/api/ide/* | various | IDE job management (runs on :5001 primarily)`" (`SERVICES.md:252`) — but the live IDE is `/ide` rendered in-process by the main app on `:5000` (`SERVICES.md:87` already lists `:5000` as the main HTTP/WS app, and `SERVICES.md:251` already has the `/ide GET` row), and `bmo-ide.service` (`systemd/bmo-ide.service`) is `Description=BMO IDE Test App (port 5001)`, binds `127.0.0.1` only, and on the live Pi is inactive/not-found (the report's `systemctl is-active bmo-ide.service` → inactive; nothing on `:5001`). `DESIGN-CONSTRAINTS.md` ("Two IDE implementations coexist — production IDE is `web/` + `routes/ide.py`, NOT `ide_app/`", lines ~47-58) already documents `ide_app`/`:5001`/`bmo-ide.service` as a stalled experimental rebuild recommended for cutover/retirement — so the actionable gap is the **docs presenting `:5001` as the IDE** when the live one is `/ide` on `:5000`. (PHASE-11 11F fixes the same misstatement in `bmo/README.md`; this finding covers `SERVICES.md` + the unit description.)

```bash
sed -n '86,89p'   bmo/docs/SERVICES.md                        # ports table: 5000 main app; 5001 ide_app (optional)
sed -n '247,253p' bmo/docs/SERVICES.md                        # IDE section: '/ide GET' + 'runs on :5001 primarily' (stale)
sed -n '1,3p'     bmo/pi/systemd/bmo-ide.service              # Description=BMO IDE Test App (port 5001)
sed -n '47,58p'   bmo/docs/DESIGN-CONSTRAINTS.md              # 'Two IDE implementations coexist' — :5000 canonical, :5001 experimental
```

## Sub-phases

> Run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file + `ruff check` on touched files. No bare `print()` (the no-new-prints guard) — use the module logger for any new line.

### 13A — Bound the TV worker round-trip so pairing/connect fail fast instead of hanging

**Objective:** when the TV is unreachable, `/pair/start`, `/pair/finish`, and the status `connect_test` return a fast, handled "TV unreachable" (≤ a few seconds) instead of blocking the request ~30s.

**Files:** `bmo/pi/routes/tv_api.py`, `bmo/pi/tests/test_tv_api.py` (or the existing tv test; add a focused one if absent).

**Steps:**

1. Add a bounded read to `_tv_cmd` (`tv_api.py:102`): give it a `timeout` parameter (default a sane ceiling) and, before `readline()` (`:116`), gate the worker's stdout fd with `select.select([_tv_proc.stdout], [], [], timeout)`; on timeout return `{"error": "TV unreachable", "timeout": true}` rather than blocking. (`select` on the pipe fd is the portable, gevent-safe approach — do not rely on the worker being co-operative.)
2. Pass a **short** timeout from the pairing/status callers: `_tv_cmd("pair_start", timeout=…)` (`:332`), `_tv_cmd("pair_finish", pin=pin, timeout=…)` (`:349`), and `_tv_cmd("connect_test", timeout=…)` (`:311`) — a few seconds, enough for a present TV to answer but short enough that a dead TV fails fast. Keep non-interactive/other callers on the default.
3. On a timeout from a pairing call, return the existing handled error shape but as a **`503`** ("TV unreachable — is it on and on the same network?") instead of the generic `500`, so the frontend (PHASE-12 12D / PHASE-11 11D) can distinguish "unreachable" from a real failure. On a pairing timeout also reset the worker the way `api_tv_pair_cancel` does (`tv_api.py:359-378`) so a half-open handshake doesn't wedge the next attempt.
4. Tests: with a stubbed/slow worker (a fake `_tv_proc` whose `stdout` never becomes ready), assert `_tv_cmd(..., timeout=short)` returns the `"TV unreachable"` error within the timeout and that `/pair/start` returns `503` (not a hang/500). Keep it hermetic — no real subprocess/TV.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_tv_api.py -q && ruff check routes/tv_api.py` (substitute the actual tv test filename).

**Acceptance:** a TV-off pairing/status call returns a handled "TV unreachable" `503` within a few seconds (no ~30s hang); a reachable TV's pairing flow is unchanged.

### 13B — IDE terminal opens in the same root as the explorer/file API

**Objective:** a new IDE terminal starts in the dev-tree root the explorer/editor use (`~/home-lab`), so editor edits and terminal commands act on one working copy.

**Files:** `bmo/pi/dev/terminal_service.py`, `bmo/pi/routes/ide.py`, `bmo/pi/tests/` (terminal/IDE test if a harness exists).

**Steps:**

1. Add a `cwd` parameter to `TerminalSession.start_pty` (`terminal_service.py:29`) and `TerminalManager.open_terminal` (`terminal_service.py:124`); in the forked child, **before** `os.execvp` (`terminal_service.py:48`), `os.chdir(cwd)` inside a try/except (fall back to the current behavior if the dir is missing, so a bad path never aborts the shell).
2. Have `on_terminal_open` (`ide.py:1404`) pass the IDE root as cwd: default to `_IDE_ALLOWED_ROOTS[0]` (`~/home-lab`, `ide.py:74`) so editor and terminal share the dev tree; optionally accept `data.get("cwd")` but **jail it through `_ide_safe_path`** (`ide.py:80`) so the terminal can never start outside the IDE sandbox.
3. Tests: assert `open_terminal(..., cwd=<root>)` threads cwd to `start_pty`; if a PTY-level test is impractical, assert the handler resolves the cwd to the allowlisted root (and rejects/falls back for an out-of-jail cwd). Keep it hermetic.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_ide.py -q && ruff check dev/terminal_service.py routes/ide.py` (substitute actual test filename; if no terminal test exists, read the diff and add a minimal handler-level test).

**Acceptance:** a freshly-opened IDE terminal's cwd is the explorer root (`~/home-lab`), matching the editor/file API; any caller-supplied cwd is sandbox-jailed.

### 13C — IDE terminal paints its initial prompt on open

**Objective:** a new terminal shows the shell prompt immediately on open, not only after the first keypress.

**Files:** `bmo/pi/routes/ide.py`, `bmo/pi/dev/terminal_service.py`.

**Steps:**

1. After `mgr.open_terminal(...)` in `on_terminal_open` (`ide.py:1418`), nudge the new session so bash repaints its prompt — the lightest safe option is to send a redraw signal / an empty input (e.g. `session.write(b"\n")` or a `kill -WINCH`-style resize round-trip) once the PTY is attached, so the first `terminal_output` carries the prompt. Prefer the option that does not inject a visible blank command (a resize/redraw over a literal newline if it produces a cleaner first paint).
2. If implemented at the session layer, add an optional `start_pty(..., paint_prompt=True)` that performs the nudge after the reader thread is up (`terminal_service.py:54`), so the behavior is testable and self-contained.
3. Keep it minimal — this is the report's **info/unverified** item (confounded by capture timeouts); do not restructure the PTY/reader.

**Cheap check:** read the diff; if a terminal test exists, assert the open path emits an initial `terminal_output` (the prompt) without prior input.

**Acceptance:** opening a terminal renders the shell prompt without requiring a keypress; existing input/resize/close behavior is unchanged.

### 13D — Reconcile `SERVICES.md` + `bmo-ide.service` to the live `/ide` on `:5000`

**Objective:** the service docs accurately state the production IDE is `/ide` on `:5000` and that `ide_app`/`:5001`/`bmo-ide.service` is the experimental, loopback-only rebuild (cross-referencing `DESIGN-CONSTRAINTS`), so a reader isn't sent to a dead `:5001`.

**Files:** `bmo/docs/SERVICES.md`, `bmo/pi/systemd/bmo-ide.service`.

**Steps:**

1. In `SERVICES.md`: annotate the `:5001` ports-table row (`:88`) and the IDE-section line (`:252`) to state the **production** IDE is `/ide` served by the main app on `:5000`, and that `ide_app` on `:5001` (`bmo-ide.service`) is an **experimental, loopback-only** rebuild that is not normally running — cross-reference `DESIGN-CONSTRAINTS.md` "Two IDE implementations coexist" (lines ~47-58). Keep the `/ide GET` row (`:251`) and correct "runs on :5001 primarily" → "served in-process on :5000".
2. In `bmo-ide.service`: update the `Description` (`:1`) to make clear it is the **experimental/dev-only** loopback IDE (e.g. "BMO experimental IDE (ide_app, loopback :5001 — not the production /ide on :5000)"). Do **not** enable/disable/restart the unit (rule 6) — text only; retiring the unit is the owner cutover (DESIGN-CONSTRAINTS).
3. Doc-only; no behavior change.

**Cheap check:** read the diff; confirm `SERVICES.md` no longer implies `:5001` is the live IDE and the unit description marks it experimental.

**Acceptance:** `SERVICES.md` distinguishes the production `/ide` (`:5000`) from the experimental loopback `ide_app` (`:5001`); the `bmo-ide.service` description matches.

## Research notes

- **A blocking IPC read needs a deadline (13A).** `readline()` on a long-lived worker's pipe has no inherent timeout; when the peer can't answer (TV off) the caller blocks indefinitely from the user's view. Gating the fd with `select(..., timeout)` before reading is the standard, gevent-safe fix and mirrors the `subprocess(..., timeout=…)` the same file already uses for the short-lived ADB/media probes. Resetting the worker on a pairing timeout (as `cancel` does) prevents a half-open handshake from wedging retries.
- **One IDE, one working copy (13B).** An editor and a terminal that disagree on which checkout they touch is a correctness trap, not just UX — a `git commit` in the terminal won't include edits made in the editor. Forking the PTY with an explicit, sandbox-jailed cwd equal to the explorer root removes the ambiguity; the split is the IDE-surface echo of the already-tracked dev-tree-vs-`home-lab-deploy` isolation work.
- **A fresh PTY needs a paint nudge (13C).** xterm attaches to a PTY that has already emitted its prompt before the client subscribed, or hasn't been prompted to repaint; a light redraw signal on open surfaces the prompt without waiting for input. Kept minimal because the finding is info/unverified.
- **Docs are part of the surface (13D).** Sending a user to `http://…:5001` for an IDE that doesn't run there is the same class of defect as a stale README; the canonical reference (`DESIGN-CONSTRAINTS`) already exists, so this is a pointer-fix, not an architecture change. Retiring `ide_app`/`bmo-ide.service` remains an owner cutover.

## Test plan

- **13A** — `tests/test_tv_api.py`: a slow/never-ready stub worker → `_tv_cmd(timeout=short)` returns "TV unreachable" within the timeout; `/pair/start` returns `503`, not a hang/500.
- **13B** — terminal/IDE test (or handler-level): `open_terminal(cwd=root)` threads cwd to `start_pty`; an out-of-jail cwd is rejected/falls back to the allowlisted root.
- **13C** — if a terminal test exists: the open path emits an initial prompt `terminal_output` without prior input (else verified by diff).
- **13D** — docs: diff-reviewed; `SERVICES.md` + unit description no longer present `:5001` as the live IDE.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + the no-new-prints / docker / codeql guards are the gate. No `systemctl` / TV pairing / terminal run on the live Pi (rule 6).

## Acceptance criteria

- [ ] A TV-off pairing/status call returns a handled "TV unreachable" `503` within a few seconds (no ~30s hang); a reachable TV's pairing is unchanged.
- [ ] A new IDE terminal's cwd matches the explorer/file-API root (`~/home-lab`); a caller-supplied cwd is sandbox-jailed.
- [ ] A freshly-opened IDE terminal shows the shell prompt without requiring a keypress.
- [ ] `bmo/docs/SERVICES.md` + the `bmo-ide.service` description correctly distinguish the production `/ide` (`:5000`) from the experimental loopback `ide_app` (`:5001`).
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Restarting / enabling / disabling / retiring `bmo-ide.service`, pairing a TV, or running a terminal on the live Pi** — owner/infra, live-Pi state (rule 6). 13D marks the unit experimental in text only; the cutover/retirement is the owner action (DESIGN-CONSTRAINTS).
- **The calendar refresh-token reauth** (`reauth_calendar.py` / moving the Google OAuth app to Production) — owner action, live-Pi data (rule 6); already framed by PHASE-10 / PHASE-INDEX provenance.
- **The missing `GOOGLE_VISION_API_KEY` (vision/OCR degraded)** — config/owner: provide the key or document the intentional omission. It is already surfaced honestly by `config_preflight.py:31` and `/api/health/full` (a "degraded" provider, not a crash), so it is a log/owner item, not a code phase. **Camera hardware absent / TV transport / voice enroll** — hardware, not code. **Header-clock TZ divergence** — intentional per `DESIGN-CONSTRAINTS` (the report itself reclassifies it).
- **The TV pairing dashboard affordance + friendly error copy** — PHASE-12 12D. **TV reachability pre-flight before the PIN** — PHASE-11 11D (13A provides the fast 503 those consume). **README IDE reference** — PHASE-11 11F (13D covers `SERVICES.md` + the unit).
