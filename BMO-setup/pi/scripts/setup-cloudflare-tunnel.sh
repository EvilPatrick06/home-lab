#!/bin/bash
# Cloudflare Tunnel setup for BMO @ bmo.mybmoai.work
# Run this AFTER: cloudflared tunnel login (and completing the browser auth)

set -e
DOMAIN="bmo.mybmoai.work"
TUNNEL_NAME="bmo"

echo "[1/5] Creating tunnel..."
CREATED=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)
echo "$CREATED"
TUNNEL_ID=$(echo "$CREATED" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
if [ -z "$TUNNEL_ID" ]; then
  echo "Could not parse tunnel ID. Output: $CREATED"
  exit 1
fi
echo "Tunnel ID: $TUNNEL_ID"

CRED_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"
if [ ! -f "$CRED_FILE" ]; then
  echo "Credentials file not found: $CRED_FILE"
  exit 1
fi

echo "[2/5] Creating config..."
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml > /dev/null << EOF
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: $DOMAIN
    service: http://localhost:5000
  - service: http_status:404
EOF

echo "[3/5] Routing DNS..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"

echo "[4/5] Installing systemd service..."
sudo cloudflared service install

echo "[5/5] Starting cloudflared..."
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

echo ""
echo "Done! BMO should be reachable at: https://$DOMAIN"
sudo systemctl status cloudflared --no-pager
