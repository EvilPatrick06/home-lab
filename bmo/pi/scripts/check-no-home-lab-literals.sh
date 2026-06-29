#!/usr/bin/env bash
# Ratchet gate: production bmo/pi modules should resolve filesystem roots via
# services.paths (BMO_ROOT / DATA_DIR / MODELS_DIR), not hand-rolled
# os.path.expanduser("~/home-lab...") literals. Fails if the literal count GROWS
# beyond the committed baseline (.home-lab-literal-baseline) — preventing new
# hardcoded roots while the remaining backlog (standalone scripts / wake /
# mcp_servers / repo-root references) is retired opportunistically. Tests +
# services/paths.py itself are exempt. (BMO-SUGGESTIONS 2026-06-24.)
set -euo pipefail
cd "$(dirname "$0")/.."   # bmo/pi
EXCL='^\./tests/|^\./services/paths\.py:'
count=$(grep -rnE 'expanduser\("~/home-lab' --include=*.py . | grep -vE "$EXCL" | wc -l)
baseline=$(cat .home-lab-literal-baseline 2>/dev/null || echo 0)
echo "home-lab path literal count=$count baseline=$baseline"
if [ "$count" -gt "$baseline" ]; then
  echo "FAIL: $((count - baseline)) new ~/home-lab path literal(s) - import from services.paths instead." >&2
  grep -rnE 'expanduser\("~/home-lab' --include=*.py . | grep -vE "$EXCL" >&2 || true
  exit 1
fi
echo "OK: no new ~/home-lab path literals (count <= baseline). Lower .home-lab-literal-baseline as you convert."
