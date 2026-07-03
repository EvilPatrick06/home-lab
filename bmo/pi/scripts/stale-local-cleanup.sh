#!/usr/bin/env bash
# bmo-LOCAL half of the stale-branch-pruner split: prune stale worktrees, remove
# leftover worktree dirs whose branch is gone, delete lock files >24h, and trim
# notify.log. It NEVER deletes branches (local or remote) and NEVER touches
# master — remote merged-branch deletion is the GitHub Action
# (.github/workflows/stale-branch-pruner.yml). Intended to run from bmo cron,
# e.g. weekly:  0 4 * * 0  /home/patrick/home-lab/bmo/pi/scripts/stale-local-cleanup.sh
set -euo pipefail
REPO="${HOME}/home-lab"
TREES="${HOME}/home-lab-trees"
LOCKS="${HOME}/home-lab-locks"
NOTIFY_LOG="${HOME}/.claude-tools/notify.log"

cd "$REPO"
git worktree prune
echo "worktrees pruned"

if [ -d "$TREES" ]; then
  for d in "$TREES"/*; do
    [ -d "$d" ] || continue
    # Skip anything git still tracks as a live worktree.
    if git worktree list --porcelain | grep -qF "worktree $d"; then
      continue
    fi
    br="auto/$(basename "$d")"
    if ! git show-ref --verify --quiet "refs/heads/$br"; then
      echo "removing stale worktree dir: $d"
      git worktree remove --force "$d" 2>/dev/null || rm -rf "$d"
    fi
  done
fi

if [ -d "$LOCKS" ]; then
  find "$LOCKS" -type f -name '*.lock' -mmin +1440 -print -delete || true
fi

if [ -f "$NOTIFY_LOG" ] && [ "$(wc -l < "$NOTIFY_LOG")" -gt 5000 ]; then
  tail -n 1000 "$NOTIFY_LOG" > "$NOTIFY_LOG.tmp" && mv "$NOTIFY_LOG.tmp" "$NOTIFY_LOG"
  echo "trimmed notify.log to last 1000 lines"
fi

echo "local cleanup done"
