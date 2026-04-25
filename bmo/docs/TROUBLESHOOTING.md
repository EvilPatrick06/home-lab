# BMO Troubleshooting

Common failures + fixes. Also check [`../../docs/BMO-ISSUES-LOG.md`](../../docs/BMO-ISSUES-LOG.md) for logged BMO bugs and [`../../docs/BMO-SUGGESTIONS-LOG.md`](../../docs/BMO-SUGGESTIONS-LOG.md) for design-gotchas.

## BMO won't start

```bash
sudo systemctl status bmo
journalctl -u bmo -n 50 --no-pager
```

Common causes:

### Import error

- **Symptom:** `ModuleNotFoundError: No module named 'services.X'`
- **Fix:** Check `bmo/pi/services/__init__.py` exists. Check `cd bmo/pi && ./venv/bin/python -c "from services import X"`.

### Python venv broken

- **Symptom:** `/home/patrick/home-lab/bmo/pi/venv/bin/python: not found`
- **Fix:** Rebuild venv: `cd bmo/pi && bash scripts/install-venv.sh` (installs **CPU-only** `torch` first — avoids a multi‑GB CUDA stack on Pi). Or the manual two-step: `python3.11 -m venv venv && ./venv/bin/pip install --upgrade pip && ./venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu && ./venv/bin/pip install -r requirements.txt`

### Port 5000 occupied

- **Symptom:** `OSError: [Errno 98] Address already in use`
- **Fix:** `sudo lsof -i :5000` → kill the process OR change port in `app.py`.

### .env missing / wrong

- **Symptom:** `KeyError: 'ANTHROPIC_API_KEY'` or `401 Unauthorized` from LLM
- **Fix:** Copy `bmo/.env.template` to `bmo/pi/.env`, fill in keys. Restart.

## Voice not working

### Wake-word not triggering

- **Check audio input:** `pactl list short sources` — is your mic detected?
- **Check wake-word model exists:** `ls -la bmo/pi/wake/hey_bmo.onnx`
- **Check openwakeword logs:** `journalctl -u bmo | grep -i "wake"`
- **Fallback active?** If logs say "openwakeword not available, using energy+STT fallback" — that still works, just less accurate. See [BMO-ISSUES-LOG.md](../../docs/BMO-ISSUES-LOG.md) for the model file issue.

### STT fails

- **Symptom:** `[stt] Local STT failed (No module named 'faster_whisper'), falling back to Groq` + Groq also fails
- **Fix:** Check `GROQ_API_KEY` in `.env`. Check internet. Install faster_whisper for local fallback: `./venv/bin/pip install faster-whisper`.

### TTS robotic / wrong voice

