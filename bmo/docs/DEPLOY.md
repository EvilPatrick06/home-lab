# Deploying BMO

How to update BMO running on the Pi from your laptop.

## Current model: SSH + git

User is on the Pi directly (`/home/patrick/home-lab/`) AND keeps a laptop clone for editing. Laptop edits → commit/push → pull on Pi → restart services.

```
laptop ──(git push)──► GitHub ──(git pull)──► Pi ──► systemctl restart
```

## Laptop → Pi one-liner

After pushing to GitHub from laptop, drive the health-gated deploy script (recommended — fetches, ff-only merges, runs a canary boot, then selectively restarts and rolls back on any red):

```bash
ssh patrick@bmo.local "/home/patrick/home-lab/bmo/pi/scripts/deploy.sh"
```

See [Automated deploy](#automated-deploy) for flags, env knobs, and the full gate order.

Raw fallback (no canary, no rollback — only if `deploy.sh` is unavailable):

```bash
ssh patrick@bmo.local "cd ~/home-lab && git pull && sudo systemctl restart bmo"
```

The legacy `bmo/docker/deploy.sh` helper (SSH + scp to a flat `~/bmo/` layout) is recoverable from git history (`git log --all --full-history -- bmo/docker/deploy.sh`). The script above is the current workflow.

## When dev directly on Pi

(i.e., editing in Cursor over SSH, or with a monitor connected)

```bash
cd ~/home-lab/bmo/pi
# make changes
sudo systemctl restart bmo                        # reload Python changes
journalctl -u bmo -f                              # verify
```

## Partial restarts

Don't restart everything if you didn't touch everything:

| Changed | Restart |
|---|---|
| `app.py`, `agents/*`, `services/*` | `bmo` |
| `bots/*` | `bmo-dm-bot bmo-social-bot` |
| `hardware/fan_control.py` | `bmo-fan` |
| `ide_app/*` | `bmo-ide` (if enabled) |
| Systemd service files | `daemon-reload` + relevant service |
| Docker config | `docker compose restart <container>` |

## Hot-reload (dev)

For fast iteration without systemctl restart:

```bash
cd ~/home-lab/bmo/pi
sudo systemctl stop bmo
./venv/bin/python app.py           # foreground, Ctrl-C to stop
```

Makes changes, Ctrl-C, re-run. Don't forget:

```bash
sudo systemctl start bmo           # re-enable systemd when done
```

## Updating Python dependencies

```bash
cd ~/home-lab/bmo/pi
./venv/bin/pip install -r requirements.txt        # runtime
./venv/bin/pip install -r requirements-test.txt   # test-only
./venv/bin/pip list --outdated                    # what's upgradable
./venv/bin/pip install --upgrade pkg-name         # upgrade one
# commit updated requirements.txt if version pins change
```

## Database migrations

BMO uses SQLite for:
- `data/campaign_memory.db` (per-campaign long-term memory)
- `data/bmo_social.db` (Discord social bot stats)

No formal migration framework. If schema changes:
1. Add migration SQL in the module that owns the DB
2. Run on service start (check `PRAGMA user_version` etc.)
3. OR backup DB + delete + recreate if you're OK losing data

## Rolling back a bad deploy

```bash
cd ~/home-lab
git log --oneline -10                    # find last-known-good SHA
git reset --hard <SHA>                   # CAREFUL: discards anything newer
sudo systemctl restart bmo bmo-dm-bot bmo-social-bot
```

Then on laptop, investigate what went wrong with the reverted commits before re-pushing.

## Checking deploy success

```bash
# Services active?
systemctl is-active bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot

# HTTP responsive?
curl -sf http://localhost:5000/health

# No errors in logs?
journalctl -u bmo --since "2 min ago" | grep -iE "error|traceback|fatal" | head

# Tests pass?
cd ~/home-lab/bmo/pi
./venv/bin/python -m pytest tests/ --tb=no -q
```

If any red flags → [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).

## Remote access setup (for deploy from anywhere)

### Option 1: LAN only (simplest)

Works when laptop + Pi are on the same WiFi.

```bash
ssh patrick@bmo.local     # mDNS-resolved
```

### Option 2: Tailscale (recommended)

Free for up to 100 devices. Zero-config mesh VPN.

1. Install on Pi: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`
2. Install on laptop, log in to same Tailscale account
3. `ssh patrick@bmo.your-tailnet.ts.net`

Setup helper: `bmo/pi/scripts/setup-tailscale.sh`

### Option 3: Cloudflare Tunnel (if exposing web UI)

For making BMO's web UI accessible at a domain (e.g., `https://bmo.mybmoai.work`).

See `bmo/docs/CLOUDFLARE_TUNNEL_SETUP.md`.

## Zero-downtime considerations

BMO systemd has `Restart=on-failure` + `RestartSec=5`. A crash restarts within ~5s.

`deploy.sh` minimizes the risk of a bad deploy (not the restart blip itself): it validates a hardware-free **canary** boot of the candidate code on `:5002` *before* touching the live `:5000` services, so a syntax error / import failure / route-registration crash is caught while the running blue instance is still serving. The brief restart window remains — BMO owns hardware singletons (mic / OLED / LEDs), so only one process can run at a time and a true traffic-swap blue/green is not possible (see [Automated deploy](#automated-deploy)). `systemctl reload` is not implemented (would need a SIGHUP handler in `app.py`).

## Automated deploy

`bmo/pi/scripts/deploy.sh` is the supported one-shot updater. It is idempotent, lockable (single concurrent run), and health-gated, rolling the working tree back to the pre-deploy SHA if any gate fails.

### Usage

```bash
/home/patrick/home-lab/bmo/pi/scripts/deploy.sh [TARGET_SHA] [--dry-run] [--services-only] [--no-canary]
```

- `TARGET_SHA` — deploy a specific commit instead of the current `origin/master` tip (must be a descendant of `HEAD` — the merge is ff-only).
- `--dry-run` — run every read-only gate and print the plan; make no changes.
- `--services-only` — skip the git update; just re-run canary + restart + health gate against the already-checked-out tree.
- `--no-canary` — skip the `:5002` canary boot (faster, but loses the pre-restart validation).

### Env knobs

| Var | Default | Meaning |
|---|---|---|
| `BMO_DEPLOY_REPO_ROOT` | autodetected | Repo root the script operates on |
| `BMO_DEPLOY_CANARY_PORT` | `5002` | Port the canary instance binds |
| `BMO_DEPLOY_CANARY_TIMEOUT` | `120` | Seconds to wait for the canary `/health` |
| `BMO_DEPLOY_HEALTH_TIMEOUT` | `90` | Seconds to wait for live `:5000` `/health` after restart |

### Gate order

The script aborts (and, past the merge, rolls back) on the first red gate:

1. **lock** — acquire the deploy lock (refuse if another deploy is running)
2. **root-check** — refuse to run as root (services run as `patrick`)
3. **clean-tree** — refuse if the working tree has uncommitted changes
4. **branch=master** — refuse unless on `master`
5. **resolve target** — `git fetch`, then verify the target SHA is an ancestor-clean fast-forward of the current `HEAD`
6. **ff-only merge** — fast-forward the tree to the target (no merge commits)
7. **pip** — `pip install -r requirements.txt` *only if* `requirements.txt` changed in this update
8. **compileall** — `python -m compileall` syntax sweep over the tree
9. **canary boot** — boot the candidate on `:5002` and wait for `/health` (unless `--no-canary`)
10. **restart** — selective `systemctl restart` of only the services whose code changed
11. **health gate** — wait for live `:5000` `/health`
12. **rollback** — on any red after the merge: `git reset --hard` to the pre-deploy SHA + restart, so the Pi never sits on a half-deployed tree

### Canary semantics

```bash
BMO_CANARY=1 BMO_PORT=5002 python app.py
```

In canary mode `app.py` boots a **hardware-free** instance: it imports every module, registers every route, and answers `/health`, but does **not** touch hardware, audio, alarms, or background pollers. `deploy.sh` validates this green candidate on `:5002` *before* it restarts the live blue services on `:5000`.

A real traffic-swap blue/green (run green alongside blue, flip a proxy) is **deliberately not used here**: BMO owns hardware singletons (only one process can hold the mic / OLED / LEDs at a time), so two full instances cannot coexist. The canary is the most isolation we can get — it exercises the import/route/boot path without contending for hardware, then the single live process is restarted in place.

### CI deploy (auto-deploy-on-merge)

`.github/workflows/bmo-deploy.yml` chains off the test workflow:

```
push to master ──► bmo / pi pytest ──(green)──► bmo / deploy
```

`bmo / deploy` joins the tailnet ephemerally (Tailscale OAuth secrets `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET`), SSHes to the Pi over **Tailscale SSH** (no SSH-key secret stored), and runs `deploy.sh <head_sha>`.

The workflow is **dormant until the OAuth secrets are set**. Even with secrets present, auto-deploy-on-merge is additionally gated behind the repo variable `BMO_AUTO_DEPLOY` — it must be `true` to deploy on merge (default off). A `workflow_dispatch` trigger always allows a manual deploy from the Actions tab regardless of `BMO_AUTO_DEPLOY`.

### Docker option

A containerized deploy lives in `bmo/docker/` (Dockerfile + `compose.yml`), validated on arm64 by `.github/workflows/bmo-docker-build.yml`. It is **off by default** — host venv + systemd remains the supported deploy path. See [`bmo/docker/README.md`](../docker/README.md).

## CI deploy provisioning (console-only — do once)

These steps are done by hand in the Tailscale admin console + via `gh`; they are intentionally **not** scripted (one-time account-level config):

1. **Tailscale admin console → Access controls.** Add the tag owners, the network ACL granting CI SSH access to the Pi, and the SSH rules (the second SSH rule preserves laptop → Pi Tailscale SSH after the Pi is tagged):

   ```jsonc
   "tagOwners": {
     "tag:ci":  ["autogroup:admin"],
     "tag:bmo": ["autogroup:admin"]
   }
   ```

   ```jsonc
   // network ACL
   {"action": "accept", "src": ["tag:ci"], "dst": ["tag:bmo:22"]}
   ```

   ```jsonc
   // SSH rules
   {"action": "accept", "src": ["tag:ci"],            "dst": ["tag:bmo"], "users": ["patrick"]}
   {"action": "accept", "src": ["autogroup:member"], "dst": ["tag:bmo"], "users": ["patrick"]}
   ```

2. **Tag the Pi:**

   ```bash
   sudo tailscale up --ssh --advertise-tags=tag:bmo
   ```

3. **Create a Tailscale OAuth client** (scoped to `tag:ci`) and store the credentials as repo secrets:

   ```bash
   gh secret set TS_OAUTH_CLIENT_ID --body "<client-id>"
   gh secret set TS_OAUTH_SECRET    --body "<client-secret>"
   ```

4. **To enable auto-deploy-on-merge** (otherwise leave unset/false for manual-`workflow_dispatch`-only):

   ```bash
   gh variable set BMO_AUTO_DEPLOY --body "true"
   ```
