# PHASE-42 — BMO deploy automation (CI SSH deploy, canary on :5002, Docker option)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Replace BMO's manual "SSH in, `git pull`, `sudo systemctl restart bmo`" deploy flow with automation: (1) a health-gated, rollback-capable Pi-side deploy script (`bmo/pi/scripts/deploy.sh`); (2) a blue/green-style **canary boot on port :5002** — the new tree boots a hardware-free instance on :5002 and must answer `/health` before the live :5000 services are restarted, with automatic `git` + pip rollback if the post-restart health gate fails; (3) a GitHub Actions workflow that SSH-deploys to the Pi over Tailscale after the `bmo / pi pytest` workflow goes green on `master` — **dormant/no-op until secrets are provisioned, and auto-deploy-on-merge additionally opt-in via a repo variable (off by default)**; (4) an optional, off-by-default Docker deploy path (`bmo/docker/Dockerfile` + compose) validated by a path-filtered arm64 CI build. This closes the audit's "BMO deploy automation ideas" item and removes `bmo/docs/DEPLOY.md`'s dangling "Future improvements" pointer (the audit file it points to is deleted as part of this phase set).

## Dependencies & cross-phase notes

- **No prerequisite phases** (PHASE-INDEX row 42: *(no deps)*). Runs near the end of the set by number.
- **PHASE-16 (bmo blueprint refactor) rewrites `bmo/pi/app.py`** — it runs before this phase numerically. Every `app.py` line number cited below was verified 2026-06-10 and WILL drift; re-run the verification commands before editing. The work in 42A (port env + canary mode) attaches to wherever the Flask entrypoint (`socketio.run`) and `init_services()` live after the refactor.
- **PHASE-15 (bmo hygiene)** touches `bmo/pi/agents/`/services but not the deploy surface; no expected collision.
- **PHASE-20/22 (Discord bridge / sync plane)** may edit `bmo/setup-bmo.sh` (systemd units) and `bmo/docs/SERVICES.md`. This phase edits `setup-bmo.sh` §12 (the post-merge hook block, lines 392–410) and the SERVICES.md ports table (line 82) — different regions, merge carefully if both landed.
- **PHASE-43 (CodeQL hardening)** triages `actions/missing-workflow-permissions` alerts. The two NEW workflows added here must ship with an explicit `permissions: contents: read` block so this phase does not add alerts (note: the existing `.github/workflows/bmo-pi-pytest.yml` has NO `permissions:` block — verified 2026-06-10 via `grep -n "permissions" .github/workflows/*.yml`, which matched only `deploy.yml:11` and `release.yml:24`; fixing bmo-pi-pytest.yml belongs to PHASE-43, not here).
- The end-of-run release happens after this phase per PHASE-INDEX ("ONE release after PHASE-42").

## Verified findings

All commands below were run 2026-06-10 against the live tree (worktree root `/home/patrick/home-lab/.claude/worktrees/ai-p6-roadmap`, referred to as `$ROOT`) and, where noted, against the live Pi host (this repo runs ON the Pi).

### F1 — The audit item: deploy-automation ideas parked behind a dangling doc pointer (corrected line range)

The audit said `bmo/docs/DEPLOY.md:147-152`; the file is actually **149 lines** and the "Future improvements" section is **lines 147–149**.

```bash
wc -l bmo/docs/DEPLOY.md                      # → 149
sed -n '147,149p' bmo/docs/DEPLOY.md
```

Shows: `## Future improvements` → "Tracked in the consolidated backlog — `dnd-app/docs/AI-DM-AUDIT.md` § Future/Stubbed/Unfinished → bmo … CI/CD GitHub-Actions SSH-deploy on merge, blue/green on `:5002`, Docker-based deploy." That audit file is deleted at the end of this phase-set authoring, so the pointer dangles again unless this phase rewrites the section (42E).

### F2 — Current deploy model: manual SSH + git pull + systemctl restart

`bmo/docs/DEPLOY.md:13-21` documents the one-liner `ssh patrick@bmo.local "cd ~/home-lab && git pull && sudo systemctl restart bmo"`. `bmo/docs/DEPLOY.md:34-45` documents the partial-restart table (bots → `bmo-dm-bot bmo-social-bot`, `hardware/fan_control.py` → `bmo-fan`, app/agents/services → `bmo`). `DEPLOY.md:85-94` documents manual rollback via `git reset --hard <SHA>`. These tables are the spec for `deploy.sh`'s selective-restart logic (42B).

### F3 — Port 5002 is reserved-and-unused; :5000 is hardcoded in app.py

```bash
grep -rn "5002" bmo/ --include="*.py" --include="*.sh" --include="*.md" --include="*.yml"
# → only bmo/docs/DEPLOY.md:149 (the idea) and bmo/docs/SERVICES.md:82 "| 5002 | (reserved) | future |"
grep -n "socketio.run" bmo/pi/app.py
# → app.py:5448: socketio.run(app, host="0.0.0.0", port=5000, debug=False)
sed -n '5447,5448p' bmo/pi/app.py   # log line at 5447 also hardcodes ":5000"
```

Nothing binds :5002 today; making the port env-configurable (`BMO_PORT`) is a pure addition.

### F4 — `/health` endpoint exists and is the canary/health-gate probe

`bmo/pi/app.py:919-924`: `@app.route("/health")` + `@app.route("/api/v1/health")` → `jsonify({"status": "ok", "api_version": "v1"})`. Verify: `sed -n '919,925p' bmo/pi/app.py`. The kiosk unit already polls it (`setup-bmo.sh:262` `ExecStartPre … curl -sf http://localhost:5000/health`), and `bmo/docs/DEPLOY.md:103` uses it as the deploy-success check.

### F5 — `init_services()` hardware blocks + existing per-device kill-switch precedent

