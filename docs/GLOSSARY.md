# Glossary

Plain-English definitions for terms you'll see in this repo. Grouped by topic. Beginner-friendly.

## D&D / gameplay

- **DM** — Dungeon Master, the player who runs the game (describes world, voices NPCs, adjudicates rules)
- **VTT** — Virtual Tabletop, a digital version of the D&D battle map + tools. "dnd-app" is the VTT.
- **Campaign** — a connected series of D&D sessions with a persistent world + characters
- **Session** — a single play meeting (usually 3-5 hours)
- **Initiative** — turn order in combat, rolled each encounter
- **Encounter** — a combat or challenge scene (monsters, traps, social)
- **5e / 5.5e / 2024** — D&D 5th edition (2014) / revised 2024 rules. This app targets the 2024 "Player's Handbook 2024" revision.
- **Bastion** — new in 2024 rules: a player's personal base of operations
- **NPC** — Non-Player Character (any character not controlled by a player)
- **Stat block** — a monster/NPC's game stats in a standard format (HP, AC, abilities, attacks)
- **PHB / DMG / MM** — Player's Handbook / Dungeon Master's Guide / Monster Manual (the core 3 rulebooks)
- **LFS** — Git Large File Storage. We use it for rulebook PDFs (too big for regular git).

## Our apps

- **BMO** — (pronounced "beemo") Adventure Time character, name of our Pi voice assistant. Lives in a 3D-printed BMO case.
- **BMO Kiosk** — the BMO Pi's HDMI touchscreen UI (Chromium fullscreen).
- **Discord DM Bot** — a Discord bot that relays between D&D players on Discord and the VTT
- **VTT Sync Receiver** — HTTP server running inside the VTT that accepts callbacks from BMO
- **dnd-app** — the Electron VTT (in `dnd-app/` dir). Confusingly also the repo name.

## AI / LLM

- **LLM** — Large Language Model (Claude, Gemini, GPT, etc.)
- **Claude** — Anthropic's LLM. BMO uses it for D&D DM + code agent.
- **Gemini** — Google's LLM. BMO uses it for routing + general chat.
- **Groq** — fast LLM inference service. BMO uses it for Whisper STT.
- **Whisper** — OpenAI's speech-to-text model. Groq hosts a fast version.
- **Fish Audio** — TTS provider with cloned voices. BMO's voice runs on Fish Audio.
- **Piper** — local open-source TTS. BMO uses it as fallback if Fish Audio fails.
- **RAG** — Retrieval-Augmented Generation. Stuffs relevant docs into LLM context for better answers.
- **MCP** — Model Context Protocol. Standardized way for LLMs to talk to external tools/servers.
- **Agent** — a focused LLM-driven unit that does one thing well. BMO has 41.
- **Orchestrator** — the agent that decides which other agents to invoke.
- **Router** — BMO's intent classifier (maps user message → which agent should handle it).
- **STT / TTS** — Speech-to-Text / Text-to-Speech.

## Tech stack

- **Electron** — framework for building desktop apps with web tech (Chromium + Node.js). dnd-app uses it.
- **Vite** — bundler/dev-server (faster than Webpack). dnd-app uses electron-vite wrapper.
- **React** — UI library. dnd-app uses React 19.
- **zustand** — small React state management library.
- **Flask** — Python web framework. BMO uses it for HTTP API.
- **SocketIO** — real-time WebSocket library. BMO uses Flask-SocketIO for voice UI.
- **gevent** — Python greenlet/coroutine library. Monkey-patches stdlib for async I/O. BMO needs it for SocketIO.
- **pytest** — Python test framework.
- **vitest** — JavaScript test framework (Vite-native).
- **biome** — fast Rust-based linter + formatter (replaces ESLint + Prettier).
- **tiptap** — rich text editor (notes, descriptions). dnd-app uses it.
- **pixi.js** — 2D WebGL rendering. dnd-app uses it for token map.
- **three.js** — 3D rendering. dnd-app uses it for 3D dice.
- **cannon-es** — physics engine. dnd-app uses it for dice physics.
- **peerjs** — WebRTC peer-to-peer library. dnd-app uses it for multiplayer.
- **zod** — TypeScript runtime type validation.

