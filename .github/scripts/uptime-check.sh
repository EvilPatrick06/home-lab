#!/usr/bin/env bash
# External uptime probe from a GitHub runner (genuinely off-tailnet) → BMO board
# 🚨 Incidents, self-clearing. no-LLM replacement for external-uptime-check.
#
# bmo-INDEPENDENT FALLBACK: if the board itself is unreachable (bmo/board down,
# or TS_OAUTH absent), the alert still lands as a GitHub issue so an outage is
# never silent just because the surface we normally post to is part of the outage.
set -uo pipefail   # not -e: curl probes are allowed to fail; we handle rc
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/board-ssh.sh"

REPO="${GITHUB_REPOSITORY:-EvilPatrick06/home-lab}"
BOARD_OK="${BOARD_OK:-false}"
ISSUE_TITLE="External uptime: public endpoint(s) unreachable"

# check <url> <mode>  → "UP" or "DOWN http=NNN"
#   mode 200    : healthy ONLY on 200 (a 302-to-Access here means public access broke)
#   mode access : 302/other healthy; DOWN only on connection failure (000) or 5xx
check() {
  local url="$1" mode="$2" code
  code=$(curl -sS -o /dev/null -w '%{http_code}' -m 20 "$url" 2>/dev/null || echo 000)
  if [ "$mode" = "200" ]; then
    [ "$code" = "200" ] && echo "UP" || echo "DOWN http=$code"
  else
    case "$code" in 000|5??) echo "DOWN http=$code" ;; *) echo "UP" ;; esac
  fi
}

declare -a DOWN
r=$(check "https://bmo.mybmoai.work/DungeonTableOnline/" 200)
[ "${r%% *}" = "DOWN" ] && DOWN+=("game|https://bmo.mybmoai.work/DungeonTableOnline/|$r")
r=$(check "https://bmo.mybmoai.work/" access)
[ "${r%% *}" = "DOWN" ] && DOWN+=("root|https://bmo.mybmoai.work/|$r")

board_failed=0
if [ "$BOARD_OK" = "true" ]; then
  board clear external-uptime || board_failed=1
  for d in "${DOWN[@]:-}"; do
    [ -n "$d" ] || continue
    IFS='|' read -r slug url reason <<<"$d"
    board set external-uptime "$slug" incident "External: $url $reason" \
      --detail "$reason (probed from GitHub Actions)" --severity critical || board_failed=1
  done
fi

# Fallback issue when down AND the board path didn't take the alert.
if [ "${#DOWN[@]}" -gt 0 ] && { [ "$BOARD_OK" != "true" ] || [ "$board_failed" = "1" ]; }; then
  body="Detected $(date -u '+%Y-%m-%d %H:%M UTC') from GitHub Actions (external vantage):"$'\n'
  for d in "${DOWN[@]}"; do IFS='|' read -r s u re <<<"$d"; body+="- ${u} — ${re}"$'\n'; done
  num=$(gh issue list --repo "$REPO" --state open --search "\"$ISSUE_TITLE\" in:title" \
        --json number --jq '.[0].number // empty' 2>/dev/null || true)
  if [ -n "$num" ]; then
    gh issue comment "$num" --repo "$REPO" --body "$body" || true
  else
    gh issue create --repo "$REPO" --title "$ISSUE_TITLE" --body "$body" --label uptime 2>/dev/null \
      || gh issue create --repo "$REPO" --title "$ISSUE_TITLE" --body "$body" || true
  fi
fi

# Recovered → close the fallback issue if one is open.
if [ "${#DOWN[@]}" -eq 0 ]; then
  num=$(gh issue list --repo "$REPO" --state open --search "\"$ISSUE_TITLE\" in:title" \
        --json number --jq '.[0].number // empty' 2>/dev/null || true)
  [ -n "$num" ] && gh issue close "$num" --repo "$REPO" \
    --comment "Recovered $(date -u '+%Y-%m-%d %H:%M UTC'); all endpoints healthy." || true
fi

echo "uptime: ${#DOWN[@]} endpoint(s) down; board_ok=$BOARD_OK board_failed=$board_failed"
