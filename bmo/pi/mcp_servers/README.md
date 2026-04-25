# MCP server settings

- **`mcp_settings.json`** — stdio command lines, env, and **hooks** (`hooks.preToolUse` / `hooks.postToolUse`).
- **Hooks** are executed as **shell strings** (see `agents/hooks.py`). Treat edits to this file like editing `~/.bashrc` on the Pi: same trust and same code-execution surface.

For design rationale (why `shell=True`, why not `shlex.split`), see [`../../docs/DESIGN-CONSTRAINTS.md`](../../docs/DESIGN-CONSTRAINTS.md).
