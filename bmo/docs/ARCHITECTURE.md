# BMO Architecture

> BMO is a Raspberry Pi 5–based AI assistant and smart home hub.
> Self-hosted on Pi with cloud APIs for LLM/TTS/STT.

---

## Hardware

| Component | Spec |
|-----------|------|
| Board | Raspberry Pi 5, 8 GB RAM |
| Storage | 32 GB USB SSD (ext4) |
| OS | Raspberry Pi OS (Debian Bookworm, 64-bit) |
| Peripherals | USB mic, 3.5 mm speakers, Pi Camera v2, 128×64 OLED (I²C), NeoPixel LED ring (SPI/GPIO) |
| Network | Travel-friendly DHCP (Wi-Fi/Ethernet), mDNS `bmo.local`, optional Tailscale + Cloudflare |

---

## System Overview

```
┌─────────────────────── Raspberry Pi 5 ───────────────────────┐
│                                                               │
│  ┌──── Bare Metal (systemd: bmo.service) ────────────────┐   │
│  │  Flask/SocketIO app  (app.py)                          │   │
│  │   ├── Voice Pipeline  (wake word → STT → LLM → TTS)   │   │
│  │   ├── Agent System    (orchestrator + 20 specialists)  │   │
│  │   ├── Camera Service  (picamera2 object detection)     │   │
│  │   ├── Smart Home      (Home Assistant API)             │   │
│  │   ├── Music Service   (MPD/Spotify)                    │   │
│  │   ├── D&D Engine      (campaign, combat, sessions)     │   │
│  │   ├── Calendar        (Google Calendar API)            │   │
│  │   ├── Weather         (OpenWeatherMap API)             │   │
│  │   ├── TV Controller   (Samsung WebSocket)              │   │
│  │   ├── Timer Service   (alarms, timers)                 │   │
│  │   ├── LED Controller  (NeoPixel status ring)           │   │
│  │   ├── OLED Face       (animated expressions)           │   │
│  │   ├── Monitoring      (health checks + Discord alerts) │   │
│  │   └── MCP Servers     (D&D data server)                │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──── Docker Containers ─────────────────────────────────┐   │
│  │  bmo-ollama   — Local LLM fallback (gemma3:4b, 4 GB)  │   │
│  │  bmo-peerjs   — WebRTC signaling (D&D VTT, 128 MB)    │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──── Scheduled Tasks ───────────────────────────────────┐   │
│  │  cron  */5 * * * *   health_check.sh → health.log      │   │
│  │  systemd timer 3 AM  backup.sh → Google Drive (rclone) │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘

              │                    │                    │
              ▼                    ▼                    ▼
     ┌──── Cloud APIs ────┐  ┌── Google ──┐   ┌── Discord ──┐
     │ Gemini 3 Pro/Flash │  │ Calendar   │   │ Webhook     │
     │ Groq Whisper (STT) │  │ Drive      │   │ (alerts)    │
     │ Fish Audio (TTS)   │  │ Vision     │   └─────────────┘
     │ Claude Opus (D&D)  │  └────────────┘
     └────────────────────┘
```

---

## Service Map

### Bare Metal (systemd `bmo.service`)

The Flask app runs directly on the host because it needs low-latency access to hardware
(camera, microphone, speakers, GPIO, I²C, SPI).

| Service | File | Port | Purpose |
|---------|------|------|---------|
| Web UI + API | `app.py` | 5000 | Main Flask/SocketIO server |
| Voice Pipeline | `voice_pipeline.py` | — | Wake word → Groq STT → LLM → Fish TTS |
| Agent Orchestrator | `agents/orchestrator.py` | — | Routes queries to 20 specialist agents |
| Cloud Providers | `cloud_providers.py` | — | Gemini/Groq/Fish/Claude API wrappers |
| Camera | `camera_service.py` | — | picamera2 object detection |
| Smart Home | `smart_home.py` | — | Home Assistant REST API |
| Calendar | `calendar_service.py` | — | Google Calendar OAuth2 |
| Weather | `weather_service.py` | — | OpenWeatherMap API |
| Music | `music_service.py` | — | MPD/Spotify playback control |
| D&D Engine | `dnd_engine.py` | — | Campaign management, combat tracker |
| TV Controller | `tv_controller.py` | — | Samsung TV WebSocket remote |
| Timers | `timer_service.py` | — | Alarms and countdown timers |
| LED Controller | `led_controller.py` | — | NeoPixel status ring (SPI/GPIO) |
| OLED Face | `oled_face.py` | — | 128×64 animated expressions (I²C) |
| Monitoring | `monitoring.py` | — | Health checks, Pi stats, Discord alerts |
| MCP Server | `mcp_servers/dnd_data_server.py` | — | D&D 5e data via MCP protocol |
| Discord DM Bot | `bots/discord_dm_bot.py` | — | D&D session management over Discord |
| Discord Social Bot | `bots/discord_social_bot.py` | — | Casual server: music, games, trivia |
| RAG Search | `rag_search.py` | — | SRD keyword index for AI context |

