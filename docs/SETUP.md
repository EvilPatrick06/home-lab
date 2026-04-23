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
git clone https://github.com/EvilPatrick06/DnD.git
cd DnD

# LFS — large files (D&D rulebook PDFs)
git lfs install
git lfs pull    # downloads PDFs (~1.7 GB). Skip if you don't need local rulebooks.
```

## DnD app (VTT)

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

## Connect DnD app ↔ BMO

On DM's laptop (running dnd-app):

1. Open dnd-app Settings → BMO Integration
2. Enter Pi URL (e.g., `http://bmo.local:5000` if on same LAN, or Tailscale/Cloudflare URL if remote)
3. Test connection (click "Ping BMO")
4. Open firewall port 5001 on laptop for BMO callbacks (Windows Defender / iptables)

On Pi:

```bash
# Set VTT sync URL so BMO knows where to send callbacks
echo 'VTT_SYNC_URL=http://<DM-laptop-ip>:5001' >> /home/patrick/DnD/bmo/pi/.env
sudo systemctl restart bmo
```

## Verify end-to-end

1. DM laptop: open dnd-app → Settings → click "Start Discord Session" → select campaign
2. Expected: BMO Discord DM bot posts "Session started" in Discord channel
3. Player types in Discord: "I roll a d20"
4. Expected: dnd-app VTT chat panel shows the roll

If broken, check:
- `bmo/docs/TROUBLESHOOTING.md`
- `docs/KNOWN-ISSUES.md`
- `journalctl -u bmo -f` + dnd-app logs (Help → Open Logs)

## Next steps

- [`COMMANDS.md`](./COMMANDS.md) — cheat sheet
- [`GLOSSARY.md`](./GLOSSARY.md) — beginner terms
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how it works
- [`BACKUP.md`](./BACKUP.md) — don't lose your data