`bmo/pi/app.py:407` `def init_services()`. Hardware/side-effect blocks (verified line anchors, `grep -n` on the comments):
- `app.py:422` LED controller (RPi GPIO; `LedController().start()`)
- `app.py:433-437` OLED face — **existing kill-switch precedent**: `BMO_DISABLE_OLED=1` skips init (`os.environ.get("BMO_DISABLE_OLED", "").lower() in ("1","true","yes")`)
- `app.py:449` Voice pipeline (pyaudio/mic)
- `app.py:461-464` Camera — second kill-switch: `BMO_DISABLE_CAMERA=1`
- `app.py:496` LocationService `start_polling()`
- `app.py:515` Audio output routing; `app.py:524` Music (VLC); `app.py:533` Timers (loads + can FIRE alarms — a second live instance would double-fire)
- `app.py:547` agent creation; `app.py:559/561` calendar/weather `start_polling()`
- `app.py:5427-5448` `__main__` block: `init_services()` → `register_ide(app, socketio, agent)` → `register_game_relay` → `register_library` → `register_rclone` → `register_sounds` → `music.restore_playback()` (`:5444`, plays audio) → `socketio.run`.

A concurrent full second instance would contend for mic/GPIO/I2C/audio and double-fire alarms — this is why the canary must be a **hardware-free, import-only boot**, not a full blue/green traffic swap. `register_ide(flask_app, socketio_obj, agent_obj)` (`bmo/pi/routes/ide.py:1380`) just stamps module globals, so passing `agent=None` in canary mode is structurally fine (handlers resolve `agent` at call time); 42A verifies None-tolerance with a test.

### F6 — systemd topology (what "restart" means)

`bmo/setup-bmo.sh:208-237` generates `bmo.service`: `User=patrick`, `WorkingDirectory=/home/patrick/home-lab/bmo/pi`, `EnvironmentFile=/home/patrick/home-lab/bmo/pi/.env`, `ExecStart=/home/patrick/home-lab/bmo/pi/venv/bin/python app.py`, `Restart=on-failure`, `ProtectSystem=strict`, `ReadWritePaths=/home/patrick/home-lab/bmo/pi`. Bots: `setup-bmo.sh:301-354` (`python -m bots.discord_dm_bot` / `discord_social_bot`). Fan: `:284-298`. Enable list `:358`: `bmo bmo-kiosk bmo-fan bmo-dm-bot bmo-social-bot`. Live unit verified identical entrypoint: `grep -n "ExecStart" /etc/systemd/system/bmo.service` → `/home/patrick/home-lab/bmo/pi/venv/bin/python app.py`. Live venv + `.env` exist: `ls /home/patrick/home-lab/bmo/pi/venv/bin/python /home/patrick/home-lab/bmo/pi/.env`. Passwordless sudo works for `patrick` (`sudo -n true` → exit 0), so `deploy.sh` can call `sudo systemctl restart …` non-interactively.

### F7 — setup-bmo.sh's post-merge auto-restart hook is NOT what's live; git-lfs clobbered it (new drift finding)

`bmo/setup-bmo.sh:392-410` writes a `.git/hooks/post-merge` that blanket-restarts all five services + four Docker containers on every `git pull`. But the LIVE hook is git-lfs's:

```bash
cat /home/patrick/home-lab/.git/hooks/post-merge
# → "#!/bin/sh … git lfs post-merge \"$@\"" (276 bytes, git-lfs stub — NOT the setup-bmo.sh restart hook)
```

So (a) there is currently NO auto-restart on pull (the restart hook was overwritten by `git lfs install`, or never re-applied), and (b) re-running `setup-bmo.sh` would clobber the LFS hook (repo uses LFS for `5.5e References/*.pdf` — see CLAUDE.md). Both directions of the clobber are latent bugs. 42B replaces the setup-bmo.sh hook block with an LFS-chaining hook that does NOT auto-restart (deploy.sh owns restarts, health-gated), matching live reality.

### F8 — Tailscale is installed, running, with MagicDNS and Tailscale SSH ENABLED; the Pi is untagged

```bash
command -v tailscale && tailscale status --peers=false      # → /usr/bin/tailscale; "100.85.66.54  bmo  …  linux"
tailscale status --json | grep -E '"MagicDNSSuffix"|"DNSName"' | head -2
# → DNSName "bmo.tail31b5d9.ts.net.", MagicDNSSuffix "tail31b5d9.ts.net"
tailscale status --json | grep -o '"RunSSH"[^,]*'           # → "RunSSH": true
tailscale status --json | python3 -c "import json,sys; print(json.load(sys.stdin)['Self'].get('Tags'))"  # → None
```

Consequences: (1) CI can reach the Pi by joining the tailnet (`tailscale/github-action`); (2) because **Tailscale SSH intercepts port 22 on the tailnet interface**, `~/.ssh/authorized_keys` forced-command restrictions do NOT apply to tailnet SSH — access control is the tailnet ACL `ssh` rules; (3) the Pi is currently untagged, and Tailscale SSH ACL `dst` for non-self access requires a tagged device, so provisioning includes tagging the Pi (user-console action, spelled out in 42E). `bmo/pi/scripts/setup-tailscale.sh:23` confirms the node was brought up with `--ssh`.

### F9 — Repo is PUBLIC → no self-hosted runner; CI workflow chain target exists

```bash
gh repo view EvilPatrick06/home-lab --json isPrivate        # → {"isPrivate":false}
```

GitHub's hardening guidance recommends against self-hosted runners on public repositories (fork PRs can target them), so the deploy runs on GitHub-hosted runners that join the tailnet ephemerally. The upstream CI to chain from exists: `.github/workflows/bmo-pi-pytest.yml` — `name: bmo / pi pytest` (line 2), triggers on push/PR with `paths: bmo/**` (lines 4-13), runs `python -m pytest tests/ -q` on ubuntu-latest/py3.11. A `workflow_run`-triggered deploy that requires `event == 'push' && head_branch == 'master' && conclusion == 'success'` therefore fires only for green master pushes that touched `bmo/**`.

### F10 — cloudflared tunnel is active but HTTP-only (not a deploy transport today)

`systemctl is-active cloudflared` → `active`; `/etc/cloudflared/config.yml` ingress routes `bmo.mybmoai.work` → `http://localhost:5000` (+ `/myapp.*` → :9000) with no SSH hostname. Adding SSH over the tunnel would need a CF Access app + service token (dashboard work) — Tailscale is the lower-friction transport since it is already node-joined. Recorded as the rejected alternative (Research notes).

### F11 — Legacy Docker assets: archived, and the old compose never containerized the app

