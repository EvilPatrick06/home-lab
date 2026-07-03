#!/usr/bin/env bash
#
# migrate-bmo-deploy-checkout.sh — ONE-TIME owner migration to the decoupled
# deploy checkout used by deploy.sh (deploy isolation).
#
# WHAT IT DOES
#   Stands up a dedicated, deploy-owned checkout at $DEPLOY_ROOT (default
#   /home/patrick/home-lab-deploy), seeds it with the runtime state the services
#   need (venv, .env, config/, and the untracked files under data/), and repoints
#   the installed systemd units from the shared dev tree
#   (/home/patrick/home-lab/bmo/pi) to that checkout.  After this runs once,
#   deploy.sh fetch+reset's ONLY the deploy checkout and the shared dev tree is no
#   longer deploy-relevant — dev edits / agent worktrees / an interrupted
#   integrator merge can never again block or pollute a deploy.
#
# SAFETY
#   Default mode is a DRY RUN: it prints every step and changes nothing. Pass
#   --apply to actually perform the migration. It is idempotent: re-running with
#   --apply after a partial run resumes safely. It NEVER deletes the dev tree and
#   NEVER touches the dev tree's git state.
#
# USAGE
#   ./migrate-bmo-deploy-checkout.sh            # dry run (prints the plan)
#   ./migrate-bmo-deploy-checkout.sh --apply    # perform the migration
#
# Env overrides:
#   DEV_ROOT      /home/patrick/home-lab          (existing shared dev tree)
#   DEPLOY_ROOT   /home/patrick/home-lab-deploy   (new dedicated deploy checkout)
#   GIT_ORIGIN    (auto-detected from DEV_ROOT)   (GitHub URL for the new clone)
#   VENV_PY       python3.11                      (interpreter for the rebuilt venv)
#
set -euo pipefail

DEV_ROOT="${DEV_ROOT:-/home/patrick/home-lab}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/patrick/home-lab-deploy}"
VENV_PY="${VENV_PY:-python3.11}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

PI_DEV="$DEV_ROOT/bmo/pi"
PI_DEP="$DEPLOY_ROOT/bmo/pi"
OLD_PATH="$DEV_ROOT/bmo/pi"
NEW_PATH="$DEPLOY_ROOT/bmo/pi"
UNITS=(bmo bmo-dm-bot bmo-social-bot bmo-fan bmo-voice-canary bmo-ide \
       bmo-kiosk bmo-backup bmo-backup-verify)
RESTART_NOW=(bmo bmo-dm-bot bmo-social-bot bmo-fan)

log()  { echo "[migrate] $*"; }
step() { echo; echo "[migrate] == $* =="; }
do_or_echo() {
  if [ "$APPLY" -eq 1 ]; then "$@"; else echo "[dry-run] $*"; fi
}

if [ "$APPLY" -eq 1 ]; then log "APPLY mode — performing migration"; else log "DRY RUN — pass --apply to perform changes"; fi
log "DEV_ROOT=$DEV_ROOT  DEPLOY_ROOT=$DEPLOY_ROOT"

# ── Preconditions ─────────────────────────────────────────────────────────────
[ -d "$PI_DEV" ] || { echo "[migrate] FAIL: dev tree not found: $PI_DEV"; exit 1; }
GIT_ORIGIN="${GIT_ORIGIN:-$(git -C "$DEV_ROOT" remote get-url origin)}"
log "git origin: $GIT_ORIGIN"
# The SHA to seed the deploy checkout at — what the services run today.
DEPLOYED_SHA="$(cat /home/patrick/.bmo-deployed-sha 2>/dev/null || git -C "$DEV_ROOT" rev-parse HEAD)"
log "seeding deploy checkout at SHA: ${DEPLOYED_SHA:0:8}"

# ── 1. Create the deploy checkout (clone locally for speed, point at GitHub) ───
step "1. Create deploy checkout at $DEPLOY_ROOT"
if [ -d "$DEPLOY_ROOT/.git" ]; then
  log "deploy checkout already exists — will fetch + reset only"
else
  # Clone from the LOCAL dev tree (fast, hardlinked objects), then set origin to
  # GitHub so ongoing fetches are fully independent of the dev tree.
  do_or_echo git clone "$DEV_ROOT" "$DEPLOY_ROOT"
  do_or_echo git -C "$DEPLOY_ROOT" remote set-url origin "$GIT_ORIGIN"
fi
do_or_echo git -C "$DEPLOY_ROOT" fetch origin master
do_or_echo git -C "$DEPLOY_ROOT" reset --hard "$DEPLOYED_SHA"

# ── 2. Seed runtime state: .env, config/, untracked data/ files ───────────────
step "2. Copy runtime state (.env, config/, untracked data/) into the checkout"
# .env + rotated backups (gitignored; the services read .env directly).
for f in "$PI_DEV"/.env "$PI_DEV"/.env.*; do
  [ -e "$f" ] || continue
  do_or_echo cp -a "$f" "$PI_DEP/"
