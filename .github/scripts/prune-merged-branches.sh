#!/usr/bin/env bash
# Remote half of the stale-branch-pruner split: delete origin auto/* branches
# ALREADY MERGED into master. NEVER master, NEVER unmerged, NEVER force. Uses the
# GitHub API (gh + GITHUB_TOKEN) for both listing and deletion, so no persisted
# git credentials are needed (persist-credentials: false, per repo convention).
# The local worktree/lock/notify.log cleanup is the bmo-cron half
# (bmo/pi/scripts/stale-local-cleanup.sh).
set -euo pipefail
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"
deleted=0
branches="$(gh api --paginate "repos/$REPO/branches?per_page=100" --jq '.[].name')"
while IFS= read -r br; do
  [ -n "$br" ] || continue
  case "$br" in
    auto/*) ;;
    *) continue ;;
  esac
  # ahead_by 0 vs master => no commits master lacks => fully merged.
  # Anything ahead>0 is unmerged and is LEFT ALONE.
  cmp="repos/$REPO/compare/master...$br"
  ahead="$(gh api "$cmp" --jq '.ahead_by' 2>/dev/null || echo -1)"
  if [ "$ahead" = "0" ]; then
    ref="repos/$REPO/git/refs/heads/$br"
    echo "deleting merged remote branch: $br"
    if gh api -X DELETE "$ref" >/dev/null 2>&1; then
      deleted="$((deleted + 1))"
    fi
  fi
done <<< "$branches"
echo "pruned $deleted merged auto/* remote branch(es)"
