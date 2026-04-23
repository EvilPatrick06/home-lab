#!/bin/bash
# Cloudflare Tunnel setup for BMO @ bmo.mybmoai.work
# Run this AFTER: cloudflared tunnel login (and completing the browser auth)

set -euo pipefail

DOMAIN="${CLOUDFLARE_DOMAIN:-bmo.mybmoai.work}"
TUNNEL_NAME="${CLOUDFLARE_TUNNEL_NAME:-bmo}"
LOCAL_SERVICE_URL="${BMO_LOCAL_SERVICE_URL:-http://localhost:5000}"

echo "[1/6] Resolving tunnel..."
TUNNEL_ID="$(cloudflared tunnel list 2>/dev/null | awk -v name="$TUNNEL_NAME" '$2==name {print $1}' | head -1 || true)"
if [ -z "$TUNNEL_ID" ]; then
  echo "No existing tunnel named '$TUNNEL_NAME' found. Creating..."
  CREATED="$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)"
  echo "$CREATED"
  TUNNEL_ID="$(echo "$CREATED" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1 || true)"
fi

if [ -z "$TUNNEL_ID" ]; then
  echo "Could not determine tunnel ID for '$TUNNEL_NAME'."
  exit 1
fi
echo "Tunnel ID: $TUNNEL_ID"

CRED_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"
if [ ! -f "$CRED_FILE" ]; then
  echo "Credentials file not found: $CRED_FILE"
  echo "Run: cloudflared tunnel login"
  exit 1
fi

echo "[2/6] Writing /etc/cloudflared/config.yml..."
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml > /dev/null << EOF
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: $DOMAIN
    service: $LOCAL_SERVICE_URL
  - service: http_status:404
EOF

echo "[3/6] Validating ingress..."
cloudflared tunnel ingress validate

echo "[4/6] Ensuring DNS route..."
if ! cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"; then
  echo "WARNING: DNS route update failed (it may already exist)."
  echo "Run manually to confirm: cloudflared tunnel route dns \"$TUNNEL_NAME\" \"$DOMAIN\""
fi

echo "[5/6] Installing/enabling cloudflared service..."
if ! sudo cloudflared service install; then
  echo "WARNING: cloudflared service install returned non-zero (may already be installed)."
fi
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared

echo "[6/6] Verifying local Flask endpoint + tunnel service..."
if curl -sf "$LOCAL_SERVICE_URL" >/dev/null 2>&1; then
  echo "Local Flask check: OK ($LOCAL_SERVICE_URL)"
else
  echo "WARNING: Local Flask check failed at $LOCAL_SERVICE_URL"
fi

echo ""
echo "Done! BMO should be reachable at: https://$DOMAIN"
echo "Verify tunnel health:"
echo "  sudo systemctl status cloudflared --no-pager"
echo "  journalctl -u cloudflared -n 50 --no-pager"
sudo systemctl status cloudflared --no-pager
