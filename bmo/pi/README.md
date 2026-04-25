# bmo/pi

Python runtime code for BMO. This is what actually runs on the Raspberry Pi 5.

## Layout

```
pi/
├── app.py                       Flask entry — starts HTTP on port 5000 + WebSocket
├── agent.py                     Agent router entry (used by CLI + app)
├── cli.py                       REPL/CLI — `./venv/bin/python cli.py`
│
├── agents/                      41 AI agents — each owns one capability
│   ├── __init__.py, _registry.py
│   ├── base_agent.py            base class + interface
│   ├── orchestrator.py          top-level director
│   ├── router.py                3-tier intent classifier
│   ├── conversation.py          conversation state management
│   ├── memory.py                per-project memory files
│   ├── scratchpad.py            ephemeral agent scratch
│   ├── settings.py              user/project settings resolution
│   ├── hooks.py, custom_commands.py, project_context.py
│   ├── mcp_client.py, mcp_manager.py
│   ├── vtt_sync.py              BMO↔dnd-app (VTT) bridge
│   ├── alert_agent.py, calendar_agent.py, cleanup_agent.py, code_agent.py,
│   ├── deploy_agent.py, design_agent.py, dnd_dm.py, docs_agent.py,
│   ├── encounter_agent.py, learning_agent.py, list_agent.py, lore_agent.py,
│   ├── monitoring_agent.py, music_agent.py, npc_dialogue_agent.py,
│   ├── plan_agent.py, research_agent.py, review_agent.py, routine_agent.py,
│   ├── rules_agent.py, security_agent.py, session_recap_agent.py,
│   ├── smart_home_agent.py, test_agent.py, timer_agent.py, treasure_agent.py,
│   └── weather_agent.py
│
├── services/                    Service modules — business logic
│   ├── alert_service.py, audio_output_service.py, calendar_service.py,
│   ├── list_service.py, location_service.py, music_service.py,
│   ├── notification_service.py, routine_service.py, scene_service.py,
│   ├── timer_service.py, weather_service.py
│   ├── voice_pipeline.py        STT → agent → TTS loop
│   ├── voice_personality.py     persona injection
│   ├── bmo_say.py               TTS helper (Fish Audio + piper fallback)
│   ├── personality_engine.py    adventure time quotes + quips
│   ├── rag_search.py            RAG over indexed docs
│   ├── build_rag_indexes.py     index builder
│   ├── authorize_calendar.py, reauth_calendar.py    Google OAuth flows
│   ├── cloud_providers.py       LLM provider abstraction (Anthropic, Gemini, OpenAI, Groq)
│   ├── smart_home.py, tv_controller.py, tv_worker.py    Chromecast + TV control
│   ├── sound_effects.py, dnd_engine.py, campaign_memory.py
│   └── monitoring.py            service+hardware health
│
├── hardware/                    Pi hardware drivers
│   ├── fan_control.py           I2C fan speed curve (smbus, 400 Hz PWM)
│   ├── led_controller.py        WS2812B LED strip (GPIO 18)
│   ├── oled_face.py             SH1106 OLED face display
│   ├── camera_service.py        picamera2 + USB webcam fallback
│   ├── list_audio_devs.py       Audio device enumeration (PulseAudio/PipeWire)
│   ├── 51-hdmi-default.conf     ALSA default HDMI audio
│   ├── 99-noise-suppression.conf   PulseAudio noise suppression
│   └── wireplumber-logind-fix.lua  session fix for WirePlumber
│
├── bots/                        Discord bots (NAMED bots/ NOT discord/ — shadows discord.py)
│   ├── discord_dm_bot.py        D&D DM bot (player-facing, invites to session)
│   └── discord_social_bot.py    Social bot (casual server, music, games)
│
├── dev/                         Dev tools — NOT used in production
│   ├── claude_tools.py, dev_tools.py, file_watcher.py, terminal_service.py
│   ├── patch_debug.py, patch_keepalive.py, patch_retry.py, patch_revert.py, patch_wol.py
│   ├── revert_power.py, bmo_ui_lab_server.py   (webcam/YT/Calendar lab; uses web/templates)
│   ├── benchmark_audio.py, benchmark_full.py, benchmark_llm.py, benchmark_personality.py
│   ├── benchmarks/              thinking_budget_sweep.py, gemini_stream_probe.py (live API)
│   └── diagnostics/            aec_pipewire_check.py, wake_word_{auto,timed,debug}.py
│
├── wake/                        Wake-word detection
│   ├── hey_bmo.onnx             Custom trained model
│   ├── hey_bmo.onnx.data
│   ├── record_wake_clips.py     Record training samples (16kHz mono WAV)
│   ├── enroll_gavin.py          Voice profile enrollment
│   └── clips/                   20 training WAV files
│
├── web/                         Flask UI assets
│   ├── templates/               Jinja2 HTML (index.html, ide.html)
│   └── static/                  CSS, JS, favicon, img/, ide/, vendor/ (hljs, marked)
│
├── mcp_servers/                 Model Context Protocol servers
│   ├── dnd_data_server.py       Serves D&D data to agents via MCP
│   └── mcp_settings.json        MCP config
│
├── ide_app/                     Embedded web IDE — self-contained Flask sub-app on port 5001
│   ├── bmo-ide.service
│   ├── ide_app.py
│   ├── templates/ide.html
│   └── static/ide.{css,js}
│
├── kiosk/                       Systemd services for kiosk mode + bots
│   ├── bmo-kiosk.service        Chromium fullscreen on HDMI
│   ├── bmo-dm-bot.service       → python -m bots.discord_dm_bot
│   ├── bmo-social-bot.service   → python -m bots.discord_social_bot
│   └── install-kiosk.sh
│
├── scripts/                     Operational scripts (bash + python)
│   ├── apply-access-config.sh, cloudflare-access-api.sh,
│   ├── diagnose-cloudflare.sh, setup-cloudflare-tunnel.sh, setup-tailscale.sh
│   ├── e2e_test.sh, health_check.sh
│   ├── win_proxy.py             Windows WSL2 proxy helper
│   └── apply_patch.py           Deploy BMO agent patches from laptop
│
├── tests/                       Pytest — 650+ unit tests
│   ├── conftest.py              Shared fixtures (mocks Pi hardware for cross-OS runs)
│   ├── test_app_endpoints.py, test_audio_output.py, test_calendar_service.py,
│   ├── test_claude_tools.py, test_dev_tools.py, test_ide_app.py,
│   ├── test_monitoring.py, test_music_service.py, test_shell_scripts.py,
│   ├── test_timer_service.py, test_voice_pipeline.py, test_weather_service.py,
│   ├── test_calendar_auth_paths.py, test_monitoring_health.py, test_music_restore.py
│   └── agents/
│       ├── test_0_routing_accuracy.py, test_base_agent.py
│
├── data/                        Canonical data (content + runtime state)
│   ├── games/                   Trivia, Adventure Time trivia
│   ├── personality/             Quips, quotes
│   ├── 5e/                      D&D rules cache (encounter-presets, conditions, magic-items, spells, ...)
│   ├── 5e-references/           Markdown rules (MM2025, DMG2024, PHB2024)
│   ├── rag_data/                Pre-built chunk indexes (anime, games, music, dnd, movies)
│   ├── commands/, playlists/, sfx/, indexes/, memory/, logs/
│   └── (runtime state: alarms.json, alert_history.json, ide_jobs.json, location_cache.json,
│        monitor_state.json, music_history.json, notes.json, play_counts.json,
│        playback_state.json, recent_chat.json, settings.json, bmo_social.db, campaign_memory.db)
│
├── config/                      Gitignored secrets (credentials.json, token.json)
├── venv/                        Python 3.11 venv (gitignored)
├── requirements.txt             Runtime deps
├── requirements-ci.txt          Same for GitHub Actions (no Pi hardware wheels)
├── requirements-test.txt        Test deps (pytest, pytest-asyncio)
├── pytest.ini
├── tailwind.config.js
└── README.md (this file)
```

