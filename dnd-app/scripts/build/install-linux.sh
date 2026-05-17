#!/usr/bin/env bash
# D&D VTT — Linux installer
#
# One-line install:
#   curl -fsSL https://github.com/EvilPatrick06/home-lab/releases/latest/download/install-linux.sh | bash
#
# What it does:
#   1. Resolves the latest AppImage URL from the GitHub release
#   2. Downloads to ~/Applications/dnd-vtt.AppImage and chmod +x
#   3. Drops a .desktop entry in ~/.local/share/applications/ so it shows up
#      in your app menu
#
# Won't touch system paths, won't sudo, won't auto-install Ollama. AI
# features need Ollama (`curl -fsSL https://ollama.com/install.sh | sh`)
# or cloud API keys set in-app.

set -euo pipefail

REPO="EvilPatrick06/home-lab"
APP_NAME="dnd-vtt"
DISPLAY_NAME="D&D Virtual Tabletop"
INSTALL_DIR="${HOME}/Applications"
DESKTOP_DIR="${HOME}/.local/share/applications"
DEST="${INSTALL_DIR}/${APP_NAME}.AppImage"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
info() { printf "  %s\n" "$*"; }
ok()   { printf "\033[32m✓\033[0m %s\n" "$*"; }
err()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; }

bold "==> Installing ${DISPLAY_NAME}"

# Resolve latest AppImage from GitHub Releases API
info "Querying latest release..."
APPIMAGE_URL=$(
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -oE 'https://[^"]+x86_64\.AppImage' \
    | head -1
)

if [[ -z "${APPIMAGE_URL}" ]]; then
  err "Could not find an x86_64 AppImage asset on the latest release."
  err "Browse releases at https://github.com/${REPO}/releases and download manually."
  exit 1
fi

VERSION=$(echo "${APPIMAGE_URL}" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
info "Version: ${VERSION:-unknown}"

mkdir -p "${INSTALL_DIR}"

bold "==> Downloading"
info "${APPIMAGE_URL}"
info "to ${DEST}"
# Download to a tmp path and atomic-rename so a Ctrl+C mid-download
# doesn't leave a half-finished file with a misleading name.
curl -fL --progress-bar "${APPIMAGE_URL}" -o "${DEST}.tmp"
mv -f "${DEST}.tmp" "${DEST}"
chmod +x "${DEST}"
ok "Downloaded + made executable"

bold "==> Adding desktop entry"
mkdir -p "${DESKTOP_DIR}"
cat > "${DESKTOP_DIR}/${APP_NAME}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=${DISPLAY_NAME}
Comment=D&D Virtual Tabletop — Electron desktop app for D&D 5e
Exec=${DEST}
Icon=${APP_NAME}
Categories=Game;RolePlaying;
Terminal=false
StartupWMClass=${APP_NAME}
EOF
update-desktop-database "${DESKTOP_DIR}" 2>/dev/null || true
ok "Added ${DESKTOP_DIR}/${APP_NAME}.desktop"

bold "==> Done"
info "Run from terminal:  ${DEST}"
info "Or launch from your app menu: ${DISPLAY_NAME}"
echo
info "Local AI (optional, for Ollama):"
info "    curl -fsSL https://ollama.com/install.sh | sh"
info "    ollama pull llama3.2"
info "Cloud AI: set API keys in app → Settings → AI Providers"
