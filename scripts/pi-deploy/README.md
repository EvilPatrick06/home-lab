# Pi Deployment: VTT Sync Module

## What This Is

`vtt_sync.py` adds bidirectional state sync between the D&D VTT and BMO's Discord bot.

## Deploy Instructions

1. **Copy to Pi:**
   ```bash
   scp vtt_sync.py patrick@bmo:~/bmo/agents/vtt_sync.py
   ```

2. **Edit `~/bmo/agents/dnd_dm.py`** to import and use the sync module:
   ```python
   from vtt_sync import (
       register_sync_routes,
       push_discord_message,
       push_discord_roll,
       push_player_join,
       push_player_leave,
       vtt_state,
   )

   # In your Flask app setup:
   register_sync_routes(app)

   # In your Discord message handler:
   push_discord_message(author.name, message.content, character_name)

   # In your dice roll handler:
   push_discord_roll(author.name, "1d20+5", 18, character_name)
   ```

3. **Set VTT IP** (if not 10.10.20.100):
   ```bash
   export VTT_SYNC_URL=http://<YOUR_VTT_IP>:5001
   ```

4. **Restart BMO service:**
   ```bash
   sudo systemctl restart bmo
   ```

## Architecture

```
VTT (Electron)                    Pi (BMO)
─────────────                    ─────────
bmo-bridge.ts ──HTTP POST──→     Flask /api/discord/dm/sync/*
  sendInitiativeToPi()              → vtt_state cache
  sendGameStateToPi()               → Discord embeds

sync receiver :5001 ←──HTTP──    vtt_sync.py
  POST /api/sync                    push_discord_message()
  POST /api/sync/initiative         push_discord_roll()
  GET  /api/sync/health             push_player_join/leave()
```
