# Data Flow

Where every kind of data lives, how it moves, and who owns it.

## Ownership rules

- **Each domain owns its own storage.** dnd-app and bmo never read each other's files.
- **Cross-domain data transfer = HTTP only.** (Not filesystem, not shared DB.)
- **Public content = tracked in git.** Runtime state + secrets = gitignored.

## Data map

### D&D 2024 content (read-only rules content)

| Kind | Location | Format | Size |
|---|---|---|---|
| Spells | `dnd-app/src/renderer/public/data/5e/spells/*.json` | JSON per spell | 395 files |
| Equipment | `dnd-app/src/renderer/public/data/5e/equipment/**/*.json` | JSON | 1121 files |
| Monsters | `dnd-app/src/renderer/public/data/5e/dm/npcs/monsters/**/*.json` | JSON | 654 files |
| Classes + subclasses | `dnd-app/src/renderer/public/data/5e/classes/*.json` | JSON | 61 files |
| Feats | `dnd-app/src/renderer/public/data/5e/feats/*.json` | JSON | 77 files |
| Origins (backgrounds/species) | `dnd-app/src/renderer/public/data/5e/origins/*.json` | JSON | 67 files |
| Game mechanics (conditions, damage types) | `dnd-app/src/renderer/public/data/5e/game/*.json` | JSON | 330 files |
| World data (planes, gods, cosmology) | `dnd-app/src/renderer/public/data/5e/world/*.json` | JSON | 231 files |
| Hazards, maps, rules reference | `dnd-app/src/renderer/public/data/5e/{hazards,maps,rules}/` | JSON | 55 files |

Source of truth. Built via `dnd-app/scripts/extract/` from the DMG/PHB/MM PDFs. Validated by `scripts/audit/ultimate-audit.ts`.

BMO maintains a mirror:
- `bmo/pi/data/5e/` — common subset BMO needs for agents (encounter-presets, conditions, random-tables, spells, magic-items)
- `bmo/pi/data/5e-references/` — markdown versions of rulebook content (MM2025, DMG2024, PHB2024)

### D&D reference PDFs (LFS)

| Kind | Location | Storage |
|---|---|---|
| PHB 2024 | `5.5e References/PHB2024/*.pdf` | Git LFS |
| DMG 2024 | `5.5e References/DMG2024/*.pdf` | Git LFS |
| MM 2025 | `5.5e References/MM2025/*.pdf` | Git LFS |

Gitignored locally after initial pull. Fetch on demand via `git lfs pull`. Total ~1.7 GB.

### User-generated game data (per-install)

**dnd-app writes to:**

| Kind | Windows path | Linux path |
|---|---|---|
| Characters | `%APPDATA%/dnd-vtt/characters/*.json` | `~/.config/dnd-vtt/characters/*.json` |
| Campaigns | `%APPDATA%/dnd-vtt/campaigns/*.json` | `~/.config/dnd-vtt/campaigns/*.json` |
| Homebrew content | `%APPDATA%/dnd-vtt/homebrew/*.json` | `~/.config/dnd-vtt/homebrew/*.json` |
| Game state (session) | RAM only, peerjs-synced across players | — |
| Book notes | `%APPDATA%/dnd-vtt/books/*.json` | `~/.config/dnd-vtt/books/*.json` |
| Image library | `%APPDATA%/dnd-vtt/images/` | `~/.config/dnd-vtt/images/` |
| Map library | `%APPDATA%/dnd-vtt/maps/` | `~/.config/dnd-vtt/maps/` |

Not in git. Each user has their own. Back up via OS-level tools (OneDrive, Time Machine, rsync).

### BMO runtime state

**Location:** `/home/patrick/home-lab/bmo/pi/data/` (canonical since 2026-04-23)

| File / dir | Purpose | Gitignored |
|---|---|---|
| `alarms.json` | User-set alarms | Yes |
| `alert_history.json` | Alert log | Yes |
| `bmo_social.db` | Discord social bot state (SQLite) | Yes |
| `campaign_memory.db` | Per-campaign long-term memory (SQLite) | Yes |
| `ide_jobs.json` | IDE background jobs | Yes |
| `ide_state.json` | IDE editor state | Yes |
| `location_cache.json` | Geolocation cache | Yes |
| `logs/dm-bot.log` | Discord DM bot log | Yes |
| `logs/social-bot.log` | Discord social bot log | Yes |
| `logs/unknown_notifications.jsonl` | Unmatched notifications | Yes |
| `logs/debug_stereo.wav` | Audio debug capture | Yes |
| `memory/<hash>/MEMORY.md` | Per-project agent memory | Yes |
| `monitor_state.json` | Service monitor snapshot | Yes |
| `monitor_alert_state.json` | Monitor alert tracking | Yes |
| `music_history.json` | Recently played tracks | Yes |
| `notes.json` | User notes | Yes |
| `play_counts.json` | Track play stats | Yes |
| `playback_state.json` | Current music position | Yes |
| `recent_chat.json` | Last N conversation turns | Yes |
| `settings.json` | User settings | Yes |

