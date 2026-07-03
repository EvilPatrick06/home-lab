#!/usr/bin/env bash
# no-LLM replacement for the severe-weather-alert Claude task. Posts ONE keyed
# board item per ACTIVE NWS alert for Colorado Springs (ZIP 80920), re-synced so
# each clears when its alert expires. Deterministic: official api.weather.gov
# active alerts (no API key). Silent when nothing is active.
set -uo pipefail
NB="${NOTIFY_BOARD:-/home/patrick/bmo-board/notify-board}"
POINT="${WEATHER_POINT:-38.95,-104.76}"   # 80920 Colorado Springs, CO
SRC=severe-weather

alerts="$(python3 - "$POINT" <<'PY'
import json, re, sys, urllib.request
point = sys.argv[1]
url = "https://api.weather.gov/alerts/active?point=%s" % point
req = urllib.request.Request(url, headers={
    "User-Agent": "home-lab-weather-cron (bmo; contact patrick)",
    "Accept": "application/geo+json"})
try:
    with urllib.request.urlopen(req, timeout=25) as r:
        data = json.load(r)
except Exception as e:
    print("FETCH_ERROR %s" % e, file=sys.stderr)
    sys.exit(3)

KNOWN = {
    "red flag warning": "redflag", "fire weather watch": "redflag",
    "air quality alert": "airquality", "winter storm warning": "winterstorm",
    "winter storm watch": "winterstorm", "winter weather advisory": "winterweather",
    "ice storm warning": "winterstorm", "high wind warning": "highwind",
    "wind advisory": "highwind", "tornado warning": "tornado", "tornado watch": "tornado",
    "severe thunderstorm warning": "severethunderstorm",
    "severe thunderstorm watch": "severethunderstorm",
    "flood warning": "flood", "flash flood warning": "flashflood", "flood watch": "flood",
    "excessive heat warning": "extremeheat", "heat advisory": "extremeheat",
    "extreme cold warning": "extremecold", "wind chill warning": "extremecold",
    "wind chill advisory": "extremecold", "dense fog advisory": "densefog",
}
def slugify(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())[:20] or "weather"
seen = {}
for f in data.get("features", []):
    p = f.get("properties", {})
    event = (p.get("event") or "").strip()
    if not event:
        continue
    slug = KNOWN.get(event.lower()) or slugify(event)
    base, n = slug, 2
    while slug in seen and seen[slug] != event.lower():
        slug = "%s%d" % (base, n); n += 1
    seen[slug] = event.lower()
    sev = "critical" if (p.get("severity") or "").lower() in ("extreme", "severe") else "warning"
    headline = p.get("headline") or event
    onset = (p.get("onset") or p.get("effective") or "")[:16]
    ends = (p.get("ends") or p.get("expires") or "")[:16]
    detail = ("%s | %s to %s" % (event, onset, ends))[:180]
    print("%s\t%s\t%s\t%s" % (slug, ("Weather: " + headline)[:140], detail, sev))
PY
)"
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "NWS fetch failed (rc=$rc) — leaving board unchanged"
  exit 0
fi
"$NB" clear "$SRC" || exit 0
[ -n "$alerts" ] || { echo "no active weather alerts"; exit 0; }
while IFS=$'\t' read -r slug title detail sev; do
  [ -n "$slug" ] || continue
  "$NB" set "$SRC" "$slug" attention "$title" --detail "$detail" --severity "$sev"
done <<< "$alerts"
echo "posted weather alerts"
