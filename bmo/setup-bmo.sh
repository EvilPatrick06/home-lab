#!/bin/bash
# ══════════════════════════════════════════════════════════════════
# BMO Setup Script — Fresh Raspberry Pi OS Lite (64-bit) on NVMe SSD
# ══════════════════════════════════════════════════════════════════
#
# Prerequisites:
#   1. Flash "Raspberry Pi OS Lite (64-bit)" to the NVMe SSD via Pi Imager
#   2. In Pi Imager settings: hostname=bmo, user=patrick, WiFi, SSH enabled
#   3. Boot from the SSD
#   4. Copy this script to the Pi and run: bash setup-bmo.sh
#
# This script replicates the full BMO setup from the current Pi.
# ══════════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[BMO]${NC} $1"; }
warn() { echo -e "${YELLOW}[BMO]${NC} $1"; }
err()  { echo -e "${RED}[BMO]${NC} $1"; exit 1; }

# ── 1. System Update ──────────────────────────────────────────────
log "Updating system packages..."
sudo apt update && sudo apt full-upgrade -y
sudo apt autoremove -y

# ── 2. Install System Dependencies ───────────────────────────────
log "Installing system packages..."
sudo apt install -y \
    python3 python3-venv python3-pip python3-dev \
    git curl wget \
    avahi-daemon avahi-utils \
    chromium-browser unclutter cage \
    docker.io docker-compose \
    nodejs npm \
    rclone \
    portaudio19-dev libsndfile1 libopenblas-dev \
    ffmpeg vlc \
    i2c-tools python3-smbus \
    libcamera-tools python3-libcamera python3-picamera2 rpicam-apps \
    adb \
    xset xdotool \
    alsa-utils pulseaudio pipewire wireplumber \
    libjpeg-dev libpng-dev libtiff-dev \
    build-essential

# Add user to required groups
sudo usermod -aG docker,video,audio,i2c,gpio,spi,input patrick

# ── 3. Boot Config ───────────────────────────────────────────────
log "Configuring boot parameters..."
sudo tee -a /boot/firmware/config.txt > /dev/null << 'EOF'

# BMO Hardware Config
dtparam=i2c_arm=on
dtparam=spi=on
dtparam=audio=on
camera_auto_detect=1

# NVMe SSD — PCIe Gen 3
dtparam=pciex1
dtparam=pciex1_gen=3
dtoverlay=pciex1-compat-pi5,no-l0s

# Case fan control
dtparam=fan_temp0=60000,fan_temp0_hyst=5000,fan_temp0_speed=50
dtparam=fan_temp1=67000,fan_temp1_hyst=5000,fan_temp1_speed=100
dtparam=fan_temp2=75000,fan_temp2_hyst=5000,fan_temp2_speed=175
dtparam=fan_temp3=80000,fan_temp3_hyst=5000,fan_temp3_speed=250

# RTC battery charging
dtparam=rtc_bbat_vchg=3000000

# Camera (OV5647 — case built-in 5MP)
dtoverlay=ov5647
EOF

# ── 4. Clone Repo ────────────────────────────────────────────────
log "Cloning DnD repository..."
cd ~
if [ ! -d "DnD" ]; then
    git clone https://github.com/EvilPatrick06/DnD.git
fi

# ── 5. Python Virtual Environment ────────────────────────────────
log "Setting up Python venv..."
cd ~/DnD/bmo/pi
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r requirements.txt

# ── 6. Tailwind CSS Compilation ──────────────────────────────────
log "Installing Tailwind CLI and compiling CSS..."
sudo curl -sL https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-linux-arm64 -o /usr/local/bin/tailwindcss
sudo chmod +x /usr/local/bin/tailwindcss
cd ~/DnD/bmo/pi
tailwindcss -i static/css/tailwind-input.css -o static/css/tailwind.css --minify

