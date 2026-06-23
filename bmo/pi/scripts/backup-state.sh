#!/usr/bin/env bash
# Off-tree backup of BMO's gitignored runtime state — the only copy of campaign
# memory, D&D sessions, lists, notes, alarms, play history, etc. Writes a
# timestamped tar.gz OUTSIDE the repo tree and prunes to the most recent N.
# Large, seedable 5e reference data is excluded (re-creatable via
# seed-5e-library.sh). See BMO-SUGGESTIONS-LOG 2026-06-22.
set -euo pipefail

PI_DIR="${BMO_PI_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DEST="${BMO_BACKUP_DIR:-$HOME/bmo-backups}"
KEEP="${BMO_BACKUP_KEEP:-14}"

mkdir -p "$DEST"
ts="$(date +%Y%m%d-%H%M%S)"
archive="$DEST/bmo-state-$ts.tar.gz"

paths=()
[ -d "$PI_DIR/data" ] && paths+=("data")
[ -f "$PI_DIR/config/token.json" ] && paths+=("config/token.json")
if [ ${#paths[@]} -eq 0 ]; then
  echo "[backup] nothing to back up under $PI_DIR (no data/ or config/token.json)" >&2
  exit 1
fi

tar -czf "$archive" \
  --exclude='5e' --exclude='5e-library' --exclude='5e-references' \
  -C "$PI_DIR" "${paths[@]}"

if [ ! -s "$archive" ]; then
  echo "[backup] ERROR: archive not created" >&2
  exit 1
fi
echo "[backup] wrote $archive ($(du -h "$archive" | cut -f1))"

# Prune: keep newest $KEEP
mapfile -t old < <(ls -1t "$DEST"/bmo-state-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) || true)
if [ ${#old[@]} -gt 0 ]; then
  rm -f "${old[@]}"
  echo "[backup] pruned ${#old[@]} old archive(s); keeping newest $KEEP in $DEST"
fi