- **Symptom:** BMO speaks with Piper's default voice (female American English) instead of Fish Audio
- **Fix:** Check `FISH_AUDIO_API_KEY` + `FISH_AUDIO_VOICE_ID` in `.env`. Fish Audio has rate limits — check quota at [https://fish.audio/account](https://fish.audio/account).

### No audio output

- **Check sinks:** `pactl list short sinks` — is HDMI/Bluetooth speaker present?
- **Restart PipeWire:** `systemctl --user restart pipewire wireplumber`
- **Check ALSA:** `aplay -l` — device listed?

## Discord bots offline

```bash
systemctl status bmo-dm-bot bmo-social-bot
journalctl -u bmo-dm-bot -n 50 --no-pager
```

### Token invalid

- **Symptom:** `discord.errors.LoginFailure: Improper token has been passed.`
- **Fix:** Re-copy token from [https://discord.com/developers/applications](https://discord.com/developers/applications) → Bot → Reset Token. Update `.env`. Restart.

### Bot shows as online but commands don't work

- **Cause:** Slash commands didn't register.
- **Fix:** Restart the bot. On first run after changes, bots register commands (can take a minute for Discord to sync globally).

### Bot can't reach Flask

- **Symptom:** `requests.exceptions.ConnectionError: ... http://localhost:5000/ ...`
- **Fix:** Is `bmo.service` running? Bots talk to main BMO via localhost:5000.

## Kiosk (touchscreen) not displaying

### Chromium window not appearing

```bash
systemctl status bmo-kiosk
journalctl -u bmo-kiosk -n 50 --no-pager
```

- **Cause:** Graphics session not ready at boot, OR bmo.service `/health` not responding.
- **Fix 1:** Wait 30-60s after boot. Kiosk polls /health up to 30 times.
- **Fix 2:** Manually restart: `sudo systemctl restart bmo-kiosk`
- **Fix 3:** If `/health` hangs, see "HTTP endpoints hang" below.

### Kiosk shows but touch doesn't work

- **Cause:** Touchscreen input device not initialized.
- **Fix:** Check xinput list OR reboot the Pi. Chromium needs touchscreen to be detected at launch.

## HTTP endpoints hang

- **Symptom:** `curl http://localhost:5000/health` times out but service is "active"
- **Cause:** gevent workers blocked by slow operation (see BMO-ISSUES-LOG.md).
- **Quick fix:** `sudo systemctl restart bmo`
- **Diagnose:** `ss -tnp | grep 5000` — many CLOSE-WAIT = worker exhaustion

## Google Calendar broken

### `invalid_grant: Bad Request`

- **Cause:** OAuth token expired or revoked. Refresh tokens can become invalid after prolonged inactivity, password changes, or manual revocation.
- **Fix (headless Pi):** print URL, paste the auth code (writes `bmo/pi/config/token.json`):
  ```bash
  cd ~/home-lab/bmo/pi
  ./venv/bin/python services/reauth_calendar.py
  sudo systemctl restart bmo
  ```
- **Fix (machine with a browser):** `cd ~/home-lab/bmo/pi && ./venv/bin/python services/authorize_calendar.py` (local server OAuth). Ensure tokens live in **`bmo/pi/config/`** only; do not add a second `token.json` under `services/config/`.

### `credentials.json missing`

- **Fix:** Download OAuth client JSON from [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) → save to `bmo/pi/config/credentials.json`.

## Fan control broken

### Fan stuck at max speed / off

- **Check I2C:** `i2cdetect -y 1` — fan controller should appear (usually at 0x0D for Argon ONE, check your hat docs)
- **Check bmo-fan service:** `journalctl -u bmo-fan -n 20 --no-pager`
- **Hardware:** `sudo raspi-config` → Interfaces → I2C enabled?

## Disk full

```bash
df -h /                           # root fs
du -sh ~/home-lab/bmo/pi/venv          # expect ~1–2 GB with CPU-only torch; multi-GB if CUDA stack slipped in
du -sh ~/home-lab/bmo/pi/data/logs     # logs grow
du -sh ~/.cache/chromium-bmo      # kiosk cache grows
```

### Prune BMO logs

```bash
sudo journalctl --vacuum-time=7d      # systemd logs
find ~/home-lab/bmo/pi/data/logs -name "*.log" -mtime +7 -delete
rm -rf ~/.cache/chromium-bmo/Default/Cache/*
```

## MCP servers fail to initialize

- **Symptom:** `[mcp] Initialized: 0/3 servers, 0 tools`
- **Fix:** Tracked in [BMO-ISSUES-LOG.md](../../docs/BMO-ISSUES-LOG.md). Probably path issue in `mcp_servers/mcp_settings.json` or server script crashing.

## Service keeps restarting

```bash
systemctl show bmo --property=NRestarts
journalctl -u bmo --since "30 min ago" | grep -iE "error|traceback"
```

- **Cause:** Service crashes repeatedly.
- **Diagnose:** Find the traceback in logs.
- **Workaround:** Temporarily disable auto-restart to stop the crash loop: `sudo systemctl stop bmo; sudo systemctl disable bmo` — fix the bug, then re-enable.

## Performance: Pi slow / overheating

```bash
vcgencmd measure_temp                   # should be < 80°C
vcgencmd get_throttled                  # should be 0x0
top -bn1 | head -20                     # top processes
free -h                                 # RAM
```

- **CPU throttling (>80°C):** Check fan working. Clean dust. Move to cooler location.
- **Memory pressure:** Check Ollama isn't loaded if not using it. `docker stop bmo-ollama` (containers are launched directly via `docker run` from `setup-bmo.sh`, not compose).
- **Disk I/O:** Move to NVMe SSD with `bmo/finalize-ssd.sh`.

## Recovery from catastrophic failure

1. Stop all services:
  ```bash
   sudo systemctl stop bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot
  ```
2. Check for runaway processes:
  ```bash
   ps aux | grep -E "python|chromium" | grep -v grep
   sudo kill <stuck PIDs>
  ```
3. Reset to known good state:
  ```bash
   cd /home/patrick/home-lab
   git fetch origin
   git reset --hard origin/master    # careful: loses local changes
  ```
4. Rebuild venv if Python messed up (CPU `torch` first — see `scripts/install-venv.sh`):
  ```bash
   cd bmo/pi
   rm -rf venv __pycache__
   bash scripts/install-venv.sh
  ```
5. Restart services one at a time:
  ```bash
   sudo systemctl start bmo
   sleep 15 && curl http://localhost:5000/health   # should respond
   sudo systemctl start bmo-fan bmo-dm-bot bmo-social-bot bmo-kiosk
  ```

## Still stuck?

1. Search [`BMO-ISSUES-LOG.md`](../../docs/BMO-ISSUES-LOG.md) and [`BMO-SUGGESTIONS-LOG.md`](../../docs/BMO-SUGGESTIONS-LOG.md)
2. Check recent commits: `cd ~/home-lab && git log --oneline -20`
3. Ask an AI agent (Cursor/Claude/Gemini) — they have all the context via `AGENTS.md`
4. File an issue on GitHub with:
  - What you were doing
  - Full error + stack trace
  - Output of `systemctl status bmo` + `journalctl -u bmo -n 50 --no-pager`