```bash
git log --all --full-history --oneline -- bmo/docker/   # → f1f2ed11 "chore: archive discord_bot.py + bmo/docker/ …"
git show f1f2ed11^:bmo/docker/docker-compose.yml | head -10
```

The archived compose (recoverable at `git show f1f2ed11^:bmo/docker/<file>`) defined only the four supporting containers (ollama/peerjs/coturn/pihole) and stated "BMO's Flask app runs directly on the host (needs camera, mic, speakers, GPIO, I2C, SPI)". The archive commit message confirms the four containers are started via plain `docker run` in `setup-bmo.sh` (lines 145-202), not compose. So the "Docker deploy option" deliverable is a NEW containerization of the BMO app itself (off-by-default), not a restoration; the supporting containers stay as-is.

### F12 — Test conventions this phase extends

- `bmo/pi/tests/test_shell_scripts.py` already shellchecks/syntax-checks all `bmo` shell scripts and **conditionally references the deleted `bmo/docker/deploy.sh`** (`DEPLOY_SH = …"bmo","docker","deploy.sh"`, included in `ALL_SH_FILES` only `if os.path.isfile(...)`) — the new scripts get added here. `shellcheck` exists on the Pi (`/usr/bin/shellcheck`) and on ubuntu-latest runners; tests skip when absent.
- `bmo/pi/tests/conftest.py` mocks all hardware modules (`RPi`, `luma`, `pyaudio`, `picamera2`, `vlc`, …) and sets `BMO_SOCKETIO_ASYNC_MODE=threading`, so a canary-mode test that imports `app` and calls `init_services()` runs hardware-free on any host.
- `pyyaml==6.0.3` is in `bmo/pi/requirements-test.txt` (`grep -i "^pyyaml" bmo/pi/requirements-test.txt`) — workflow-YAML drift-guard tests can `yaml.safe_load` the new workflow files.
- Python on Pi and in CI: 3.11 (`python3 --version` → 3.11.2; `bmo-pi-pytest.yml:33` `python-version: '3.11'`). Requirements are pip-compiled (`requirements.in/.txt`, `requirements-ci.in/.txt`, `requirements-test.in/.txt`) with piwheels + pytorch-cpu extra indexes.

## Sub-phases

> Execution-environment note: phase work happens in the repo worktree; the executing host IS the Pi. Live-host actions (reading `/etc/systemd/system/*`, `gh secret`/`gh variable`, the local canary rehearsal, writing the live git hook) may trigger permission prompts — handle per INSTRUCTIONS.md rule 25.

### 42A — `BMO_PORT` + `BMO_CANARY` boot mode in app.py

**Objective:** the Flask entrypoint can bind any port, and a canary boot validates "every module imports + app boots + routes register + `/health` answers" without touching hardware, audio, alarms, or pollers.

**Files:** `bmo/pi/app.py`, `bmo/pi/tests/test_canary_mode.py` (new).

**Steps:**
1. Near the top of `app.py` (after `import os`), add module constants:
   ```python
   BMO_PORT = int(os.environ.get("BMO_PORT", "5000"))
   BMO_CANARY = os.environ.get("BMO_CANARY", "").lower() in ("1", "true", "yes")
   ```
2. In the `__main__` block (currently `app.py:5447-5448`), replace the hardcoded log string and `socketio.run(app, host="0.0.0.0", port=5000, …)` with `BMO_PORT`, and log `"[bmo] CANARY boot — hardware/services skipped"` when `BMO_CANARY` is set.
3. In `init_services()` (currently `app.py:407`), gate every side-effectful block on canary mode using the **import-only pattern** (catches the dominant deploy-breakage class — syntax/import errors — while instantiating nothing). Mirror the existing `BMO_DISABLE_OLED` block style (`app.py:433-448`). Blocks to gate: LED (`:422`), OLED (`:433`), voice pipeline (`:449`), camera (`:461`), smart home, calendar, location (`start_polling`), weather, audio output (`:515`), music (`:524`), timers (`:533` — alarms must not double-fire), and the trailing `start_polling()` calls (`:559-561`). Pattern per block:
   ```python
   if BMO_CANARY:
       from services.voice_pipeline import VoicePipeline  # noqa: F401 — canary import check
       log.info("[bmo]   Voice pipeline: CANARY (import-only)")
   else:
       ...existing block unchanged...
   ```
