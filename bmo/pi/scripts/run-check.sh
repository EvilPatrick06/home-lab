#!/usr/bin/env bash
# run-check.sh — admission gate for heavy local checks (tsc / vitest / builds).
#
# WHY THIS EXISTS
#   bmo (an 8 GB Pi) OOM-crashed when several scheduled agents each launched a
#   full-project `npx tsc --noEmit` / `npx vitest` at the same time. Nothing
#   bounded how many heavy jobs ran concurrently, and nothing checked whether
#   there was enough free RAM to start one. This wrapper is the "admission gate":
#   automated agents call heavy checks THROUGH it instead of invoking them
#   directly, and it:
#     1. refuses to launch while free RAM is below a floor (waits instead),
#     2. allows only N heavy jobs per node at once (default 1) via an flock
#        semaphore, so concurrent agents serialize instead of OOM-ing,
#     3. queues with small randomized jitter when saturated, up to a timeout,
#     4. then runs the wrapped command and passes its exit code straight through.
#
# USAGE
#   run-check.sh <command> [args...]
#   run-check.sh npx tsc --noEmit -p tsconfig.web.json
#   run-check.sh npx vitest run src/foo.test.ts
#
# CONFIG (all override-able via environment)
#   RUN_CHECK_RAM_FLOOR_MB    Minimum admissible RAM (MB) before launching. Default 2500.
#   RUN_CHECK_RAM_FIELD       Which `free -m` column to read: "available" (default) or "free".
#                             "available" is used because it counts reclaimable page
#                             cache — it reflects what a new process can actually get.
#   RUN_CHECK_MAX_CONCURRENCY Max concurrent heavy jobs on this node. Default 1.
#   RUN_CHECK_TIMEOUT_S       Max seconds to wait in the queue for admission. Default 900.
#   RUN_CHECK_POLL_INTERVAL_S Base seconds between admission retries. Default 5.
#   RUN_CHECK_JITTER_S        Max extra random seconds added per retry. Default 3.
#   RUN_CHECK_LOCK_DIR        Directory holding the semaphore lock files.
#                             Default ${TMPDIR:-/tmp}/bmo-run-check.
#   RUN_CHECK_DISABLE         If "1", bypass the gate entirely and just exec the command
#                             (escape hatch for humans / emergencies).
#   RUN_CHECK_RAM_OVERRIDE_MB Testing hook: if set, use this value instead of `free -m`.
#   RUN_CHECK_QUIET           If "1", suppress the informational queue/admit log lines.
#
# EXIT CODES
#   Passes through the wrapped command's exit code on success.
#   75 (EX_TEMPFAIL)  admission timed out (RAM never recovered / slot never freed).
#   2                 usage error (no command given).

set -uo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
RAM_FLOOR_MB="${RUN_CHECK_RAM_FLOOR_MB:-2500}"
RAM_FIELD="${RUN_CHECK_RAM_FIELD:-available}"
MAX_CONCURRENCY="${RUN_CHECK_MAX_CONCURRENCY:-1}"
TIMEOUT_S="${RUN_CHECK_TIMEOUT_S:-900}"
POLL_INTERVAL_S="${RUN_CHECK_POLL_INTERVAL_S:-5}"
JITTER_S="${RUN_CHECK_JITTER_S:-3}"
LOCK_DIR="${RUN_CHECK_LOCK_DIR:-${TMPDIR:-/tmp}/bmo-run-check}"

readonly EX_TEMPFAIL=75
readonly EX_USAGE=2

ACQUIRED_FD=""

log() {
  [ "${RUN_CHECK_QUIET:-0}" = "1" ] && return 0
  printf 'run-check[%s]: %s\n' "$(date +%H:%M:%S)" "$*" >&2
}

die() {
  printf 'run-check: %s\n' "$*" >&2
  exit "$EX_USAGE"
}

