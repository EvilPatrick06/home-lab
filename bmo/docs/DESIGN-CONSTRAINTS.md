# BMO design constraints (do not “fix” these)

Canonical copy of design gotchas that used to live only in `docs/BMO-SUGGESTIONS-LOG.md`. **Read this before refactors** that touch hooks, cloud HTTP, package names, or shared 5e JSON.

## Task list discipline (AI sessions)

If you use Cursor `TodoWrite` (or similar), flip each item to `completed` or `cancelled` before the final message. Leaving items `pending` / `in_progress` makes the UI show false gaps (“25/43”). See **Task List Discipline** in repo root [`AGENTS.md`](../../AGENTS.md).

## `shell=True` in `agents/hooks.py`

Hook **commands** come from user config (`mcp_servers/mcp_settings.json` → `hooks.preToolUse` / `hooks.postToolUse`). They are **shell pipelines** by design (`|`, `&&`, `$VAR`). `subprocess.run(..., shell=True)` is intentional. Do not replace with `shlex.split` + `shell=False`. Suppress bandit with `# nosec B602` at the call site; threat model equals “user edits their own hook file on the Pi.”

## `os.system("curl …")` in `services/cloud_providers.py`

Main app uses **gevent** (`gevent.monkey.patch_all()` in `app.py`). Gevent patches `subprocess` and `requests`; those paths can add latency or interact badly under concurrent voice/STT load. **`os.system` is intentionally unpatched** so `curl` runs with normal blocking OS behavior. Do not “modernize” to `subprocess.run` or `requests.post` without load-testing voice. See comments on each `os.system` block in that file.

## Package name `bots/` (not `discord/`)

A local package named `discord/` would **shadow** the `discord.py` library. Keep **`bots/`** (or a name that is not a stdlib/third-party top-level import).

## Service module names (e.g. `calendar_service.py`)

Do not rename to `services/calendar.py` — that collides with Python’s stdlib **`calendar`**. Same idea for `list_service` vs `list`.

## Duplicated 5e JSON (dnd-app + BMO)

Five files are **byte-identical by policy** between domains (VTT ship path vs BMO agent path). If you change one side, run the sync script (or copy manually) so the other does not go stale.

| dnd-app (source) | bmo (copy) |
|---|---|
| `dnd-app/src/renderer/public/data/5e/hazards/conditions.json` | `bmo/pi/data/5e/conditions.json` |
| `dnd-app/src/renderer/public/data/5e/encounters/encounter-presets.json` | `bmo/pi/data/5e/encounter-presets.json` |
| `dnd-app/src/renderer/public/data/5e/encounters/random-tables.json` | `bmo/pi/data/5e/random-tables.json` |
| `dnd-app/src/renderer/public/data/5e/equipment/magic-items.json` | `bmo/pi/data/5e/magic-items.json` |
| `dnd-app/src/renderer/public/data/5e/world/treasure-tables.json` | `bmo/pi/data/5e/treasure-tables.json` |

Script: `bmo/pi/scripts/sync-shared-5e-json.sh` (from monorepo root).

## Data ownership (no cross-domain filesystem)

BMO and dnd-app **do not** read each other’s data dirs. **HTTP only** (e.g. `bmo-bridge.ts`, `vtt_sync.py`). See [`../../docs/DATA-FLOW.md`](../../docs/DATA-FLOW.md).

## MCP hook config

`mcp_settings.json` is **trusted** like shell startup files: whoever can edit it can run arbitrary hook commands. There is no JSON comment in standard JSON; this file documents behavior here and in `bmo/pi/mcp_servers/README.md`.

## Two IDE implementations coexist — production IDE is `web/` + `routes/ide.py`, NOT `ide_app/`

There are two separate, diverged IDE frontends in `bmo/pi/`:

- **Production (canonical):** `app.py` `@app.route("/ide")` renders `web/templates/ide.html`, backed by the `/api/ide/*` blueprint in `routes/ide.py`, with assets under `web/static/ide/` (`ide.css`, `ide.js`, `sw.js`). Runs on :5000.
- **Experimental rebuild:** `ide_app/` — a standalone Flask+SocketIO app on :5001 (`ide_app/ide_app.py`, its own `bmo-ide.service` (unit file in `systemd/`)) carrying its OWN diverged copies of the assets (`ide_app/static/...`, `ide_app/templates/ide.html`).

The two asset trees have already diverged (different sizes + md5s), so a fix applied to one will **not** reach the other. A contributor editing `ide_app/` expecting it to change the live `/ide` tab (or vice-versa) will be surprised. Treat `web/` + `routes/ide.py` as the **single source of truth**; `ide_app/` is a stalled/experimental rebuild — plan a cutover and retire one side rather than maintaining two diverging copies of `ide.css`/`ide.js`/`ide.html`.

Related: `bmo/pi/app.py` (`/ide` route), `bmo/pi/routes/ide.py`, `bmo/pi/web/templates/ide.html`, `bmo/pi/web/static/ide/`, `bmo/pi/ide_app/`.

_Relocated from `docs/BMO-SUGGESTIONS-LOG.md` on 2026-06-22._


## Test persistence must never touch the live `recent_chat.json` (PHASE-01 01E)

Module-level path constants resolved at import (`chat_history.RECENT_CHAT_FILE`, `DND_LOG_DIR`) are how a test write escapes into production data — this is what leaked ~200 seeded "Hello from BMO!" rows into the live chat buffer. Two-layer guard now in place: an **autouse** `_isolate_chat_history` fixture in `bmo/pi/tests/conftest.py` monkeypatches both constants to `tmp_path` for every test, and `save_recent_message` refuses a real-path write when `PYTEST_CURRENT_TEST` is set. A new chat-history test must still write to a tmp path (never the real constant). **Owner one-time cleanup (live-Pi data mutation, not an executer action):** the already-polluted `recent_chat.json` on the Pi must be cleared once via the dashboard "clear history" control (`POST /api/chat/clear`) or by deleting the file. Added 2026-06-24.

Related: `bmo/pi/services/chat_history.py`, `bmo/pi/tests/conftest.py`.
