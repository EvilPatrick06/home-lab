# BMO disaster recovery

Consolidated runbook for standing BMO up on a fresh Pi from a cold backup, plus how the backup-integrity check works. Read alongside [`DEPLOY.md`](./DEPLOY.md) (laptop→Pi updates) and the Backup Strategy section of [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## What is (and isn't) backed up

The nightly `bmo-backup.timer` runs [`scripts/backup-state.sh`](../pi/scripts/backup-state.sh), which writes a **timestamped `tar.gz` of the gitignored runtime state to `~/bmo-backups/` (off the repo tree)** and prunes to the newest `BMO_BACKUP_KEEP` (default 14). It captures:

- `data/` — campaign memory, D&D sessions, lists, notes, alarms, play history, snapshots, the SQLite DBs (`bmo_social.db`, `campaign_memory.db`), etc.
- `config/token.json` — the Google Calendar OAuth token.

**Excluded** (re-creatable, not backed up): the 5e reference data (`data/5e*`, restored via [`scripts/seed-5e-library.sh`](../pi/scripts/seed-5e-library.sh)), `__pycache__`/`.pyc`, and `.audiocache`.

Everything else (application code, systemd units, dependency list) lives in git and is reinstalled by `setup-bmo.sh`. Secrets that are NOT in the backup — the API keys in `pi/.env` and `config/credentials.json` — must be restored from your own secret store.

## Cold-restore runbook (fresh Pi)

1. **Base image + clone.** Flash Raspberry Pi OS Lite, enable SSH, then:
   ```bash
   git clone <repo-url> ~/home-lab
   ```
2. **Run setup.** Installs system deps, the venv, all systemd units (from `bmo/pi/systemd/`), Docker containers, avahi, and the logrotate entry:
   ```bash
   ~/home-lab/bmo/setup-bmo.sh
   ```
3. **Restore secrets** (from your secret store, not the backup):
   - `~/home-lab/bmo/pi/.env`  ← copy `bmo/.env.template`, fill every key (see the startup preflight summary at boot / `GET /api/health/full` for which are required).
   - `~/home-lab/bmo/pi/config/credentials.json`  (Google OAuth client).
4. **Restore runtime state** from the newest backup archive:
   ```bash
   ls -1t ~/bmo-backups/bmo-state-*.tar.gz | head -1          # newest archive
   tar -xzf ~/bmo-backups/bmo-state-YYYYMMDD-HHMMSS.tar.gz -C ~/home-lab/bmo/pi
   # restores data/ and config/token.json in place
   ```
   (If the archive lives only on another host, copy it to `~/bmo-backups/` first.)
5. **Re-seed 5e reference data** (excluded from backups):
   ```bash
   ~/home-lab/bmo/pi/scripts/seed-5e-library.sh
   ```
6. **Calendar re-auth** if `config/token.json` is missing/expired — follow the Calendar OAuth flow in [`ARCHITECTURE.md`](./ARCHITECTURE.md) (Cloud APIs).
7. **Start + verify:**
   ```bash
   sudo systemctl restart bmo bmo-dm-bot bmo-social-bot
   ~/home-lab/bmo/pi/scripts/health-check.sh        # expect STATUS=0, no MSG
   curl -sf http://localhost:5000/ >/dev/null && echo "web UI up"
   curl -s http://localhost:5000/api/health/full    # provider/degraded summary
   ```

Expected end state: `bmo` active, web UI on :5000, the two Discord bots connected, calendar reads working, and the preflight reporting all required providers configured.

## Backup-integrity check

[`scripts/verify-backup.sh`](../pi/scripts/verify-backup.sh) is a lightweight, read-only check that the newest archive is actually restorable. It pulls the latest `~/bmo-backups/bmo-state-*.tar.gz` into a temp dir and asserts: valid gzip/tar; contains `data/` + `config/token.json`; a set of key JSON files (`config/token.json` required; `alarms.json`, `recent_chat.json`, `settings.json`, `lists.json`, `notes.json`, `play_counts.json` if present) extract and parse; and `token.json` is a JSON object. On any failure it alerts via `~/.claude-tools/notify.sh` (`error`) and exits non-zero; it also warns if the newest backup is more than 8 days old.

Run it on demand:
```bash
~/home-lab/bmo/pi/scripts/verify-backup.sh
```

It runs automatically **monthly** via `bmo-backup-verify.timer` (installed + enabled by `setup-bmo.sh`). Check status with:
```bash
systemctl status bmo-backup-verify.timer
journalctl -u bmo-backup-verify.service --since "60 days ago"
```