4. In canary mode skip `BmoAgent(...)` instantiation (`:547`; keep `from agent import BmoAgent` as the import check, leave `agent = None`) and skip `music.restore_playback()` (`:5444` — already `if music:`-guarded; music stays `None` in canary).
5. The `register_ide/register_game_relay/register_library/register_rclone/register_sounds` calls in `__main__` run in canary mode too (route registration IS part of what the canary validates). Verify `register_ide(app, socketio, None)` is None-safe (it stamps module globals, `routes/ide.py:1380`); if any registered handler dereferences `agent` at import/registration time rather than call time, add a None-guard there.
6. New `bmo/pi/tests/test_canary_mode.py`:
   - `test_canary_skips_hardware`: `monkeypatch.setenv("BMO_CANARY", "1")`, force-reimport `app` (`sys.modules.pop("app", None)` then `importlib.import_module("app")` — conftest mocks make this safe), call `app_module.init_services()`, assert `voice/camera/led_controller/oled_face/music/timers` are all `None` and no thread-starting mock was invoked (e.g. `LedController` mock not called).
   - `test_bmo_port_env`: with `BMO_PORT=5002` set before import, assert `app_module.BMO_PORT == 5002`; without it, `5000`.
   - `test_canary_health_route`: via the Flask test client, `GET /health` → 200 + `{"status":"ok","api_version":"v1"}` (the canary's probe contract).

**Targeted checks:** `cd bmo/pi && venv-or-system python -m pytest tests/test_canary_mode.py -q` (on the Pi: `/home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/test_canary_mode.py -q`); `python -m compileall -q bmo/pi/app.py`.

**Acceptance:** canary test file green; existing `tests/test_app_endpoints.py` still green (`-q` run of just that file); no behavior change when `BMO_CANARY`/`BMO_PORT` are unset (default path byte-equivalent in behavior: port 5000, full init).

### 42B — `bmo/pi/scripts/deploy.sh` — health-gated deploy with canary + rollback

**Objective:** one idempotent, lockable script that takes the repo from "origin/master has new bmo code" to "services restarted and healthy", aborting safely at every gate, with automatic rollback. This is what both the CI workflow and a human at a shell invoke.

**Files:** `bmo/pi/scripts/deploy.sh` (new, executable), `bmo/setup-bmo.sh` (§12 hook block, lines 392-410), `bmo/pi/tests/test_shell_scripts.py` (extend), `bmo/pi/tests/test_deploy_script.py` (new).

**Steps:**
1. Write `deploy.sh` with `set -euo pipefail`. Interface:
   - `deploy.sh [TARGET_SHA] [--dry-run] [--services-only] [--no-canary]`
   - Env overrides (defaults in parens): `BMO_DEPLOY_REPO_ROOT` (`/home/patrick/home-lab`), `BMO_DEPLOY_CANARY_PORT` (`5002`), `BMO_DEPLOY_CANARY_TIMEOUT` (`120` s), `BMO_DEPLOY_HEALTH_TIMEOUT` (`90` s), `BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT` (unset; tests set it).
   - A `run()` wrapper executes every mutating command; under `--dry-run` it only echoes `[dry-run] <cmd>`. Read-only git queries always execute.
2. Gates, in order (each failure = clear `[deploy] FAIL: …` line + non-zero exit):
   - **Lock:** `exec 9>/tmp/bmo-deploy.lock; flock -n 9 || fail "another deploy is running"`.
   - **Root check:** resolved repo root must equal `BMO_DEPLOY_REPO_ROOT` unless `BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT=1` — prevents accidentally "deploying" a worktree.
   - **Tree clean:** `git status --porcelain` empty, else abort (never stash/clobber — the operator may be mid-edit on the Pi; per `DEPLOY.md:5-7` the Pi checkout doubles as a dev tree).
   - **Branch:** current branch is `master`.
3. **Resolve target:** `git fetch origin master`; `TARGET` = validated CLI arg (`^[0-9a-f]{7,40}$`, then `git rev-parse --verify`) or `origin/master`. Require `git merge-base --is-ancestor "$TARGET" origin/master` (refuse arbitrary/unpushed SHAs). If `TARGET == HEAD` and not `--services-only`: log "already deployed" and exit 0.
4. **Record `OLD_SHA=$(git rev-parse HEAD)`**, compute `CHANGED=$(git diff --name-only "$OLD_SHA" "$TARGET")`, then `run git merge --ff-only "$TARGET"`.
5. **Dependencies:** if `CHANGED` includes `bmo/pi/requirements.txt` → `run "$REPO_ROOT/bmo/pi/venv/bin/pip" install -r "$REPO_ROOT/bmo/pi/requirements.txt"` (set `REQS_CHANGED=1` for the rollback path).
6. **Syntax sweep:** `run "$VENV_PY" -m compileall -q "$REPO_ROOT/bmo/pi"` (fast, catches syntax errors in files the canary may import lazily).
7. **Canary (blue/green gate; skipped by `--no-canary` or `--services-only`):** from `$REPO_ROOT/bmo/pi`, launch `BMO_CANARY=1 BMO_PORT=$CANARY_PORT "$VENV_PY" app.py` backgrounded with output to `data/logs/deploy-canary.log`; poll `curl -sf "http://localhost:$CANARY_PORT/health"` once per second up to `BMO_DEPLOY_CANARY_TIMEOUT`; always tear down (TERM, 5 s grace, KILL) via a `trap`-registered cleanup. Canary red → `rollback`.
8. **Selective restart** (from `DEPLOY.md:34-45` table; `--services-only` jumps straight here): paths under `bmo/pi/bots/` → `bmo-dm-bot bmo-social-bot`; `bmo/pi/hardware/fan_control.py` → `bmo-fan`; any other `bmo/pi/**` change (or `REQS_CHANGED`) → `bmo` (+ both bots when `REQS_CHANGED`, since they share the venv). No `bmo/pi/**` changes at all → log "no service-affecting changes" and exit 0 without restarts. Restarts via `run sudo systemctl restart <units>` (F6: passwordless sudo verified).
9. **Health gate:** if `bmo` was restarted, poll `http://localhost:5000/health` up to `BMO_DEPLOY_HEALTH_TIMEOUT`; also `run systemctl is-active --quiet <each restarted unit>`. Red → `rollback`.
10. **`rollback()`:** kill canary if alive; `run git reset --hard "$OLD_SHA"` (tree was verified clean at entry, so this is safe); if `REQS_CHANGED` → reinstall old `requirements.txt`; restart the same unit set; re-poll `/health` (log loudly either way); `exit 1` so CI shows red.
11. Final success line: `[deploy] OK: <OLD_SHA:0:8> → <TARGET:0:8>; restarted: <units>; canary+health green.`
12. **`setup-bmo.sh` §12 (lines 392-410):** replace the blanket-restart post-merge hook with an LFS-chaining, non-restarting hook (fixes the mutual-clobber found in F7 and matches live reality):
    ```bash
    cat > ~/home-lab/.git/hooks/post-merge << 'EOF'
    #!/bin/sh
    # Chain git-lfs (repo uses LFS); deploys are explicit via deploy.sh.
    command -v git-lfs >/dev/null 2>&1 && git lfs post-merge "$@"
    echo '[deploy] Code updated. Run bmo/pi/scripts/deploy.sh for a health-gated restart.'
    EOF
    chmod +x ~/home-lab/.git/hooks/post-merge
    ```
    Also write this hook to the LIVE `/home/patrick/home-lab/.git/hooks/post-merge` (one-time host action, mirrors what re-running setup would do).
13. Tests:
    - `test_shell_scripts.py`: add `PI_DEPLOY_SH = os.path.join(_SCRIPTS_DIR, "deploy.sh")` to `ALL_SH_FILES` (shellcheck + `bash -n` coverage; keep the legacy conditional `bmo/docker/deploy.sh` entry untouched — that path stays deleted).
    - New `bmo/pi/tests/test_deploy_script.py` (hermetic; `pytest.mark.skipif` without bash): fixture builds a temp git repo (an `origin` bare repo + clone with `bmo/pi/requirements.txt` and two commits on `master`); run `bash deploy.sh --dry-run` with `BMO_DEPLOY_REPO_ROOT=<clone>` + `BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT=1` and assert: exit 0; output contains `[dry-run] git merge --ff-only`; requirements-touching commit triggers a `[dry-run] … pip install` line; a dirty tree aborts non-zero with `FAIL`; a non-ancestor SHA argument aborts; `TARGET == HEAD` exits 0 with "already deployed"; `--services-only` emits only restart lines.

**Targeted checks:** `shellcheck bmo/pi/scripts/deploy.sh`; `python -m pytest tests/test_deploy_script.py tests/test_shell_scripts.py -q` from `bmo/pi`.

**Acceptance:** both test files green; `deploy.sh --dry-run` against the real live checkout (`/home/patrick/home-lab`) prints a sane no-op/"already deployed" plan without mutating anything.

### 42C — `.github/workflows/bmo-deploy.yml` — CI SSH deploy over Tailscale (dormant until provisioned; auto-deploy opt-in)

**Objective:** green `bmo / pi pytest` on a `master` push → GitHub-hosted runner joins the tailnet ephemerally → SSHes to the Pi → runs `deploy.sh <head_sha>`. Without secrets the workflow skips with a notice (lands green); without the repo variable opt-in, only manual `workflow_dispatch` deploys run.

**Files:** `.github/workflows/bmo-deploy.yml` (new), `bmo/pi/tests/test_deploy_workflow.py` (new).

**Steps:**
1. Workflow shape (verified upstream API shapes — see Research notes):
   ```yaml
   name: bmo / deploy
   on:
     workflow_run:
       workflows: ["bmo / pi pytest"]   # MUST match bmo-pi-pytest.yml:2 exactly
       types: [completed]
     workflow_dispatch:
       inputs:
         target_sha:
           description: "Commit to deploy (default: origin/master HEAD)"
           required: false
   permissions:
     contents: read
   concurrency:
     group: bmo-deploy
     cancel-in-progress: false          # never kill a deploy mid-restart
   jobs:
     gate:
       runs-on: ubuntu-latest
       # vars/needs/github/inputs are the only contexts legal in job-level `if`;
       # secrets are NOT — hence the gate-job output pattern below.
       if: >
         github.event_name == 'workflow_dispatch' ||
         (github.event.workflow_run.conclusion == 'success' &&
          github.event.workflow_run.event == 'push' &&
          github.event.workflow_run.head_branch == 'master' &&
          vars.BMO_AUTO_DEPLOY == 'true')
       outputs:
         has-secrets: ${{ steps.check.outputs.ok }}
         target: ${{ steps.check.outputs.target }}
       steps:
         - id: check
           env:
             HAS_ID: ${{ secrets.TS_OAUTH_CLIENT_ID != '' }}
             HAS_SECRET: ${{ secrets.TS_OAUTH_SECRET != '' }}
             DISPATCH_SHA: ${{ inputs.target_sha }}
             RUN_SHA: ${{ github.event.workflow_run.head_sha }}
           run: |
             ok=false; [ "$HAS_ID" = "true" ] && [ "$HAS_SECRET" = "true" ] && ok=true
             echo "ok=$ok" >> "$GITHUB_OUTPUT"
             if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
               echo "target=$DISPATCH_SHA" >> "$GITHUB_OUTPUT"
             else
               echo "target=$RUN_SHA" >> "$GITHUB_OUTPUT"
             fi
             [ "$ok" = "true" ] || echo "::notice::bmo deploy skipped — TS_OAUTH_CLIENT_ID / TS_OAUTH_SECRET secrets not configured."
     deploy:
       needs: gate
       if: needs.gate.outputs.has-secrets == 'true'
       runs-on: ubuntu-latest
       timeout-minutes: 20
       steps:
         - name: Join tailnet (ephemeral)
           uses: tailscale/github-action@v4
           with:
             oauth-client-id: ${{ secrets.TS_OAUTH_CLIENT_ID }}
             oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}
             tags: tag:ci
             ping: bmo.tail31b5d9.ts.net
         - name: Run health-gated deploy on the Pi
           env:
             TARGET: ${{ needs.gate.outputs.target }}
           run: |
             ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
               patrick@bmo.tail31b5d9.ts.net \
               "/home/patrick/home-lab/bmo/pi/scripts/deploy.sh $TARGET"
   ```
   Notes baked into comments in the file: `workflow_run` only fires from the workflow file on the DEFAULT branch (master — fine here); SSH auth is Tailscale SSH (tailnet ACL `ssh` rule, F8), so no SSH-key secrets exist; the deploy is idempotent (`deploy.sh` exits 0 on "already deployed"); `$TARGET` is passed via env (not inline interpolation) as expression-injection hygiene even though `head_sha` on a master push is trusted.
2. Set the opt-in variable explicitly off (documents the toggle): `gh variable set BMO_AUTO_DEPLOY --body "false"`. Do NOT set the TS secrets (user-owned; see 42E checklist). With the variable `false`/unset, only `workflow_dispatch` passes the gate-job `if`.
3. New `bmo/pi/tests/test_deploy_workflow.py` (drift guards, `yaml.safe_load` — pyyaml is in requirements-test, F12):
   - the `workflow_run.workflows` list in `bmo-deploy.yml` equals `[<name: of bmo-pi-pytest.yml>]` (read both files — this breaks silently if someone renames the pytest workflow);
   - `permissions == {"contents": "read"}` in both `bmo-deploy.yml` and `bmo-docker-build.yml` (42D);
   - gate `if` contains `head_branch == 'master'`, `event == 'push'`, and `vars.BMO_AUTO_DEPLOY`;
   - deploy step references `tag:ci` and `bmo/pi/scripts/deploy.sh`; the script path exists in the repo.

**Targeted checks:** `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/bmo-deploy.yml'))"`; `python -m pytest tests/test_deploy_workflow.py -q` from `bmo/pi`.

**Acceptance:** workflow YAML parses; drift-guard tests green; after the phase commit lands on master, `gh run list --workflow=bmo-deploy.yml` shows the run completing with the gate job skipping/no-op (secrets absent) — i.e. the dormant path is green, not red.

### 42D — Docker deploy option (off by default) + arm64 CI build validation

**Objective:** a working, documented container path for the BMO Flask app for users/forks who prefer Docker — never wired into setup-bmo.sh or systemd; the host-venv flow stays the default. CI proves the image builds on arm64.

**Files:** `bmo/docker/Dockerfile` (new), `bmo/docker/compose.yml` (new), `bmo/docker/README.md` (new), `bmo/.dockerignore` (new), `.github/workflows/bmo-docker-build.yml` (new), `bmo/pi/tests/test_docker_deploy_files.py` (new).

**Steps:**
1. `bmo/docker/Dockerfile` (build context is `bmo/`, so COPY paths use the `pi/` prefix):
   ```dockerfile
   # syntax=docker/dockerfile:1
   FROM python:3.11-slim-bookworm
   ARG REQUIREMENTS=requirements.txt        # CI overrides with requirements-ci.txt
   RUN apt-get update && apt-get install -y --no-install-recommends \
         build-essential portaudio19-dev libsndfile1 ffmpeg vlc curl \
     && rm -rf /var/lib/apt/lists/*
   WORKDIR /app
   COPY pi/requirements*.txt ./
   RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r "$REQUIREMENTS"
   COPY pi/ /app/
   ENV PYTHONUNBUFFERED=1
   EXPOSE 5000
   HEALTHCHECK --interval=30s --timeout=5s CMD curl -sf http://localhost:5000/health || exit 1
   CMD ["python", "app.py"]
   ```
   Base/python pinned 3.11 to match the Pi venv and CI (F12). System packages mirror `bmo-pi-pytest.yml:42-47` (the proven non-Pi dependency set). Torch installed exactly as CI does (`bmo-pi-pytest.yml:52`).
2. `bmo/.dockerignore`: `pi/venv/`, `**/__pycache__/`, `pi/data/` (mounted at runtime), `docs/`, `pi/tests/`.
3. `bmo/docker/compose.yml`:
   ```yaml
   services:
     bmo-app:
       build: { context: .., dockerfile: docker/Dockerfile }
       container_name: bmo-app
       restart: unless-stopped
       network_mode: host            # :5000 + SocketIO + LAN mDNS reachability
       env_file: ../pi/.env
       environment:
         BMO_DISABLE_OLED: "1"       # I2C not mapped into the container
         BMO_DISABLE_CAMERA: "1"     # picamera2 needs host libcamera — unsupported in-container
       volumes:
         - ../pi/data:/app/data
       # Optional hardware passthrough — uncomment per-device:
       # devices:
       #   - /dev/snd:/dev/snd       # speakers/mic
       #   - /dev/i2c-1:/dev/i2c-1   # OLED/fan I2C (then drop BMO_DISABLE_OLED)
       #   - /dev/gpiomem0:/dev/gpiomem0
   ```
4. `bmo/docker/README.md`: what works in-container (Flask UI, agents, music-less API surface, D&D engine, game relay/registry, rclone/sounds/library APIs), what does not (OLED/camera/GPIO/voice without device passthrough; kiosk; fan), how to run (`cd bmo/docker && docker compose up -d --build`), and an explicit "**optional path — the supported deploy is host venv + systemd via setup-bmo.sh; do not run both bindings of :5000 at once**" banner. Note the existing four supporting containers (ollama/peerjs/coturn/pihole, `setup-bmo.sh:145-202`) are unrelated to this and unchanged (F11).
5. `.github/workflows/bmo-docker-build.yml`: build-only validation on native arm64 (no QEMU — free arm64 hosted runners for public repos, see Research notes):
   ```yaml
   name: bmo / docker build
   on:
     push:
       branches: [master, main]
       paths: ['bmo/docker/**', 'bmo/.dockerignore', 'bmo/pi/requirements*.txt', '.github/workflows/bmo-docker-build.yml']
     pull_request:
       paths: ['bmo/docker/**', 'bmo/.dockerignore', 'bmo/pi/requirements*.txt', '.github/workflows/bmo-docker-build.yml']
   permissions:
     contents: read
   concurrency:
     group: bmo-docker-${{ github.event.pull_request.number || github.ref }}
     cancel-in-progress: true
   jobs:
     build:
       runs-on: ubuntu-24.04-arm     # public-repo arm64 runner — matches the Pi (aarch64)
       timeout-minutes: 45
       steps:
         - uses: actions/checkout@v6
         - uses: docker/setup-buildx-action@v3
         - uses: docker/build-push-action@v6
           with:
             context: bmo
             file: bmo/docker/Dockerfile
             platforms: linux/arm64
             push: false
             build-args: REQUIREMENTS=requirements-ci.txt   # CI subset; full requirements.txt is Pi-local
             cache-from: type=gha
             cache-to: type=gha,mode=max
   ```
   (actions/checkout@v6 matches the repo's existing pin in `bmo-pi-pytest.yml:28`.)
6. New `bmo/pi/tests/test_docker_deploy_files.py`: `yaml.safe_load(compose.yml)` succeeds and pins `network_mode: host` + both `BMO_DISABLE_*` envs; Dockerfile text references only requirements files that exist under `bmo/pi/`; `.dockerignore` excludes `pi/venv/`; `bmo-docker-build.yml` parses and sets `push: false` + `permissions: contents: read` (the assertion itself can live here or in `test_deploy_workflow.py` — keep one place).

**Targeted checks:** `python -m pytest tests/test_docker_deploy_files.py -q`; if the Pi has spare disk and the executor wants a local smoke: `docker build -f bmo/docker/Dockerfile bmo` (optional — CI is the authoritative build check; do not block on local build time).

**Acceptance:** files land; tests green; after push, `gh run list --workflow=bmo-docker-build.yml` shows the arm64 build run (triggered by these paths changing) and it must conclude success.

### 42E — Docs, provisioning, and live rehearsal

**Objective:** documentation states the new truth; everything provisionable from the Pi/CLI is provisioned; the canary path is exercised once for real; the remaining console-only steps are a precise user checklist (the workflow stays safely dormant until they're done).

**Files:** `bmo/docs/DEPLOY.md`, `bmo/docs/SERVICES.md` (line 82), `bmo/docs/SYSTEMD.md`, plus live-host actions (no repo files).

**Steps:**
1. **DEPLOY.md rewrite:** replace "Future improvements" (lines 147-149 — dangling pointer, F1) with an "Automated deploy" section documenting: `deploy.sh` usage/flags/env knobs, the gate order (lock → clean tree → ff-only → pip → compileall → canary :5002 → selective restart → health gate → rollback), the canary semantics ("green candidate boots import-only on :5002; blue on :5000 is only restarted after green passes" — and why a traffic-swap blue/green is wrong on this host: hardware singletons, F5), the CI workflow trigger chain (`bmo / pi pytest` green on master push → `bmo / deploy`), the `BMO_AUTO_DEPLOY` repo-variable opt-in, `workflow_dispatch` manual deploys, and the Docker option (link `bmo/docker/README.md`). Update the "Laptop → Pi one-liner" section to recommend `ssh patrick@bmo.local "/home/patrick/home-lab/bmo/pi/scripts/deploy.sh"` and keep the raw old one-liner as the fallback. Update "Zero-downtime considerations" (lines 141-145) to describe the canary gate.
2. **SERVICES.md:82:** `| 5002 | (reserved) | future |` → `| 5002 | app.py (canary) | deploy-time boot check only (BMO_PORT/BMO_CANARY; see DEPLOY.md) |`.
3. **SYSTEMD.md:** in "Common commands", add the deploy.sh pointer as the preferred restart-after-update path; note the post-merge hook change (no auto-restart; LFS chained).
4. **Provisioning (executor-runnable now):** `gh variable set BMO_AUTO_DEPLOY --body "false"`; write the new live post-merge hook (42B step 12); verify `gh secret list` and surface in the run log that `TS_OAUTH_CLIENT_ID`/`TS_OAUTH_SECRET` are absent (expected — dormant mode).
5. **User checklist (console-only; put verbatim in DEPLOY.md):**
   - Tailscale admin console → Access controls: add `"tagOwners": {"tag:ci": ["autogroup:admin"], "tag:bmo": ["autogroup:admin"]}`; network ACL `{"action":"accept","src":["tag:ci"],"dst":["tag:bmo:22"]}`; SSH rules `{"action":"accept","src":["tag:ci"],"dst":["tag:bmo"],"users":["patrick"]}` and `{"action":"accept","src":["autogroup:member"],"dst":["tag:bmo"],"users":["patrick"]}` (the second preserves laptop→Pi Tailscale SSH after tagging, because tagging the node takes it out of `autogroup:self`).
   - Tag the Pi: `sudo tailscale up --ssh --advertise-tags=tag:bmo` (Pi is untagged today, F8; Tailscale SSH ACL `dst` needs a tagged device for non-self access).
   - Console → Settings → OAuth clients → new client with writable `auth_keys` scope, tag `tag:ci`; then `gh secret set TS_OAUTH_CLIENT_ID` / `gh secret set TS_OAUTH_SECRET`.
   - Opt in to auto-deploy when ready: `gh variable set BMO_AUTO_DEPLOY --body "true"`. Until then, deploys are manual (`gh workflow run "bmo / deploy"`).
6. **Live rehearsal (no service disruption):** from the phase tree, boot a real canary against the live venv — `cd <tree>/bmo/pi && BMO_CANARY=1 BMO_PORT=5002 /home/patrick/home-lab/bmo/pi/venv/bin/python app.py` backgrounded; `curl -sf http://localhost:5002/health` must return `{"status":"ok",…}`; kill it; confirm `curl -sf http://localhost:5000/health` (live instance) was never disturbed. Then `bash bmo/pi/scripts/deploy.sh --dry-run` against `/home/patrick/home-lab` (expect "already deployed"/no-op plan). Record both outputs in the Completed section.

**Targeted checks:** the two curl probes above; `grep -n "AI-DM-AUDIT" bmo/docs/DEPLOY.md` returns nothing after the rewrite.

**Acceptance:** docs updated with no dangling audit references; rehearsal canary answered on :5002 while :5000 stayed live; `BMO_AUTO_DEPLOY` variable exists and is `false`.

## Research notes

- **Transport choice — Tailscale over alternatives.** The Pi is already a tailnet node with MagicDNS (`bmo.tail31b5d9.ts.net`) and Tailscale SSH enabled (F8), so `tailscale/github-action` gives CI a zero-listening-port, WireGuard-encrypted path with ephemeral nodes that auto-deregister after the job — Tailscale's documented CI pattern ([docs: GitHub Action](https://tailscale.com/docs/integrations/github/github-action), [kb: secure GitHub runners](https://tailscale.com/kb/1586/secure-github-runners), [action repo — current major is **v4**, OAuth client must have writable `auth_keys` scope, ≥1 tag mandatory, `ping:` input verifies reachability](https://github.com/tailscale/github-action)). Worked deploy examples: [fariszr.com](https://fariszr.com/deploy-with-tailscale-ssh-github-action/), [gabrielaleks.com](https://gabrielaleks.com/blog/automated-deployments-to-a-private-server-using-tailscale-github-action/).
  - *Rejected: self-hosted runner on the Pi* — repo is public (F9); GitHub recommends only private repos use self-hosted runners because fork PRs can execute code on them ([security hardening docs](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)).
  - *Rejected: SSH over the Cloudflare tunnel* — tunnel is HTTP-only today (F10); adding SSH ingress + an Access app + a service token is dashboard-heavy and duplicates what the tailnet already provides.
  - *Rejected: pull-based poller on the Pi* (systemd timer polling origin/master + checks API) — zero inbound access needed, but no CI-side failure surfacing, and the audit item explicitly calls for the Actions→SSH shape.
  - *Caveat — Tailscale SSH vs forced commands:* with `RunSSH: true`, tailscaled (not OpenSSH) answers tailnet port 22, so `authorized_keys` `command="…"`/`restrict` options do NOT constrain CI; authorization lives in tailnet ACL `ssh` rules. If per-command confinement is ever wanted, the alternative is `tailscale set --ssh=false` + an OpenSSH forced-command deploy key — documented in DEPLOY.md as a hardening option, not implemented here.
- **`workflow_run` semantics.** Fires only from the workflow file on the default branch; gate on `conclusion == 'success'`, and because the pytest workflow also runs for PRs, additionally require `event == 'push'` and `head_branch == 'master'` ([events that trigger workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows), [NimblePros workflow_run write-up](https://blog.nimblepros.com/blogs/using-workflow-run-in-github-actions/)).
- **Secrets can't gate a job directly.** The `secrets` context is unavailable in job-level `if`; the supported pattern is a gate job exporting `secrets.X != ''` via step env → job output, consumed through `needs` ([actions/runner#520](https://github.com/actions/runner/issues/520), [cloudtruth write-up](https://cloudtruth.com/blog/skipping-jobs-in-github-actions-when-secrets-are-unavailable-securely-inject-configuration-secrets-into-github/)). The `vars` context IS legal in job-level `if` — used for the `BMO_AUTO_DEPLOY` opt-in ([contexts reference](https://docs.github.com/en/actions/learn-github-actions/contexts)).
- **arm64 CI runners.** `ubuntu-24.04-arm` hosted runners are free for public repos and GA since 2025-08 ([changelog: public preview](https://github.blog/changelog/2025-01-16-linux-arm64-hosted-runners-now-available-for-free-in-public-repositories-public-preview/), [changelog: GA](https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/)) — native arm64 Docker builds without QEMU, matching the Pi 5's aarch64.
- **Why canary-then-restart instead of true blue/green traffic swap.** Classic blue/green needs a fronting proxy and two concurrently-serving instances. On this host a second full instance contends for mic/GPIO/I2C/audio and double-fires timer alarms (F5), and every consumer (kiosk unit, dnd-app `bmo-bridge`, avahi advertisement, cloudflared ingress) pins :5000. The :5002 canary keeps the valuable property (new code proves it boots and serves `/health` before the live instance is touched) without the hazards; the residual exposure is the ~5-10 s systemd restart window, which `Restart=on-failure` plus the rollback path bounds. The `BMO_CANARY` import-only mode is what makes the canary safe (imports every module — the dominant breakage class — instantiates nothing).
- **Docker scope.** The archived compose proves the app was never containerized (F11); hardware services are the blocker (picamera2/libcamera, GPIO, ALSA). The shipped container therefore defaults to `BMO_DISABLE_OLED=1`/`BMO_DISABLE_CAMERA=1` with documented opt-in `devices:` passthrough, mirroring the CI dependency set that already proves the codebase runs hardware-free on generic Linux (`bmo-pi-pytest.yml:39-54`).

## Test plan

- **42A:** new `bmo/pi/tests/test_canary_mode.py` (canary skips hardware/instantiation; `BMO_PORT` honored; `/health` contract). Targeted: that file + `test_app_endpoints.py`.
- **42B:** new `bmo/pi/tests/test_deploy_script.py` (hermetic temp-repo dry-run matrix: ff-merge plan, requirements-change → pip line, dirty-tree abort, non-ancestor abort, already-deployed no-op, `--services-only`); `test_shell_scripts.py` gains `deploy.sh` in `ALL_SH_FILES` (shellcheck + `bash -n`).
- **42C:** new `bmo/pi/tests/test_deploy_workflow.py` (workflow-name chain integrity, permissions blocks, gate conditions, script-path existence).
- **42D:** new `bmo/pi/tests/test_docker_deploy_files.py` (compose parses + safety pins; Dockerfile references real requirements files; build workflow parses, `push: false`). The authoritative image-build check is the `bmo / docker build` Actions run post-push.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run` — plus, since this phase touches `bmo/pi/`, `cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/ -q` (or system python per `bmo-pi-pytest.yml` parity comment, line 1).

## Acceptance criteria

1. `BMO_PORT`/`BMO_CANARY` exist in `app.py`; defaults unset = byte-for-byte current behavior (port 5000, full init); canary mode imports every service module, instantiates none, and serves `/health` — proven by `test_canary_mode.py` AND a live rehearsal canary on :5002 that never disturbed the live :5000 instance.
2. `bmo/pi/scripts/deploy.sh` exists, is shellcheck-clean, and implements: lock, clean-tree/branch/root gates, ff-only merge to a validated ancestor of origin/master, conditional pip install, compileall, canary gate, selective restarts per the DEPLOY.md table, post-restart health gate, and automatic rollback (git + pip + restart) on red — dry-run test matrix green.
3. `setup-bmo.sh`'s post-merge hook block chains git-lfs and no longer blanket-restarts; the live hook matches.
4. `.github/workflows/bmo-deploy.yml` lands green-when-dormant: with TS secrets absent it skips with a `::notice`; auto-deploy requires BOTH secrets AND repo variable `BMO_AUTO_DEPLOY=true` (set to `false` by this phase); `workflow_dispatch` is the manual path; `permissions: contents: read` present.
5. `bmo/docker/{Dockerfile,compose.yml,README.md}` + `bmo/.dockerignore` land as a documented optional path (host venv stays default; nothing in setup-bmo.sh/systemd references the container); `bmo / docker build` workflow builds the arm64 image with `push: false` and concludes success on the phase's own push.
6. `bmo/docs/DEPLOY.md` has no reference to the deleted audit file; SERVICES.md port table row for 5002 reflects the canary; all four new pytest files green in the end-of-phase gate.

## Out of scope

- Fixing the missing `permissions:` block in the PRE-EXISTING `bmo-pi-pytest.yml` and all other workflow-permissions alerts → **PHASE-43** (this phase only guarantees its two NEW workflows are clean).
- The VTT→Discord bridge topology (`bmo-dm-bot` process split, in-process bot decision) and any systemd-unit changes beyond the post-merge hook block → **PHASE-20**.
- `scripts/apply_patch.py` removal / vtt_sync route registration → **PHASE-22**.
- Containerizing or compose-managing the four supporting containers (bmo-ollama/peerjs/coturn/pihole `docker run` blocks in `setup-bmo.sh:145-202`) — unchanged here; no phase owns a migration (log a suggestion if wanted).
- Publishing the Docker image to GHCR / image signing — build-validation only; future idea (log to `docs/BMO-SUGGESTIONS-LOG.md` if pursued).
- `systemctl reload`/SIGHUP zero-downtime hot-reload inside app.py (`DEPLOY.md:141-145` note) — superseded by the canary gate; not built.
- dnd-app/dungeon-scholar deploy/release flows (cut.mjs, Pages deploy) — untouched.

## Completed

*(filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations)*
