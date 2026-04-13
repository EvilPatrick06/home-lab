# Fedora unattended install — single USB (Everything DVD) + Wi‑Fi firmware + Workstation
#
# INSTALL SOURCE: use "cdrom" — you MUST build from Fedora Everything *DVD* ISO (full), not netinst.
#   Base packages install from the USB/DVD without a mirror.
#
# NETWORK STILL NEEDED DURING INSTALL for: RPM Fusion, NVIDIA (akmod), Steam, Flatpak/Prism
# (those are not on the Fedora DVD). Use Wi‑Fi (firmware below helps after install; installer Wi‑Fi
# usually works on Intel laptops) or USB tether / Ethernet if the installer does not see Wi‑Fi.
#
# EDIT BEFORE YOU BUILD THE ISO:
# 1) DISK: ignoredisk / clearpart / autopart — default nvme0n1. Wrong disk = DATA LOSS.
# 2) Patrick password: openssl passwd -6  then paste hash in user line; escape each $ as \$
#
# Single-boot only — clearpart wipes the whole disk.

#version=DEVEL
eula --agreed
lang en_US.UTF-8
keyboard us
timezone UTC --utc

network --bootproto=dhcp --device=link --activate --hostname=patrick-fedora

# Offline base install from the same ISO/USB (requires Everything DVD ISO + mkksiso)
cdrom

# Target disk only (no /dev/ prefix)
ignoredisk --only-use=nvme0n1
clearpart --all --initlabel --drives=nvme0n1
autopart --type btrfs

rootpw --lock

# Password hash: openssl passwd -6  — escape every $ as \$
user --name=Patrick --groups=wheel --homedir=/home/Patrick --shell=/bin/bash --iscrypted --password=\$6\$EDITME\$EDITMEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE

services --enabled=NetworkManager,sshd

%packages
@fedora-workstation
@hardware-support
-firefox
# Wi‑Fi / wireless stacks and firmware blobs (linux-firmware is the big one)
linux-firmware
wireless-regdb
iw
NetworkManager-wifi
wpa_supplicant
git
curl
wget
vim
htop
openssl
openssh-server
rclone
chromium
flatpak
@development-tools
dnf-plugins-core
kernel-devel
%end

%post --erroronfail
set -euo pipefail
FV="$(rpm -E %fedora)"

dnf install -y \
  "https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-${FV}.noarch.rpm" \
  "https://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-${FV}.noarch.rpm"

dnf upgrade --refresh -y

dnf install -y akmod-nvidia xorg-x11-drv-nvidia-cuda || echo "NVIDIA install failed — fix RPM Fusion / reboot and install manually."

dnf install -y steam || echo "Steam install failed — check RPM Fusion nonfree."

flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpak || true
flatpak install -y flathub org.prismlauncher.PrismLauncher || true

systemctl enable sshd

echo "Kickstart %%post finished at $(date -Iseconds)" >> /root/kickstart-post.log
%end

reboot
