#!/bin/bash
# Add Access JWT validation to cloudflared config (defense-in-depth).
# Run on the Pi after Access login works. Requires tunnel ID and credentials path.
#
# AUD tag from Access app Edit page: Basic information → Application Audience (AUD) Tag
# Team name from Zero Trust Settings → Team name and domain

set -e
CONFIG="/etc/cloudflared/config.yml"

# From your Cloudflare One setup (Edit bmo → Application Audience (AUD) Tag)
TEAM_NAME="bmoai"
AUD_TAG="d997c2c8bc36a5b3045eff79b8bf2ce01eb0099deb01009f6d02e3bdeecd96cb"

echo "Backing up config..."
sudo cp "$CONFIG" "${CONFIG}.bak.$(date +%Y%m%d%H%M%S)"

TUNNEL_ID=$(grep -E '^tunnel:' "$CONFIG" | awk '{print $2}')
CRED_FILE=$(grep -E 'credentials-file:' "$CONFIG" | awk '{print $2}')

if [ -z "$TUNNEL_ID" ] || [ -z "$CRED_FILE" ]; then
  echo "Could not extract tunnel ID or credentials-file from config"
  exit 1
fi

# Expand ~ in cred path if present
CRED_FILE="${CRED_FILE/#\~/$HOME}"

echo "Tunnel: $TUNNEL_ID"
echo "Credentials: $CRED_FILE"
echo "Adding Access JWT validation (teamName=$TEAM_NAME, audTag=$AUD_TAG)"

sudo tee "$CONFIG" > /dev/null << EOF
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: bmo.mybmoai.work
    service: http://localhost:5000
    originRequest:
      access:
        required: true
        teamName: $TEAM_NAME
        audTag:
          - $AUD_TAG
  - service: http_status:404
EOF

echo "Restarting cloudflared..."
sudo systemctl restart cloudflared
sleep 2
sudo systemctl status cloudflared --no-pager
