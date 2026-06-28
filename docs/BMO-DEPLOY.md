# BMO Pi deploy — deploy-from-clean-checkout model

> Canonical runbook for how bmo Pi code reaches the live services.
> Script: [`bmo/pi/scripts/deploy.sh`](../bmo/pi/scripts/deploy.sh).
> CI trigger: [`.github/workflows/bmo-deploy.yml`](../.github/workflows/bmo-deploy.yml).

## TL;DR

Deploys run from a **dedicated, deploy-owned git checkout**
(`/home/patrick/home-lab-deploy`), **not** from the shared dev/integrator tree
(`/home/patrick/home-lab`). `deploy.sh` `git fetch`es origin and
`git reset --hard`s that checkout to a validated target SHA, validates it
(syntax sweep + hardware-free canary), restarts only the affected systemd units,
and gates on `/health` — rolling back on any failure.

Because **nothing edits the deploy checkout by hand**, a dirty dev tree —
in-progress human edits, agent worktrees, or an interrupted integrator merge —
can **never again block or pollute a deploy**. The old "refuse to deploy while
the working tree is dirty" gate is gone; the dev tree is no longer
deploy-relevant.

## Why this exists

`deploy.sh` used to fast-forward `/home/patrick/home-lab` in place and restart
the services that run out of it. But that path is also the **shared dev /
integrator tree**: humans edit it, the daily integrator merges `auto/*` branches
on it, and scheduled agents churn around it. It got left dirty (a half-finished
integrator merge killed mid-flight by a rate-limit wave; staged/uncommitted
edits; agent `.env` backups), and the dirty-tree gate then refused every deploy.

The fix decouples the deploy from that mutable tree entirely.

## Runtime topology (what runs from where)

All bmo services run out of `<checkout>/bmo/pi` via systemd
(`WorkingDirectory`, the `venv/`, and `EnvironmentFile=.env` all live there):

| Unit | Runs |
|---|---|
| `bmo` | `venv/bin/python app.py` (main, `/health` on :5000) |
| `bmo-dm-bot` / `bmo-social-bot` | `venv/bin/python -m bots.discord_*_bot` |
| `bmo-fan` | system `python3 hardware/fan_control.py` |
| `bmo-voice-canary`, `bmo-ide`, `bmo-kiosk`, `bmo-backup*` | also rooted at `<checkout>/bmo/pi` |

`deploy.sh` restarts only `bmo`, `bmo-dm-bot`, `bmo-social-bot`, `bmo-fan`
(selectively, by which files changed). After migration `<checkout>` is
`/home/patrick/home-lab-deploy`.

Runtime state lives **inside** `<checkout>/bmo/pi` as **untracked / gitignored**
files, so `git reset --hard` (which only rewrites tracked files) never disturbs
it:

- `venv/` — the Python virtualenv (gitignored)
- `.env`, `.env.*` — secrets / config (gitignored)
- `config/` — `credentials.json`, `token.json` (gitignored)
- `data/` — a **mix**: tracked content (`5e/`, `5e-references/`, `personality/`,
  `rag_data/`, `games/`) plus untracked runtime state (`*.db`, `*.json`, `logs/`,
  `memory/`, …). The tracked content comes from git; the untracked runtime
  survives every reset.

## What `deploy.sh` does (gates)

1. **Lock** — `flock -n /tmp/bmo-deploy.lock` (one deploy at a time).
2. **Checkout root** — `$BMO_DEPLOY_REPO_ROOT` (default
   `/home/patrick/home-lab-deploy`) must exist and resolve to itself; otherwise
   fail loudly (migration not run).
3. **Resolve & validate target** — `git fetch origin master`; `TARGET` defaults
   to `origin/master` (or a 7–40 hex arg), and **must be an ancestor of
   `origin/master`** (no arbitrary/unpushed SHAs). Unexpected *tracked* dirt in
   the checkout is logged as a WARNING (diagnosis) but is **not** blocking — it
   is discarded by the reset.
4. **Reset to target** — `git reset --hard $TARGET` (replaces the old
   `merge --ff-only`; safe because the checkout is deploy-owned, and it can move
   in either direction for a deliberate roll-back).
   - **4b. Clean-checkout integrity check** — after the reset, `HEAD` must equal
     `TARGET` and the tracked tree must be clean; otherwise roll back. This is
     the replacement for the old dirty-tree gate.
5. **Deps** — `pip install -r requirements.txt` if it changed.
6. **Syntax sweep** — `compileall` over `bmo/pi` (venv excluded).
7. **Canary** — boot `app.py` with `BMO_CANARY=1` on **:5002**, gate on its
   `/health`. Roll back if red.
