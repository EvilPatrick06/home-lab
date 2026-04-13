#!/usr/bin/env bash
# Backup Fedora-friendly copies of your home data, then upload to Google Drive via rclone.
#
# Prerequisite: rclone configured with a remote (e.g. `rclone config` → name it `gdrive`).
#
# Usage:
#   RCLONE_REMOTE=gdrive RCLONE_PATH=Patrick-backups ./backup-to-gdrive.sh
#
# Optional env:
#   BACKUP_STAGING   — where tarball is built (default: ~/backup-staging)
#   RCLONE_REMOTE    — rclone remote name (default: gdrive)
#   RCLONE_PATH      — folder on remote (default: Patrick-backups)
#   EXTRA_PATHS         — space-separated extra paths under $HOME to include
#   SKIP_COMPRESS       — if 1, upload a directory tree instead of a single .tar.zst
#   INCLUDE_DOT_CONFIG  — if 0, omit ~/.config (can be huge from Chromium/Cursor caches)

set -euo pipefail

RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
RCLONE_PATH="${RCLONE_PATH:-Patrick-backups}"
BACKUP_STAGING="${BACKUP_STAGING:-$HOME/backup-staging}"
SKIP_COMPRESS="${SKIP_COMPRESS:-0}"
INCLUDE_DOT_CONFIG="${INCLUDE_DOT_CONFIG:-1}"

DATE_STAMP="$(date +%Y%m%d-%H%M%S)"
STAGING_ROOT="${BACKUP_STAGING}/build-${DATE_STAMP}"
ARCHIVE_NAME="patrick-migration-${DATE_STAMP}.tar.zst"
REMOTE_DEST="${RCLONE_REMOTE}:${RCLONE_PATH}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone not found. Install: sudo dnf install -y rclone" >&2
  exit 1
fi

if ! rclone listremotes 2>/dev/null | grep -qx "${RCLONE_REMOTE}:"; then
  echo "No rclone remote named '${RCLONE_REMOTE}:'." >&2
  echo "Run: rclone config   (create a remote, often named 'gdrive' for Google Drive)" >&2
  exit 1
fi

mkdir -p "${STAGING_ROOT}/home/${USER}"

# Paths relative to $HOME — add more as needed.
DEFAULT_PATHS=(
  Documents
  Desktop
  Pictures
  Videos
  Music
  Downloads
  .ssh
  .gitconfig
  .git-credentials
  .local/share/PrismLauncher
  .minecraft
  .gnupg
  Projects
  dev
  src
  workspace
)

read -r -a EXTRA_ARR <<< "${EXTRA_PATHS:-}"

include_paths=()
if [[ "${INCLUDE_DOT_CONFIG}" == "1" ]]; then
  DEFAULT_PATHS+=(.config)
fi

for rel in "${DEFAULT_PATHS[@]}" "${EXTRA_ARR[@]}"; do
  [[ -z "${rel}" ]] && continue
  if [[ -e "${HOME}/${rel}" ]]; then
    include_paths+=("${rel}")
  fi
done

if [[ ${#include_paths[@]} -eq 0 ]]; then
  echo "Nothing to back up under ${HOME} (no matching paths)." >&2
  exit 1
fi

echo "Including (${#include_paths[@]} paths):"
printf '  %s\n' "${include_paths[@]}"

for rel in "${include_paths[@]}"; do
  parent="$(dirname "${rel}")"
  mkdir -p "${STAGING_ROOT}/home/${USER}/${parent}"
  cp -a "${HOME}/${rel}" "${STAGING_ROOT}/home/${USER}/${parent}/"
done

mkdir -p "${BACKUP_STAGING}"

if [[ "${SKIP_COMPRESS}" == "1" ]]; then
  echo "Uploading directory tree (no compression) to ${REMOTE_DEST}/migration-${DATE_STAMP}/ ..."
  rclone copy "${STAGING_ROOT}" "${REMOTE_DEST}/migration-${DATE_STAMP}/" --progress --transfers 8 --checkers 16
  echo "Done: ${REMOTE_DEST}/migration-${DATE_STAMP}/"
else
  if ! tar -cf - -C "${STAGING_ROOT}" . | zstd -T0 -19 -o "${BACKUP_STAGING}/${ARCHIVE_NAME}"; then
    echo "zstd failed; install: sudo dnf install -y zstd" >&2
    exit 1
  fi
  echo "Uploading ${ARCHIVE_NAME} to ${REMOTE_DEST}/ ..."
  rclone copy "${BACKUP_STAGING}/${ARCHIVE_NAME}" "${REMOTE_DEST}/" --progress --transfers 4
  echo "Done: ${REMOTE_DEST}/${ARCHIVE_NAME}"
  echo "Extract on Fedora: mkdir -p ~/restore && tar -C ~/restore --zstd -xf ${ARCHIVE_NAME}"
fi

echo "You can remove the staging build to save disk: rm -rf ${STAGING_ROOT}"
