#!/usr/bin/env bash
# Fedora post-install setup: RPM Fusion, packages, Flatpak, optional NVIDIA, user Patrick.
#
# Run as root AFTER Fedora is installed (live session or first boot):
#   sudo FEDORA_USER_PASSWORD='your-password-here' ./fedora-setup.sh
#
# Do NOT commit real passwords. Clear shell history after:  history -c
#
# Optional env:
#   INSTALL_NVIDIA=0     — skip proprietary NVIDIA driver (open drivers only)
#   SKIP_USER=1          — skip user creation (you already have Patrick)
#   FEDORA_USER_PASSWORD — required unless SKIP_USER=1

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo -E FEDORA_USER_PASSWORD='...' $0" >&2
  exit 1
fi

INSTALL_NVIDIA="${INSTALL_NVIDIA:-1}"
SKIP_USER="${SKIP_USER:-0}"
TARGET_USER="${TARGET_USER:-Patrick}"

FV="$(rpm -E %fedora)"

install_rpmfusion() {
  dnf install -y \
    "https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-${FV}.noarch.rpm" \
    "https://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-${FV}.noarch.rpm"
}

echo ">>> dnf upgrade"
dnf upgrade -y

echo ">>> RPM Fusion"
install_rpmfusion
dnf upgrade --refresh -y

if [[ "${INSTALL_NVIDIA}" == "1" ]]; then
  echo ">>> NVIDIA (akmod) — reboot required after this script finishes"
  dnf install -y akmod-nvidia xorg-x11-drv-nvidia-cuda || {
    echo "NVIDIA install failed; set INSTALL_NVIDIA=0 and install manually." >&2
  }
fi

echo ">>> Core packages"
dnf install -y \
  git \
  curl \
  wget \
  vim \
  htop \
  openssl \
  rclone \
  chromium \
  steam \
  @development-tools \
  dnf-plugins-core

echo ">>> Flatpak + Flathub"
dnf install -y flatpak
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpak || true

echo ">>> Optional: Prism Launcher (Flatpak)"
flatpak install -y flathub org.prismlauncher.PrismLauncher || true

if [[ "${SKIP_USER}" != "1" ]]; then
  if [[ -z "${FEDORA_USER_PASSWORD:-}" ]]; then
    echo "Set FEDORA_USER_PASSWORD for new user ${TARGET_USER}, or SKIP_USER=1" >&2
    exit 1
  fi
  if ! id "${TARGET_USER}" &>/dev/null; then
    echo ">>> Creating user ${TARGET_USER}"
    useradd -m -G wheel -s /bin/bash "${TARGET_USER}"
  fi
  echo "${TARGET_USER}:${FEDORA_USER_PASSWORD}" | chpasswd
  echo "User ${TARGET_USER} ready (change password after login: passwd)"
fi

echo ">>> Enable sshd (optional remote access)"
systemctl enable --now sshd 2>/dev/null || systemctl enable --now sshd.service 2>/dev/null || true

echo ""
echo "Done. If NVIDIA was installed, reboot: sudo reboot"
echo "Then: log in as ${TARGET_USER}, install Cursor from vendor site, run: rclone config"
