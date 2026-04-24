# Commands Cheat Sheet

Frequent commands, in the directory they run from.

## `cd dnd-app/`

```bash
# Dev
npm install                    # fresh install from package-lock
npm run dev                    # electron-vite dev server
npm start                      # same as `npm run preview`

# Build
npm run build                  # production build (→ out/)
npm run build:index            # regenerate chunk index (run before release)
npm run release                # full release: build + electron-builder + publish to GitHub
npm run build:win              # Windows-only build (no publish)

# Test
npm test                       # vitest run
npm run test:watch             # watch mode
npm run test:coverage          # with coverage report

# Lint / check
npm run lint                   # biome check
npm run lint:fix               # biome fix
npm run format                 # biome format
npx tsc --noEmit               # type check only (no emit)
npm run dead-code              # knip unused exports
npm run circular               # madge circular deps
npm run audit:ci               # npm audit (critical only)
```

## `cd bmo/pi/`

```bash
# Dev run (without systemd)
./venv/bin/python app.py            # Flask on :5000
./venv/bin/python cli.py            # REPL
./venv/bin/python -m bots.discord_dm_bot       # manual bot run

# Test
./venv/bin/python -m pytest                    # full suite
./venv/bin/python -m pytest tests/test_X.py -v   # one file
./venv/bin/python -m pytest -m "not live"      # skip real-API tests
./venv/bin/python -m pytest -m "not hardware"  # skip hardware-dependent
./venv/bin/python -m pytest --co               # collect only (dry run)

# Manual API calls
curl http://localhost:5000/health
curl http://localhost:5000/api/health/full
curl -X POST http://localhost:5000/api/narrate -H "Content-Type: application/json" -d '{"text":"hello"}'
```

## Systemd (from anywhere)

```bash
# Check status
systemctl status bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot
systemctl list-units --type=service --state=active | grep bmo

# Start / stop / restart
sudo systemctl start bmo
sudo systemctl stop bmo
sudo systemctl restart bmo                     # or any other bmo-*

# Enable / disable auto-start at boot
sudo systemctl enable bmo
sudo systemctl disable bmo

# Logs
journalctl -u bmo -f                           # tail main
journalctl -u bmo --since "10 min ago" --no-pager
journalctl -u bmo-dm-bot -n 100 --no-pager     # last 100 lines
journalctl -u bmo-kiosk -b                     # since last boot

# After editing .service file
sudo systemctl daemon-reload
sudo systemctl restart bmo                     # pick it up

# Kiosk-only (chromium fullscreen)
sudo systemctl restart bmo-kiosk               # reload touchscreen UI
```

## Git (from repo root)

```bash
# Status
git status
git log --oneline -20
git branch -a
git remote -v

# Sync
git pull                                        # fetch + merge from origin
git lfs pull                                    # download LFS files (PDFs)
GIT_LFS_SKIP_SMUDGE=1 git pull                  # pull without LFS content

# Commit
git add -A
git commit -m "feat: <summary>"

# Push
git push origin master                          # normal push
git push --force-with-lease origin master       # safer force push

# LFS
git lfs ls-files                                # list LFS-tracked files
git lfs track "*.pdf"                           # add new pattern
git lfs status

# Inspection
git diff                                        # unstaged changes
git diff --cached                               # staged changes
git diff HEAD~3                                 # vs 3 commits ago
git show HEAD                                   # last commit details
git blame <file>                                # who changed each line
git log --follow -- <file>                      # file's history (across renames)
```

## Pi / system

```bash
# Check running BMO processes
ps aux | grep -E "python|app.py" | grep -v grep
ps -p <PID> -o pid,etime,pcpu,pmem,cmd

# Port usage
ss -tnlp | grep -E "5000|5001|8080"           # listening
ss -tnp | grep 5000                            # connections to port 5000

# Disk / memory
df -h /home                                    # root fs
du -sh ~/home-lab                                   # repo size
du -sh ~/home-lab/bmo/pi/venv                       # venv size
free -h                                        # RAM

# Audio (PipeWire / PulseAudio)
pactl list short sinks                         # output devices
pactl list short sources                       # input devices
wpctl status                                   # wireplumber overview

# Pi hardware
vcgencmd measure_temp                          # CPU temp
vcgencmd get_throttled                         # throttling state
i2cdetect -y 1                                 # I2C devices (fan, OLED should appear)
```

## Docker containers (Ollama, PeerJS, Coturn, Pi-hole)

Containers are launched directly via `docker run` from `bmo/setup-bmo.sh`, not via compose. The old `bmo/docker/docker-compose.yml` is recoverable from git history if needed (`git log --all --full-history -- bmo/docker/`).

```bash
docker ps                                      # list running
docker logs -f bmo-ollama                      # tail one
docker restart bmo-ollama                      # restart one
docker stop bmo-pihole bmo-coturn              # stop multiple
```

## Remote management (from laptop via SSH)

```bash
# From laptop, SSH to Pi
ssh patrick@bmo.local                          # LAN
ssh patrick@bmo.tailnet-name.ts.net            # Tailscale
ssh -p 2222 user@tunnel.example.com            # Cloudflare tunnel

# Deploy from laptop
ssh patrick@bmo.local "cd ~/home-lab && git pull && sudo systemctl restart bmo"
```

## Debugging BMO fast

```bash
# 1. Service not starting?
systemctl status bmo
journalctl -u bmo -n 50 --no-pager

# 2. Service running but not responding?
curl --max-time 3 http://localhost:5000/health
ss -tnp | grep 5000                            # check connections

# 3. Python import error?
cd ~/home-lab/bmo/pi
./venv/bin/python -c "import app"              # smoke test

# 4. Test suite broken?
./venv/bin/python -m pytest --co               # collection only first

# 5. Agent routing wrong?
./venv/bin/python -m pytest tests/agents/test_routing_accuracy.py -v
```

## Docs quick-links

- Architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Glossary: [`GLOSSARY.md`](./GLOSSARY.md)
- Known issues: [`ISSUES-LOG.md`](./ISSUES-LOG.md)
- BMO troubleshoot: [`../bmo/docs/TROUBLESHOOTING.md`](../bmo/docs/TROUBLESHOOTING.md)
- BMO deploy: [`../bmo/docs/DEPLOY.md`](../bmo/docs/DEPLOY.md)
