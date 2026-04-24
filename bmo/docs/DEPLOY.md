# Deploying BMO

How to update BMO running on the Pi from your laptop.

## Current model: SSH + git

User is on the Pi directly (`/home/patrick/home-lab/`) AND keeps a laptop clone for editing. Laptop edits → commit/push → pull on Pi → restart services.

```
laptop ──(git push)──► GitHub ──(git pull)──► Pi ──► systemctl restart
```

## Laptop → Pi one-liner

After pushing to GitHub from laptop:

```bash
ssh patrick@bmo.local "cd ~/home-lab && git pull && sudo systemctl restart bmo"
```

The legacy `bmo/docker/deploy.sh` helper (SSH + scp to a flat `~/bmo/` layout) is archived at `_archive_system_cleanup/bmo/docker/deploy.sh`. The one-liner above is the current workflow.

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

For near-zero-downtime deploys, use `systemctl reload` where supported (not currently — add if desired via SIGHUP handler in app.py).

## Future improvements

- CI/CD: GitHub Actions → SSH to Pi on merge to master (see [`ISSUES-LOG.md`](../../docs/ISSUES-LOG.md) future-idea entries)
- Blue/green: run two BMO instances on :5000 and :5002, swap via a tiny routing proxy — overkill for solo use
- Container deploy: wrap BMO in Docker, rollback = `docker-compose up -d --force-recreate` of specific image tag
