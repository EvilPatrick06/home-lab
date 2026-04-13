#!/usr/bin/env bash
# Build ONE bootable Fedora USB image: Everything DVD + kickstart (auto-install) + patrick-migration/ scripts.
#
# Run ON Fedora as root:
#   sudo dnf install -y mkksiso
#   sudo ./build-custom-iso.sh /path/to/Fedora-Everything-x86_64-DVD-*.iso
#
# Base ISO MUST be the full "Everything DVD" ISO (several GB), NOT *netinst* — kickstart uses cdrom.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
KS="${SCRIPT_DIR}/fedora-patrick.ks"
BASE_ISO="${1:?Usage: $0 /path/to/Fedora-Everything-x86_64-DVD-*.iso [output.iso]}"
OUT_ISO="${2:-${SCRIPT_DIR}/fedora-patrick-unattended.iso}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "mkksiso must run as root. Try: sudo $0 $*" >&2
  exit 1
fi

if ! command -v mkksiso >/dev/null 2>&1; then
  echo "Install mkksiso:  dnf install -y mkksiso" >&2
  exit 1
fi

if [[ ! -f "${KS}" ]]; then
  echo "Missing kickstart: ${KS}" >&2
  exit 1
fi

if [[ ! -f "${BASE_ISO}" ]]; then
  echo "Base ISO not found: ${BASE_ISO}" >&2
  exit 1
fi

bn="$(basename "${BASE_ISO}")"
if [[ "${bn}" == *netinst* ]] || [[ "${bn}" == *boot.iso* ]]; then
  echo "Wrong ISO: use Fedora Everything *DVD* (full) ISO, not netinst/boot.iso." >&2
  echo "Kickstart uses 'cdrom' so all base packages come from the disc image." >&2
  echo "Download from: https://fedoraproject.org/workstation/download/ (see \"Everything\" / full image)" >&2
  exit 1
fi

BUNDLE_TMP="$(mktemp -d)"
cleanup() { rm -rf "${BUNDLE_TMP}"; }
trap cleanup EXIT

BUNDLE_ROOT="${BUNDLE_TMP}/patrick-migration"
mkdir -p "${BUNDLE_ROOT}"
cp -a "${SCRIPT_DIR}/fedora-patrick.ks" "${SCRIPT_DIR}/BUILD-ISO.txt" "${BUNDLE_ROOT}/"
cp -a "${MIGRATION_DIR}/backup-to-gdrive.sh" "${MIGRATION_DIR}/fedora-setup.sh" "${MIGRATION_DIR}/google-drive-rclone.txt" "${BUNDLE_ROOT}/" 2>/dev/null || true
cp -a "${MIGRATION_DIR}/backup-from-windows.ps1" "${BUNDLE_ROOT}/" 2>/dev/null || true

echo "Kickstart:     ${KS}"
echo "Base ISO:      ${BASE_ISO}"
echo "Bundle on ISO: /patrick-migration/ (scripts + ks copy)"
echo "Output:        ${OUT_ISO}"
echo "Needs ~20 GB+ free disk for temp files; can take a while."
mkksiso --ks "${KS}" --add "${BUNDLE_ROOT}" "${BASE_ISO}" "${OUT_ISO}"
echo "Done: ${OUT_ISO}"
echo "Flash with Fedora Media Writer (large USB). After install, copy /run/media/.../patrick-migration from USB if needed, or use your Google Drive copy."
