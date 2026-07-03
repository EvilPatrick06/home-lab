#!/usr/bin/env bash
# bmo-cron replacement for weekday-morning-brief. Gathers LOCAL inputs
# deterministically (calendar / weather / Pi / GitHub) and calls Gemini (bmo's
# existing gemini_chat; key read safely from bmo/pi/.env) ONLY for the prose
# overview line. Posts to the board (Briefs) via notify-board, re-synced daily.
# Degrades to a deterministic overview if GEMINI_API_KEY is unset or Gemini errors
# (403/429/network). Web-search-only sections (news/picks/local events) are
# intentionally omitted — a cron has no search tool. See docs/SCHEDULED-TASK-MIGRATION.md.
set -uo pipefail
NB="${NOTIFY_BOARD:-/home/patrick/bmo-board/notify-board}"
PI="${BMO_PI_DIR:-/home/patrick/home-lab-deploy/bmo/pi}"
VENV_PY="$PI/venv/bin/python"
export BMO_PI_DIR="$PI" NB SRC=morning-brief
export BRIEF_MODEL="${BMO_BRIEF_MODEL:-gemini-2.0-flash}"
export BMO_ENV_FILE="${BMO_ENV_FILE:-$PI/.env}"

# deterministic Pi status (runs locally on bmo) — no .env needed here
pi_services=""; for s in bmo bmo-fan cloudflared tailscaled docker fail2ban; do
  pi_services+="$s=$(systemctl is-active "$s.service" 2>/dev/null) "
done
export PI_SERVICES="$pi_services"
export PI_DISK="$(df -h / | tail -1 | awk '{print $5" used, "$4" free"}')"
export PI_TEMP="$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//')"
export WX_JSON="$(curl -s -m 20 'https://wttr.in/80920?format=j1' 2>/dev/null)"
export NWS_JSON="$(curl -s -m 20 'https://api.weather.gov/alerts/active?point=38.95,-104.80' -H 'User-Agent: home-lab-brief (bmo)' 2>/dev/null)"
export GH_PRS="$(gh pr list --repo EvilPatrick06/home-lab --state open --json isDraft --jq '[.[]|select(.isDraft==false)]|length' 2>/dev/null || echo '?')"
export GH_FAILS="$(gh run list --repo EvilPatrick06/home-lab --branch master --status failure --limit 20 --json databaseId --jq 'length' 2>/dev/null || echo '?')"

"$VENV_PY" - <<'PY'
import os, json, subprocess, sys
PI=os.environ["BMO_PI_DIR"]; NB=os.environ["NB"]; SRC=os.environ["SRC"]
sys.path.insert(0, PI)

# Safe .env load (no shell execution): KEY=VALUE lines only, strip matched quotes.
def load_env(path):
    try:
        for ln in open(path, encoding="utf-8"):
            ln=ln.strip()
            if not ln or ln.startswith("#") or "=" not in ln:
                continue
            k,v=ln.split("=",1); v=v.strip()
            if len(v)>=2 and v[0]==v[-1] and v[0] in ("'",'"'):
                v=v[1:-1]
            os.environ.setdefault(k.strip(), v)
    except Exception:
        pass
load_env(os.environ.get("BMO_ENV_FILE", PI+"/.env"))

def bset(key, title, detail="", sev="info"):
    a=[NB,"set",SRC,key,"brief",title]
    if detail: a+=["--detail",detail]
    a+=["--severity",sev]
    subprocess.run(a, check=False)

subprocess.run([NB,"clear",SRC], check=False)

cal_lines=[]
try:
    from services.calendar.service import CalendarService
    evs=CalendarService().get_today_events()
    for e in evs:
        t=e.get("summary","(no title)"); s=e.get("start","")
        key="cal:"+("".join(c for c in t.lower() if c.isalnum())[:16] or "evt")
        bset(key, "📅 %s — %s"%(s,t), e.get("location",""), "info")
        cal_lines.append("%s %s"%(s,t))
    if not evs: bset("cal:clear","📅 Clear day","","info")
except Exception as ex:
    bset("cal:err","📅 calendar unavailable",str(ex)[:120],"info")

wx_summary=""
try:
    wx=json.loads(os.environ.get("WX_JSON") or "{}")
    cur=wx["current_condition"][0]; today=wx["weather"][0]
    hi=today["maxtempF"]; lo=today["mintempF"]; cond=cur["weatherDesc"][0]["value"]
    astr=today.get("astronomy",[{}])[0]
    alert=""
    try:
        feats=json.loads(os.environ.get("NWS_JSON") or "{}").get("features",[])
        if feats: alert=feats[0]["properties"].get("event","")
    except Exception: pass
    wx_summary="%s/%s F, %s"%(hi,lo,cond)
    det="sunrise %s, sunset %s%s"%(astr.get("sunrise","?"),astr.get("sunset","?"),(" | ALERT: "+alert) if alert else "")
    bset("weather","🌤 "+wx_summary, det, "warning" if alert else "info")
except Exception as ex:
    bset("weather","🌤 weather unavailable",str(ex)[:120],"info")

svc=os.environ.get("PI_SERVICES",""); disk=os.environ.get("PI_DISK",""); temp=os.environ.get("PI_TEMP","")
down=[x for x in svc.split() if x.endswith("=failed") or x.endswith("=inactive")]
pi_ok=not down
bset("pi","🔧 Pi: "+("all healthy" if pi_ok else "ISSUES: "+" ".join(down)), "%s| disk %s | temp %s"%(svc,disk,temp), "info" if pi_ok else "warning")

prs=os.environ.get("GH_PRS","?"); fails=os.environ.get("GH_FAILS","?")
bset("github","🐙 GitHub: %s open PRs, %s failing runs"%(prs,fails), "", "warning" if fails not in ("0","?") else "info")

overview=None
if os.environ.get("GEMINI_API_KEY"):
    try:
        from services.cloud_providers import gemini_chat
        ctx=("Calendar today: %s\nWeather: %s\nPi services: %s (disk %s, temp %s)\nGitHub: %s open PRs, %s failing runs"
             %("; ".join(cal_lines) or "clear", wx_summary or "n/a", svc.strip(), disk, temp, prs, fails))
        msgs=[{"role":"system","content":"You write ONE warm, concise 1-2 sentence morning-brief overview for Gavin (19, Colorado Springs). Plain text, no markdown, under 240 chars. Mention only what matters today."},
              {"role":"user","content":ctx}]
        overview=gemini_chat(msgs, model=os.environ.get("BRIEF_MODEL","gemini-2.0-flash"), temperature=0.7, max_tokens=200).strip()
    except Exception as ex:
        sys.stderr.write("gemini overview failed: %s\n"%str(ex)[:160])
        overview=None
if not overview:
    overview="Good morning! %d event(s) today. Weather: %s. Pi %s."%(len(cal_lines), wx_summary or "n/a", "healthy" if pi_ok else "needs a look")
bset("overview","☀️ "+overview[:220], "", "info")
print("morning brief posted (%d cal, gemini_key=%s)"%(len(cal_lines), bool(os.environ.get('GEMINI_API_KEY'))))
PY
echo done
