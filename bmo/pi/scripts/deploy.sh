#!/usr/bin/env bash
#
# deploy.sh — idempotent, lockable, health-gated, rollback-capable BMO deploy.
#
# Takes the Pi from "origin/master has new bmo code" → "services restarted and
# healthy".  Deploys from a DEDICATED, deploy-owned checkout that is fully
# decoupled from the shared /home/patrick/home-lab dev/integrator tree: it
# `git fetch`es origin and `git reset --hard`s that checkout to a validated
# target SHA, runs a syntax sweep + a hardware-free canary boot (42A:
# BMO_CANARY=1), selectively restarts only the affected systemd units, and gates
# on /health.  On any post-reset failure it hard-resets to the previous SHA and
# restarts the same units.
#
# WHY A SEPARATE CHECKOUT (deploy isolation)
# ------------------------------------------
# The bmo services run out of $REPO_ROOT/bmo/pi (systemd WorkingDirectory + venv
# + EnvironmentFile).  Historically $REPO_ROOT WAS /home/patrick/home-lab — the
# SAME tree humans edit, agents merge into, and the daily integrator merges on.
# That shared mutable tree got transiently/persistently dirty (in-progress edits,
# a half-finished integrator merge killed mid-flight, agent activity), and the
# old dirty-tree gate then refused to deploy.  The permanent fix is to stop the
# deploy reading the shared tree at all: $REPO_ROOT now points at a dedicated
# deploy checkout (default /home/patrick/home-lab-deploy) that NOTHING edits by
# hand, so `git reset --hard <target>` is always safe and the deploy can never be
# blocked or polluted by dev edits, agent worktrees, or an interrupted merge in
# the main checkout.  Runtime state (venv, .env, config/, and the untracked files
# under data/ — DBs, logs, memory) lives in this checkout exactly as it did in the
# old tree; `git reset --hard` only touches TRACKED files, so that state is
# preserved across deploys.  See docs/BMO-DEPLOY.md for the one-time owner
# migration (creating the checkout + repointing systemd).
#
# NOTE: this script file itself is invoked from the DEV tree copy
# (/home/patrick/home-lab/bmo/pi/scripts/deploy.sh, per .github/workflows/
# bmo-deploy.yml) so it is never reset out from under itself — it only ever
# git-operates on the SEPARATE $REPO_ROOT deploy checkout, never on its own tree.
#
# Usage:
#   deploy.sh [TARGET_SHA] [--dry-run] [--services-only] [--no-canary]
#
#   TARGET_SHA        Optional 7-40 hex commit to deploy; must be an ancestor of
#                     origin/master.  Defaults to origin/master.
#   --dry-run         Echo every mutating command as "[dry-run] <cmd>" and make
#                     NO side effects: no reset, no pip, no canary launch, no
#                     systemctl, no curl.  Read-only git queries still execute.
#   --services-only   Skip reset/deps/syntax/canary; restart affected units only
#                     based on the diff between the deployed SHA and the target.
#   --no-canary       Skip the canary boot gate (still does reset + restart +
#                     /health gate).
#
# Env overrides (defaults):
#   BMO_DEPLOY_REPO_ROOT             /home/patrick/home-lab-deploy
#                                    The DEDICATED deploy checkout (NOT the dev
#                                    tree).  The hermetic test harness overrides
#                                    this to a throwaway clone.
#   BMO_DEPLOY_CANARY_PORT           5002
#   BMO_DEPLOY_CANARY_TIMEOUT        120   (seconds to wait for canary /health)
#   BMO_DEPLOY_HEALTH_TIMEOUT        90    (seconds to wait for live /health)
#   BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT  unset; set to 1 to allow a non-standard
#                                      repo root (used by the hermetic test
#                                      harness, which clones to a temp dir).
#
# Every MUTATING command runs through run().  Under --dry-run, run() only echoes
# "[dry-run] <cmd>" and returns 0, so dry-run is fully side-effect-free — this
# guards the reset, canary launch, pip install, systemctl restarts, and the
# marker write.
#
set -euo pipefail

