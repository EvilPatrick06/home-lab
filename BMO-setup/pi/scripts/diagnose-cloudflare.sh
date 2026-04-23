#!/bin/bash
# Cloudflare Tunnel + Access diagnostics for BMO
# Run on the Pi via: ssh patrick@bmo.local 'bash -s' < scripts/diagnose-cloudflare.sh
# Or: ssh patrick@bmo 'cd ~/bmo && ./scripts/diagnose-cloudflare.sh'

set -e
echo "=== Cloudflare Tunnel + Access Diagnostics ==="
echo ""

echo "--- 1. cloudflared config ---"
if [ -f /etc/cloudflared/config.yml ]; then
  cat /etc/cloudflared/config.yml
else
  echo "NOT FOUND: /etc/cloudflared/config.yml"
fi
echo ""

echo "--- 2. cloudflared version ---"
cloudflared --version 2>/dev/null || echo "cloudflared not in PATH"
echo ""

echo "--- 3. Tunnel list ---"
cloudflared tunnel list 2>&1 || echo "Could not list tunnels"
echo ""

echo "--- 4. Tunnel info (bmo) ---"
cloudflared tunnel info bmo 2>&1 || echo "Could not get tunnel info"
echo ""

echo "--- 5. Ingress validation ---"
cloudflared tunnel ingress validate 2>&1 || true
echo ""

echo "--- 6. systemd status ---"
systemctl status cloudflared --no-pager 2>&1 || true
echo ""

echo "--- 7. Recent cloudflared logs (last 30 lines) ---"
journalctl -u cloudflared -n 30 --no-pager 2>&1 || true
echo ""

echo "--- 8. DNS resolution for bmo.mybmoai.work ---"
getent hosts bmo.mybmoai.work 2>/dev/null || host bmo.mybmoai.work 2>/dev/null || dig +short bmo.mybmoai.work 2>/dev/null || echo "Could not resolve"
echo ""

echo "--- 9. Local app check (curl localhost:5000) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5000/ 2>/dev/null || echo "Failed to connect"
echo ""

echo "--- 10. Ingress target sanity check ---"
if [ -f /etc/cloudflared/config.yml ]; then
  if grep -q "service: http://localhost:5000" /etc/cloudflared/config.yml; then
    echo "OK: ingress targets http://localhost:5000"
  else
    echo "WARNING: ingress target is not http://localhost:5000"
  fi
else
  echo "Cannot validate ingress target: missing /etc/cloudflared/config.yml"
fi
echo ""

echo "--- 11. Credentials files ---"
ls -la ~/.cloudflared/*.json 2>/dev/null || echo "No credential files"
echo ""

echo "=== Done. Share this output for troubleshooting. ==="
