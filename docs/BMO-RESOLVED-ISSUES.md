# BMO Resolved Issues

> **Archive of resolved BMO-domain entries** moved out of [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md) / [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) — kept here so the active logs stay lean while preserving fix history.
>
> When fixing an entry, **move** it here (don't delete) and append resolution metadata. Resolved security entries (any domain) go in [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md) (gitignored), not here.
>
> Sibling logs:
> - dnd-app resolved → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
> - Resolved security (any domain, gitignored) → [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md)
>
> Newest first.

---

### [2026-04-23] Google Calendar `invalid_grant: Bad Request` (plus split `token.json` paths)

- **Original severity:** high
- **Category:** config
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Resolution (code + ops):** **Root issue 1 — path drift:** `CalendarService` preferred `bmo/pi/services/config/token.json` (a 43-byte stub) over `bmo/pi/config/token.json` whenever the former existed, so a bad or half-written token overrode the real file. **Fix:** `CONFIG_DIR` is now canonical **`bmo/pi/config`**. `_resolve_config_paths()` checks **`bmo/pi/config` first**, then `services/config`, then `bmo/config`. `authorize_calendar.py` and `reauth_calendar.py` read/write the same `bmo/pi/config` paths as `app.py`. Removed the stray `bmo/pi/services/config/token.json` stub. **Root issue 2 — expired refresh token:** If Google still returns `invalid_grant` (revoked or expired refresh token), `creds.refresh()` now raises a clear `RuntimeError` with `reauth_calendar.py` / `authorize_calendar.py` steps. On this Pi, the refresh token in `bmo/pi/config/token.json` was still **invalid** after the path fix — **calendar recovery requires a manual re-auth** (`./venv/bin/python services/reauth_calendar.py` on the Pi, paste the code from the printed URL) or browser OAuth via `authorize_calendar.py`. After a successful re-auth, `sudo systemctl restart bmo`.
- **User follow-up (when ready):** Run re-auth, then `sudo systemctl restart bmo` (user deferred restart).

---

### [2026-04-23] BMO venv ~4.5 GB CUDA / GPU stack on Pi 5 (no GPU) — `torch` from PyPI

- **Original severity:** high
- **Category:** debt, performance, config
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Documented in `bmo/pi/requirements.txt` (install **CPU-only** `torch` before `pip install -r`, because `resemblyzer` / `openwakeword` depend on `torch` and a plain install on Linux aarch64 pulled CUDA + `nvidia-*` wheels). `bmo/setup-bmo.sh` now runs `pip install torch --index-url https://download.pytorch.org/whl/cpu` before `requirements.txt`. Added `bmo/pi/scripts/install-venv.sh` for one-command venv rebuilds. **On the production Pi:** ran `install-venv.sh`; venv **~5.4 GB → ~1.7 GB**; `pip list` has **no** `nvidia-*` or `triton`; `torch` reports `2.11.0+cpu`, `torch.cuda.is_available()` is `False`. `import resemblyzer` smoke test passes. BMO and bots restarted.

---

### [2026-04-23] `bmo/pi/requirements.txt` — missing direct runtime deps (`python-dotenv`, `discord.py`, `edge-tts`, `scipy`)

- **Original severity:** high
- **Category:** config, bug
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Declared in `bmo/pi/requirements.txt`: `python-dotenv`, `discord.py[voice]`, `edge-tts`, `scipy` (section *Used directly by app / bots*). On the production Pi, `pip install -r requirements.txt` pulled in `discord.py` 2.7.1, `edge-tts` 7.2.8, and voice extras; `import dotenv, discord, edge_tts, scipy` verified. `systemctl restart bmo-dm-bot bmo-social-bot` — both units report **active** (no more `ModuleNotFoundError: discord` crash loop).

---

### [2026-04-24] Broken symlinks `bmo/pi/data/music_history.json` + `play_counts.json` → legacy `DnD/BMO-setup/`

- **Original severity:** high
- **Category:** bug, config
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Removed stale symlinks and created real files: `music_history.json` = `[]` (list schema for `MusicService._load_history`), `play_counts.json` = `{}` (dict schema for `_load_play_counts`). Applied on the production Pi under `~/home-lab/bmo/pi/data/`. Added the same guard to `bmo/setup-bmo.sh` after runtime `mkdir` so fresh installs or clones replace broken symlinks with empty JSON instead of inheriting pre-reorg links.

---

### [2026-04-24] `kiosk/bmo-{dm,social}-bot.service` — wrong `StandardOutput` / `StandardError` log paths

- **Original severity:** high
- **Category:** config, bug
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Updated both unit files so `StandardOutput` and `StandardError` append to `/home/patrick/home-lab/bmo/pi/data/logs/{dm,social}-bot.log` instead of the nonexistent `/home/patrick/bmo/data/logs/...`. In-repo `kiosk/bmo-*.service` matches `setup-bmo.sh` inline units. **On the production Pi:** units were copied to `/etc/systemd/system/`, `daemon-reload` run, and `bmo-dm-bot` / `bmo-social-bot` restarted; `diff` repo vs installed is empty for those two files.

---

### [2026-04-24] `scripts/setup-cloudflare-tunnel.sh` — UTF-8 BOM before shebang

- **Original severity:** high
- **Category:** bug, config
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Stripped the leading UTF-8 BOM so byte 0 is `#!`. `shellcheck` no longer reports SC1082. Added repo-root `.editorconfig` with `[*.sh] charset = utf-8` to reduce BOM reintroduction.

---

### [2026-04-24] `services/voice_pipeline.py` — `_stream_and_speak` B023 + stray `_remember_spoken(text)`

- **Original severity:** high (B023) + related medium (F821 `text`)
- **Category:** bug
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Replaced the comma-boundary `class _M` closure with explicit `end` integer handling (no `RecursionError`). Removed erroneous `self._remember_spoken(text)` at the start of `_stream_and_speak` (undefined `text`); `_remember_spoken` remains after the stream with `full_text` only. Added `test_stream_and_speak_comma_boundary_long_buffer_no_recursion`. `ruff --select=B023,F821` clean on `voice_pipeline.py`. Also addresses the active log item *Streaming chat falls back to sync — `name 'text' is not defined`* (same root cause).

---

### [2026-04-23] Dual BMO directories (`/home/patrick/bmo/` vs `/home/patrick/home-lab/bmo/pi/`)

- **Original severity:** high
- **Category:** config
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Commit:** `2c52d5a`
- **Date resolved:** 2026-04-23
- **Resolution:** Merged runtime state from standalone `/home/patrick/bmo/` into canonical `/home/patrick/home-lab/bmo/pi/` via mtime-aware rsync (newer file wins). Rewrote 50+ `~/bmo/...` path references across Python to canonical `~/home-lab/bmo/pi/...`. Archived stale Python copies from standalone to `_archive/2026-04-reorg/old-bmo-standalone/`. Deleted standalone dir.

---

### [2026-04-23] `BMO-setup/` → `bmo/` rename

- **Original severity:** medium
- **Category:** debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Commit:** `2c52d5a`
- **Date resolved:** 2026-04-23
- **Resolution:** Folder renamed. Systemd service files patched (both in-repo and installed at `/etc/systemd/system/`). All hardcoded paths updated. `daemon-reload` + service restart successful — all 5 BMO services running on new paths.

---

### [2026-04-23] Pi-deploy duplicate `vtt_sync.py`

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app, bmo *(primary: bmo — agent module — also mirrored in [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md))*
- **Resolved by:** Claude Opus
- **Commit:** `2c52d5a`
- **Date resolved:** 2026-04-23
- **Resolution:** `scripts/pi-deploy/vtt_sync.py` was byte-identical to `bmo/pi/agents/vtt_sync.py`. Archived the pi-deploy copy. `apply_patch.py` moved to `bmo/pi/scripts/apply_patch.py` (canonical location for BMO deploy tooling).

---

### [2026-04-23] Three likely-dead Python modules in `bmo/pi/` (pre-reorg leftovers superseded by newer modules)

- **Original severity:** medium
- **Category:** debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Commits:** `780dc9f` (sound_effects.py + tv_controller.py) + `7e2090c` (discord_bot.py + bmo/docker/)
- **Date resolved:** 2026-04-23
- **Resolution:** All three confirmed orphan (zero importers in runtime, systemd, setup-bmo.sh, MCP config). Archived to `_archive_system_cleanup/bmo/pi/{bots,services}/`. Updated `bmo/pi/README.md` and `bmo/docs/ARCHITECTURE.md` to drop the `discord_bot.py` "common base" line and replaced with the two live bots (`discord_dm_bot.py`, `discord_social_bot.py`). Post-archive sanity: `py_compile` clean; import resolution for `bots.discord_dm_bot`, `bots.discord_social_bot`, `services.tv_worker`, `services.voice_pipeline` still OK.

---

### [2026-04-23] `bmo/docker/` — obsolete laptop → Pi SSH-deploy path

- **Original severity:** high
- **Category:** config, debt
- **Domain:** bmo, infra
- **Resolved by:** Claude Opus
- **Commit:** `7e2090c`
- **Date resolved:** 2026-04-23
- **Resolution:** The entire `bmo/docker/` directory targeted a pre-monorepo "remote Pi" deploy (laptop `scp`/`ssh` → flat `~/bmo/` layout on Pi) that is no longer the workflow — the Pi (this machine) runs directly from the monorepo via `bmo/setup-bmo.sh`, and the Docker containers (`bmo-ollama`, `bmo-peerjs`, `bmo-coturn`, `bmo-pihole`) are started via plain `docker run` in `setup-bmo.sh`, not via `docker-compose.yml`. The dir's systemd units (`bmo.service`, `bmo-backup.service/timer`) target the old path and are not installed on this Pi. `activate-hdmi-audio.sh` is documented as "runs as a user service" but is not registered under `~/.config/systemd/user/`. Whole dir archived to `_archive_system_cleanup/bmo/docker/`. Live docs updated: `bmo/docs/DEPLOY.md`, `bmo/docs/ARCHITECTURE.md`, `bmo/docs/SYSTEMD.md`, `bmo/docs/TROUBLESHOOTING.md`, `docs/COMMANDS.md`, `docs/BACKUP.md`, `bmo/README.md`. Running containers are unaffected (they outlive the config dir).

---

### [2026-04-23] Stale legacy files loose at `/home/patrick/` (pre-monorepo-reorg leftovers)

- **Original severity:** low
- **Category:** debt
- **Domain:** bmo, infra
- **Resolved by:** Claude Opus
- **Commits:** `780dc9f` (3 identical dupes) + `7e2090c` (4 differing + 3 WiFi scripts + __pycache__)
- **Date resolved:** 2026-04-23
- **Resolution:** Eleven files sat at `$HOME` from Mar 15–19 (pre-reorg). After comparison: none of the "differs from repo" versions had local hotfixes worth extracting — they were simply older snapshots (e.g., `~/app.py` was 5099 lines vs repo's 5504; `~/bmo-kiosk.service` still referenced the pre-rename `/home/patrick/DnD/BMO-setup/` path). All 10 archived to `_archive_system_cleanup/home-dir-pre-reorg/` (the `index.html` "differs from dnd-app" flag was misleading — it was actually an older copy of `bmo/pi/web/templates/index.html`). `/home/patrick/hide-cursor.py` (root-owned, no repo match) left in place — not verified whether it's a live system hook.

---

> dnd-app resolved entries: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). Resolved security (gitignored): [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md). Active BMO bugs: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md). Active BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
