#!/usr/bin/env bash
# check-md-links.sh — offline markdown link-integrity guard.
#
# WHY: the ~283 tracked docs are the agent-coordination fabric and are densely
# cross-linked by RELATIVE path. Docs get archived (into _archive/), resolved
# log entries move to RESOLVED-*, and files get renamed — each a chance for an
# inbound relative link to silently rot, degrading agent behavior, not just
# reading. Nothing validated links before this guard (ci-hygiene lints
# workflows; agent-docs-check guards only the AGENTS.md sync block).
#
# SCOPE: relative / internal links only (offline — no external-URL fetch, so no
# network flakiness). Checks tracked *.md, excluding _archive/** and
# node_modules. A link whose target (resolved relative to the linking file)
# does not exist on disk fails. Anchors (#frag), external URLs
# (http/https/mailto/tel), and template placeholders are skipped. Targets that
# exist on disk but are gitignored (e.g. the local-only SECURITY-LOG.md) count
# as present — the link is valid on a real checkout.
#
# MODE: default is enforcing (exit 1 on any dead link). Pass --warn-only (or set
# MD_LINK_WARN_ONLY=1) to report dead links but exit 0 — used while the existing
# backlog of ~180 pre-existing dead links is triaged, before flipping the CI job
# to enforcing. See SUGGESTIONS-LOG entry [2026-07-02] md-link-check.
#
# USAGE: scripts/check-md-links.sh [--warn-only]
set -euo pipefail
cd "$(dirname "$0")/.."

warn_only="${MD_LINK_WARN_ONLY:-0}"
[ "${1:-}" = "--warn-only" ] && warn_only=1

fail=0
checked=0
dead=0

while IFS= read -r md; do
  [ -z "$md" ] && continue
  case "$md" in
    _archive/*|*/node_modules/*|node_modules/*) continue ;;
  esac
  dir="$(dirname "$md")"
  while IFS= read -r target; do
    [ -z "$target" ] && continue
    target="${target%% *}"
    case "$target" in
      "") continue ;;
      \#*) continue ;;
      http://*|https://*|mailto:*|tel:*|//*) continue ;;
      \<*|*\$\{*|*\{\{*) continue ;;
    esac
    path="${target%%#*}"
    path="${path%%\?*}"
    [ -z "$path" ] && continue
    if [ "${path#/}" != "$path" ]; then
      resolved=".${path}"
    else
      resolved="${dir}/${path}"
    fi
    checked=$((checked+1))
    if [ ! -e "$resolved" ]; then
      echo "DEAD LINK: $md -> $target (resolved: $resolved)" >&2
      dead=$((dead+1))
      fail=1
    fi
  done < <(grep -oP "\]\(\K[^)]+" "$md" 2>/dev/null || true)
done < <(git ls-files "*.md")

if [ "$fail" -ne 0 ]; then
  if [ "$warn_only" = "1" ]; then
    echo "check-md-links: $dead dead relative link(s) found (WARN-ONLY — not failing). Backlog triage; see SUGGESTIONS-LOG md-link-check." >&2
    echo "check-md-links: checked $checked relative links"
    exit 0
  fi
  echo "check-md-links: FAILED — $dead dead relative link(s) above" >&2
  exit 1
fi
echo "check-md-links: all $checked relative links resolve"
