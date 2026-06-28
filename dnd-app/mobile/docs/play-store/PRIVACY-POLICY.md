# Privacy Policy — Dungeon Table Online (Mobile)

_Last updated: 2026-06-28. Live at https://bmo.mybmoai.work/DungeonTableOnline/privacy.html Host this at a public URL and link it in the
Play Console listing and the in-app Settings._

## Summary

Dungeon Table Online stores your game data **on your device**. It does not run
its own analytics or advertising. Multiplayer connects you directly to other
players (peer-to-peer) and to an optional self-hosted backend you or the host
choose to use.

## What is stored on your device

Characters, campaigns, settings, and saved game state are kept locally in the
app's on-device database (SQLite). Uninstalling the app deletes this data.

## Data shared during multiplayer

When you host or join a table, your chosen display name, character data you
share, and in-game actions/chat are sent **directly to the other players** in
that session over an encrypted peer-to-peer (WebRTC) connection. A lightweight
game-discovery registry may receive a game's public listing metadata (name,
invite code, player counts) while it is advertised; it does not receive your
characters or chat.

## Optional integrations (off by default)

- **AI Dungeon Master:** if you enable it and supply your own API key (Claude,
  OpenAI, Gemini) or point at your own local/self-hosted model, your prompts and
  relevant game context are sent to that provider/endpoint under their terms.
  No AI features call any third party unless you configure them.
- **Self-hosted backend (BMO Pi):** optional features (narration, Discord relay,
  cloud backup) only contact the backend URL you configure.

## Permissions

- **Internet / network state:** multiplayer connectivity and optional backends.
- **Microphone (optional):** only used if you enable voice features; never
  recorded or uploaded by the app itself.

## Children

The app is not directed to children under 13. Do not share personal information
in multiplayer chat.

## Contact

datdude365d@gmail.com