# ── Read admissible RAM in MB ─────────────────────────────────────────────────
read_ram_mb() {
  if [ -n "${RUN_CHECK_RAM_OVERRIDE_MB:-}" ]; then
    printf '%s\n' "$RUN_CHECK_RAM_OVERRIDE_MB"
    return 0
  fi
  # Parse `free -m` by header label so we are robust to column layout changes.
  # In the header row the labels are 1-based positions p; in the Mem: row the
  # same value sits at position p+1 (because of the leading "Mem:" label).
  free -m | awk -v field="$RAM_FIELD" '
    NR==1 { for (i = 1; i <= NF; i++) col[$i] = i + 1; next }
    /^Mem:/ {
      idx = col[field]
      if (idx == "") idx = (field == "free" ? 4 : 7)
      print $idx
      exit
    }
  '
}

ram_ok() {
  local have
  have="$(read_ram_mb)"
  # Non-numeric (parse failure) is treated as "not ok" so we fail safe (wait).
  case "$have" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$have" -ge "$RAM_FLOOR_MB" ]
}

# ── Semaphore via flock: try to grab one of MAX_CONCURRENCY slots ─────────────
acquire_slot() {
  local i slot fd
  for ((i = 1; i <= MAX_CONCURRENCY; i++)); do
    slot="$LOCK_DIR/heavy.slot${i}.lock"
    # Open a fresh fd for this slot; keep it open (and thus the lock held) only
    # if flock succeeds. flock is released automatically when the fd closes /
    # the process exits, so there is no stale-lock cleanup to do.
    exec {fd}>"$slot" || continue
    if flock -n "$fd"; then
      ACQUIRED_FD="$fd"
      return 0
    fi
    exec {fd}>&-
  done
  return 1
}

release_slot() {
  [ -n "$ACQUIRED_FD" ] || return 0
  flock -u "$ACQUIRED_FD" 2>/dev/null || true
  eval "exec ${ACQUIRED_FD}>&-" 2>/dev/null || true
  ACQUIRED_FD=""
}

wait_jitter() {
  local extra=0
  if [ "$JITTER_S" -gt 0 ]; then
    extra=$(( RANDOM % (JITTER_S + 1) ))
  fi
  sleep "$(( POLL_INTERVAL_S + extra ))"
}

# ── Main ──────────────────────────────────────────────────────────────────────
[ "$#" -ge 1 ] || die "no command given. usage: run-check.sh <command> [args...]"

# Escape hatch: run without gating.
if [ "${RUN_CHECK_DISABLE:-0}" = "1" ]; then
  exec "$@"
fi

mkdir -p "$LOCK_DIR" || die "cannot create lock dir: $LOCK_DIR"

deadline=$(( $(date +%s) + TIMEOUT_S ))
announced_wait=0

while :; do
  if ram_ok; then
    if acquire_slot; then
      # Re-check RAM after acquiring the slot: memory may have dropped in the
      # window between the check and the grab. If so, release and keep waiting
      # rather than launch a heavy job below the floor.
      if ram_ok; then
        break
      fi
      release_slot
    fi
  fi

  now="$(date +%s)"
  if [ "$now" -ge "$deadline" ]; then
    log "TIMEOUT after ${TIMEOUT_S}s waiting for admission (RAM floor ${RAM_FLOOR_MB}MB / ${MAX_CONCURRENCY} slot(s)); not launching: $*"
    exit "$EX_TEMPFAIL"
  fi

  if [ "$announced_wait" = "0" ]; then
    log "queued: RAM<${RAM_FLOOR_MB}MB or all ${MAX_CONCURRENCY} slot(s) busy; waiting up to $(( deadline - now ))s for: $*"
    announced_wait=1
  fi
  wait_jitter
done

log "admitted (RAM>=${RAM_FLOOR_MB}MB, slot acquired); running: $*"

# Run the wrapped command holding the slot, and pass its exit code through.
"$@"
rc=$?
release_slot
exit "$rc"
