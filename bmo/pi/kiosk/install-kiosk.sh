#!/bin/bash
# BMO Kiosk — Install script
#
# Installs the systemd service for Chromium kiosk mode.
# Run on the Pi: sudo bash install-kiosk.sh
#
# To escape kiosk: Ctrl+Alt+F2 (switch to TTY), then:
#   sudo systemctl stop bmo-kiosk
#   sudo systemctl disable bmo-kiosk
#
# SSH is always available for remote management.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== BMO Kiosk Installer ==="

# Install dependencies
echo "Installing unclutter (cursor hide)..."
sudo apt-get install -y unclutter > /dev/null 2>&1 || true

# Install Chromium if not present
if ! command -v chromium-browser &> /dev/null; then
    echo "Installing Chromium..."
    sudo apt-get install -y chromium-browser > /dev/null 2>&1
fi

# Copy systemd service
echo "Installing systemd service..."
sudo cp "$SCRIPT_DIR/bmo-kiosk.service" /etc/systemd/system/
sudo systemctl daemon-reload

# Enable and start
sudo systemctl enable bmo-kiosk
sudo systemctl start bmo-kiosk

echo ""
echo "✅ BMO Kiosk installed and started"
echo ""
echo "Commands:"
echo "  sudo systemctl status bmo-kiosk    # Check status"
echo "  sudo systemctl stop bmo-kiosk      # Stop kiosk"
echo "  sudo systemctl restart bmo-kiosk   # Restart"
echo "  Ctrl+Alt+F2                        # Escape to TTY"