## Import rules

Always use subpackage prefix:

```python
from services.calendar_service import CalendarService     # ✓
from calendar_service import CalendarService              # ✗ bare (breaks post-reorg)

from hardware.fan_control import FanController            # ✓
from bots.discord_dm_bot import DMBot                     # ✓
from dev.claude_tools import invoke                       # ✓
from wake.enroll_gavin import enroll                      # ✓
```

`import discord` = `discord.py` library (installed via pip).
Our bots are under `bots/` precisely to avoid shadowing.

## Running

```bash
cd /home/patrick/home-lab/bmo/pi
./venv/bin/python app.py                    # dev run (port 5000)
./venv/bin/python cli.py                    # interactive REPL
./venv/bin/python -m bots.discord_dm_bot    # manual DM bot run
```

Production = systemd. See [`../docs/SYSTEMD.md`](../docs/SYSTEMD.md).

## Testing

```bash
./venv/bin/python -m pytest                         # all
./venv/bin/python -m pytest tests/test_X.py -v      # one file
./venv/bin/python -m pytest -m "not live"           # skip API-hitting tests
./venv/bin/python -m pytest -m "not hardware"       # skip Pi-hardware tests
```

**CI:** GitHub Actions runs the same command (`python -m pytest tests/ -q` from this directory) on pushes/PRs that touch `bmo/**` — see `.github/workflows/bmo-pi-pytest.yml`. Installs from `requirements-ci.txt` (runtime deps without Pi-only wheels) plus `requirements-test.txt`. When you add runtime dependencies, update both `requirements.txt` and `requirements-ci.txt` unless the new package is Pi hardware-only.