# ── 7. Environment File ─────────────────────────────────────────
log "Creating .env template..."
if [ ! -f ~/DnD/bmo/pi/.env ]; then
    cat > ~/DnD/bmo/pi/.env << 'ENVEOF'
# BMO Environment Variables — fill in your keys
FISH_AUDIO_API_KEY=
FISH_AUDIO_VOICE_ID=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
GROQ_API_KEY=
GOOGLE_VISION_API_KEY=
BMO_PRIMARY_MODEL=
BMO_ROUTER_MODEL=
BMO_DND_MODEL=
DISCORD_WEBHOOK_URL=
PIHOLE_API_PASSWORD=
GOOGLE_MAPS_API_KEY=
DISCORD_DM_BOT_TOKEN=
DISCORD_SOCIAL_BOT_TOKEN=
DISCORD_GUILD_ID=
RAWG_API_KEY=
OMDB_API_KEY=
TMDB_API_KEY=
TMDB_ACCESS_TOKEN=
PICOVOICE_ACCESS_KEY=
ENVEOF
    warn ".env created — you need to fill in the API keys!"
fi

# ── 8. Runtime Directories ───────────────────────────────────────
log "Creating runtime directories..."
mkdir -p ~/DnD/bmo/pi/{data,data/logs,config,logs,.bmo,.audiocache,wake_clips}

# ── 9. Docker Containers ────────────────────────────────────────
log "Setting up Docker containers..."

# Pi-hole DNS
sudo docker run -d \
    --name bmo-pihole \
    --restart always \
    --net host \
    -e TZ=America/Denver \
    -e WEBPASSWORD="${PIHOLE_PASSWORD:-changeme}" \
    -v pihole_data:/etc/pihole \
    -v pihole_dnsmasq:/etc/dnsmasq.d \
    pihole/pihole:latest

# Ollama (local LLM)
sudo docker run -d \
    --name bmo-ollama \
    --restart always \
    -p 11434:11434 \
    -v ollama_data:/root/.ollama \
    ollama/ollama:latest

# coturn (TURN server for VTT WebRTC)
sudo docker run -d \
    --name bmo-coturn \
    --restart always \
    --net host \
    coturn/coturn:latest \
    -n \
    --listening-port=3478 \
    --min-port=49152 --max-port=49200 \
    --realm=dndvtt \
    --user=dndvtt:dndvtt-relay \
    --lt-cred-mech --fingerprint \
    --no-tls --no-dtls \
    --log-file=stdout

# PeerJS (signaling server for VTT WebRTC)
sudo docker run -d \
    --name bmo-peerjs \
    --restart always \
    -p 9000:9000 \
    -v bmo_peerjs-modules:/app/node_modules \
    node:22-slim \
    sh -c "npm install -g peer && peerjs --port 9000 --path /myapp"

# ── 10. Systemd Services ────────────────────────────────────────
log "Installing systemd services..."

# BMO main service
sudo tee /etc/systemd/system/bmo.service > /dev/null << 'EOF'
[Unit]
Description=BMO AI Assistant
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=patrick
Group=patrick
WorkingDirectory=/home/patrick/DnD/bmo/pi
Environment=PATH=/home/patrick/DnD/bmo/pi/venv/bin:/usr/local/bin:/usr/bin:/bin
Environment=PYTHONUNBUFFERED=1
Environment=XDG_RUNTIME_DIR=/run/user/1000
EnvironmentFile=/home/patrick/DnD/bmo/pi/.env
ExecStart=/home/patrick/DnD/bmo/pi/venv/bin/python app.py
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal
SupplementaryGroups=video audio i2c gpio spi input

[Install]
WantedBy=multi-user.target
EOF

# BMO Kiosk (Chromium via cage — no desktop needed)
sudo tee /etc/systemd/system/bmo-kiosk.service > /dev/null << 'EOF'
[Unit]
Description=BMO Kiosk — Chromium fullscreen on HDMI
After=bmo.service
Wants=bmo.service

