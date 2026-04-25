# BMO Services

Service modules in `bmo/pi/services/` — business logic used by agents + Flask routes.

## Services index

### Voice + audio (4)

| Module | Purpose |
|---|---|
| `voice_pipeline.py` | STT → agent invocation → TTS loop. Wake-word listens, triggers pipeline. |
| `voice_personality.py` | Persona injection — wraps responses with "BMO-ness". |
| `bmo_say.py` | TTS dispatcher (Fish Audio primary, Piper fallback). |
| `audio_output_service.py` | Routes audio to HDMI, Bluetooth, or USB speakers. |

### Calendar + time (4)

| Module | Purpose |
|---|---|
| `calendar_service.py` | Google Calendar read/write via OAuth. |
| `authorize_calendar.py` | One-time OAuth authorization flow (run at setup). |
| `reauth_calendar.py` | Re-authorize after token expiration. |
| `timer_service.py` | Named timers + alarms. Persists to `data/alarms.json`. |

### External integrations (5)

| Module | Purpose |
|---|---|
| `weather_service.py` | Open-Meteo API + caching. Uses `location_service` for coords. |
| `location_service.py` | Geolocation polling (Google geocoding). Cached at `data/location_cache.json`. |
| `music_service.py` | YouTube Music (ytmusicapi) + VLC playback. Persists `data/{music_history,play_counts,playback_state}.json`. |
| `smart_home.py` | Chromecast discovery + control. |
| `tv_worker.py` | ADB subprocess wrapper for TV control (isolates ADB state from main process; TV routes in `app.py`). |

### Notifications + alerts (3)

| Module | Purpose |
|---|---|
| `notification_service.py` | Android notification ingestion + classification. |
| `alert_service.py` | User-facing alerts. Persists to `data/alert_history.json`. |
| `monitoring.py` | Service + hardware health checker. Alerts via Discord webhook. |

### Scenes + routines (2)

| Module | Purpose |
|---|---|
| `scene_service.py` | Scene triggers (morning, evening, party time, etc.) — LED + audio + TV composed. |
| `routine_service.py` | Cron-like scheduled tasks (daily briefing, etc.). |
| `list_service.py` | Generic list management (shopping, TODO). |

### D&D (2)

| Module | Purpose |
|---|---|
| `dnd_engine.py` | Dice roller, rules lookups, encounter-building helpers for `dnd_dm` agent. |
| `campaign_memory.py` | SQLite-backed long-term campaign memory. `data/campaign_memory.db`. |

### AI / RAG (3)

| Module | Purpose |
|---|---|
| `cloud_providers.py` | LLM provider abstraction: Anthropic, Gemini, OpenAI, Groq. |
| `rag_search.py` | Retrieval over pre-built chunk indexes in `data/rag_data/`. |
| `build_rag_indexes.py` | Offline script to rebuild RAG indexes. |
| `personality_engine.py` | Injects personality from `data/personality/{quips,adventure_time_quotes}.json`. |

## Ports

| Port | Served by | Purpose |
|---|---|---|
| 5000 | `app.py` (Flask) | Main HTTP + WebSocket |
| 5001 | `ide_app/ide_app.py` | Embedded web IDE (optional) |
| 5002 | (reserved) | future |

BMO's services run inside the main Flask process on :5000. They share an `init_services()` lifecycle.

## HTTP endpoint map (partial)

Full map in source — use `grep "@app.route" bmo/pi/app.py` for current list.

### Meta

| Path | Method | Returns |
|---|---|---|
| `/health` | GET | `{"status":"ok"}` |
| `/api/health/full` | GET | Pi stats + service statuses |

### Chat / agents

| Path | Method | Purpose |
|---|---|---|
| `/api/chat` | POST (SSE) | Stream chat with agent router |
| `/api/agent/:name/invoke` | POST | Directly invoke one agent |

### Music

| Path | Method | Purpose |
|---|---|---|
| `/api/music/state` | GET | Current playback state |
| `/api/music/play` | POST | Play by track/search |
| `/api/music/pause` | POST | Pause |
| `/api/music/resume` | POST | Resume |
| `/api/music/skip` | POST | Next track |
| `/api/music/search` | GET `?q=...` | Search YT Music |

### Calendar

| Path | Method | Purpose |
|---|---|---|
| `/api/calendar/events` | GET `?days=7` | Upcoming events |
| `/api/calendar/create` | POST | Create event |

### Timers

| Path | Method | Purpose |
|---|---|---|
| `/api/timers` | GET | List active timers |
| `/api/timers` | POST | Create (body: `{"name":...,"duration_sec":...}`) |
| `/api/timers/:id` | DELETE | Cancel |

### Discord control (from VTT)

| Path | Method | Purpose |
|---|---|---|
| `/api/discord/start-session` | POST | Start D&D Discord session |
| `/api/discord/end-session` | POST | End session |
| `/api/discord/initiative` | POST | Push initiative order to Discord channel |
| `/api/discord/narrate` | POST | Narrate text to current session channel |

### IDE

| Path | Method | Purpose |
|---|---|---|
| `/ide` | GET | Render IDE UI |
| `/api/ide/*` | various | IDE job management (runs on :5001 primarily) |

### System / settings

| Path | Method | Purpose |
|---|---|---|
| `/api/settings` | GET | Read settings.json |
| `/api/settings` | POST | Write settings.json |
| `/api/system/wifi` | GET | Wifi status |
| `/api/system/restart` | POST | Restart a systemd service |

## WebSocket events (SocketIO)

Emit from server → client:

| Event | Payload | When |
|---|---|---|
| `voice_state` | `{"state":"listening"|"processing"|"speaking"}` | Voice pipeline state change |
| `music_state` | `{"state":"playing|paused|stopped", "track":{...}}` | Music state change |
| `weather_update` | `{...}` | New weather data |
| `notification` | `{"title","body","priority"}` | New alert |
| `agent_response` | `{"agent","text","delta"}` | Agent streaming chunk |

Client → server:

| Event | Payload | Purpose |
|---|---|---|
| `chat_message` | `{"text"}` | Send text to agent |
| `voice_start` | `{}` | Manual voice trigger (for devices without wake-word) |
| `request_state` | `{"service"}` | Ask for current state |

## Flask config

```python
app = Flask(__name__, template_folder="web/templates", static_folder="web/static")
```

Templates at `bmo/pi/web/templates/*.html`. Static at `bmo/pi/web/static/`. If you add a new `render_template("foo.html")`, create `bmo/pi/web/templates/foo.html`.

## Adding a new service

1. Create `bmo/pi/services/my_service.py`
2. Initialize in `app.py:init_services()`:
   ```python
   try:
       from services.my_service import MyService
       my_service = MyService(socketio=socketio)
       service_map["my_service"] = my_service
       print("[bmo]   MyService: OK")
   except Exception as e:
       print(f"[bmo]   MyService: SKIPPED ({e})")
   ```
3. Add HTTP routes if needed in `app.py`
4. Add test in `bmo/pi/tests/test_my_service.py`
5. Document above
6. Restart BMO

## Debugging services

```bash
# Which services initialized successfully?
journalctl -u bmo --since "5 min ago" --no-pager | grep -E "\[bmo\].*:\s+(OK|SKIPPED)"

# Failing service? Get full traceback
journalctl -u bmo -f
# Then in another terminal: send a request that exercises that service
curl http://localhost:5000/api/<service>/state
```
