#!/usr/bin/env bash
# board-decision-nudge.sh — triggered by bmo-board-decision-nudge.path the moment
# a board Approve/Deny/Other click appends to the decisions outbox.
#
# It replaces the every-15-min board-decision-relay POLL with an EVENT: on each
# click it records a per-producer "nudge" marker naming the owning source + item
# + decision, so the owning task (and/or the dispatch orchestrator) can consume
# the decision promptly — via board-pending-decisions.sh — instead of waiting on
# a fixed polling cadence.
#
# It performs NO Discord I/O and never resumes a session itself: the actual
# re-dispatch of the owning scheduled task is orchestrator-side (the same split
# the relay task already documented — "delivery is orchestrator-side; this task
# only detects"). This script only turns the file-write into a signal + audit log.
set -euo pipefail

SELF="$(readlink -f "$0" 2>/dev/null || echo "$0")"
DATA_DIR="${BOARD_DATA_DIR:-$(dirname "$(dirname "$SELF")")/data}"
OUTBOX="$DATA_DIR/board_decisions_outbox.jsonl"
LOG="$DATA_DIR/logs/board-decision-nudge.log"
mkdir -p "$DATA_DIR/nudges" "$(dirname "$LOG")"

[ -f "$OUTBOX" ] || exit 0

# The last outbox line is the newest click. Extract its owning source + item and
# stamp a per-source nudge marker (latest decision wins per source) plus an
# append-only audit line.
python3 - "$OUTBOX" "$DATA_DIR" "$LOG" <<'PY'
import json, os, sys, time
outbox, data_dir, log = sys.argv[1:4]
try:
    with open(outbox, encoding="utf-8") as f:
        lines = [l for l in f if l.strip()]
except FileNotFoundError:
    sys.exit(0)
if not lines:
    sys.exit(0)
try:
    rec = json.loads(lines[-1])
except json.JSONDecodeError:
    sys.exit(0)  # torn trailing write; the next append re-fires the path unit
src = rec.get("source")
if not src:
    sys.exit(0)
payload = {
    "source": src,
    "item_id": rec.get("item_id"),
    "decision": rec.get("decision"),
    "session_id": rec.get("session_id"),
    "title": rec.get("title", ""),
    "ts": rec.get("ts"),
    "nudged_at": time.time(),
}
marker = os.path.join(data_dir, "nudges", "%s.nudge" % src)
tmp = marker + ".tmp.%d" % os.getpid()
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False)
os.replace(tmp, marker)
with open(log, "a", encoding="utf-8") as f:
    f.write(json.dumps(payload, ensure_ascii=False) + "\n")
PY