### Next steps (maintenance)

1. **Confirm the workflow** — Open the repo **Actions** tab and ensure **bmo / pi pytest** passes on `master` after the workflow file landed; if it fails, check logs (often a missing system package, new import, or `requirements-ci.txt` drift from `requirements.txt`).
2. **Keep CI requirements in sync** — Edits to `requirements.txt` that are not RPi/smbus/luma/spidev should be mirrored in `requirements-ci.txt` so the job does not break on the next run.
3. **Optional: cloud stub alignment** — Some tests use `sys.modules["cloud_providers"]` while the app imports `services.cloud_providers`; consolidating stubs reduces bad `patch()` targets and accidental real API calls.
4. **Optional: repo security** — GitHub’s Dependabot alerts (see Security tab) are separate from bmo; triage when you have time, especially critical/high.
5. **Optional: local untracked paths** — If `bmo/pi/data/dnd_sessions/` or `bmo/pi/hardware/data/` should never be committed, add them to `.gitignore`; if they are artifacts to keep, document or ignore as appropriate.

## Common tasks

**Add a new agent:**
1. `agents/my_agent.py` → subclass `base_agent.BaseAgent`
2. Register in `agents/_registry.py`
3. Add keywords/prefix mappings in `agents/router.py` (or let orchestrator fall through)
4. Add test: `tests/agents/test_my_agent.py`
5. Document in `../docs/AGENTS.md`

**Add a new service:**
1. `services/my_service.py`
2. Initialize in `app.py:init_services()`
3. Wire up routes in `app.py`
4. Add test: `tests/test_my_service.py`
5. Document in `../docs/SERVICES.md`

**Add a new Discord slash command:**
1. Edit `bots/discord_dm_bot.py` or `bots/discord_social_bot.py`
2. Restart: `sudo systemctl restart bmo-dm-bot` (or social)
3. Slash commands auto-register on bot startup

**Change hardware config (fan curve, LED pattern):**
1. Edit `hardware/fan_control.py` or `hardware/led_controller.py`
2. Restart: `sudo systemctl restart bmo-fan` (for fan) OR `sudo systemctl restart bmo` (for LED, since LED runs inside main app)

## Paths

All BMO code uses canonical paths:
- Data: `/home/patrick/home-lab/bmo/pi/data/`
- Wake: `/home/patrick/home-lab/bmo/pi/wake/`
- Web: `/home/patrick/home-lab/bmo/pi/web/`

Legacy `~/bmo/` paths have been rewritten. If you find one, it's a bug — log in [`../../docs/BMO-ISSUES-LOG.md`](../../docs/BMO-ISSUES-LOG.md).