done
# config/ (credentials.json, token.json — gitignored, runtime auth).
do_or_echo mkdir -p "$PI_DEP/config"
if [ -d "$PI_DEV/config" ]; then
  do_or_echo bash -c "cp -a '$PI_DEV/config/.' '$PI_DEP/config/' 2>/dev/null || true"
fi
# Untracked + ignored files under data/ (DBs, *.json state, logs/, memory/, …).
# The TRACKED data content (5e/, personality/, rag_data/, games/, …) is already
# present from the git checkout, so we copy ONLY the non-tracked runtime files.
step "2b. Copy untracked runtime files under data/ (and logs/)"
if [ "$APPLY" -eq 1 ]; then
  ( cd "$PI_DEV"
    { git ls-files --others --exclude-standard -- data logs
      git ls-files --others --ignored --exclude-standard -- data logs
    } | sort -u > /tmp/bmo-runtime-files.txt )
  log "$(wc -l < /tmp/bmo-runtime-files.txt) untracked runtime paths to copy"
  rsync -a --files-from=/tmp/bmo-runtime-files.txt "$PI_DEV/" "$PI_DEP/"
else
  echo "[dry-run] rsync untracked data/ + logs/ runtime files from $PI_DEV to $PI_DEP"
  echo "[dry-run]   (list = git ls-files --others [--ignored] --exclude-standard -- data logs)"
fi

# ── 3. Rebuild the venv in the deploy checkout (correct absolute shebangs) ────
step "3. Build venv in the deploy checkout (via install-venv.sh)"
# A copied venv would keep the OLD path in its console-script shebangs (pip etc.),
# so we rebuild cleanly. This downloads torch (CPU) + deps and can take a while.
if [ -x "$PI_DEP/scripts/install-venv.sh" ]; then
  do_or_echo bash "$PI_DEP/scripts/install-venv.sh" "$VENV_PY"
else
  do_or_echo bash -c "cd '$PI_DEP' && '$VENV_PY' -m venv venv && venv/bin/pip install --upgrade pip && venv/bin/pip install -r requirements.txt && venv/bin/pip install --no-deps openwakeword==0.6.0"
fi

# ── 4. Repoint the installed systemd units to the deploy checkout ─────────────
step "4. Repoint systemd units ($OLD_PATH → $NEW_PATH)"
for u in "${UNITS[@]}"; do
  unit="/etc/systemd/system/$u.service"
  [ -f "$unit" ] || { log "skip $u (no unit file)"; continue; }
  if grep -q "$OLD_PATH" "$unit"; then
    do_or_echo sudo sed -i "s#${OLD_PATH}#${NEW_PATH}#g" "$unit"
  else
    log "skip $u (already repointed)"
  fi
done
# logrotate configs, if installed, also reference the path.
for lr in /etc/logrotate.d/bmo /etc/logrotate.d/bmo-bots; do
  [ -f "$lr" ] && grep -q "$OLD_PATH" "$lr" && do_or_echo sudo sed -i "s#${OLD_PATH}#${NEW_PATH}#g" "$lr"
done
do_or_echo sudo systemctl daemon-reload

# ── 5. Restart the live services on the new path + health gate ────────────────
step "5. Restart services on the new path and health-check"
do_or_echo sudo systemctl restart "${RESTART_NOW[@]}"
if [ "$APPLY" -eq 1 ]; then
  log "polling http://localhost:5000/health ..."
  ok=0
  for _ in $(seq 1 90); do curl -sf http://localhost:5000/health >/dev/null 2>&1 && { ok=1; break; }; sleep 1; done
  if [ "$ok" -eq 1 ]; then log "/health GREEN"; else echo "[migrate] FAIL: /health red after restart — investigate before proceeding"; exit 1; fi
  printf '%s\n' "$DEPLOYED_SHA" > /home/patrick/.bmo-deployed-sha
fi

step "DONE"
if [ "$APPLY" -eq 1 ]; then _state="applied"; else _state="plan printed (dry run)"; fi
cat <<EOF
[migrate] Migration: $_state.
[migrate] Next:
[migrate]   - Verify all units active:  systemctl is-active ${UNITS[*]}
[migrate]   - Confirm a deploy works:   /home/patrick/home-lab/bmo/pi/scripts/deploy.sh --dry-run
[migrate]   - The shared dev tree ($DEV_ROOT) is now deploy-irrelevant; it may be
[migrate]     dirty/mid-merge without affecting deploys.
[migrate]   - (Optional) the old runtime state under $PI_DEV (venv/.env/config/data
[migrate]     runtime files) can stay as-is for dev/test; it is no longer read by the
[migrate]     live services.
EOF
