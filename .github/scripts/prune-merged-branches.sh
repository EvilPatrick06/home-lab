#!/usr/bin/env bash
# Remote half of the stale-branch-pruner split: delete origin auto/* branches
# ALREADY MERGED into origin/master. NEVER master, NEVER unmerged, NEVER force.
# Runs on a GitHub runner (checkout's GITHUB_TOKEN has contents:write). The local
# worktree/lock/notify.log cleanup is the bmo-cron half (bmo/pi/scripts/stale-local-cleanup.sh).
set -euo pipefail
git fetch origin --prune --quiet
base="origin/master"
deleted=0
while IFS= read -r br; do
  case "$br" in
    origin/master|origin/HEAD) continue ;;
    origin/auto/*) ;;
    *) continue ;;
  esac
  name="${br#origin/}"
  # Belt-and-suspenders: only delete if it is a true ancestor of master.
  if git merge-base --is-ancestor "$br" "$base" 2>/dev/null; then
    echo "deleting merged remote branch: $name"
    if git push origin --delete "$name"; then
      deleted=$((deleted + 1))
    fi
  fi
done < <(git branch -r --merged "$base" --format='%(refname:short)')
echo "pruned $deleted merged auto/* remote branch(es)"
