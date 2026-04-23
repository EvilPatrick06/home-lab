# BMO Network Access (Travel + IP Change Safe)

This guide is for Raspberry Pi OS Lite (headless) with kiosk mode and no keyboard/mouse.

## Goals
- Keep local LAN access stable: `bmo.local`
- Keep remote SSH stable even when LAN IP changes: Tailscale
- Keep remote web stable: Cloudflare Tunnel (`https://bmo.mybmoai.work`)
- Preserve operator command target: `ssh patrick@bmo`

## Immediate recovery when traveling (no keyboard/mouse, no Ethernet)

### 1) Fastest path: Android USB tether to Pi
If your Pi is currently offline and you can connect your Android phone to a Pi USB-A port:

1. Plug phone into Pi with a data-capable USB cable.
2. On Android, enable **USB tethering**.
3. Wait ~30-60s for DHCP/default route on Pi.
4. Try SSH from laptop:
   - `ssh patrick@bmo.local`
   - or `ssh patrick@bmo` (if SSH alias/Tailscale path already configured)
5. Once in, verify:
   - `systemctl is-active bmo`
   - `systemctl is-active cloudflared`
   - `tailscale status` (if installed)

If Tailscale and cloudflared were already configured, they should reconnect automatically once internet is restored.

### 2) Storage-edit fallback (Wi-Fi pre-provision)
Use this if USB tether does not bring the Pi online and SSH is unreachable.

1. Power off Pi and attach storage to laptop (or use the image workflow you normally use).
2. Add/update Wi-Fi provisioning so Pi can join the current network at boot.
3. Ensure SSH is enabled.
4. Boot Pi and retry:
   - `ssh patrick@bmo.local`
   - `ssh patrick@bmo`

### 3) Optional assisted paths
- **USB serial console** can work with proper USB-TTL adapter and wiring.
- **HDMI to laptop** usually does not work because most laptop HDMI ports are output-only.
  It only helps if you have HDMI capture-capable input hardware.

## Stable day-to-day access model

### Local (same Wi-Fi/LAN)
- SSH: `ssh patrick@bmo.local`
- Web: `http://bmo.local:5000`

### Remote (different network, changing LAN IP)
- SSH: Tailscale (recommended)
- Web: Cloudflare Tunnel (`https://bmo.mybmoai.work`)

## Optional home static-IP profile (not required for travel)

If you want predictable home LAN addressing, set a DHCP reservation in your router
for the Pi MAC address. This is optional and should not be required for your travel flow.

- Recommended: keep travel mode DHCP + mDNS + Tailscale.
- Optional at home: DHCP reservation for convenience (for example, to match old bookmarks).

## Windows OpenSSH alias (recommended)
Create or edit `%USERPROFILE%\.ssh\config`:

```sshconfig
Host bmo
    HostName bmo.tailnet-name.ts.net
    User patrick
    ConnectTimeout 5

Host bmo-local
    HostName bmo.local
    User patrick
    ConnectTimeout 5
```

Then:
- Remote-stable command: `ssh patrick@bmo`
- Local explicit fallback: `ssh patrick@bmo-local`

## Cloudflare reliability checks (Flask app)

Run on Pi:

```bash
sudo systemctl is-active cloudflared
cloudflared tunnel ingress validate
grep "service: http://localhost:5000" /etc/cloudflared/config.yml
curl -s -o /dev/null -w "local Flask: HTTP %{http_code}\n" http://localhost:5000/
```

Expected:
- `cloudflared` is active
- ingress validation succeeds
- config points to `http://localhost:5000`
- local Flask returns HTTP 200
