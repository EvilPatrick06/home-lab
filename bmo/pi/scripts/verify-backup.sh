#!/usr/bin/env bash
# Backup-integrity check for BMO's off-tree state backups (see backup-state.sh).
# Pulls the NEWEST ~/bmo-backups/bmo-state-*.tar.gz into a temp dir and asserts:
#   - archive exists, is non-empty, and is a valid gzip/tar
#   - it contains data/ and config/token.json
#   - a set of key JSON files extract and parse (json.load)
# On any failure it alerts via ~/.claude-tools/notify.sh (error) and exits 1.
# Intended to run monthly via bmo-backup-verify.timer. Safe + read-only:
# it never touches the live data/ or the archives themselves.
set -euo pipefail

DEST="${BMO_BACKUP_DIR:-$HOME/bmo-backups}"
NOTIFY="$HOME/.claude-tools/notify.sh"

fail() {
  local msg="$1"
  echo "[verify-backup] FAIL: $msg" >&2
  [ -x "$NOTIFY" ] && "$NOTIFY" error "BMO backup integrity check FAILED" "$msg" || true
  exit 1
}

archive="$(ls -1t "$DEST"/bmo-state-*.tar.gz 2>/dev/null | head -n1 || true)"
[ -n "$archive" ] || fail "no backup archives found in $DEST"
[ -s "$archive" ] || fail "newest archive is empty: $archive"

# Staleness: warn (not fail) if the newest backup is older than 8 days.
age_days=$(( ( $(date +%s) - $(stat -c %Y "$archive") ) / 86400 ))
if [ "$age_days" -gt 8 ]; then
  [ -x "$NOTIFY" ] && "$NOTIFY" warn "BMO backup is stale" "Newest backup $archive is ${age_days}d old (daily timer may be failing)." || true
fi

gzip -t "$archive" 2>/dev/null || fail "archive is not a valid gzip: $archive"

contents="$(tar -tzf "$archive")" || fail "cannot list archive: $archive"
echo "$contents" | grep -q '^data/' || fail "archive missing data/ : $archive"
echo "$contents" | grep -q '^config/token.json$' || fail "archive missing config/token.json : $archive"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tar -xzf "$archive" -C "$tmp" || fail "extraction failed: $archive"

# Key files that must exist AND parse as JSON. token.json must be a JSON object;
# the others just have to parse. Missing-but-optional files are allowed.
required_json=( "config/token.json" )
optional_json=( "data/alarms.json" "data/recent_chat.json" "data/settings.json" \
                "data/lists.json" "data/notes.json" "data/play_counts.json" )

for rel in "${required_json[@]}"; do
  f="$tmp/$rel"
  [ -f "$f" ] || fail "required file missing from archive: $rel"
  python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" \
    || fail "required file does not parse as JSON: $rel"
done

checked=1
for rel in "${optional_json[@]}"; do
  f="$tmp/$rel"
  [ -f "$f" ] || continue
  python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" \
    || fail "file present but does not parse as JSON: $rel"
  checked=$((checked+1))
done

# token.json shape sanity: must be a JSON object (calendar OAuth token).
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if isinstance(d,dict) else 1)" \
  "$tmp/config/token.json" || fail "config/token.json is not a JSON object"

size="$(du -h "$archive" | cut -f1)"
echo "[verify-backup] OK: $archive ($size, ${age_days}d old) — $checked key JSON file(s) parsed; data/ + config/token.json present."