# ── Config / env ──────────────────────────────────────────────────────────────
# REPO_ROOT is the dedicated deploy checkout (see header).  Default is the
# decoupled /home/patrick/home-lab-deploy; the old default (/home/patrick/
# home-lab, the dev tree) is intentionally NOT used any more.
REPO_ROOT="${BMO_DEPLOY_REPO_ROOT:-/home/patrick/home-lab-deploy}"
CANARY_PORT="${BMO_DEPLOY_CANARY_PORT:-5002}"
CANARY_TIMEOUT="${BMO_DEPLOY_CANARY_TIMEOUT:-120}"
HEALTH_TIMEOUT="${BMO_DEPLOY_HEALTH_TIMEOUT:-90}"
ALLOW_NONSTANDARD_ROOT="${BMO_DEPLOY_ALLOW_NONSTANDARD_ROOT:-}"

VENV_PY="$REPO_ROOT/bmo/pi/venv/bin/python"
VENV_PIP="$REPO_ROOT/bmo/pi/venv/bin/pip"
CANARY_LOG="$REPO_ROOT/bmo/pi/data/logs/deploy-canary.log"

# Standalone notify-board CLI that scheduled tasks call directly (a live-ops path
# OUTSIDE the repo). deploy.sh OWNS this file: install_board_cli refreshes it on
# every deploy so it can never silently drift from the deployed code. Overridable
# for tests/alternate hosts.
BOARD_CLI_DEST="${BMO_BOARD_CLI_DEST:-/home/patrick/bmo-board/notify-board}"

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

# poll_health URL TIMEOUT [PID] — curl the URL once/sec up to TIMEOUT.
#   return 0 = healthy; 1 = timed out; 2 = the given PID exited before /health
#   went green (fast-fail, so a canary that dies binding the port is RED
#   immediately instead of burning the whole timeout — BMO-ISSUES-LOG 2026-07-02).
poll_health() {
  local url="$1" timeout="$2" pid="${3:-}" i
  for ((i = 0; i < timeout; i++)); do
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      return 2
    fi
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# canary_port_listeners — PIDs holding a LISTEN socket on CANARY_PORT (best-effort;
# needs ss). Exact port match so :5002 never matches :50020.
canary_port_listeners() {
  ss -tlnp 2>/dev/null     | awk -v port=":$CANARY_PORT" '$1=="LISTEN" && $4 ~ port"$"'     | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
}

# port_in_use — true if anything holds a LISTEN socket on CANARY_PORT (or, if ss
# is unavailable, answers /health there).
port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null       | awk -v port=":$CANARY_PORT" '$1=="LISTEN" && $4 ~ port"$"{f=1} END{exit !f}'       && return 0
    return 1
  fi
  curl -sf "http://localhost:$CANARY_PORT/health" >/dev/null 2>&1
}

# _looks_like_canary PID — only true for OUR deploy-checkout canary: an app.py
# process with BMO_CANARY set in its environment. Guards the reap below so we
# never signal an unrelated listener that merely happens to hold the port.
_looks_like_canary() {
  local pid="$1"
  tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "app.py" || return 1
  tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | grep -qx "BMO_CANARY=1" || return 1
  return 0
}

# reap_stale_canary — TERM/KILL any leftover canary squatting CANARY_PORT (e.g.
# one orphaned/reparented by an earlier deploy whose EXIT trap never fired on
# SIGKILL — SECURITY-LOG 2026-07-02). Returns non-zero (without touching it) if
# the port is held by something that is NOT a canary.
reap_stale_canary() {
  local pid rc=0
  for pid in $(canary_port_listeners); do
    if _looks_like_canary "$pid"; then
      log "reaping stale canary pid $pid squatting port $CANARY_PORT (likely orphaned by an interrupted deploy)"
      kill -TERM "$pid" 2>/dev/null || true
      for _ in $(seq 1 5); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
      kill -KILL "$pid" 2>/dev/null || true
    else
      log "port $CANARY_PORT held by non-canary pid $pid — refusing to touch it"
      rc=1
    fi
  done
  return $rc
}

