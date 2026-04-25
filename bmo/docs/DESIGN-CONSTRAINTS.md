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
