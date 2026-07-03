#!/usr/bin/env bash
# no-LLM replacement for the calendar-conflict-watch Claude task. READ-ONLY.
# Detects overlaps (double-bookings) and tight (<BUFFER min) back-to-backs in the
# next 7 days via bmo's CalendarService, and posts ONE keyed board item per
# conflict, re-synced so resolved conflicts clear. Silent when the schedule is clean.
set -uo pipefail
NB="${NOTIFY_BOARD:-/home/patrick/bmo-board/notify-board}"
SRC=calendar-conflict
PI="${BMO_PI_DIR:-/home/patrick/home-lab-deploy/bmo/pi}"
VENV_PY="$PI/venv/bin/python"
BUFFER_MIN="${BUFFER_MIN:-15}"

conflicts="$("$VENV_PY" - "$PI" "$BUFFER_MIN" <<'PY'
import sys, re, datetime
pi, buf = sys.argv[1], int(sys.argv[2])
sys.path.insert(0, pi)
try:
    from services.calendar.service import CalendarService
except Exception as e:
    print("IMPORT_ERROR %s" % e, file=sys.stderr); sys.exit(3)
try:
    svc = CalendarService()
    evs = svc.get_upcoming_events(days_ahead=7, max_results=100)
except Exception as e:
    print("FETCH_ERROR %s" % e, file=sys.stderr); sys.exit(3)

def parse(s):
    try:
        return datetime.datetime.fromisoformat(s)
    except Exception:
        return None

timed = []
for e in evs:
    if e.get("all_day"):
        continue
    st, en = parse(e.get("start_iso", "")), parse(e.get("end_iso", ""))
    if not st or not en:
        continue
    timed.append((st, en, e.get("summary", "(no title)")))
timed.sort(key=lambda x: x[0])

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:24] or "evt"

buffer = datetime.timedelta(minutes=buf)
emitted = set()
for i in range(len(timed)):
    s1, e1, t1 = timed[i]
    for j in range(i + 1, len(timed)):
        s2, e2, t2 = timed[j]
        if s2 >= e1 + buffer:
            break  # sorted by start: nothing later can be closer than this
        day = s1.strftime("%Y-%m-%d")
        if s2 < e1:  # overlap / double-booking
            key = "%s-%s-%s-overlap" % (day, slug(t1), slug(t2))
            title = "Calendar conflict: %s" % s1.strftime("%a %b %d")
            det = "OVERLAP: '%s' (%s-%s) & '%s' (%s-%s)" % (
                t1, s1.strftime("%H:%M"), e1.strftime("%H:%M"),
                t2, s2.strftime("%H:%M"), e2.strftime("%H:%M"))
        else:  # tight back-to-back
            gap = int((s2 - e1).total_seconds() // 60)
            key = "%s-%s-%s-tight" % (day, slug(t1), slug(t2))
            title = "Tight back-to-back: %s" % s1.strftime("%a %b %d")
            det = "%d min between '%s' (ends %s) & '%s' (starts %s)" % (
                gap, t1, e1.strftime("%H:%M"), t2, s2.strftime("%H:%M"))
        if key in emitted:
            continue
        emitted.add(key)
        print("%s\t%s\t%s\twarning" % (key[:60], title[:140], det[:200]))
PY
)"
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "calendar fetch failed (rc=$rc) — leaving board unchanged"
  exit 0
fi
"$NB" clear "$SRC" || exit 0
[ -n "$conflicts" ] || { echo "no calendar conflicts"; exit 0; }
while IFS=$'\t' read -r key title detail sev; do
  [ -n "$key" ] || continue
  "$NB" set "$SRC" "$key" attention "$title" --detail "$detail" --severity "$sev"
done <<< "$conflicts"
echo "posted calendar conflicts"