# install_board_cli — (re)generate the standalone notify-board CLI at
# $BOARD_CLI_DEST from the repo's canonical copy, so that hand-placed live-ops
# path can never silently drift from the deployed code again. It is a THIN
# DELEGATOR that execs the deployed canonical notify-board
# ($REPO_ROOT/bmo/pi/scripts/notify-board) under the deploy venv. Running the
# canonical file IN PLACE (not copying it) means its data dir resolves to the
# deploy checkout's data/ (the dir the board cog reads) and it transparently
# inherits every flag the deployed CLI gains (e.g. --session-id) with no
# per-deploy edits. The generated wrapper only references paths, so it is
# SHA-independent and correct whether written before or after the reset. All
# disk writes are dry-run-guarded so --dry-run stays fully side-effect-free.
install_board_cli() {
  local canonical="$REPO_ROOT/bmo/pi/scripts/notify-board"
  local venv_py="$REPO_ROOT/bmo/pi/venv/bin/python"
  if [ "$DRY_RUN" -eq 1 ]; then
    run "install standalone notify-board -> $BOARD_CLI_DEST (delegates to $canonical)"
    return 0
  fi
  if [ ! -f "$canonical" ]; then
    log "board CLI: canonical $canonical missing — skipping standalone refresh"
    return 0
  fi
  mkdir -p "$(dirname "$BOARD_CLI_DEST")"
  local tmp="$BOARD_CLI_DEST.deploy-tmp.$$"
  cat > "$tmp" <<EOF_BOARD_CLI
#!/usr/bin/env bash
# AUTO-GENERATED by bmo/pi/scripts/deploy.sh on every deploy — DO NOT EDIT.
# Thin delegator: always runs the DEPLOYED canonical notify-board so this
# standalone path stays in lockstep with master and cannot silently drift.
# Run in place under the deploy venv so its data dir resolves to the deploy
# checkout's data/ and it inherits all deployed flags (e.g. --session-id).
exec "$venv_py" \\
     "$canonical" "\$@"
EOF_BOARD_CLI
  chmod +x "$tmp"
  mv -f "$tmp" "$BOARD_CLI_DEST"
  log "refreshed standalone notify-board -> $BOARD_CLI_DEST (delegates to deployed canonical)"
}

# rollback — restore the previous SHA + units, re-poll /health, then exit 1.
# Uses the globals OLD_SHA / TARGET / RESTART_UNITS / REQS_CHANGED.  Resets the
# SAME deploy checkout ($REPO_ROOT) — safe because nothing else writes it.
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
  # Services are back on OLD_SHA — record it so the next deploy diffs correctly.
  [ "$DRY_RUN" -eq 0 ] && printf '%s\n' "$OLD_SHA" > "${DEPLOYED_MARKER:-$(dirname "$REPO_ROOT")/.bmo-deployed-sha}"
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

# ── Gate 2: Deploy checkout exists & is the expected root ───────────────────--
# $REPO_ROOT must be the dedicated deploy checkout.  If it does not exist yet,
# the one-time migration has not been run — fail loudly rather than silently
# falling back to any other tree.
RESOLVED_ROOT="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null)" \
  || fail "deploy checkout not found at '$REPO_ROOT' (run the one-time migration in docs/BMO-DEPLOY.md, or set BMO_DEPLOY_REPO_ROOT)"
if [ "$ALLOW_NONSTANDARD_ROOT" != "1" ] && [ "$RESOLVED_ROOT" != "$REPO_ROOT" ]; then
  fail "repo root mismatch (resolved '$RESOLVED_ROOT' != '$REPO_ROOT'); deploy checkout misconfigured"
fi

# ── Gate 3: Resolve & validate target ───────────────────────────────────────--
# (The old "tree must be clean" gate is gone: this checkout is reset --hard to the
# target below, and a POST-reset integrity check guarantees a clean tracked tree.
# Because nothing hand-edits this checkout, a transiently dirty DEV tree can no
# longer block or pollute the deploy.)
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

# Diagnose (don't block on) any unexpected TRACKED dirt in the deploy checkout.
# Untracked runtime files (DBs, logs, .env, config) are EXPECTED and ignored. A
# tracked diff here is anomalous (nothing should hand-edit this checkout) — log it
# for visibility; the reset below discards it and the integrity check re-verifies.
if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" ]; then
  log "WARNING: deploy checkout had unexpected tracked modifications — discarding via reset (nothing should edit $REPO_ROOT by hand):"
  git -C "$REPO_ROOT" status --porcelain --untracked-files=no | sed 's/^/[deploy]   /'
fi

