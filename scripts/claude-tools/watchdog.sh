#!/usr/bin/env bash
# SOURCE OF TRUTH for the live failsafe deployed at ~/.claude-tools/watchdog.sh
# (invoked every 60s by the systemd user timer). Not auto-deployed yet — sync
# this file to ~/.claude-tools/watchdog.sh after merge for the change to take effect.
# Claude Code failsafe watchdog. Invoked every 60s by the systemd user timer.
#
# PURPOSE: catch a CRASHED / gone session — session-active flag left behind but
# the agent's tmux session is dead (crash, host reboot, killed terminal). It is
# NOT meant to nag while the agent is alive and working, or while the user is
# deliberately waiting/ignoring.
#
# Decision tree:
#   no session-active                       -> quiet (no session running)
#   no heartbeat                            -> quiet (fresh setup)
#   heartbeat fresh (< STALE_THRESHOLD)     -> recovery: clear alert flag; quiet
#   heartbeat stale BUT tmux session alive  -> quiet. The agent is working or
#                                              deliberately idle; a live agent
#                                              self-notifies on real STOPs
#                                              (notify.sh, rule 23). This is the
#                                              fix for the false "heartbeat cold
#                                              while still going" alerts.
#   heartbeat stale AND tmux session dead:
#       already alerted this episode        -> quiet  (alert ONCE — never spam;
#                                              fix for the every-30-min repeat)
#       otherwise                           -> fire notify.sh once + set flag
#
# The alert flag (last-watchdog-alert) is cleared the moment the heartbeat goes
# fresh again, so a genuinely new crash later still alerts exactly once.

set -u
TOOLS_DIR="${HOME}/.claude-tools"
SESSION_ACTIVE="${TOOLS_DIR}/session-active"
HEARTBEAT="${TOOLS_DIR}/heartbeat"
SESSION_META="${TOOLS_DIR}/session-meta"
ALERTED="${TOOLS_DIR}/last-watchdog-alert"
LOG="${TOOLS_DIR}/watchdog.log"
NOTIFY="${TOOLS_DIR}/notify.sh"
STALE_THRESHOLD_SECONDS=900   # 15 min — generous for long 4-gates / gh run watch

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

[[ -e "${SESSION_ACTIVE}" ]] || exit 0
[[ -e "${HEARTBEAT}" ]]      || exit 0

now_ts=$(date +%s)
hb_ts=$(stat -c %Y "${HEARTBEAT}")
elapsed=$(( now_ts - hb_ts ))

# Fresh heartbeat -> session healthy; clear any prior cold-episode alert flag.
if (( elapsed < STALE_THRESHOLD_SECONDS )); then
  rm -f "${ALERTED}"
  exit 0
fi

# Heartbeat is stale. Is the agent's tmux session still alive? If so, the agent
# is working or deliberately waiting — NOT crashed. Stay silent.
tmux_target=""
[[ -e "${SESSION_META}" ]] && tmux_target=$(sed -n 's/^TMUX_TARGET=//p' "${SESSION_META}")
if [[ -n "${tmux_target}" ]] && tmux has-session -t "${tmux_target}" 2>/dev/null; then
  exit 0
fi

# Stale heartbeat AND no live tmux session -> genuine crash / gone session.
# Alert exactly ONCE per cold episode (flag cleared on recovery above).
[[ -e "${ALERTED}" ]] && exit 0

if [[ ! -x "${NOTIFY}" ]]; then
  echo "$(stamp) ERROR notify.sh missing or not executable" >> "${LOG}"
  exit 1
fi

minutes=$(( elapsed / 60 ))
hb_iso=$(date -u -d "@${hb_ts}" +%Y-%m-%dT%H:%M:%SZ)
now_iso=$(stamp)
started_at=""
[[ -e "${SESSION_META}" ]] && started_at=$(sed -n 's/^STARTED_AT=//p' "${SESSION_META}")

# Identify WHICH task the dead session was running, so the alert is actionable
# instead of a generic "a session died". Per-run identity lives in the agent lock
# files (~/home-lab-locks/<agent>.lock: agent=, mode=/phase=, pid=). Collect every
# lock still on disk whose recorded holder pid is gone (or absent) — those are the
# stuck/abandoned tasks the operator should look at. A lock whose pid is still
# alive (a running agent) is skipped. Only when exactly ONE lock has a confirmed
# dead pid do we name it in the subject; otherwise we keep a session-scoped subject
# and list all candidates in the body, to avoid fingering the wrong agent.
LOCKS_DIR="${HOME}/home-lab-locks"
candidates=""
dead_task=""
dead_count=0
if [[ -d "${LOCKS_DIR}" ]]; then
  for lf in $(ls -1t "${LOCKS_DIR}"/*.lock 2>/dev/null); do
    a=$(sed -n 's/.*agent=\([A-Za-z0-9_.-]*\).*/\1/p' "${lf}" | head -1)
    m=$(sed -n 's/.*\(mode\|phase\)=\([A-Za-z0-9_.-]*\).*/\2/p' "${lf}" | head -1)
    p=$(sed -n 's/.*pid=\([0-9]\{1,\}\).*/\1/p' "${lf}" | head -1)
    [[ -z "${a}" ]] && a=$(basename "${lf}" .lock)
    name="${a}${m:+ (${m})}"
    if [[ -n "${p}" ]]; then
      if kill -0 "${p}" 2>/dev/null; then continue; fi   # holder still running -> not crashed
      candidates="${candidates:+${candidates}; }${name} [pid ${p} dead]"
      dead_count=$(( dead_count + 1 ))
      [[ -z "${dead_task}" ]] && dead_task="${name}"
    else
      candidates="${candidates:+${candidates}; }${name} [pid not recorded]"
    fi
  done
fi

if (( dead_count == 1 )); then
  subject="Claude session ended unexpectedly: ${dead_task}"
else
  subject="Claude session ended unexpectedly (tmux '${tmux_target:-?}', started ${started_at:-?})"
fi

"${NOTIFY}" "error" \
  "${subject}" \
  "Detected ${now_iso}. session-active is set but tmux session '${tmux_target:-?}' (started ${started_at:-?}) is gone and the heartbeat is ${minutes}m stale (last: ${hb_iso}). Stuck/abandoned task lock(s): ${candidates:-none found in ${LOCKS_DIR}}. Likely a crashed session, host reboot, or killed terminal. Alerting once — won't repeat until a new session refreshes the heartbeat."
touch "${ALERTED}"
echo "$(stamp) ALERT-FIRED (session dead) elapsed=${elapsed}s" >> "${LOG}"
