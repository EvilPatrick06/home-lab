# Cloudflare Tunnel for BMO (bmo.mybmoai.work)

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
./setup-cloudflare-tunnel.sh
```

This will:
- Create the `bmo` tunnel
- Configure it for `http://localhost:5000`
- Create DNS: `bmo.mybmoai.work` → your Pi
- Install and start the systemd service

## Step 3: Access BMO

Open **https://bmo.mybmoai.work** from anywhere.

---

**Useful commands:**
- `sudo systemctl status cloudflared` — check status
- `sudo systemctl restart cloudflared` — restart tunnel
- `journalctl -u cloudflared -f` — view logs

## CLI/SSH troubleshooting

### Diagnose (run on Pi)
```bash
cd ~/bmo
./scripts/diagnose-cloudflare.sh
```
Collects config, tunnel info, status, logs, DNS. Share output when debugging Error 1043.

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
