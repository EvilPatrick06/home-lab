#!/usr/bin/env bash
# push-with-deploy-key.sh — run a git command authenticated with the dedicated
# push-resilience write deploy key instead of the Pi's gh OAuth token.
#
# Why: during a bmo outage the gh-token credential path (Pi-resident) is gone;
# this key is the off-Pi push lifeline. Full doc: docs/PUSH-RESILIENCE.md.
#
# Usage (any git args pass straight through):
#   scripts/claude-tools/push-with-deploy-key.sh push origin auto/<agent-id>
#   scripts/claude-tools/push-with-deploy-key.sh fetch origin
#   scripts/claude-tools/push-with-deploy-key.sh clone git@github.com:EvilPatrick06/home-lab.git
#
# Works from any host holding the private key (default ~/.ssh/home-lab-push-key,
# override with HOME_LAB_PUSH_KEY). The repo's HTTPS origin URL is rewritten to
# SSH on the fly via url.insteadOf, so the existing https remote — and the Pi's
# normal gh-token auth — stay untouched.
set -euo pipefail

KEY="${HOME_LAB_PUSH_KEY:-${HOME}/.ssh/home-lab-push-key}"
HTTPS_PREFIX="https://github.com/EvilPatrick06/home-lab"
SSH_PREFIX="git@github.com:EvilPatrick06/home-lab"

if [[ $# -eq 0 ]]; then
  echo "usage: $(basename "$0") <git args...>    e.g.: $(basename "$0") push origin auto/my-branch" >&2
  echo "runs git with the push-resilience deploy key (docs/PUSH-RESILIENCE.md)" >&2
  exit 64
fi

if [[ ! -f "${KEY}" ]]; then
  echo "error: deploy key not found at ${KEY}" >&2
  echo "copy it from bmo (scp patrick@bmo:~/.ssh/home-lab-push-key ~/.ssh/ && chmod 600 ~/.ssh/home-lab-push-key)" >&2
  echo "or point HOME_LAB_PUSH_KEY at it. See docs/PUSH-RESILIENCE.md." >&2
  exit 66
fi

export GIT_SSH_COMMAND="ssh -i ${KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
exec git \
  -c "url.${SSH_PREFIX}.insteadOf=${HTTPS_PREFIX}" \
  -c "url.${SSH_PREFIX}.pushInsteadOf=${HTTPS_PREFIX}" \
  "$@"
