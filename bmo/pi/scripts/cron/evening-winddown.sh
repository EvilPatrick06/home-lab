#!/usr/bin/env bash
# bmo-cron replacement for evening-winddown. Gathers LOCAL inputs deterministically
# (tomorrow's calendar + open PRs / failing CI as heads-ups) and calls Gemini
# (bmo's gemini_chat; key from bmo/pi/.env) ONLY for the prose wind-down line.
# Posts to the board (Briefs) via notify-board, re-synced daily. Degrades to a
# deterministic line if GEMINI_API_KEY is unset or Gemini errors.
# Gmail-derived heads-ups (billing/unread) are owned by email-triage and omitted
# here to avoid duplication. See docs/SCHEDULED-TASK-MIGRATION.md.
set -uo pipefail
NB="${NOTIFY_BOARD:-/home/patrick/bmo-board/notify-board}"
PI="${BMO_PI_DIR:-/home/patrick/home-lab-deploy/bmo/pi}"
VENV_PY="$PI/venv/bin/python"
export BMO_PI_DIR="$PI" NB SRC=evening-winddown
export BRIEF_MODEL="${BMO_BRIEF_MODEL:-gemini-2.0-flash}"
export BMO_ENV_FILE="${BMO_ENV_FILE:-$PI/.env}"
export GH_PR_LIST="$(gh pr list --repo EvilPatrick06/home-lab --state open --json number,title,isDraft --jq '[.[]|select(.isDraft==false)]|.[:5][]|"#\(.number) \(.title)"' 2>/dev/null || true)"
export GH_FAILS="$(gh run list --repo EvilPatrick06/home-lab --branch master --status failure --limit 20 --json databaseId --jq 'length' 2>/dev/null || echo '?')"

"$VENV_PY" - <<'PY'
import os, subprocess, sys, datetime
PI=os.environ["BMO_PI_DIR"]; NB=os.environ["NB"]; SRC=os.environ["SRC"]
sys.path.insert(0, PI)

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

# Tomorrow's calendar
tomo_lines=[]
try:
    from services.calendar.service import CalendarService
    evs=CalendarService().get_upcoming_events(days_ahead=2, max_results=100)
    tomorrow=(datetime.date.today()+datetime.timedelta(days=1))
    for e in evs:
        iso=e.get("start_iso","")
        d=iso[:10]
        if d==tomorrow.isoformat():
            t=e.get("summary","(no title)")
            key="cal:"+("".join(c for c in t.lower() if c.isalnum())[:16] or "evt")
            bset(key,"📅 Tomorrow: %s — %s"%(e.get("start",""),t), e.get("location",""), "info")
            tomo_lines.append("%s %s"%(e.get("start",""),t))
except Exception as ex:
    bset("cal:err","📅 calendar unavailable",str(ex)[:120],"info")

# Heads-ups: failing CI + open PRs
fails=os.environ.get("GH_FAILS","?")
if fails not in ("0","?",""):
    bset("ci","⚠️ %s failing CI run(s) on master"%fails,"resolve before the next deploy","warning")
prs=[l for l in (os.environ.get("GH_PR_LIST","") or "").splitlines() if l.strip()]
for l in prs:
    num=l.split()[0].lstrip("#")
    bset("pr:%s"%num,"🔀 Open PR %s"%l,"awaiting review/merge","info")

if not tomo_lines and fails in ("0","?","") and not prs:
    bset("clear","🌙 Tomorrow's clear — nothing pending","","info")

# Gemini wind-down prose
overview=None
if os.environ.get("GEMINI_API_KEY"):
    try:
        from services.cloud_providers import gemini_chat
        ctx=("Tomorrow's calendar: %s\nOpen PRs: %s\nFailing CI runs: %s"
             %("; ".join(tomo_lines) or "clear", "; ".join(prs) or "none", fails))
        msgs=[{"role":"system","content":"You write ONE calm, concise 1-2 sentence evening wind-down for Gavin about tomorrow. Plain text, no markdown, under 220 chars."},
              {"role":"user","content":ctx}]
        overview=gemini_chat(msgs, model=os.environ.get("BRIEF_MODEL","gemini-2.0-flash"), temperature=0.7, max_tokens=180).strip()
    except Exception as ex:
        sys.stderr.write("gemini winddown failed: %s\n"%str(ex).replace(os.environ.get("GEMINI_API_KEY") or "\0","***")[:160])
        overview=None
if not overview:
    overview="Tomorrow: %s. %s pending CI. Rest up."%(("%d event(s)"%len(tomo_lines)) if tomo_lines else "clear", fails if fails not in ("?","") else "0")
bset("overview","🌙 "+overview[:210], "", "info")
print("evening winddown posted (%d tomorrow, gemini_key=%s)"%(len(tomo_lines), bool(os.environ.get('GEMINI_API_KEY'))))
PY
echo done
