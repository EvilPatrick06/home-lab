#!/usr/bin/env bash
#
# deploy.sh — idempotent, lockable, health-gated, rollback-capable BMO deploy.
#
# Takes the Pi from "origin/master has new bmo code" → "services restarted and
# healthy".  Fast-forwards the live checkout to a validated target SHA, runs a
# syntax sweep + a hardware-free canary boot (42A: BMO_CANARY=1), selectively
# restarts only the affected systemd units, and gates on /health.  On any post-
# merge failure it hard-resets to the previous SHA and restarts the same units.
#
# Usage:
#   deploy.sh [TARGET_SHA] [--dry-run] [--services-only] [--no-canary]
#
#   TARGET_SHA        Optional 7-40 hex commit to deploy; must be an ancestor of
#                     origin/master.  Defaults to origin/master.
#   --dry-run         Echo every mutating command as "[dry-run] <cmd>" and make
#                     NO side effects: no merge, no pip, no canary launch, no
#                     systemctl, no curl.  Read-only git queries still execute.
#   --services-only   Skip merge/deps/syntax/canary; restart affected units only
#                     based on the diff between HEAD and the target.
#   --no-canary       Skip the canary boot gate (still does merge + restart +
#                     /health gate).
#
# Env overrides (defaults):
#   BMO_DEPLOY_REPO_ROOT             /home/patrick/home-lab
#   BMO_DEPLOY_CANARY_PORT           5002
#   BMO_DEPLOY_CANARY_TIMEOUT        120   (seconds to wait for canary /health)
#   BMO_DEPLOY_HEALTH_TIMEOUT        90    (seconds to wait for live /health)
#   BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT  unset; set to 1 to allow a non-standard
#                                      repo root + skip the master-branch check
#                                      (used by the hermetic test harness).
#
# Every MUTATING command runs through run().  Under --dry-run, run() only echoes
# "[dry-run] <cmd>" and returns 0, so dry-run is fully side-effect-free — this
# guards the canary launch, pip install, systemctl restarts, and git mutations.
#
set -euo pipefail

# ── Config / env ──────────────────────────────────────────────────────────────
REPO_ROOT="${BMO_DEPLOY_REPO_ROOT:-/home/patrick/home-lab}"
CANARY_PORT="${BMO_DEPLOY_CANARY_PORT:-5002}"
CANARY_TIMEOUT="${BMO_DEPLOY_CANARY_TIMEOUT:-120}"
HEALTH_TIMEOUT="${BMO_DEPLOY_HEALTH_TIMEOUT:-90}"
ALLOW_NONSTANDARD_ROOT="${BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT:-}"

VENV_PY="$REPO_ROOT/bmo/pi/venv/bin/python"
VENV_PIP="$REPO_ROOT/bmo/pi/venv/bin/pip"
CANARY_LOG="$REPO_ROOT/bmo/pi/data/logs/deploy-canary.log"

# ── Flag parsing ────────────────────────────────────────────────────────────--
DRY_RUN=0
SERVICES_ONLY=0
NO_CANARY=0
TARGET_ARG=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)       DRY_RUN=1 ;;
    --services-only) SERVICES_ONLY=1 ;;
    --no-canary)     NO_CANARY=1 ;;
    -*)
      echo "[deploy] FAIL: unknown flag: $arg" >&2
      exit 1
      ;;
    *)
      if [ -n "$TARGET_ARG" ]; then
        echo "[deploy] FAIL: multiple TARGET_SHA args: '$TARGET_ARG' and '$arg'" >&2
        exit 1
      fi
      TARGET_ARG="$arg"
      ;;
  esac
done

# ── Helpers ─────────────────────────────────────────────────────────────────--
fail() { echo "[deploy] FAIL: $*" >&2; exit 1; }
log()  { echo "[deploy] $*"; }

# run() — execute a MUTATING command (or echo it under --dry-run).  Read-only
# git queries must NOT go through run() so the script can still reason about the
# repo while dry-running.
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $*"
    return 0
  fi
  "$@"
}

CANARY_PID=""

# cleanup_canary — TERM, 5s grace, then KILL.  Registered via trap so the canary
# is always torn down (success, failure, or signal).
cleanup_canary() {
  if [ -n "$CANARY_PID" ] && kill -0 "$CANARY_PID" 2>/dev/null; then
    kill -TERM "$CANARY_PID" 2>/dev/null || true
    for _ in $(seq 1 5); do
      kill -0 "$CANARY_PID" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$CANARY_PID" 2>/dev/null || true
  fi
  CANARY_PID=""
}
trap cleanup_canary EXIT INT TERM