# The SHA the RUNNING services were last (re)started on, recorded by this script
# after each successful restart. We base "already deployed" and the changed-file
# diff on THIS — not the working-tree HEAD — so a tree that was advanced WITHOUT a
# restart still triggers the restart it needs. Falls back to the tree HEAD when no
# marker exists yet (first run after this change).
DEPLOYED_MARKER="$(dirname "$REPO_ROOT")/.bmo-deployed-sha"
DEPLOYED_SHA="$(cat "$DEPLOYED_MARKER" 2>/dev/null || true)"
if ! git -C "$REPO_ROOT" rev-parse --verify --quiet "${DEPLOYED_SHA}^{commit}" >/dev/null 2>&1; then
  DEPLOYED_SHA="$OLD_SHA"
fi

# Refresh the deploy-owned standalone notify-board CLI on EVERY invocation (before
# the early-exit below) so the live-ops path at $BOARD_CLI_DEST can never drift,
# even on an otherwise no-op "already deployed" run. The wrapper is SHA-independent.
install_board_cli

# Nothing to do only when BOTH the tree AND the running services are at TARGET.
if [ "$TARGET" = "$OLD_SHA" ] && [ "$TARGET" = "$DEPLOYED_SHA" ] && [ "$SERVICES_ONLY" -eq 0 ]; then
  log "already deployed and running (${OLD_SHA:0:8})"
  exit 0
fi

# ── Gate 4: Compute diff + reset to target ──────────────────────────────────--
# Diff against the running SHA (see DEPLOYED_SHA above) so the correct units
# restart even when the tree was already at TARGET but services were not.
CHANGED="$(git -C "$REPO_ROOT" diff --name-only "$DEPLOYED_SHA" "$TARGET")"
REQS_CHANGED=0
RESTART_UNITS=""