[Service]
Type=simple
User=patrick
EnvironmentFile=-/home/patrick/DnD/bmo/pi/.env
Environment=XDG_RUNTIME_DIR=/run/user/1000
Environment=GDK_BACKEND=wayland
Environment=WLR_DRM_DEVICES=/dev/dri/card0
Environment=WLR_DRM_CONNECTORS=DSI-2
Environment=WLR_XCURSOR_THEME=bmo-invisible
Environment=WLR_XCURSOR_SIZE=1
Environment=WLR_NO_HARDWARE_CURSORS=1
Environment=XCURSOR_THEME=bmo-invisible
Environment=XCURSOR_SIZE=1
Environment=XCURSOR_PATH=/home/patrick/.icons:/usr/share/icons

# Wait for BMO Flask to be ready
ExecStartPre=/bin/bash -c 'for i in {1..30}; do curl -sf http://localhost:5000/health > /dev/null && break; sleep 1; done'
ExecStart=/bin/bash -lc 'export GOOGLE_API_KEY="${GOOGLE_MAPS_API_KEY:-}"; exec /usr/bin/cage -- chromium --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-restore-session-state --disable-features=TranslateUI --disable-component-update --disable-domain-reliability --disable-sync --dns-prefetch-disable --no-default-browser-check --password-store=basic --check-for-update-interval=31536000 --no-first-run --start-fullscreen --touch-events=enabled --ash-hide-cursor-on-touch --enable-touchview --enable-pinch --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required --force-device-scale-factor=1 --high-dpi-support=1 --window-size=800,480 --user-data-dir=/home/patrick/.config/chromium-bmo --enable-logging=stderr --v=1 --unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:5000,http://localhost:5000 http://127.0.0.1:5000/?kiosk=1'

ExecStartPost=/bin/bash -c 'sleep 20; /usr/bin/chromium --headless --disable-gpu --no-sandbox --use-fake-ui-for-media-stream --virtual-time-budget=25000 --run-all-compositor-stages-before-draw --dump-dom http://127.0.0.1:5000/?kiosk=1 > /dev/null 2>&1 || true'

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Chromium policy: always allow geolocation for local kiosk origin
sudo mkdir -p /etc/chromium/policies/managed
sudo tee /etc/chromium/policies/managed/bmo-geolocation.json > /dev/null << 'EOF'
{
  "DefaultGeolocationSetting": 1,
  "GeolocationAllowedForUrls": ["http://127.0.0.1:5000", "http://localhost:5000"]
}
EOF

# BMO Fan Controller
sudo tee /etc/systemd/system/bmo-fan.service > /dev/null << 'EOF'
[Unit]
Description=BMO Case Fan Controller
After=multi-user.target

[Service]
Type=simple
User=patrick
ExecStart=/usr/bin/python3 /home/patrick/DnD/bmo/pi/hardware/fan_control.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# BMO DM Discord Bot
sudo tee /etc/systemd/system/bmo-dm-bot.service > /dev/null << 'EOF'
[Unit]
Description=BMO DM Discord Bot — D&D Dungeon Master
After=network-online.target bmo.service
Wants=network-online.target

[Service]
Type=simple
User=patrick
WorkingDirectory=/home/patrick/DnD/bmo/pi
EnvironmentFile=/home/patrick/DnD/bmo/pi/.env
ExecStart=/home/patrick/DnD/bmo/pi/venv/bin/python -m bots.discord_dm_bot
Restart=on-failure
RestartSec=10
MemoryMax=512M
CPUQuota=50%
StandardOutput=append:/home/patrick/DnD/bmo/pi/data/logs/dm-bot.log
StandardError=append:/home/patrick/DnD/bmo/pi/data/logs/dm-bot.log

[Install]
WantedBy=multi-user.target
EOF

