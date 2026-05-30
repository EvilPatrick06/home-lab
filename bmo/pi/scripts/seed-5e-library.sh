#!/usr/bin/env bash
# Phase 36 — seed the Pi-hosted 5e library.
#
# Copies dnd-app's canonical 5e JSON tree (EXCLUDING the large `maps/` dir) into
# bmo/pi/data/5e-library/, which the `/api/library` route serves over HTTP so the
# dnd-app can optionally load library content from the Pi (with a bundled
# fallback). This is a BUILD-TIME copy — the same established exception as
# sync-shared-5e-json.sh; the RUNTIME constraint ("HTTP only, no cross-dir reads")
# is unaffected.
#
# The target is gitignored (it's a generated mirror of canonical data, not a
# source of truth). Re-run whenever the dnd-app 5e JSON changes. Idempotent.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts -> bmo/pi -> bmo -> home-lab
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SRC="$REPO_ROOT/dnd-app/src/renderer/public/data/5e"
DEST="$REPO_ROOT/bmo/pi/data/5e-library"

if [[ ! -d "$SRC" ]]; then
  echo "error: dnd-app 5e dir not found: $SRC" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"

# Copy every .json under the tree EXCEPT the maps/ dir (82 MB of binary-ish map
# assets we don't serve), preserving the relative directory structure.
count=0
while IFS= read -r -d '' f; do
  rel="${f#"$SRC"/}"
  mkdir -p "$DEST/$(dirname "$rel")"
  cp "$f" "$DEST/$rel"
  count=$((count + 1))
done < <(find "$SRC" -type f -name '*.json' -not -path "$SRC/maps/*" -print0)

echo "OK: seeded $count 5e JSON files -> bmo/pi/data/5e-library/ (maps/ excluded)"