if [ "$SERVICES_ONLY" -eq 0 ]; then
  # Deploy = hard-reset the dedicated checkout to the validated target SHA.
  # This REPLACES the old `git merge --ff-only`: the checkout is deploy-owned and
  # never has local commits, so reset --hard is both safe and able to move in
  # either direction (e.g. a deliberate roll-back to an earlier validated SHA).
  # reset --hard only rewrites TRACKED files, leaving untracked runtime state
  # (DBs, logs, .env, config) in place.
  log "resetting deploy checkout ${OLD_SHA:0:8} → ${TARGET:0:8} (clean-checkout deploy; dev tree untouched)"
  run git -C "$REPO_ROOT" reset --hard "$TARGET"

  # ── Gate 4b: Clean-checkout integrity check (replaces the dirty-tree gate) ──
  # After the reset the tracked tree MUST equal TARGET exactly. A mismatch means
  # the checkout is corrupt/contended — never deploy a polluted tree; roll back.
  if [ "$DRY_RUN" -eq 0 ]; then
    _head_now="$(git -C "$REPO_ROOT" rev-parse HEAD)"
    [ "$_head_now" = "$TARGET" ] \
      || { log "integrity: HEAD ${_head_now:0:8} != target ${TARGET:0:8} after reset"; rollback; }
    git -C "$REPO_ROOT" diff --quiet HEAD -- \
      || { log "integrity: tracked files still differ from ${TARGET:0:8} after reset"; rollback; }
    log "clean-checkout integrity OK (${TARGET:0:8})"
  fi

  # ── Gate 5: Deps ──────────────────────────────────────────────────────────--
  if echo "$CHANGED" | grep -qx "bmo/pi/requirements.txt"; then
    log "requirements.txt changed — installing deps"
    run "$VENV_PIP" install -r "$REPO_ROOT/bmo/pi/requirements.txt"
    REQS_CHANGED=1
  fi

  # ── Gate 6: Syntax sweep ──────────────────────────────────────────────────--
  # Compile only OUR source — exclude the virtualenv (third-party site-packages
  # ship files like torch's py312_intrinsics.py that don't byte-compile on 3.11)
  # and bytecode caches. Without -x, a single un-compilable vendored file aborts
  # the whole deploy.
  log "compileall syntax sweep"
  run "$VENV_PY" -m compileall -q -x '(/venv/|/__pycache__/|/node_modules/)' "$REPO_ROOT/bmo/pi" \
    || { log "compileall failed"; rollback; }

  # ── Gate 7: Canary ────────────────────────────────────────────────────────--
  if [ "$NO_CANARY" -eq 0 ]; then
    log "launching canary on port $CANARY_PORT"
    # The canary launch is a mutating action: gate it behind run() so --dry-run
    # never actually starts app.py (keeps dry-run fully side-effect-free).
    if [ "$DRY_RUN" -eq 1 ]; then
      run "BMO_CANARY=1 BMO_PORT=$CANARY_PORT $VENV_PY app.py > $CANARY_LOG 2>&1 &"
    else
      mkdir -p "$(dirname "$CANARY_LOG")"
      # Pre-launch guard (BMO-ISSUES-LOG / SECURITY-LOG 2026-07-02): the canary
      # port MUST be free before we launch. A leaked/orphaned canary (or any
      # squatter) answering /health here would false-green Gate 7 against a
      # FOREIGN listener while the real canary dies binding the port — the deploy
      # would then restart live services having validated nothing. Reap a stale
      # canary if that is what is holding it; abort if it is anything else.
      if port_in_use "$CANARY_PORT"; then
        log "canary port $CANARY_PORT already in use before launch — attempting to reap a stale canary"
        reap_stale_canary || { log "canary port $CANARY_PORT occupied by a non-canary listener — aborting deploy"; rollback; }
        for _ in $(seq 1 10); do port_in_use "$CANARY_PORT" || break; sleep 1; done
        if port_in_use "$CANARY_PORT"; then
          log "canary port $CANARY_PORT still in use after reap — aborting to avoid gating against a foreign listener"
          rollback
        fi
      fi
      # Close the flock fd (9) in the canary so a slow/leaked canary can't keep
      # holding /tmp/bmo-deploy.lock after this deploy exits (would block every
      # future deploy with "another deploy is running").
      ( cd "$REPO_ROOT/bmo/pi" \
        && BMO_CANARY=1 BMO_PORT="$CANARY_PORT" "$VENV_PY" app.py \
             > "$CANARY_LOG" 2>&1 9>&- ) &
      CANARY_PID=$!
      poll_rc=0
      poll_health "http://localhost:$CANARY_PORT/health" "$CANARY_TIMEOUT" "$CANARY_PID" || poll_rc=$?
      if [ "$poll_rc" -eq 2 ]; then
        log "canary (pid $CANARY_PID) exited before /health went green — see $CANARY_LOG"
        rollback
      elif [ "$poll_rc" -ne 0 ]; then
        log "canary /health RED — see $CANARY_LOG"
        rollback
      fi
      # Post-green verification: the canary we launched must (a) still be alive and
      # (b) report the TARGET commit on /health — otherwise we went green against a
      # foreign listener, not the code we are deploying. The /health `commit` field
      # is a 12-char prefix; it degrades to empty in a non-git env, so only enforce
      # the match when the canary actually reported one.
      if ! kill -0 "$CANARY_PID" 2>/dev/null; then
        log "canary (pid $CANARY_PID) died immediately after going green — see $CANARY_LOG"
        rollback
      fi
      canary_commit="$(curl -sf "http://localhost:$CANARY_PORT/health" 2>/dev/null \
        | "$VENV_PY" -c 'import sys, json; print(json.load(sys.stdin).get("commit") or "")' 2>/dev/null || true)"
      if [ -n "$canary_commit" ] && [ "$canary_commit" != "${TARGET:0:${#canary_commit}}" ]; then
        log "canary /health commit '$canary_commit' != target ${TARGET:0:12} — refusing to proceed (gated against wrong code)"
        rollback
      fi
      log "canary /health green (commit ${canary_commit:-unknown})"
      cleanup_canary
    fi
  fi
fi

# ── Gate 8: Selective restart ───────────────────────────────────────────────--
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
  # Code now matches TARGET and no restart was needed — advance the marker.
  [ "$DRY_RUN" -eq 0 ] && printf '%s\n' "$TARGET" > "$DEPLOYED_MARKER"
  exit 0
fi

RESTART_UNITS="${units[*]}"
log "restarting: $RESTART_UNITS"
# shellcheck disable=SC2086  # intentional word-splitting of the unit list
run sudo systemctl restart $RESTART_UNITS

# Record the SHA the services are now running on, so the next deploy compares
# against what is actually running (not just the tree HEAD).
[ "$DRY_RUN" -eq 0 ] && printf '%s\n' "$TARGET" > "$DEPLOYED_MARKER"

# ── Gate 9: Health gate ─────────────────────────────────────────────────────--
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

# ── Gate 10: Success ────────────────────────────────────────────────────────--
log "OK: ${OLD_SHA:0:8} → ${TARGET:0:8}; restarted: $RESTART_UNITS; canary+health green."