## Pi hardware / OS

- **Raspberry Pi 5** — the single-board computer running BMO (16GB RAM).
- **Raspberry Pi OS** — Debian-based Linux for Pi.
- **systemd** — Linux service manager. Our 5 BMO services are systemd units.
- **journalctl** — query systemd logs.
- **I2C** — low-speed hardware bus. Pi fan + OLED connect via I2C.
- **GPIO** — General Purpose Input/Output pins. LED strip uses GPIO 18.
- **PipeWire / PulseAudio / WirePlumber** — Linux audio stack (in increasing order of abstraction).
- **ALSA** — low-level Linux audio API.
- **SSD** — Solid State Drive. Pi can boot from NVMe SSD via PCIe hat.
- **Cloudflare Tunnel** — secure inbound tunnel (no port forwarding needed) for remote access.
- **Tailscale** — mesh VPN. Makes Pi reachable from anywhere by hostname.

## Git / workflow

- **Commit** — a saved snapshot of changes.
- **Branch** — a line of development. `master` is main. Feature branches for work-in-progress.
- **Merge** — combine branches' changes.
- **Rebase** — replay commits on top of another branch.
- **Remote** — a git server (GitHub, in our case `origin` → `github.com/EvilPatrick06/home-lab`).
- **Force push** — overwrite remote history. Dangerous — only use with `--force-with-lease` or after explicit confirmation.
- **git-filter-repo** — tool for rewriting entire git history. Useful if you ever need to remove a file from all commits (not just going forward).
- **Pre-commit hook** — runs before `git commit`. Useful for blocking secret commits.
- **PR / Pull Request** — GitHub's UI for proposing changes from a branch.

## Our structure terms

- **Monorepo** — one git repo containing multiple related projects. We have dnd-app + bmo in one.
- **Domain** — a top-level folder representing one app/service boundary (`dnd-app/`, `bmo/`).
- **Canonical path** — the one true location for something. Non-canonical = bugged.
- **Subpackage** — a Python dir with `__init__.py`. Counts as a namespace.
- **Feature-based** — organized by what code does (inventory, combat, calendar). Opposite of type-based.
- **Type-based** — organized by kind of file (components, services, utils). We avoid this at the top level.
- **Renderer process** — the browser-like sandbox in Electron. Runs the UI.
- **Main process** — Electron's Node.js backend process. Has full system access.
- **Preload** — an Electron bridge between main and renderer (limited API exposure).
- **IPC** — Inter-Process Communication. How renderer talks to main.

## Security terms

- **Secret** — a credential (API key, OAuth token, private key, password).
- **Leak** — accidentally committing a secret to a public repo.
- **Rotate** — generate a new secret + invalidate the old one. Required after any leak.
- **Purge from history** — rewrite git history to remove all traces of a secret.
- **gitignore** — file listing patterns git should never track.
- **OAuth** — auth standard where you log in once, get a token for API calls. Google uses OAuth.
- **Refresh token** — long-lived token that can get new access tokens. High-value target.

## Common filenames

- `app.py` — BMO Flask entry
- `agent.py` — BMO agent router entry
- `index.ts` — Electron main process entry
- `App.tsx` — React app root
- `main.tsx` — React mount point
- `package.json` — Node project manifest (deps, scripts)
- `requirements.txt` — Python deps
- `pytest.ini` — pytest config
- `tsconfig.json` — TypeScript config
- `biome.json` — biome lint/format config
- `.cursorrules` — Cursor AI instructions
- `AGENTS.md` — cross-AI agent instructions
- `.gitignore` — files git ignores
- `.gitattributes` — git file handling (LFS, line endings)
