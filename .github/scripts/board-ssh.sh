#!/usr/bin/env bash
# Shared helper: drive the BMO status board from a GitHub Actions runner over
# Tailscale SSH — the SAME auth path bmo / deploy uses (no SSH-key secret; the
# runner joins the tailnet with TS_OAUTH_CLIENT_ID/TS_OAUTH_SECRET first).
#
# Source it, then call `board <notify-board args...>`. Args with spaces are
# quoted safely for the remote bash so titles/details survive SSH intact.
#
# Requires: a prior tailscale/github-action step in the same job. If the tailnet
# isn't joined (secrets absent) the caller should skip this entirely — callers
# gate on TS_OAUTH so runs stay GREEN when the board is unreachable.
BMO_HOST="${BMO_HOST:-patrick@bmo.tail31b5d9.ts.net}"
NOTIFY_BOARD="${NOTIFY_BOARD:-/home/patrick/bmo-board/notify-board}"

board() {
  local remote
  remote="$(printf '%q ' "$NOTIFY_BOARD" "$@")"
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
    "$BMO_HOST" "$remote"
}