### Docker Containers

| Container | Image | Port | Memory Limit | Purpose |
|-----------|-------|------|-------------|---------|
| `bmo-ollama` | `ollama/ollama:latest` | 11434 | 4 GB | Local LLM fallback (gemma3:4b Q4_K_M) |
| `bmo-peerjs` | `node:22-slim` | 9000 | 128 MB | WebRTC signaling for D&D VTT |

### Cloud APIs

| API | Model/Service | Purpose | Env Var |
|-----|--------------|---------|---------|
| Google Gemini | gemini-3-pro, gemini-3-flash | Primary LLM (chat, routing) | `GEMINI_API_KEY` |
| Anthropic Claude | claude-opus-4.6 | D&D Dungeon Master | `ANTHROPIC_API_KEY` |
| Groq | whisper-large-v3 | Speech-to-text | `GROQ_API_KEY` |
| Fish Audio | Custom BMO voice | Text-to-speech | `FISH_AUDIO_API_KEY` |
| Google Vision | Cloud Vision API | Image analysis | `GOOGLE_VISION_API_KEY` |
| Google Calendar | Calendar API v3 | Schedule management | OAuth2 (`config/token.json`) |
| OpenWeatherMap | Weather API | Weather forecasts | `OPENWEATHER_API_KEY` |

---

## Directory Layout (`~/bmo/`)

```
~/bmo/
├── app.py                    # Main Flask/SocketIO server
├── agents/                   # 20 specialist AI agents
│   ├── orchestrator.py       #   Routes to correct agent
│   ├── router.py             #   Intent classification
│   ├── dnd_dm.py             #   D&D Dungeon Master
│   ├── smart_home_agent.py   #   Home Assistant control
│   ├── music_agent.py        #   Music playback
│   ├── calendar_agent.py     #   Calendar management
│   ├── weather_agent.py      #   Weather queries
│   ├── timer_agent.py        #   Timers and alarms
│   └── ...                   #   code, deploy, docs, research, etc.
├── mcp_servers/              # Model Context Protocol servers
│   ├── dnd_data_server.py    #   5e SRD data server
│   └── mcp_settings.json     #   MCP configuration
├── config/                   # Credentials (not in git)
│   └── token.json            #   Google Calendar OAuth2 token
├── data/                     # Persistent data
│   ├── 5e/                   #   D&D 5e game data JSONs
│   ├── 5e-references/        #   SRD reference documents
│   ├── dnd_sessions/         #   Saved D&D campaign sessions
│   ├── memory/               #   Agent conversation memory
│   ├── commands/             #   Custom user commands
│   ├── rag_data/             #   RAG index files
│   ├── snapshots/            #   Camera snapshots
│   ├── recent_chat.json      #   Chat history
│   ├── alarms.json           #   Active timers/alarms
│   ├── music_history.json    #   Music playback history
│   └── monitor_state.json    #   Health check state (survives restarts)
├── templates/                # Jinja2 HTML templates
│   └── index.html
├── static/                   # Web UI assets
│   ├── css/
│   ├── js/
│   ├── img/
│   ├── faces/                #   OLED face PNGs
│   └── sounds/               #   Sound effect files
├── logs/                     # Log files
│   └── health.log            #   Health check cron output
├── models/                   # Local model files
├── venv/                     # Python virtual environment
├── .env                      # Environment config (secrets)
├── docker-compose.yml        # Docker service definitions
├── bmo.service               # systemd unit file
├── backup.sh                 # Google Drive backup script
├── health_check.sh           # Cron health check script
├── requirements.txt          # Python dependencies
└── .audiocache/              # TTS audio cache
```

---

## Deployment

This Pi is the source of truth. Code lives in `/home/patrick/home-lab/bmo/pi/` (monorepo) and is installed via `bmo/setup-bmo.sh`. Systemd unit definitions live in `bmo/pi/kiosk/` and `bmo/pi/ide_app/`. Docker containers (ollama, peerjs, coturn, pihole) are launched by `setup-bmo.sh` directly via `docker run`.