8. **Selective restart** — restart only the affected units.
9. **Health gate** — main `/health` on **:5000** + `systemctl is-active`. Roll
   back if red.
10. **Marker** — record the deployed SHA in `/home/patrick/.bmo-deployed-sha`.

`--dry-run` echoes every mutating command (`[dry-run] …`) and makes no changes.
`--services-only` restarts affected units without resetting/validating.
`--no-canary` skips the :5002 canary (still does reset + restart + :5000 gate).

Rollback (`rollback()`) hard-resets the checkout to the previous SHA, reinstalls
deps if they changed, restarts the same units, and re-polls `/health`.

> The script file itself is invoked from the **dev tree** copy
> (`/home/patrick/home-lab/bmo/pi/scripts/deploy.sh`, per `bmo-deploy.yml`), so it
> is never `reset` out from under itself — it only git-operates on the separate
> deploy checkout.

## One-time owner migration

This is a **one-time** cutover from the in-place dev-tree deploy to the dedicated
checkout. A helper script encodes every step and **defaults to a dry run**:

```bash
# On bmo, as patrick. Dry run first (prints the plan, changes nothing):
/home/patrick/home-lab/bmo/pi/scripts/migrate-bmo-deploy-checkout.sh

# When the plan looks right, apply it:
/home/patrick/home-lab/bmo/pi/scripts/migrate-bmo-deploy-checkout.sh --apply
```

What `--apply` does (and the equivalent manual steps):

1. **Create the deploy checkout** — clone the repo to
   `/home/patrick/home-lab-deploy` (cloned from the local dev tree for speed, then
   `origin` is set to GitHub for fully independent fetches) and `reset --hard` it
   to the currently-deployed SHA.
   ```bash
   git clone /home/patrick/home-lab /home/patrick/home-lab-deploy
   git -C /home/patrick/home-lab-deploy remote set-url origin \
       https://github.com/EvilPatrick06/home-lab.git
   git -C /home/patrick/home-lab-deploy fetch origin master
   git -C /home/patrick/home-lab-deploy reset --hard "$(cat /home/patrick/.bmo-deployed-sha)"
   ```
2. **Seed runtime state** — copy `.env`, `.env.*`, `config/`, and the **untracked**
   files under `data/` + `logs/` into the deploy checkout (tracked content comes
   from git).
3. **Build the venv** — rebuild it in the deploy checkout via
   `bmo/pi/scripts/install-venv.sh` (a *copied* venv would keep the old path in
   its console-script shebangs, so it is rebuilt cleanly — this downloads
   torch/deps and takes a while).
4. **Repoint systemd** — replace `/home/patrick/home-lab/bmo/pi` with
   `/home/patrick/home-lab-deploy/bmo/pi` in the installed unit files
   (`bmo`, `bmo-dm-bot`, `bmo-social-bot`, `bmo-fan`, `bmo-voice-canary`,
   `bmo-ide`, `bmo-kiosk`, `bmo-backup`, `bmo-backup-verify`) and any installed
   `logrotate.d` configs, then `systemctl daemon-reload`. The tracked unit
   **templates** in `bmo/pi/systemd/` already reference the new path.
5. **Restart + health-check** — restart `bmo bmo-dm-bot bmo-social-bot bmo-fan`,
   poll `:5000/health`, and write the marker.

After migration:

- Confirm a deploy plans cleanly: `/home/patrick/home-lab/bmo/pi/scripts/deploy.sh --dry-run`.
- The shared dev tree (`/home/patrick/home-lab`) may now be dirty / mid-merge
  with **zero** effect on deploys.
- The old runtime state under `/home/patrick/home-lab/bmo/pi` can stay for
  dev/test; it is no longer read by the live services.

### Worktree alternative

A `git worktree add /home/patrick/home-lab-deploy <SHA>` off the existing repo
also works and is lighter (shared object store, own `HEAD`/index). A **separate
clone** (above) is the default here because it removes even the shared-`.git`
contention — the deploy checkout's git state is then 100% independent of the dev
tree and any interrupted merge in it.

## Environment overrides

| Var | Default | Meaning |
|---|---|---|
| `BMO_DEPLOY_REPO_ROOT` | `/home/patrick/home-lab-deploy` | the deploy checkout |
| `BMO_DEPLOY_CANARY_PORT` | `5002` | canary `/health` port |
| `BMO_DEPLOY_CANARY_TIMEOUT` | `120` | canary wait (s) |
| `BMO_DEPLOY_HEALTH_TIMEOUT` | `90` | live `/health` wait (s) |
| `BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT` | unset | test harness: allow a non-standard root |
