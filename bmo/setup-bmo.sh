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
dtparam=fan_temp3=80000,fan_temp3_hyst=5000,fan_temp3_speed=255

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
# Install order:
#   1. CPU-only torch FIRST so resemblyzer / openwakeword don't pull the
#      4.5+ GB GPU stack from PyPI's default index.
#   2. requirements.txt — fully resolved + transitively pinned via pip-tools
#      (top-level deps live in requirements.in; regenerate with
#      `pip-compile --extra-index-url https://download.pytorch.org/whl/cpu
#       -o requirements.txt requirements.in`).
log "Setting up Python venv (PyTorch CPU-only first — no GPU on Pi)..."
cd ~/home-lab/bmo/pi
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
venv/bin/pip install -r requirements.txt

# PHASE-21 21A: streaming-TTS support for the DM bot.
#  - NLTK punkt data for stream2sentence's default tokenizer. The regex fallback
#    in services/discord_tts.py covers an offline failure, so this is best-effort.
#  - Piper multi-speaker voice for per-NPC casting. `|| true`: the fish fallback
#    backend covers a missing model, so a download failure must not abort setup.
venv/bin/python - <<'PYEOF' || true
import nltk
nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)
PYEOF
venv/bin/python -m piper.download_voices en_US-libritts_r-medium \
  --download-dir /home/patrick/home-lab/bmo/pi/models/piper || true

# ── 6. Tailwind CSS Compilation ──────────────────────────────────
log "Installing Tailwind CLI and compiling CSS..."
sudo curl -sL https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-linux-arm64 -o /usr/local/bin/tailwindcss
sudo chmod +x /usr/local/bin/tailwindcss
cd ~/home-lab/bmo/pi
tailwindcss -i static/css/tailwind-input.css -o static/css/tailwind.css --minify

# ── 7. Environment File ─────────────────────────────────────────
log "Creating .env template..."
if [ ! -f ~/home-lab/bmo/pi/.env ]; then
    cat > ~/home-lab/bmo/pi/.env << 'ENVEOF'
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
mkdir -p ~/home-lab/bmo/pi/{data,data/logs,config,logs,.bmo,.audiocache,wake_clips}

# Pre-reorg checkouts may have symlinks to ~/DnD/BMO-setup/... — replace with empty JSON
_DATA=~/home-lab/bmo/pi/data
for _name in music_history play_counts; do
  _p="$_DATA/${_name}.json"
  if [[ -L "$_p" ]] || [[ ! -f "$_p" ]]; then
    rm -f "$_p"
    if [[ "$_name" == music_history ]]; then
      echo '[]' > "$_p"
    else
      echo '{}' > "$_p"
    fi
  fi
done

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

# Unit files live in bmo/pi/kiosk/ as the single source of truth (consolidated
# 2026-06-22 — they were previously duplicated as inline heredocs here and had
# drifted from the kiosk/ copies). Install by copying those files.
for unit in bmo.service bmo-kiosk.service bmo-fan.service bmo-dm-bot.service \
            bmo-social-bot.service bmo-backup.service bmo-backup.timer \
            bmo-voice-canary.service bmo-voice-canary.timer; do
  sudo cp "/home/patrick/home-lab/bmo/pi/kiosk/$unit" /etc/systemd/system/
done

# Chromium policy: always allow geolocation for local kiosk origin
sudo mkdir -p /etc/chromium/policies/managed
sudo tee /etc/chromium/policies/managed/bmo-geolocation.json > /dev/null << 'EOF'
{
  "DefaultGeolocationSetting": 1,
  "GeolocationAllowedForUrls": ["http://127.0.0.1:5000", "http://localhost:5000"]
}
EOF

# ── 11. Enable Services ─────────────────────────────────────────
sudo systemctl daemon-reload
sudo systemctl enable bmo bmo-kiosk bmo-fan bmo-dm-bot bmo-social-bot bmo-backup.timer bmo-voice-canary.timer
sudo systemctl enable avahi-daemon
sudo systemctl restart avahi-daemon

# Publish HTTP + SSH + _bmo._tcp via mDNS service discovery.
# The dedicated `_bmo._tcp` type lets the dnd-app's main process discover
# the Pi without the user having to type a URL into Settings or install
# Bonjour Print Services on Windows (which would otherwise be needed to
# resolve `bmo.local`). See dnd-app/src/main/lan-discovery.ts.
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
    <type>_bmo._tcp</type>
    <port>5000</port>
    <txt-record>has_registry=true</txt-record>
    <txt-record>version=1</txt-record>
  </service>
  <service>
    <type>_ssh._tcp</type>
    <port>22</port>
  </service>
</service-group>
EOF
sudo systemctl restart avahi-daemon

# ── 12. Git Post-Merge Hook ─────────────────────────────────────
# The hook NO LONGER restarts services — a blanket restart on every merge is
# unsafe (no canary, no health gate, no rollback) and would also fire on a
# `git pull` of a dev checkout.  It now only chains git-lfs (the repo uses LFS)
# and prints a reminder.  Deploys are explicit + health-gated via deploy.sh.
log "Setting up git deploy hook..."
cat > ~/home-lab/.git/hooks/post-merge << 'EOF'
#!/bin/sh
# Chain git-lfs (repo uses LFS); deploys are explicit via deploy.sh.
command -v git-lfs >/dev/null 2>&1 && git lfs post-merge "$@"
echo '[deploy] Code updated. Run bmo/pi/scripts/deploy.sh for a health-gated restart.'
EOF
chmod +x ~/home-lab/.git/hooks/post-merge

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
log "  1. Copy your .env file with API keys to ~/home-lab/bmo/pi/.env"
log "  2. Copy config/token.json and config/credentials.json"
log "  3. Copy your rclone config for VTT cloud saves"
log "  4. Optional remote SSH (recommended): ~/home-lab/bmo/pi/scripts/setup-tailscale.sh"
log "  5. Optional Cloudflare web tunnel: ~/home-lab/bmo/pi/scripts/setup-cloudflare-tunnel.sh"
log "  6. Reboot: sudo reboot now"
log ""
log "  After reboot, verify local hostname:"
log "    avahi-resolve-host-name bmo.local"
log "    ssh patrick@bmo.local"
warn "  Note: No keyring, no GNOME — just cage + Chromium kiosk."
log "══════════════════════════════════════════════════"