# BMO Social Discord Bot
sudo tee /etc/systemd/system/bmo-social-bot.service > /dev/null << 'EOF'
[Unit]
Description=BMO Social Discord Bot — Music, Chat & Fun
After=network-online.target bmo.service
Wants=network-online.target

[Service]
Type=simple
User=patrick
WorkingDirectory=/home/patrick/DnD/bmo/pi
EnvironmentFile=/home/patrick/DnD/bmo/pi/.env
ExecStart=/home/patrick/DnD/bmo/pi/venv/bin/python -m bots.discord_social_bot
Restart=on-failure
RestartSec=10
MemoryMax=512M
CPUQuota=50%
StandardOutput=append:/home/patrick/DnD/bmo/pi/data/logs/social-bot.log
StandardError=append:/home/patrick/DnD/bmo/pi/data/logs/social-bot.log

[Install]
WantedBy=multi-user.target
EOF

# ── 11. Enable Services ─────────────────────────────────────────
sudo systemctl daemon-reload
sudo systemctl enable bmo bmo-kiosk bmo-fan bmo-dm-bot bmo-social-bot
sudo systemctl enable avahi-daemon
sudo systemctl restart avahi-daemon

# Publish HTTP + SSH via mDNS service discovery
sudo mkdir -p /etc/avahi/services
sudo tee /etc/avahi/services/bmo.service > /dev/null << 'EOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">BMO on %h</name>
  <service>
    <type>_http._tcp</type>
    <port>5000</port>
    <txt-record>path=/</txt-record>
  </service>
  <service>
    <type>_ssh._tcp</type>
    <port>22</port>
  </service>
</service-group>
EOF
sudo systemctl restart avahi-daemon

# ── 12. Git Post-Merge Hook ─────────────────────────────────────
log "Setting up git deploy hook..."
cat > ~/DnD/.git/hooks/post-merge << 'EOF'
#!/bin/bash
echo '[deploy] Restarting all BMO services...'
sudo systemctl restart bmo
sudo systemctl restart bmo-kiosk
sudo systemctl restart bmo-fan
sudo systemctl restart bmo-dm-bot
sudo systemctl restart bmo-social-bot
echo '[deploy] All services restarted'

echo '[deploy] Restarting Docker containers...'
sudo docker restart bmo-ollama bmo-pihole bmo-coturn bmo-peerjs 2>/dev/null
echo '[deploy] Docker containers restarted'

echo '[deploy] All done!'
EOF
chmod +x ~/DnD/.git/hooks/post-merge

# ── 13. Auto-login for Kiosk (no desktop needed) ────────────────
log "Configuring auto-login..."
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf > /dev/null << 'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin patrick --noclear %I $TERM
EOF

sudo tee /etc/systemd/system/getty@tty1.service.d/10-no-cursor.conf > /dev/null << 'EOF'
[Service]
ExecStartPre=/bin/sh -c '/usr/bin/setterm -cursor off >/dev/tty1 || true'
EOF

# ── Done ─────────────────────────────────────────────────────────
log "══════════════════════════════════════════════════"
log "  BMO setup complete!"
log "══════════════════════════════════════════════════"
log ""
log "  Next steps:"
log "  1. Copy your .env file with API keys to ~/DnD/bmo/pi/.env"
log "  2. Copy config/token.json and config/credentials.json"
log "  3. Copy your rclone config for VTT cloud saves"
log "  4. Optional remote SSH (recommended): ~/DnD/bmo/pi/scripts/setup-tailscale.sh"
log "  5. Optional Cloudflare web tunnel: ~/DnD/bmo/pi/scripts/setup-cloudflare-tunnel.sh"
log "  6. Reboot: sudo reboot now"
log ""
log "  After reboot, verify local hostname:"
log "    avahi-resolve-host-name bmo.local"
log "    ssh patrick@bmo.local"
warn "  Note: No keyring, no GNOME — just cage + Chromium kiosk."
log "══════════════════════════════════════════════════"