# poll_health URL TIMEOUT — curl the URL once/sec up to TIMEOUT; 0 = healthy.
poll_health() {
  local url="$1" timeout="$2" i
  for ((i = 0; i < timeout; i++)); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# rollback — restore the previous SHA + units, re-poll /health, then exit 1.
# Uses the globals OLD_SHA / TARGET / RESTART_UNITS / REQS_CHANGED.
rollback() {
  log "rolling back to ${OLD_SHA:0:8}"
  cleanup_canary
  run git -C "$REPO_ROOT" reset --hard "$OLD_SHA"
  if [ "${REQS_CHANGED:-0}" -eq 1 ]; then
    log "reinstalling previous requirements.txt"
    run "$VENV_PIP" install -r "$REPO_ROOT/bmo/pi/requirements.txt"
  fi
  if [ -n "${RESTART_UNITS:-}" ]; then
    # shellcheck disable=SC2086  # intentional word-splitting of the unit list
    run sudo systemctl restart $RESTART_UNITS
  fi
  if [ "$DRY_RUN" -eq 0 ]; then
    if poll_health "http://localhost:5000/health" "$HEALTH_TIMEOUT"; then
      log "rollback /health green"
    else
      log "rollback /health STILL RED — manual intervention required"
    fi
  fi
  fail "rolled back to ${OLD_SHA:0:8}"
}

# ── Gate 1: Lock ────────────────────────────────────────────────────────────--
exec 9>/tmp/bmo-deploy.lock
flock -n 9 || { echo "[deploy] FAIL: another deploy is running"; exit 1; }

# ── Gate 2: Root check (refuse to deploy a worktree) ────────────────────────--
RESOLVED_ROOT="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null)" \
  || fail "not a git repository: $REPO_ROOT"
if [ "$ALLOW_NONSTANDARD_ROOT" != "1" ] && [ "$RESOLVED_ROOT" != "$REPO_ROOT" ]; then
  fail "repo root mismatch (resolved '$RESOLVED_ROOT' != '$REPO_ROOT'); refusing to deploy a worktree"
fi

# ── Gate 3: Tree clean (NEVER stash/clobber — the Pi checkout is also a dev tree)
if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  fail "working tree is dirty; commit/clean before deploying (never auto-stashed)"
fi

# ── Gate 4: Branch must be master ───────────────────────────────────────────--
if [ "$ALLOW_NONSTANDARD_ROOT" != "1" ]; then
  CUR_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  [ "$CUR_BRANCH" = "master" ] || fail "current branch is '$CUR_BRANCH', expected 'master'"
fi

# ── Gate 5: Resolve target ──────────────────────────────────────────────────--
run git -C "$REPO_ROOT" fetch origin master
if [ -n "$TARGET_ARG" ]; then
  [[ "$TARGET_ARG" =~ ^[0-9a-f]{7,40}$ ]] || fail "invalid TARGET_SHA: '$TARGET_ARG'"
  TARGET="$(git -C "$REPO_ROOT" rev-parse --verify "${TARGET_ARG}^{commit}" 2>/dev/null)" \
    || fail "TARGET_SHA not found: '$TARGET_ARG'"
else
  TARGET="$(git -C "$REPO_ROOT" rev-parse --verify origin/master)" \
    || fail "cannot resolve origin/master"
fi

# Refuse arbitrary / unpushed SHAs — TARGET must be an ancestor of origin/master.
git -C "$REPO_ROOT" merge-base --is-ancestor "$TARGET" origin/master \
  || fail "target ${TARGET:0:8} is not an ancestor of origin/master"

OLD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"

if [ "$TARGET" = "$OLD_SHA" ] && [ "$SERVICES_ONLY" -eq 0 ]; then
  log "already deployed (${OLD_SHA:0:8})"
  exit 0
fi

# ── Gate 6: Compute diff + fast-forward ─────────────────────────────────────--
CHANGED="$(git -C "$REPO_ROOT" diff --name-only "$OLD_SHA" "$TARGET")"
REQS_CHANGED=0
RESTART_UNITS=""

if [ "$SERVICES_ONLY" -eq 0 ]; then
  run git -C "$REPO_ROOT" merge --ff-only "$TARGET"

  # ── Gate 7: Deps ──────────────────────────────────────────────────────────--
  if echo "$CHANGED" | grep -qx "bmo/pi/requirements.txt"; then
    log "requirements.txt changed — installing deps"
    run "$VENV_PIP" install -r "$REPO_ROOT/bmo/pi/requirements.txt"
    REQS_CHANGED=1
  fi

  # ── Gate 8: Syntax sweep ──────────────────────────────────────────────────--
  # Compile only OUR source — exclude the virtualenv (third-party site-packages
  # ship files like torch's py312_intrinsics.py that don't byte-compile on 3.11)
  # and bytecode caches. Without -x, a single un-compilable vendored file aborts
  # the whole deploy.
  log "compileall syntax sweep"
  run "$VENV_PY" -m compileall -q -x '(/venv/|/__pycache__/|/node_modules/)' "$REPO_ROOT/bmo/pi" \
    || { log "compileall failed"; rollback; }

  # ── Gate 9: Canary ────────────────────────────────────────────────────────--
  if [ "$NO_CANARY" -eq 0 ]; then
    log "launching canary on port $CANARY_PORT"
    # The canary launch is a mutating action: gate it behind run() so --dry-run
    # never actually starts app.py (keeps dry-run fully side-effect-free).
    if [ "$DRY_RUN" -eq 1 ]; then
      run "BMO_CANARY=1 BMO_PORT=$CANARY_PORT $VENV_PY app.py > $CANARY_LOG 2>&1 &"
    else
      mkdir -p "$(dirname "$CANARY_LOG")"
      ( cd "$REPO_ROOT/bmo/pi" \
        && BMO_CANARY=1 BMO_PORT="$CANARY_PORT" "$VENV_PY" app.py \
             > "$CANARY_LOG" 2>&1 ) &
      CANARY_PID=$!
      if poll_health "http://localhost:$CANARY_PORT/health" "$CANARY_TIMEOUT"; then
        log "canary /health green"
      else
        log "canary /health RED — see $CANARY_LOG"
        rollback
      fi
      cleanup_canary
    fi
  fi
fi

# ── Gate 10: Selective restart ──────────────────────────────────────────────--
restart_bots=0
restart_fan=0
restart_main=0

while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    bmo/pi/bots/*)                 restart_bots=1 ;;
    bmo/pi/hardware/fan_control.py) restart_fan=1 ;;
    bmo/pi/*)                      restart_main=1 ;;
  esac
done <<< "$CHANGED"

# A requirements change rebuilds the shared venv → main + both bots must restart.
if [ "$REQS_CHANGED" -eq 1 ]; then
  restart_main=1
  restart_bots=1
fi

units=()
[ "$restart_main" -eq 1 ] && units+=("bmo")
[ "$restart_bots" -eq 1 ] && units+=("bmo-dm-bot" "bmo-social-bot")
[ "$restart_fan" -eq 1 ]  && units+=("bmo-fan")

if [ "${#units[@]}" -eq 0 ]; then
  log "no service-affecting changes"
  exit 0
fi

RESTART_UNITS="${units[*]}"
log "restarting: $RESTART_UNITS"
# shellcheck disable=SC2086  # intentional word-splitting of the unit list
run sudo systemctl restart $RESTART_UNITS

# ── Gate 11: Health gate ────────────────────────────────────────────────────--
if [ "$DRY_RUN" -eq 0 ]; then
  if [ "$restart_main" -eq 1 ]; then
    if ! poll_health "http://localhost:5000/health" "$HEALTH_TIMEOUT"; then
      log "live /health RED after restart"
      rollback
    fi
    log "live /health green"
  fi
  for unit in "${units[@]}"; do
    run systemctl is-active --quiet "$unit" || { log "$unit not active"; rollback; }
  done
else
  # Under --dry-run, still echo the is-active checks for visibility.
  if [ "$restart_main" -eq 1 ]; then
    log "would poll http://localhost:5000/health (up to ${HEALTH_TIMEOUT}s)"
  fi
  for unit in "${units[@]}"; do
    run systemctl is-active --quiet "$unit"
  done
fi

# ── Gate 12/13: Success ─────────────────────────────────────────────────────--
log "OK: ${OLD_SHA:0:8} → ${TARGET:0:8}; restarted: $RESTART_UNITS; canary+health green."