The legacy `bmo/docker/` SSH-deploy path (from a dev laptop → flat `~/bmo/` on the Pi) was retired on 2026-04-23 and the on-disk archive deleted. Recoverable from git history: `git log --all --full-history -- bmo/docker/`.
4. Installs Python dependencies (unless `--quick`)
5. Starts Docker containers (`docker compose up -d`)
6. Installs and restarts `bmo.service` via systemd
7. Runs health checks against Flask, Ollama, PeerJS

### Manual operations:
```bash
# SSH to Pi (preferred local mDNS)
ssh patrick@bmo.local

# SSH to Pi (stable alias, recommended on Windows)
ssh patrick@bmo

# View BMO logs
sudo journalctl -u bmo -f

# Restart BMO
sudo systemctl restart bmo

# Docker logs
cd ~/bmo && docker compose logs -f

# Check health
curl http://localhost:5000/api/health/full | python3 -m json.tool
```

---

## Backup Strategy

**Tool:** rclone → Google Drive (`gdrive:BMO-Backups/`)

**Schedule:** Daily at 3:00 AM MST via systemd timer (`bmo-backup.timer`)

**What's backed up:**
- `~/bmo/data/` — chat history, D&D sessions, notes, snapshots, alarms
- `~/bmo/config/` — Google Calendar OAuth token
- `~/bmo/requirements.txt` — Python dependency snapshot

**What's excluded:** `.pyc`, `__pycache__`, `.audiocache` (TTS cache, regenerated on demand)

**Manual backup:**
```bash
~/bmo/backup.sh
```

**Verify backup:**
```bash
rclone ls gdrive:BMO-Backups/
```

**Restore:**
```bash
rclone sync gdrive:BMO-Backups/data/ ~/bmo/data/
rclone sync gdrive:BMO-Backups/config/ ~/bmo/config/
```

---

## Monitoring & Alerting

### Health Checks (every 60 seconds)

`monitoring.py` runs a background thread that checks:

| Check | What | Alert Level |
|-------|------|-------------|
| BMO Flask App | `http://localhost:5000/health` | CRITICAL on down |
| Ollama | `http://localhost:11434/api/tags` | CRITICAL on down |
| PeerJS | `http://localhost:9000/myapp` | CRITICAL on down |
| Gemini API | `generativelanguage.googleapis.com` | CRITICAL on down |
| Groq API | `api.groq.com` | CRITICAL on down |
| Fish Audio API | `api.fish.audio` | CRITICAL on down |
| Docker containers | `docker inspect` (bmo-ollama, bmo-peerjs) | CRITICAL if not running |
| Internet connectivity | DNS resolution (Google + Cloudflare) | CRITICAL on down |
| Pi power | `vcgencmd get_throttled` (under-voltage, throttling) | WARNING/CRITICAL |
| Pi resources | CPU, RAM, disk, temperature via psutil | WARNING at thresholds |

### Alert Routing

```
Health Check Failure
  ├── Console log with [monitor] prefix (always)
  ├── Discord webhook embed (WARNING + CRITICAL, 5-min cooldown per service)
  ├── SocketIO 'alert' event to Web UI (WARNING + CRITICAL)
  └── OLED face expression change (CRITICAL → error face)

Recovery
  ├── Console log: "[monitor] RECOVERY: <service> is back up"
  ├── Discord webhook: "✅ <service> has recovered"
  └── SocketIO: 'bmo_status' → idle expression
```

Discord alerts use human-readable service labels (e.g., "🤖 Ollama (local LLM fallback)") and include
actionable instructions.

### Health state persistence

Service status is persisted to `~/bmo/data/monitor_state.json` so recovery alerts work
correctly across BMO restarts. Without this, a service going down → BMO restart → service
comes back up would not trigger a recovery notification.

### Cron health check

A separate `health_check.sh` runs via cron every 5 minutes and logs to `~/bmo/logs/health.log`:
```
*/5 * * * * /home/patrick/bmo/health_check.sh >> /home/patrick/bmo/logs/health.log 2>&1
```

### Endpoints

| Endpoint | Response |
|----------|----------|
| `GET /health` | `{"status": "ok"}` — simple liveness check |
| `GET /api/health/full` | Full status: all services, Pi stats, down/degraded lists |

---

## Voice Pipeline

