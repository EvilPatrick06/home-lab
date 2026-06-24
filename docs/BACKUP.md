# Backup Strategy

## Current approach (post-OS-migration)

**Primary backup = git.** Since switching OSes on the dev machine, git is the source of truth. Everything that matters is in this repo.

What's backed up via git:
- All source code (dnd-app + bmo + dungeon-scholar)
- All BMO agents, services, web assets
- D&D 5e content JSON (`dnd-app/src/renderer/public/data/5e/`)
- BMO content data (`bmo/pi/data/{games,personality,5e,rag_data}/`)
- Dungeon Scholar question banks (`dungeon-scholar/src/data/`)
- Configs, docs, scripts, tests

What's NOT backed up via git (gitignored):
- `**/.env` — local secrets (you set these up per-machine)
- `**/credentials.json`, `**/token.json`, `**/*.pem` — OAuth + TLS
- `**/__pycache__/`, `**/*.pyc` — Python bytecode
- `**/venv/`, `node_modules/` — dependencies (regenerate from requirements/package-lock)
- `bmo/pi/.pytest_cache/`, `.bmo/`, `.audiocache/`, `wake_clips/*.ppn` — runtime caches
- `bmo/pi/data/logs/` — runtime logs
- `bmo/pi/data/*.db` — SQLite databases with live state (social stats, campaign memory)
- `bmo/pi/data/{alarms,alert_history,ide_jobs,location_cache,monitor_state,monitor_alert_state,music_history,notes,play_counts,playback_state,recent_chat,settings}.json` — runtime state

## Restoring from scratch

### dnd-app on laptop (Windows/Mac/Linux)

```bash
git clone https://github.com/EvilPatrick06/home-lab.git
cd home-lab/dnd-app
npm install
cp ../.env.example .env      # if present; or create manually
nano .env                    # fill secrets
npm run dev                  # done
```

User data (characters, campaigns) is in:
- Windows: `%APPDATA%\dnd-vtt\`
- Mac: `~/Library/Application Support/dnd-vtt/`
- Linux: `~/.config/dnd-vtt/`

These live outside the repo. Back them up separately if valuable. Consider syncing `%APPDATA%\dnd-vtt\` to cloud (OneDrive, Dropbox, iCloud).

### dungeon-scholar (no Pi involvement)

Build is purely from-source — `npm install && npm run build`. Cloud-sync state (optional) lives in Supabase; restore = re-auth.

```bash
git clone https://github.com/EvilPatrick06/home-lab.git
cd home-lab/dungeon-scholar
npm install
cp .env.example .env.local       # add Supabase URL + anon key if using cloud sync
npm run dev
```

Per-user progress that isn't on Supabase lives in browser `localStorage` — not backed up by the app. Browser export / import is the only path back.

### BMO on Raspberry Pi (fresh Pi)

See [`SETUP.md`](./SETUP.md) full procedure. Summary:

```bash
git clone https://github.com/EvilPatrick06/home-lab.git /home/patrick/home-lab
cd /home/patrick/home-lab/bmo
bash setup-bmo.sh                   # installs deps + systemd
cp .env.template pi/.env && nano pi/.env   # add API keys
# Manually re-authorize Google OAuth:
cd pi && ./venv/bin/python services/authorize_calendar.py
sudo systemctl start bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot
```

Runtime state lost on fresh restore:
- Chat history → regenerates as you talk
- Music play counts → starts fresh
- Campaign memory → `campaign_memory.db` lost; re-tell BMO about your campaign
- Calendar cache → refreshes from Google

**Runtime-state backup — INSTALLED and active (since 2026-06-22).** A systemd timer backs up the gitignored runtime state off-tree so it survives a repo re-clone or working-tree wipe:

- `bmo-backup.timer` -> `bmo-backup.service` runs `bmo/pi/scripts/backup-state.sh` daily at 03:00 (`Persistent=true`, so a missed run fires on next boot).
- It writes a timestamped `bmo-state-YYYYMMDD-HHMMSS.tar.gz` to `~/bmo-backups/` (override with `\$BMO_BACKUP_DIR`), containing `bmo/pi/data/` (campaign memory, D&D sessions, lists, notes, alarms, play history, etc.) plus `config/token.json`. Large seedable 5e reference data is excluded (re-creatable via `seed-5e-library.sh`).
- Retention: newest 14 archives kept (`\$BMO_BACKUP_KEEP`); older ones pruned automatically.
- `bmo-backup-verify.timer` -> `bmo-backup-verify.service` runs `bmo/pi/scripts/verify-backup.sh` monthly (1st at 04:30) as an integrity check.

> WARNING: the destination `~/bmo-backups/` is on the **same NVMe disk** as the source (`/dev/nvme0n1p2`). It is off-tree but **not offsite** -- it protects against repo re-clone / accidental deletion, not against disk failure. For true 3-2-1, sync `~/bmo-backups/` to an external SSD or cloud target.

## LFS (D&D rulebook PDFs)

`5.5e References/*.pdf` (526 files, ~1.7 GB) stored in Git LFS.

- On push: auto-uploaded to GitHub LFS
- On clone: only pointers unless you `git lfs pull`

To back up locally:
```bash
git lfs pull                      # downloads actual PDFs
# Now the files exist on disk; tar/zip/rsync to external backup
```

To save LFS storage cost: don't commit PDFs for every minor update. They're static content.

## Disaster recovery checklist

If Pi dies:
1. Get a new Pi 5, flash Raspberry Pi OS
2. Follow [`SETUP.md`](./SETUP.md) BMO section
3. Restore runtime state from backup (if you have one) into `bmo/pi/data/`
4. Restart services

If GitHub repo goes down:
1. Your local clone is also a full backup. `git push` to a new remote (GitLab, Gitea, etc.)
2. LFS files — may need to re-upload if remote storage was lost; keep `5.5e References/` local tarball just in case

If ALL copies lost (local + remote + Pi):
- You're out of luck. This is why cloud git host (GitHub) + keeping local laptop clone + keeping Pi clone = 3 copies of code.

## Recommended: 3-2-1 rule

- **3 copies** of important data
- On **2 different media** (Pi SSD + laptop SSD, for example)
- **1 offsite** (GitHub counts as offsite for code)

Status:
- Code: ✓ 3 copies (GitHub + Pi + ≥1 laptop)
- Character sheets: ⚠ only on DM's laptop (add cloud sync for %APPDATA%)
- Runtime state: ✓ backed up daily off-tree (`bmo-backup.timer` -> `~/bmo-backups/`, 14 kept) — ⚠ but still only on the Pi disk; add an offsite copy for true 3-2-1
- LFS PDFs: ⚠ only on GitHub LFS + whoever has `git lfs pull`'d
