#!/usr/bin/env bash
# Drift guard for the hand-maintained AI-assistant instruction files. AGENTS.md
# is canonical (see its header); CLAUDE.md / GEMINI.md / copilot-instructions.md
# must keep pointing at it for shared guidance instead of silently duplicating
# and drifting. If AGENTS.md wraps a block in <!-- SYNC:agents START/END -->
# markers, every other file that carries the same markers must match it byte for
# byte. (BMO-SUGGESTIONS 2026-06-22.)
set -euo pipefail
cd "$(dirname "$0")/.."

secondary=("CLAUDE.md" "GEMINI.md" ".github/copilot-instructions.md")
fail=0

for f in "${secondary[@]}"; do
  if [ ! -f "$f" ]; then echo "MISSING: $f" >&2; fail=1; continue; fi
  if ! grep -q "AGENTS.md" "$f"; then
    echo "DRIFT: $f no longer references the canonical AGENTS.md" >&2; fail=1
  fi
done

if grep -q "SYNC:agents START" AGENTS.md 2>/dev/null; then
  block() { awk "/SYNC:agents START/{f=1;next} /SYNC:agents END/{f=0} f" "$1"; }
  canon="$(block AGENTS.md)"
  for f in "${secondary[@]}"; do
    if grep -q "SYNC:agents START" "$f" 2>/dev/null && [ "$(block "$f")" != "$canon" ]; then
      echo "DRIFT: $f SYNC:agents block differs from AGENTS.md" >&2; fail=1
    fi
  done
fi

[ "$fail" -ne 0 ] && { echo "agent-instruction drift check FAILED" >&2; exit 1; }
echo "agent-instruction files OK"
