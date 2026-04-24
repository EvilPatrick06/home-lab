#!/bin/bash
# Optional: Re-save Cloudflare Access application via API (can sometimes fix Error 1043).
# Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
#
# Get CLOUDFLARE_ACCOUNT_ID: Zero Trust URL is one.dash.cloudflare.com/<ACCOUNT_ID>/...
# Get API token: dash.cloudflare.com → My Profile → API Tokens → Create Token
#   Use "Edit Cloudflare Zero Trust" template, or custom with Zero Trust:Applications:Edit

set -e

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"
  echo "Example: export CLOUDFLARE_ACCOUNT_ID=c7738b46d6dea43515728b00b6198706"
  exit 1
fi

BASE="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps"

echo "Listing Access applications..."
APPS=$(curl -s -X GET "$BASE" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json")
echo "$APPS" | head -100

# Extract app ID for bmo
APP_ID=$(echo "$APPS" | grep -oE '"id":"[a-f0-9-]+"' | head -1 | cut -d'"' -f4)
if [ -z "$APP_ID" ]; then
  echo "Could not find app ID. Check API token permissions."
  exit 1
fi

echo "App ID: $APP_ID"
echo ""
echo "Sending PATCH to re-save application (can help fix Error 1043)..."
RESULT=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/$APP_ID" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"bmo","session_duration":"24h","type":"self_hosted"}')
HTTP_CODE=$(echo "$RESULT" | tail -1)
BODY=$(echo "$RESULT" | sed '$d')
echo "$BODY" | head -20
echo "HTTP $HTTP_CODE"
echo ""
echo "Try https://bmo.mybmoai.work again in incognito."
