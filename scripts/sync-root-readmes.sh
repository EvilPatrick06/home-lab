#!/usr/bin/env bash
# Mirror each project README to a sibling at repo root so GitHub renders them
# as proper Markdown pages (symlinks render as redirect targets, which is why
# we copy instead of linking). Run from any directory.
#
# Source of truth lives in each project folder. Root-level copies are
# auto-generated; do NOT edit them by hand — edit the project copy and re-run
# this script (or let the pre-commit hook do it).
set -euo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$repo_root"

pairs=(
  "bmo/README.md:bmo-README.md"
  "dnd-app/README.md:dnd-app-README.md"
  "dungeon-scholar/README.md:dungeon-scholar-README.md"
)

changed=0
for pair in "${pairs[@]}"; do
  src="${pair%%:*}"
  dst="${pair##*:}"
  if [ ! -f "$src" ]; then
    echo "ERROR: source $src missing" >&2
    exit 1
  fi
  if ! cmp -s "$src" "$dst"; then
    cp "$src" "$dst"
    echo "synced $src → $dst"
    changed=1
  fi
done

if [ "$changed" -eq 0 ]; then
  echo "all 3 root READMEs already in sync"
fi