```
Microphone → Wake Word ("hey BMO") → Groq Whisper (STT) → Agent Router
                                                              │
                                    ┌─────────────────────────┤
                                    ▼                         ▼
                              Gemini 3 Pro              Specialist Agent
                              (general chat)            (smart home, music, etc.)
                                    │                         │
                                    └─────────┬───────────────┘
                                              ▼
                                    Fish Audio TTS (BMO voice)
                                              │
                                              ▼
                                         Speakers
```

**Fallback chain:** If Gemini is down → Ollama gemma3:4b (local)

---

## Agent System

The orchestrator (`agents/orchestrator.py`) routes user queries to specialist agents based on
intent classification by the router agent.

| Agent | Handles |
|-------|---------|
| `conversation` | General chat, greetings, small talk |
| `smart_home_agent` | Lights, switches, climate, sensors |
| `music_agent` | Play, pause, queue, volume |
| `calendar_agent` | Events, scheduling, reminders |
| `weather_agent` | Forecasts, current conditions |
| `timer_agent` | Timers, alarms, countdowns |
| `dnd_dm` | D&D campaigns, combat, NPCs (Claude Opus 4.6) |
| `code_agent` | Code help, debugging |
| `deploy_agent` | Deployment assistance |
| `research_agent` | Web research, information lookup |
| `monitoring_agent` | System status queries |
| `learning_agent` | User preference learning |
| `plan_agent` | Task planning, project management |
| `docs_agent` | Documentation queries |
| `design_agent` | Design assistance |
| `review_agent` | Code review |
| `security_agent` | Security analysis |
| `test_agent` | Testing assistance |
| `cleanup_agent` | System maintenance |
| `custom_commands` | User-defined custom commands |

---

## Performance Baseline (March 2026)

| Metric | Value | Notes |
|--------|-------|-------|
| RAM used | 1.3 GB / 8 GB (16%) | Plenty of headroom |
| CPU load | 0.06 (idle) | 4 cores barely used at idle |
| CPU temp | 48°C | Well within safe range (<85°C) |
| Disk | 83% of 28 GB | ~4.8 GB free after cleanup |
| BMO process RSS | ~155 MB | Flask app with all services |
| Ollama container | 4 GB limit | gemma3:4b Q4_K_M (3.3 GB model) |
| PeerJS container | 128 MB limit | Lightweight signaling server |
| Swap | 0 MB used / 2 GB configured | No swap pressure |
| Boot → ready | ~3 seconds | All services initialized |

---

## Troubleshooting

### BMO won't start
```bash
sudo journalctl -u bmo -n 50 --no-pager
# Check for import errors, missing deps, port conflicts
```

### Ollama not responding
```bash
docker logs bmo-ollama --tail 50
docker restart bmo-ollama
# If model not loaded:
docker exec bmo-ollama ollama pull gemma3:4b
```

### Calendar returns 500
```bash
# Token expired — re-authorize on a machine with a browser:
python3 authorize_calendar.py
# Copy resulting token.json to ~/bmo/config/
```

### No audio output
```bash
aplay -l                       # List audio devices
pactl list sinks short         # Check PulseAudio sinks
# To switch to HDMI audio: recover activate-hdmi-audio.sh from git history
#   git show <pre-cleanup-sha>:bmo/docker/activate-hdmi-audio.sh > /tmp/activate-hdmi-audio.sh && bash /tmp/activate-hdmi-audio.sh
```

### Disk full
```bash
docker image prune -f          # Remove unused Docker images
sudo apt clean                 # Clear apt cache
du -sh ~/bmo/.audiocache/      # Check TTS cache size
rm -rf ~/bmo/.audiocache/*     # Clear TTS cache (regenerates on demand)
```

### Under-voltage warnings
```bash
vcgencmd get_throttled
# 0x50000 = historical under-voltage (past, not current)
# 0x50005 = ACTIVE under-voltage — use official 5V/5A PSU
```

### Discord alerts not firing
```bash
# Verify webhook URL is set
grep DISCORD_WEBHOOK_URL ~/bmo/.env
# Test manually
curl -X POST "$DISCORD_WEBHOOK_URL" -H "Content-Type: application/json" \
  -d '{"content": "Test alert from BMO"}'
```

### Backup failed
```bash
~/bmo/backup.sh                          # Run manually, check output
rclone lsd gdrive:                       # Verify Google Drive access
systemctl status bmo-backup.timer        # Check timer is active
journalctl -u bmo-backup.service -n 20   # Check last backup log
```
