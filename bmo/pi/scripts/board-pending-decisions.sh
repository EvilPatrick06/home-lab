#!/usr/bin/env bash
# board-pending-decisions.sh — event-era replacement for the board-decision-relay poll.
#
# A button-producing scheduled task (a resolver or phase-executer) calls this at
# the START of its run to fetch the NEW Approve/Deny/Other decisions for ITS OWN
# board namespace, then acts on them itself (approve -> implement, deny -> close,
# other -> follow the typed instruction). Because every producer self-consumes
# its decisions this way, the separate every-15-min board-decision-relay Claude
# poll is no longer needed.
#
# Usage:
#   board-pending-decisions.sh <producer-source> [--peek] [--all] [--reset]
#
#   <producer-source>  the notify-board source/namespace the task posts under
#                      (e.g. bmo-resolver, dnd-phase-executer). Records are
#                      matched to it by their "source" field; each record's
#                      stable item_id/key identifies which posted item was
#                      decided.
#   --peek    print pending decisions but DO NOT advance the cursor (idempotent
#             inspection; a later run will see them again).
#   --all     ignore the cursor and print EVERY recorded decision for this
#             source (implies --peek; never advances).
#   --reset   advance the cursor to EOF WITHOUT printing (acknowledge / skip
#             everything currently pending).
#
# Output: one JSON object per NEW decision line, in outbox order, on stdout:
#   {"item_id":..,"decision":"approve|deny|other","text":..,"session_id":..,
#    "title":..,"ts":..,"source":..}
# ("text" is populated only for an ✏️ Other decision; "" otherwise.)
#
# Semantics:
#   * Absent outbox (no click has ever happened) => no output, exit 0.
#   * Per-producer cursor => a task only ever sees each decision once.
#   * Advancing the cursor is atomic (tmp + rename).
#   * Reading the append-only outbox never blocks a concurrent bot write, and a
#     torn/partial trailing line is tolerated (skipped, not fatal).
set -euo pipefail

SELF="$(readlink -f "$0" 2>/dev/null || echo "$0")"
# Resolve the data dir exactly like notify-board: BOARD_DATA_DIR wins, else the
# checkout's bmo/pi/data relative to this script (.../bmo/pi/scripts/<this> ->
# .../bmo/pi/data). Run from the deploy checkout, this reads the deploy data dir
# the board cog writes the outbox into.
DATA_DIR="${BOARD_DATA_DIR:-}"
if [ -z "$DATA_DIR" ]; then
  DATA_DIR="$(dirname "$(dirname "$SELF")")/data"
fi
OUTBOX="$DATA_DIR/board_decisions_outbox.jsonl"

SOURCE=""
PEEK=0
ALL=0
RESET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --peek)  PEEK=1 ;;
    --all)   ALL=1; PEEK=1 ;;
    --reset) RESET=1 ;;
    -h|--help) echo "usage: board-pending-decisions.sh <producer-source> [--peek] [--all] [--reset]"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) if [ -z "$SOURCE" ]; then SOURCE="$1"; else echo "unexpected arg: $1" >&2; exit 2; fi ;;
  esac
  shift
done
[ -n "$SOURCE" ] || { echo "error: missing <producer-source>" >&2; exit 2; }

# Absent outbox => nothing pending, ever. Tolerate cleanly (no click yet, or the
# board tools are not deployed on this host).
[ -f "$OUTBOX" ] || exit 0

CURSOR="$DATA_DIR/board_decisions_cursor.$SOURCE"

python3 - "$OUTBOX" "$CURSOR" "$SOURCE" "$PEEK" "$ALL" "$RESET" <<'PY'
import json, os, sys
outbox, cursor, source, peek, allf, reset = sys.argv[1:7]
peek, allf, reset = peek == "1", allf == "1", reset == "1"

# The outbox is append-only, so line numbers are stable. A per-producer cursor is
# the count of shared-outbox lines this source's task has already consumed. We
# track position against the WHOLE file but only PRINT lines whose "source"
# matches this producer, so interleaved decisions for other producers are simply
# skipped (and each producer keeps its own independent cursor file).
try:
    with open(outbox, encoding="utf-8") as f:
        lines = f.readlines()
except FileNotFoundError:
    sys.exit(0)

total = len(lines)
start = 0
if not allf:
    try:
        with open(cursor, encoding="utf-8") as f:
            start = int((f.read() or "0").strip() or 0)
    except (FileNotFoundError, ValueError):
        start = 0
    start = max(0, min(start, total))

if not reset:
    for ln in lines[start:total]:
        ln = ln.strip()
        if not ln:
            continue
        try:
            rec = json.loads(ln)
        except json.JSONDecodeError:
            continue  # tolerate a partial/torn trailing line
        if rec.get("source") != source:
            continue
        out = {
            "item_id":    rec.get("item_id"),
            "decision":   rec.get("decision"),
            "text":       rec.get("text", ""),
            "session_id": rec.get("session_id"),
            "title":      rec.get("title", ""),
            "ts":         rec.get("ts"),
            "source":     rec.get("source"),
        }
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")

# Advance the cursor to EOF unless peeking / --all. Atomic tmp + rename so a
# concurrent reader never sees a half-written cursor.
if not peek and not allf:
    os.makedirs(os.path.dirname(cursor) or ".", exist_ok=True)
    tmp = cursor + ".tmp.%d" % os.getpid()
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(str(total) + "\n")
    os.replace(tmp, cursor)
PY
