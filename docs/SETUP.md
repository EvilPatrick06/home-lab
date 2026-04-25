# Setup

First-clone → running guide.

## Prerequisites

- Linux (Raspberry Pi OS / Debian / Ubuntu / Fedora) or Windows or Mac
- git, git-lfs
- Node.js 20+ and npm
- Python 3.11 (for BMO side)
- SSH access to Pi if deploying BMO

## Clone

```bash
git clone https://github.com/EvilPatrick06/home-lab.git
cd home-lab

# LFS — large files (D&D rulebook PDFs)
git lfs install
git lfs pull    # downloads PDFs (~1.7 GB). Skip if you don't need local rulebooks.
```

## dnd-app (VTT)

Works on Linux, Mac, Windows.

```bash
cd dnd-app
npm install

# Development
npm run dev                     # electron-vite dev server (hot reload)

# Tests
npm test                        # vitest run
npm run lint                    # biome
npx tsc --noEmit                # type check

# Production build (Windows installer)
npm run build                   # electron-vite build
npm run release                 # + electron-builder NSIS installer (requires GH_TOKEN for publish)
```

App runs on your desktop. Players need to install the built NSIS installer from GitHub Releases. DM hosts session, players join via invite code.

## BMO (Raspberry Pi)

**Only on a Pi 5 with the BMO hardware (microphone, OLED, LED strip, fan, HDMI touchscreen).** Bypasses possible but not supported.

```bash
cd bmo
bash setup-bmo.sh
```

What setup-bmo.sh does:
1. Installs apt dependencies (Python, audio libs, systemd, I2C tools, etc.)
2. Creates Python venv at `bmo/pi/venv/` and installs `requirements.txt`
3. Writes + enables systemd services: `bmo, bmo-fan, bmo-kiosk, bmo-dm-bot, bmo-social-bot`
4. Creates data directory structure
5. Optionally prompts to launch services

Configure secrets:

```bash
cp .env.template pi/.env
nano pi/.env                    # fill API keys — see comments in template
```

Required API keys (minimum for BMO to function):
- `ANTHROPIC_API_KEY` — primary D&D DM + code agent
- `GEMINI_API_KEY` — routing + general chat
- `GROQ_API_KEY` — speech-to-text
- `FISH_AUDIO_API_KEY` — text-to-speech (BMO's voice)

Optional:
- `GOOGLE_CLIENT_ID/SECRET` — calendar integration (also run `pi/services/authorize_calendar.py` after setting)
- `DISCORD_DM_BOT_TOKEN` + `DISCORD_SOCIAL_BOT_TOKEN` — Discord bots
- `CF_TUNNEL_ID`, `CF_ACCOUNT_ID` — Cloudflare tunnel for remote access
- `DISCORD_WEBHOOK_URL` — alert notifications

Start services:

```bash
sudo systemctl start bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot
sudo systemctl enable bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot   # auto-start at boot
```

Verify:

```bash
systemctl status bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot
curl http://localhost:5000/health             # should return {"status":"ok"}
journalctl -u bmo -f                          # tail main app logs
```

## Connect dnd-app ↔ BMO

On DM's laptop (running dnd-app):

1. **Pi URL:** In dnd-app → **Settings** → **Cloud backup** (BMO / Google Drive section), set **BMO Pi base URL** and click **Save URL**. That value overrides `BMO_PI_URL` for main-process fetches, cloud sync, and the renderer Content Security Policy—no app restart. If the field is left empty, the app uses `BMO_PI_URL` (environment) or the built-in default `http://bmo.local:5000`.
2. Test connection: use **Check Status** in the same section (rclone/health) or in-game BMO actions as needed.
3. Open firewall port 5001 on the DM laptop for BMO callbacks (Windows Defender / iptables) when using Discord sync.

On Pi:

```bash
# Set VTT sync URL so BMO knows where to send callbacks
echo 'VTT_SYNC_URL=http://<DM-laptop-ip>:5001' >> /home/patrick/home-lab/bmo/pi/.env
sudo systemctl restart bmo
```

## Verify end-to-end

1. DM laptop: open dnd-app → Settings → click "Start Discord Session" → select campaign
2. Expected: BMO Discord DM bot posts "Session started" in Discord channel
3. Player types in Discord: "I roll a d20"
4. Expected: dnd-app VTT chat panel shows the roll

If broken, check:
- `bmo/docs/TROUBLESHOOTING.md`
- The matching active log: `docs/BMO-ISSUES-LOG.md` (bmo bugs), `docs/ISSUES-LOG-DNDAPP.md` (dnd-app bugs); also `docs/BMO-SUGGESTIONS-LOG.md` + `docs/SUGGESTIONS-LOG-DNDAPP.md` for design-gotchas / known-quirks
- `journalctl -u bmo -f` + dnd-app logs (Help → Open Logs)

## Next steps

- [`COMMANDS.md`](./COMMANDS.md) — cheat sheet
- [`GLOSSARY.md`](./GLOSSARY.md) — beginner terms
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how it works
- [`BACKUP.md`](./BACKUP.md) — don't lose your data
