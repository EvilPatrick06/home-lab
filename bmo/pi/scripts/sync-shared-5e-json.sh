#!/usr/bin/env bash
# Copy the five 5e JSON files that must match dnd-app's public data tree.
# Run from anywhere; resolves monorepo root from this script's location.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts -> bmo/pi -> bmo -> home-lab
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
D5="$REPO_ROOT/dnd-app/src/renderer/public/data/5e"
BMO="$REPO_ROOT/bmo/pi/data/5e"
if [[ ! -d "$D5" ]]; then
  echo "error: dnd-app 5e dir not found: $D5" >&2
  exit 1
fi
mkdir -p "$BMO"
cp -v "$D5/hazards/conditions.json" "$BMO/conditions.json"
cp -v "$D5/encounters/encounter-presets.json" "$BMO/encounter-presets.json"
cp -v "$D5/encounters/random-tables.json" "$BMO/random-tables.json"
cp -v "$D5/equipment/magic-items.json" "$BMO/magic-items.json"
cp -v "$D5/world/treasure-tables.json" "$BMO/treasure-tables.json"
echo "OK: 5 files synced dnd-app -> bmo/pi/data/5e/"
