# Cloudflare Tunnel for BMO (`bmo.mybmoai.work`)

Cloudflared is installed. You need to complete **one manual step** (browser auth), then run the script.

## Step 1: Authorize Cloudflare (one-time)

SSH to the Pi and run:

```bash
cloudflared tunnel login
```

It will print a URL like:
```
https://dash.cloudflare.com/argotunnel?aud=&callback=...
```

**Open that URL** in a browser on your phone or computer, log in to Cloudflare, and select **mybmoai.work**. Authorize the tunnel.

The `cloudflared tunnel login` command will exit once you're done. The cert is saved to `~/.cloudflared/cert.pem`.

## Step 2: Run the setup script

```bash
cd ~/bmo
./scripts/setup-cloudflare-tunnel.sh
```

This will:
- Create the `bmo` tunnel
- Configure ingress to `http://localhost:5000`
- Create DNS: `bmo.mybmoai.work` → your Pi
- Install/restart the `cloudflared` systemd service
- Validate ingress config before restart

## Step 3: Access BMO

Open **https://bmo.mybmoai.work** from anywhere.

---

**Useful commands:**
- `sudo systemctl status cloudflared` — check status
- `sudo systemctl restart cloudflared` — restart tunnel
- `journalctl -u cloudflared -f` — view logs
- `cloudflared tunnel ingress validate` — validate config syntax
- `grep 'service: http://localhost:5000' /etc/cloudflared/config.yml` — verify Flask target

## CLI/SSH troubleshooting

### Diagnose (run on Pi)
```bash
cd ~/bmo
./scripts/diagnose-cloudflare.sh
```
Collects config, tunnel info, status, logs, DNS. Share output when debugging Error 1043.

### Quick reliability checks after reboot/network change
```bash
sudo systemctl is-active cloudflared
curl -s -o /dev/null -w "local Flask: HTTP %{http_code}\n" http://localhost:5000/
cloudflared tunnel ingress validate
```

Expected:
- `cloudflared` is `active`
- local Flask returns `HTTP 200`
- ingress validation passes

### Add Access JWT validation (run on Pi, after Access works)
Adds defense-in-depth so cloudflared rejects requests without a valid Access JWT:
```bash
cd ~/bmo
./scripts/apply-access-config.sh
```
Uses AUD tag and team name from your existing Access app. Edit the script if yours differ.

### Re-save Access app via API (any machine, optional)
Sometimes re-saving the Access application fixes Error 1043:
```bash
export CLOUDFLARE_ACCOUNT_ID=<your-account-id>   # from Zero Trust URL
export CLOUDFLARE_API_TOKEN=<your-api-token>     # Zero Trust Edit permission
./scripts/cloudflare-access-api.sh
```

## Realtime / websocket verification (added 2026-06-24 — PHASE-02 02E)

socket.io starts on HTTP long-polling and then **upgrades** to a websocket via a separate request. The dashboard chat and the IDE terminal depend on socket.io *event delivery*; if the upgrade never completes (the client churns on `transport=polling` with rotating session IDs and a stale-session `400`), those features hang silently. The app itself is WS-capable — single-process gevent with `gevent-websocket` pinned (`bmo/pi/requirements.txt`), `SocketIO(app, async_mode="gevent", cors_allowed_origins="*")` (`bmo/pi/app.py`), no transport restriction — so the suspect is the **edge path (Cloudflare Access / tunnel)**, not Flask.

### Step 1 — Decide LAN vs tunnel (the decisive measurement)

1. On the LAN, open `http://bmo.local:5000/bmo` (bypasses Cloudflare entirely).
2. Open the browser network panel, filter `/socket.io/`.
3. Watch the transport: a healthy session shows an initial `transport=polling` request **then** a `transport=websocket` (HTTP 101 Switching Protocols) upgrade.

- **Upgrades to `websocket` on the LAN but stays `polling` over `https://bmo.mybmoai.work`** → the defect is the **edge (Access/tunnel)**, not the app. Go to Step 2.
- **Stays `polling` even on the LAN** → the app/runtime refuses the upgrade (unexpected, given the pinned deps). Re-check that the gevent worker is the one serving (not a fallback), then file an issue; do **not** restrict transports to websocket-only (that removes the working polling fallback).

### Step 2 — Owner action: allow the websocket upgrade through Cloudflare Access

> Live tunnel/Access edits mutate production and are an **owner action** — the phase-executer does not run these (INSTRUCTIONS rule 6). Commands below are the exact steps.

cloudflared proxies websockets by default, so the usual culprit is **Cloudflare Access** sitting in front of `/socket.io/`: the upgrade request may not carry the Access JWT/cookie and gets blocked. Fix is one of:

1. **Scoped bypass / service-token policy for the realtime path.** In Zero Trust → Access → your `bmo.mybmoai.work` application, add a policy (or a dedicated app) covering the path `/socket.io/*` that either bypasses Access or accepts a service token, so the upgrade isn\x27t challenged. Keep the rest of the host behind the normal policy.
2. **Ensure the upgrade carries the Access cookie** (if you prefer not to bypass): confirm the browser sends `CF_Authorization` on the `/socket.io/` upgrade request (same-origin, so it should) and that no path rule strips it.

Validate the tunnel ingress before/after:
```bash
cloudflared tunnel ingress validate            # config syntax OK
cloudflared tunnel ingress rule https://bmo.mybmoai.work/socket.io/   # which ingress rule matches
```
Then re-run **Step 1** against the external URL and confirm the `websocket` (101) upgrade now appears and chat/IDE recover.

See also [`NETWORK_ACCESS.md`](./NETWORK_ACCESS.md) for the Access app overview.

### Verification result (2026-06-24)

Ran Step 1 + a direct upgrade probe from the Pi. **The websocket upgrade completes end-to-end through Cloudflare — no edge fix is needed.**

- App side (`http://127.0.0.1:5000/socket.io/?EIO=4&transport=polling`): handshake advertises `"upgrades":["websocket"]`.
- External polling (`https://bmo.mybmoai.work/socket.io/?EIO=4&transport=polling`): **HTTP 200** — Cloudflare Access does **not** challenge `/socket.io/` (it reaches Flask).
- External websocket upgrade (same URL, `transport=websocket` + `Upgrade: websocket`): **`HTTP/1.1 101 Switching Protocols`** with a valid `Sec-WebSocket-Accept` and a `CF-RAY` header (so it traversed Cloudflare\x27s edge) — identical to the LAN result.

Conclusion: cloudflared proxies the upgrade and Access permits it; the QA-observed "stuck on polling" was transient / client-side, now further guarded by PHASE-02\x27s explicit reconnection + upgrade-error breadcrumb. **An Access bypass on `/socket.io/*` was deliberately NOT applied** — it would expose the realtime channel without auth for no current benefit. Re-open this section only if a future QA pass reproduces a stuck-on-polling state AND the 101 probe above fails externally.