**BMO content (tracked):**

| Dir | Purpose |
|---|---|
| `games/` | Trivia + Adventure Time trivia JSON |
| `personality/` | Quips, adventure time quotes |
| `5e/` | D&D rules subset BMO uses for agents |
| `5e-references/` | Markdown rulebook references |
| `rag_data/` | Pre-built chunk indexes (anime, games, music, dnd, movies) |
| `commands/`, `playlists/`, `sfx/`, `indexes/` | Misc content |

### BMO agent memory (per-project)

When an agent works on a project, it writes insights to:
```
bmo/pi/data/memory/<project-hash>/MEMORY.md
```

`<project-hash>` is SHA of the project's root path (not predictable, opaque). Gitignored.

### BMO wake-word training

| Kind | Location |
|---|---|
| Wake model | `bmo/pi/wake/hey_bmo.onnx` (+ `.onnx.data`) |
| Training clips (WAV) | `bmo/pi/wake/clips/hey_bmo_01.wav` ... `_20.wav` |
| Voice profiles | `bmo/pi/data/voice_profiles.pkl` (gitignored) |

Model + clips are TRACKED (rare — training data usually isn't). Voice profiles are gitignored (private biometrics).

### Secrets (never tracked)

| Kind | Location | Format |
|---|---|---|
| LLM API keys | `bmo/pi/.env` + `.env` at root (dnd-app) | env vars |
| Google OAuth client secret | `bmo/pi/.env` + `bmo/pi/config/credentials.json` | JSON |
| Google OAuth tokens | `bmo/pi/config/token.json` | JSON |
| TV device RSA private key | `bmo/pi/tv_key.pem` | PEM |
| TV device cert | `bmo/pi/tv_cert.pem` | PEM |
| Discord bot tokens | `bmo/pi/.env` | env vars |
| Pi-hole admin, Ollama, Coturn creds | `bmo/pi/.env` | env vars |

Backup: whatever password manager you use. Never commit.

## Flow diagrams

### DM rolls initiative → BMO announces in Discord

```
DM clicks "Start Combat" in VTT
  └─► renderer: combat-resolver.ts updates game state (zustand)
       └─► peerjs broadcasts to players
       └─► main: bmo-bridge.ts POST /api/discord/initiative
            └─► HTTP :5000 → BMO
                 └─► bmo/pi/agents/vtt_sync.py receives
                      └─► formats initiative order
                      └─► bots/discord_dm_bot.py posts to #session channel
                           └─► Discord API
```

### Discord player rolls d20 → VTT chat panel updates

```
Player in Discord: /roll d20
  └─► Discord → bots/discord_dm_bot.py slash command handler
       └─► rolls dice, formats result
       └─► POST VTT_SYNC_URL (e.g., http://10.10.20.100:5001/sync)
            └─► dnd-app: main/ipc/bmo-sync-handlers.ts receives
                 └─► type: "discord_roll" → IPC to renderer
                      └─► renderer: ChatPanel.tsx adds roll message
```

### Agent writes to per-project memory

```
code_agent (in bmo/pi/agents/code_agent.py) finishes task
  └─► agents/memory.py: update_memory_section(project_hash, section, content)
       └─► writes to /home/patrick/home-lab/bmo/pi/data/memory/<hash>/MEMORY.md
            └─► future agents read this file for context
```

## Anti-patterns

- ❌ dnd-app reading `bmo/pi/data/*.json` directly — use HTTP
- ❌ BMO reading `%APPDATA%/dnd-vtt/characters/*.json` directly — use HTTP
- ❌ Storing user secrets in `dnd-app/src/` or `bmo/pi/` (anything but `.env`/`config/`)
- ❌ Writing new runtime state files to paths not under each domain's canonical data dir
- ❌ Committing any file matching `**/.env`, `**/credentials.json`, `**/token.json`, `**/*.pem`, `**/*.key`
