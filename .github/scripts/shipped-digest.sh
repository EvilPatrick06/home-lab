#!/usr/bin/env bash
# Weekly "what shipped" digest → BMO board 📋 Briefs (no-LLM replacement for the
# weekly-shipped-digest Claude task). Deterministic git/gh queries only; posts
# ONE keyed entry per distinct thing (never a combined glob), re-synced.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/board-ssh.sh"

REPO="${GITHUB_REPOSITORY:-EvilPatrick06/home-lab}"
since="$(date -u -d '7 days ago' +%Y-%m-%d)"

board clear weekly-digest

mapfile -t prs < <(gh pr list --repo "$REPO" --state merged --limit 100 \
  --search "merged:>=$since" --json number,title,url \
  --jq '.[] | "\(.number)\t\(.title)\t\(.url)"' 2>/dev/null || true)
npr=${#prs[@]}

mapfile -t rels < <(gh release list --repo "$REPO" --limit 30 --json tagName,createdAt,url \
  --jq "[.[] | select(.createdAt >= \"${since}T00:00:00Z\")] | .[] | \"\(.tagName)\t\(.url)\"" 2>/dev/null || true)
nrel=${#rels[@]}

resolved=$(git log --since="7 days ago" --numstat --pretty=tformat: -- 'docs/logs/RESOLVED-*' 2>/dev/null \
  | awk '{added += $1} END {print added + 0}')

mapfile -t redci < <(gh run list --repo "$REPO" --branch master --status failure --limit 10 \
  --json workflowName,url --jq '.[] | "\(.workflowName)\t\(.url)"' 2>/dev/null || true)
unmerged=$(git ls-remote --heads origin 'auto/*' 2>/dev/null | wc -l | tr -d ' ')

board set weekly-digest overview brief \
  "📈 This week: ${npr} PRs merged, ${nrel} releases, ${resolved} log lines resolved" \
  --detail "unmerged auto/* branches: ${unmerged}; failed master CI runs: ${#redci[@]}" --severity info

for r in "${rels[@]}"; do
  IFS=$'\t' read -r tag url <<<"$r"; [ -n "$tag" ] || continue
  slug="$(printf '%s' "$tag" | tr -c 'a-zA-Z0-9' '-')"
  board set weekly-digest "ship:${slug}" brief "🚀 Released ${tag}" --detail "${url}" --severity info
done

i=0
for p in "${prs[@]}"; do
  IFS=$'\t' read -r num title url <<<"$p"; [ -n "$num" ] || continue
  board set weekly-digest "ship:pr-${num}" brief "🚀 #${num} ${title}" --detail "${url}" --severity info
  i=$((i + 1)); [ "$i" -ge 8 ] && break
done

for c in "${redci[@]}"; do
  IFS=$'\t' read -r wf url <<<"$c"; [ -n "$wf" ] || continue
  slug="$(printf '%s' "$wf" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-')"
  board set weekly-digest "open:ci-${slug}" brief "⚠️ CI red: ${wf}" --detail "${url}" --severity warning
done

if [ "$unmerged" -gt 0 ]; then
  board set weekly-digest "open:branches" brief "⚠️ ${unmerged} unmerged auto/* branch(es)" \
    --detail "awaiting the integrator" --severity warning
fi
echo "digest posted: prs=$npr releases=$nrel resolved=$resolved redci=${#redci[@]} unmerged=$unmerged"
