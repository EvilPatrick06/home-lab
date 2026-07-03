#!/usr/bin/env bash
# Post (on failure) or clear (on success) a keyed 🚨 Incident for one monitored
# CI workflow. Deterministic, no LLM. All inputs arrive via env (never
# interpolated into the workflow YAML) for expression-injection hygiene.
set -euo pipefail
: "${WF_NAME:?}" "${WF_CONCLUSION:?}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/board-ssh.sh"

slug="$(printf '%s' "$WF_NAME" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' \
  | sed -E 's/-+/-/g; s/^-//; s/-$//')"
key="wf:${slug}"

if [ "$WF_CONCLUSION" = "failure" ]; then
  board set ci-triage "$key" incident "CI failed: ${WF_NAME}" \
    --detail "commit ${WF_SHA:0:8} — ${WF_URL:-}" --severity critical
  echo "posted incident $key"
else
  # Green again → self-clear just this workflow's incident.
  board done "$key"
  echo "cleared incident $key"
fi
