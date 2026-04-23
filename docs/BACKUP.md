# Backup Strategy

## Current approach (post-OS-migration)

**Primary backup = git.** Since switching OSes on the dev machine, git is the source of truth. Everything that matters is in this repo.

What's backed up via git:
- All source code (dnd-app + bmo)
- All BMO agents, services, web assets
- D&D 5e content JSON (`dnd-app/src/renderer/public/data/5e/`)
- BMO content data (`bmo/pi/data/{games,personality,5e,rag_data}/`)
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

### DnD app on laptop (Windows/Mac/Linux)

```bash
git clone https://github.com/EvilPatrick06/DnD.git
cd DnD/dnd-app
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

### BMO on Raspberry Pi (fresh Pi)

See [`SETUP.md`](./SETUP.md) full procedure. Summary:

```bash
git clone https://github.com/EvilPatrick06/DnD.git /home/patrick/DnD
cd /home/patrick/DnD/bmo
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

**To avoid losing runtime state**, use optional backup service:
- `bmo/docker/bmo-backup.service` + `bmo-backup.timer` — daily backup of `bmo/pi/data/` to external location (SSD, cloud)
- Configure the target in `bmo-backup.service` before enabling

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
- Runtime state: ⚠ only on Pi (set up `bmo-backup.service`)
- LFS PDFs: ⚠ only on GitHub LFS + whoever has `git lfs pull`'d
