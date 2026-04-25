#!/bin/bash
# Install + bootstrap Tailscale for stable remote SSH to BMO
# Run on Pi: bash ~/home-lab/bmo/pi/scripts/setup-tailscale.sh

set -euo pipefail

HOSTNAME="${PI_HOSTNAME:-bmo}"

echo "[1/4] Installing Tailscale..."
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
else
  echo "Tailscale already installed."
fi

echo "[2/4] Enabling tailscaled service..."
sudo systemctl enable tailscaled
sudo systemctl restart tailscaled

echo "[3/4] Bringing node online..."
set +e
sudo tailscale up --hostname="$HOSTNAME" --ssh
UP_EXIT=$?
set -e
if [ "$UP_EXIT" -ne 0 ]; then
  echo ""
  echo "tailscale up requires interactive auth in some cases."
  echo "If prompted with a URL, open it and complete login, then re-run:"
  echo "  sudo tailscale up --hostname=\"$HOSTNAME\" --ssh"
fi

echo "[4/4] Status:"
tailscale status || true
tailscale ip -4 || true

echo ""
echo "Done. Next:"
echo "  1) Enable MagicDNS in your tailnet admin settings"
echo "  2) Use deploy.sh with PI_TAILSCALE_HOST (e.g. bmo.tailnet.ts.net)"
echo "  3) On Windows, map Host bmo -> Tailscale hostname in ~/.ssh/config"
