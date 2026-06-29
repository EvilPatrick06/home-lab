#!/usr/bin/env bash
# Ratchet gate: production modules under bmo/pi should log via bmo_logging
# (get_logger), not print(). Fails if the production print() count GROWS beyond
# the committed baseline (.print-baseline) — preventing new prints while the
# existing backlog is retired opportunistically. CLI/dev/scripts/tests/
# mcp_servers/wake + the *_calendar.py auth CLIs are exempt (stdout is their
# interface). Lower .print-baseline whenever you convert prints to logging.
# (BMO-SUGGESTIONS 2026-06-22.)
set -euo pipefail
cd "$(dirname "$0")/.."   # bmo/pi
EXCL='^\./(cli|dev|scripts|tests|mcp_servers|wake)/|^\./cli\.py:|^\./services/(authorize|reauth)_calendar\.py:|^\./services/calendar/(authorize|reauth)\.py:'
count=$(grep -rnE '^\s*print\(' --include=*.py . | grep -vE "$EXCL" | wc -l)
baseline=$(cat .print-baseline 2>/dev/null || echo 0)
echo "production print() count=$count baseline=$baseline"
if [ "$count" -gt "$baseline" ]; then
  echo "FAIL: $((count - baseline)) new print() in production modules — use services.bmo_logging.get_logger instead." >&2
  echo "New/added print() lines (review):" >&2
  grep -rnE '^\s*print\(' --include=*.py . | grep -vE "$EXCL" | tail -n +"$((baseline + 1))" >&2 || true
  exit 1
fi
echo "OK: no new production print() (count <= baseline). Lower .print-baseline as you convert."
