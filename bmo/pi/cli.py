#!/usr/bin/env python3
"""BMO CLI — Full terminal interface for BMO's multi-agent system.

Usage:
    python cli.py                  # Interactive REPL
    python cli.py "your message"   # One-shot mode
    python cli.py --speaker gavin  # Set speaker name

Features:
    - Agent selection indicators (shows which agent is handling your message)
    - Plan mode with live step tracking
    - Scratchpad viewer
    - Slash commands: /agents, /scratchpad, /init, /plan, /clear, /help
    - Colored output with spinners
    - Direct BmoAgent integration (no web server needed)
"""

from __future__ import annotations

import argparse
import os
import sys
import threading
import time

# ── Rich imports (with fallback to plain text) ──────────────────────

try:
    from rich.console import Console
    from rich.live import Live
    from rich.markdown import Markdown
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
    from rich.theme import Theme

    HAS_RICH = True
except ImportError:
    HAS_RICH = False


# ── Theme ───────────────────────────────────────────────────────────

BMO_THEME = Theme({
    "bmo": "bold cyan",
    "user": "bold green",
    "agent": "bold yellow",
    "plan": "bold magenta",
    "step.pending": "dim",
    "step.running": "bold yellow",
    "step.done": "bold green",
    "step.failed": "bold red",
    "error": "bold red",
    "dim": "dim",
    "accent": "bold cyan",
}) if HAS_RICH else None

console = Console(theme=BMO_THEME) if HAS_RICH else None


# ── CLI Event Handler (replaces SocketIO for terminal) ──────────────

class CLIEventHandler:
    """Captures SocketIO-style events and renders them in the terminal.

    Passed as `socketio` to BmoAgent — intercepts emit() calls and
    displays them as terminal output instead of WebSocket messages.
    """

    def __init__(self):
        self._live: Live | None = None
        self._spinner_text = ""
        self._plan_steps: list[dict] = []
        self._plan_status = "idle"
        self._plan_task = ""
        self._current_agent = ""
        self._nesting_stack: list[str] = []

    def emit(self, event: str, data: dict | None = None, **kwargs):
        """Handle an event emission (called by orchestrator/agents)."""
        data = data or {}
        handler = getattr(self, f"_on_{event}", None)
        if handler:
            handler(data)

    def _on_agent_selected(self, data: dict):
        name = data.get("display_name", data.get("agent", ""))
        self._current_agent = name
        if HAS_RICH:
            console.print(f"  [agent]▸ {name}[/agent]", highlight=False)
        else:
            print(f"  ▸ {name}")

    def _on_agent_nesting(self, data: dict):
        parent = data.get("parent", "")
        child = data.get("child", "")
        task = data.get("task", "")[:60]
        self._nesting_stack.append(child)
        depth = len(self._nesting_stack)
        indent = "  " * (depth + 1)
        if HAS_RICH:
            console.print(f"{indent}[dim]↳ spawning {child} → \"{task}\"[/dim]", highlight=False)
        else:
            print(f"{indent}↳ spawning {child} → \"{task}\"")

    def _on_plan_mode_entered(self, data: dict):
        self._plan_status = "exploring"
        self._plan_task = data.get("task", "")
        self._plan_steps = []
        if HAS_RICH:
            console.print()
            console.print(Panel(
                f"[plan]Planning:[/plan] {self._plan_task}",
                title="[plan]Plan Mode[/plan]",
                border_style="magenta",
                padding=(0, 1),
            ))
        else:
            print(f"\n{'='*50}")
            print(f"  PLAN MODE: {self._plan_task}")
            print(f"{'='*50}")

    def _on_plan_mode_review(self, data: dict):
        self._plan_status = "review"
        plan_text = data.get("plan", "")
        if plan_text:
            if HAS_RICH:
                console.print()
                console.print(Panel(
                    Markdown(plan_text),
                    title="[plan]Plan Ready — Approve?[/plan]",
                    border_style="magenta",
                    padding=(0, 1),
                ))
            else:
                print("\n--- Plan Ready ---")
                print(plan_text)
                print("--- Approve? (yes/no) ---")

    def _on_plan_mode_executing(self, data: dict):
        self._plan_status = "executing"
        if HAS_RICH:
            console.print("\n  [plan]▶ Executing plan...[/plan]")
        else:
            print("\n  ▶ Executing plan...")

    def _on_plan_step_start(self, data: dict):
        step = data.get("step", 0)
        total = data.get("total", 0)
        desc = data.get("description", "")
        agent = data.get("agent", "")
        if HAS_RICH:
            console.print(f"  [step.running]⟳ Step {step}/{total}:[/step.running] {desc} [dim]({agent})[/dim]")
        else:
            print(f"  ⟳ Step {step}/{total}: {desc} ({agent})")

    def _on_plan_step_done(self, data: dict):
        step = data.get("step", 0)
        desc = data.get("description", "")
        if HAS_RICH:
            console.print(f"  [step.done]✓ Step {step}:[/step.done] {desc}")
        else:
            print(f"  ✓ Step {step}: {desc}")

    def _on_plan_step_failed(self, data: dict):
        step = data.get("step", 0)
        desc = data.get("description", "")
        error = data.get("error", "")
        if HAS_RICH:
            console.print(f"  [step.failed]✗ Step {step}:[/step.failed] {desc}")
            if error:
                console.print(f"    [error]{error[:200]}[/error]")
        else:
            print(f"  ✗ Step {step}: {desc}")
            if error:
                print(f"    Error: {error[:200]}")

    def _on_plan_mode_exited(self, data: dict):
        reason = data.get("reason", "")
        self._plan_status = "idle"
        self._plan_steps = []
        if HAS_RICH:
            console.print(f"  [dim]Plan mode exited ({reason})[/dim]\n")
        else:
            print(f"  Plan mode exited ({reason})\n")

    def _on_scratchpad_update(self, data: dict):
        pass  # Silent — user can check with /scratchpad


# ── Slash Command Handlers ──────────────────────────────────────────

def handle_slash_command(cmd: str, agent, event_handler: CLIEventHandler) -> bool:
    """Handle a slash command. Returns True if handled, False if not."""
    lower = cmd.strip().lower()

    if lower == "/help":
        _show_help()
        return True

    if lower == "/agents":
        _show_agents(agent)
        return True

    if lower in ("/scratchpad", "/scratch"):
        _show_scratchpad(agent)
        return True

    if lower == "/clear":
        agent.conversation_history.clear()
        if HAS_RICH:
            console.print("[dim]Chat history cleared.[/dim]")
        else:
            print("Chat history cleared.")
        return True

    if lower.startswith("/init"):
        directory = cmd[5:].strip() or "."
        _do_init(directory)
        return True

    if lower == "/mode":
        _show_mode(agent)
        return True

    if lower.startswith("/settings"):
        _handle_settings_command(cmd.strip(), agent)
        return True

    if lower.startswith("/mcp"):
        _handle_mcp_command(cmd.strip(), agent)
        return True

    if lower == "/commands":
        _show_custom_commands()
        return True

    if lower.startswith("/memory"):
        _handle_memory_command(cmd.strip())
        return True

    if lower == "/compact":
        _do_compact(agent)
        return True

    if lower.startswith("/enroll"):
        _do_voice_enroll(cmd)
        return True

    if lower == "/voices":
        _show_voice_profiles()
        return True

    if lower in ("/quit", "/exit", "/q"):
        raise SystemExit(0)

    # Check custom commands (e.g., /deploy, /test)
    if lower.startswith("/"):
        cmd_name = lower[1:].split()[0]
        cmd_args = cmd.strip()[1 + len(cmd_name):].strip()
        if _try_custom_command(cmd_name, cmd_args, agent, event_handler):
            return True

    return False


def _handle_settings_command(cmd: str, agent):
    """Handle /settings subcommands."""
    parts = cmd.split(maxsplit=2)
    # /settings (no args) — show full merged settings
    if len(parts) == 1:
        _show_settings(agent)
        return

    subcmd = parts[1].lower()

    if subcmd == "get" and len(parts) >= 3:
        key = parts[2]
        _show_setting_key(agent, key)
    elif subcmd == "set" and len(parts) >= 3:
        # Parse "key value" or "key=value"
        rest = parts[2]
        if "=" in rest and " " not in rest.split("=", 1)[0]:
            key, raw_value = rest.split("=", 1)
        else:
            key_parts = rest.split(maxsplit=1)
            if len(key_parts) < 2:
                _print_error("Usage: /settings set <key> <value>")
                return
            key, raw_value = key_parts
        _set_setting(agent, key, raw_value)
    elif subcmd == "reset":
        _reset_settings(agent)
    elif subcmd == "init":
        _init_settings_file()
    else:
        _print_error(f"Unknown settings subcommand: {subcmd}")
        _print_dim("Usage: /settings [get <key> | set <key> <value> | reset | init]")


def _show_settings(agent):
    """Show full merged settings with secrets redacted."""
    from agents.settings import get_settings
    settings = get_settings()
    if not settings:
        _print_error("Settings not initialized.")
        return

    import json
    data = settings.to_dict_redacted()
    formatted = json.dumps(data, indent=2)

    if HAS_RICH:
        from rich.syntax import Syntax
        console.print(Syntax(formatted, "json", theme="monokai", line_numbers=False))
    else:
        print(formatted)


def _show_setting_key(agent, key: str):
    """Show a specific setting value."""
    from agents.settings import get_settings
    settings = get_settings()
    if not settings:
        _print_error("Settings not initialized.")
        return

    value = settings.get(key)
    if value is None:
        _print_dim(f"{key} = (not set)")
    else:
        import json
        if isinstance(value, (dict, list)):
            formatted = json.dumps(value, indent=2)
        else:
            formatted = repr(value)
        if HAS_RICH:
            console.print(f"  [accent]{key}[/accent] = {formatted}")
        else:
            print(f"  {key} = {formatted}")


def _set_setting(agent, key: str, raw_value: str):
    """Set a setting value and persist."""
    from agents.settings import get_settings
    import json

    settings = get_settings()
    if not settings:
        _print_error("Settings not initialized.")
        return

    # Try to parse as JSON (handles bools, numbers, lists, dicts)
    try:
        value = json.loads(raw_value)
    except json.JSONDecodeError:
        value = raw_value  # Keep as string

    settings.set(key, value, level="user")
    if HAS_RICH:
        console.print(f"  [step.done]✓[/step.done] Set [accent]{key}[/accent] = {repr(value)}")
    else:
        print(f"  ✓ Set {key} = {repr(value)}")


def _reset_settings(agent):
    """Reload settings from disk."""
    from agents.settings import get_settings
    settings = get_settings()
    if not settings:
        _print_error("Settings not initialized.")
        return
    settings.reload()
    _print_dim("Settings reloaded from disk.")


def _init_settings_file():
    """Create default ~/home-lab/bmo/pi/data/settings.json if it doesn't exist."""
    from agents.settings import USER_SETTINGS_PATH
    import json

    if os.path.isfile(USER_SETTINGS_PATH):
        _print_dim(f"Settings file already exists: {USER_SETTINGS_PATH}")
        return

    os.makedirs(os.path.dirname(USER_SETTINGS_PATH), exist_ok=True)
    with open(USER_SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump({}, f, indent=2)

    if HAS_RICH:
        console.print(f"  [step.done]✓[/step.done] Created [accent]{USER_SETTINGS_PATH}[/accent]")
    else:
        print(f"  ✓ Created {USER_SETTINGS_PATH}")


def _print_error(msg: str):
    if HAS_RICH:
        console.print(f"  [error]{msg}[/error]")
    else:
        print(f"  Error: {msg}")


def _print_dim(msg: str):
    if HAS_RICH:
        console.print(f"  [dim]{msg}[/dim]")
    else:
        print(f"  {msg}")


def _handle_mcp_command(cmd: str, agent):
    """Handle /mcp subcommands."""
    parts = cmd.split(maxsplit=2)

    if len(parts) == 1 or parts[1].lower() == "list":
        _show_mcp_status(agent)
        return

    subcmd = parts[1].lower()

    if subcmd == "tools":
        server_name = parts[2] if len(parts) > 2 else None
        _show_mcp_tools(agent, server_name)
    elif subcmd == "connect" and len(parts) > 2:
        _mcp_connect(agent, parts[2])
    elif subcmd == "disconnect" and len(parts) > 2:
        _mcp_disconnect(agent, parts[2])
    else:
        _print_dim("Usage: /mcp [list|tools [server]|connect <name>|disconnect <name>]")


def _show_mcp_status(agent):
    """Show MCP server status."""
    manager = agent.orchestrator.mcp_manager if agent and agent.orchestrator else None
    if not manager:
        _print_dim("No MCP servers configured.")
        return

    status = manager.get_status()
    if HAS_RICH:
        table = Table(title="MCP Servers", show_header=True, header_style="bold cyan")
        table.add_column("Server", style="accent")
        table.add_column("Transport")
        table.add_column("Status")
        table.add_column("Tools", justify="right")
        for name, info in status["servers"].items():
            state = "[step.done]connected[/step.done]" if info["connected"] else "[dim]disconnected[/dim]"
            table.add_row(name, info["transport"], state, str(info["tools"]))
        console.print(table)
    else:
        print(f"\nMCP Servers ({status['connected']}/{status['total']} connected):")
        for name, info in status["servers"].items():
            state = "connected" if info["connected"] else "disconnected"
            print(f"  {name:20s} {info['transport']:6s} {state:14s} {info['tools']} tools")
        print()


def _show_mcp_tools(agent, server_name=None):
    """Show MCP tools, optionally filtered by server."""
    manager = agent.orchestrator.mcp_manager if agent and agent.orchestrator else None
    if not manager:
        _print_dim("No MCP servers configured.")
        return

    tools = manager.get_all_tools()
    if server_name:
        prefix = f"mcp__{server_name}__"
        tools = [t for t in tools if t["name"].startswith(prefix)]

    if not tools:
        _print_dim(f"No tools found{' for ' + server_name if server_name else ''}.")
        return

    if HAS_RICH:
        table = Table(title=f"MCP Tools{' — ' + server_name if server_name else ''}", show_header=True, header_style="bold cyan")
        table.add_column("Tool Name", style="accent")
        table.add_column("Description")
        for tool in tools:
            table.add_row(tool["name"], tool["description"][:60])
        console.print(table)
    else:
        for tool in tools:
            print(f"  {tool['name']:40s} {tool['description'][:60]}")


def _mcp_connect(agent, name):
    """Connect/reconnect an MCP server."""
    manager = agent.orchestrator.mcp_manager if agent and agent.orchestrator else None
    if not manager:
        _print_error("No MCP manager available.")
        return

    if manager.connect_server(name):
        if HAS_RICH:
            console.print(f"  [step.done]✓[/step.done] Connected to [accent]{name}[/accent]")
        else:
            print(f"  ✓ Connected to {name}")
    else:
        _print_error(f"Failed to connect to {name}")


def _mcp_disconnect(agent, name):
    """Disconnect an MCP server."""
    manager = agent.orchestrator.mcp_manager if agent and agent.orchestrator else None
    if not manager:
        _print_error("No MCP manager available.")
        return

    if manager.disconnect_server(name):
        _print_dim(f"Disconnected from {name}")
    else:
        _print_error(f"Server not found: {name}")


def _show_custom_commands():
    """Show available custom commands."""
    try:
        from agents.custom_commands import list_commands
        commands = list_commands(os.getcwd())
    except ImportError:
        _print_dim("Custom commands module not available.")
        return

    if not commands:
        _print_dim("No custom commands found.")
        _print_dim("Create .bmo/commands/<name>.md or ~/home-lab/bmo/pi/data/commands/<name>.md")
        return

    if HAS_RICH:
        table = Table(title="Custom Commands", show_header=True, header_style="bold cyan")
        table.add_column("Command", style="accent")
        table.add_column("Source")
        table.add_column("Description")
        for cmd in commands:
            table.add_row(f"/{cmd['name']}", cmd["source"], cmd["preview"])
        console.print(table)
    else:
        print("\nCustom Commands:")
        for cmd in commands:
            print(f"  /{cmd['name']:20s} [{cmd['source']}] {cmd['preview']}")
        print()


def _try_custom_command(cmd_name: str, args: str, agent, event_handler) -> bool:
    """Try to execute a custom command. Returns True if found and executed."""
    try:
        from agents.custom_commands import discover_commands, load_command
    except ImportError:
        return False

    commands = discover_commands(os.getcwd())
    if cmd_name not in commands:
        return False

    # Load and expand the command
    expanded = load_command(commands[cmd_name], args)

    if HAS_RICH:
        console.print(f"  [dim]Running custom command: /{cmd_name}[/dim]")
    else:
        print(f"  Running custom command: /{cmd_name}")

    # Send to BMO as a chat message
    result = chat_with_spinner(agent, expanded, "user", event_handler)
    render_response(result, event_handler)
    return True


def _handle_memory_command(cmd: str):
    """Handle /memory subcommands."""
    parts = cmd.split(maxsplit=1)

    if len(parts) == 1:
        _show_memory()
        return

    subcmd = parts[1].strip().lower()
    if subcmd == "clear":
        _clear_memory()
    else:
        _show_memory()


def _show_memory():
    """Show auto-memory contents."""
    try:
        from agents.memory import load_memory, get_memory_path
        content = load_memory(os.getcwd())
        path = get_memory_path(os.getcwd())
    except ImportError:
        _print_dim("Memory module not available.")
        return

    if not content:
        _print_dim("No memory saved for this project.")
        _print_dim(f"Path: {path}")
        return

    if HAS_RICH:
        from rich.markdown import Markdown
        console.print(Panel(
            Markdown(content[:2000]),
            title="[accent]Auto-Memory[/accent]",
            subtitle=f"[dim]{path}[/dim]",
            border_style="cyan",
            padding=(0, 1),
        ))
    else:
        print(f"\n--- Auto-Memory ({path}) ---")
        print(content[:2000])
        if len(content) > 2000:
            print("...")
        print()


def _clear_memory():
    """Clear auto-memory for current project."""
    try:
        from agents.memory import clear_memory
        cleared = clear_memory(os.getcwd())
        if cleared:
            if HAS_RICH:
                console.print("  [step.done]✓[/step.done] Memory cleared.")
            else:
                print("  ✓ Memory cleared.")
        else:
            _print_dim("No memory to clear.")
    except ImportError:
        _print_dim("Memory module not available.")


def _do_voice_enroll(cmd: str):
    """Handle /enroll <name> — record 3 clips and enroll a voice profile via the local API."""
    import requests as _req

    parts = cmd.strip().split(maxsplit=1)
    if len(parts) < 2 or not parts[1].strip():
        _print_error("Usage: /enroll <name>")
        _print_dim("Example: /enroll Gavin")
        return

    name = parts[1].strip()
    base_url = "http://localhost:5000"
    num_clips = 4
    min_good = 3
    duration = 5

    prompts = [
        f"Clip 1/{num_clips}: Say something natural, like 'Hey BMO, what's the weather today?'",
        f"Clip 2/{num_clips}: Try 'BMO, tell me a joke or play some music.'",
        f"Clip 3/{num_clips}: Say anything — 'Good morning BMO, set a timer for five minutes.'",
        f"Clip 4/{num_clips}: One more — 'Hey BMO, turn off the lights and play some jazz.'",
    ]

    if HAS_RICH:
        console.print(f"\n  [accent]Voice Enrollment: {name}[/accent]")
        console.print(f"  Recording {num_clips} clips of {duration}s each.\n")
    else:
        print(f"\n  Voice Enrollment: {name}")
        print(f"  Recording {num_clips} clips of {duration}s each.\n")

    good_clips = 0
    max_retries = 2

    for i in range(num_clips):
        if HAS_RICH:
            console.print(f"  [bmo]{prompts[i]}[/bmo]")
        else:
            print(f"  {prompts[i]}")

        for attempt in range(1 + max_retries):
            if attempt > 0:
                _print_dim("  Let's try that one again. Speak clearly and close to the mic.")

            try:
                input("  Press Enter when ready...")
            except (EOFError, KeyboardInterrupt):
                print("\n  Enrollment cancelled.")
                return

            if HAS_RICH:
                with console.status(f"  [bmo]Recording {duration}s...[/bmo]", spinner="dots"):
                    try:
                        resp = _req.post(f"{base_url}/api/voice/enroll",
                                         json={"name": name, "duration": duration},
                                         timeout=30)
                    except Exception as e:
                        _print_error(f"API call failed: {e}")
                        return
            else:
                print(f"  Recording {duration}s...")
                try:
                    resp = _req.post(f"{base_url}/api/voice/enroll",
                                     json={"name": name, "duration": duration},
                                     timeout=30)
                except Exception as e:
                    _print_error(f"API call failed: {e}")
                    return

            if resp.ok:
                good_clips += 1
                if HAS_RICH:
                    console.print(f"  [step.done]✓ Clip {i + 1} recorded[/step.done]")
                else:
                    print(f"  ✓ Clip {i + 1} recorded")
                print()
                break
            elif resp.status_code == 422:
                _print_error(resp.json().get("error", "Not enough speech detected."))
                if attempt == max_retries:
                    _print_dim(f"  Skipping clip {i + 1} after {max_retries + 1} attempts.")
                    print()
            else:
                _print_error(f"Enrollment failed: {resp.json().get('error', resp.text)}")
                return

    if good_clips < min_good:
        _print_error(f"Only got {good_clips} good clip(s). Need at least {min_good}. Please try /enroll {name} again.")
        return

    profiles = resp.json().get("profiles", [])
    if HAS_RICH:
        console.print(f"  [step.done]✓ {name} enrolled from {good_clips} clips![/step.done] Profiles: {', '.join(profiles)}\n")
    else:
        print(f"  ✓ {name} enrolled from {good_clips} clips! Profiles: {', '.join(profiles)}\n")


def _show_voice_profiles():
    """Show enrolled voice profiles via the API."""
    import requests as _req
    try:
        resp = _req.get("http://localhost:5000/api/voice/profiles", timeout=5)
        profiles = resp.json().get("profiles", [])
    except Exception as e:
        _print_error(f"Could not reach BMO API: {e}")
        return

    if not profiles:
        _print_dim("No voice profiles enrolled. Use /enroll <name> to add one.")
        return

    if HAS_RICH:
        table = Table(title="Voice Profiles", show_header=True, header_style="bold cyan")
        table.add_column("Name", style="accent")
        for name in profiles:
            table.add_row(name)
        console.print(table)
    else:
        print("\nVoice Profiles:")
        for name in profiles:
            print(f"  - {name}")
        print()


def _do_compact(agent):
    """Run context compression."""
    if not agent:
        _print_error("Agent not initialized.")
        return

    msg = agent.compact()
    if HAS_RICH:
        console.print(f"  [step.done]✓[/step.done] {msg}")
    else:
        print(f"  ✓ {msg}")


def _show_help():
    if HAS_RICH:
        table = Table(title="BMO CLI Commands", show_header=True, header_style="bold cyan")
        table.add_column("Command", style="accent")
        table.add_column("Description")
        table.add_row("/help", "Show this help")
        table.add_row("/agents", "List all registered agents")
        table.add_row("/scratchpad", "Show scratchpad contents")
        table.add_row("/mode", "Show current orchestrator mode")
        table.add_row("/settings", "Show full merged settings (redacted)")
        table.add_row("/settings get <key>", "Show a specific setting value")
        table.add_row("/settings set <key> <val>", "Persist a setting to user level")
        table.add_row("/settings reset", "Reload settings from disk")
        table.add_row("/settings init", "Create default ~/home-lab/bmo/pi/data/settings.json")
        table.add_row("/init [dir]", "Create BMO.md in a directory")
        table.add_row("/clear", "Clear conversation history")
        table.add_row("/mcp", "Show MCP server status")
        table.add_row("/mcp tools [server]", "List MCP tools")
        table.add_row("/mcp connect <name>", "Connect an MCP server")
        table.add_row("/mcp disconnect <name>", "Disconnect an MCP server")
        table.add_row("/commands", "List custom slash commands")
        table.add_row("/memory", "Show auto-memory contents")
        table.add_row("/memory clear", "Clear project memory")
        table.add_row("/enroll <name>", "Enroll a voice profile (records 3 clips)")
        table.add_row("/voices", "List enrolled voice profiles")
        table.add_row("/compact", "Compress conversation history")
        table.add_row("/quit", "Exit BMO CLI")
        table.add_row("", "")
        table.add_row("!code ...", "Force route to Code Agent")
        table.add_row("!dm ...", "Force route to DM Agent")
        table.add_row("!plan ...", "Force route to Plan Agent")
        table.add_row("!music ...", "Force route to Music Agent")
        console.print(table)
    else:
        print("\nBMO CLI Commands:")
        print("  /help                       Show this help")
        print("  /agents                     List all registered agents")
        print("  /scratchpad                 Show scratchpad contents")
        print("  /mode                       Show current orchestrator mode")
        print("  /settings                   Show full merged settings")
        print("  /settings get <key>         Show a specific setting")
        print("  /settings set <key> <val>   Persist a setting")
        print("  /settings reset             Reload from disk")
        print("  /settings init              Create default settings file")
        print("  /init [dir]                 Create BMO.md in a directory")
        print("  /clear                      Clear conversation history")
        print("  /mcp                        Show MCP server status")
        print("  /mcp tools [server]         List MCP tools")
        print("  /mcp connect <name>         Connect an MCP server")
        print("  /mcp disconnect <name>      Disconnect an MCP server")
        print("  /commands                   List custom slash commands")
        print("  /memory                     Show auto-memory contents")
        print("  /memory clear               Clear project memory")
        print("  /enroll <name>              Enroll a voice profile (records 3 clips)")
        print("  /voices                     List enrolled voice profiles")
        print("  /compact                    Compress conversation history")
        print("  /quit                       Exit BMO CLI")
        print()
        print("  !code ...      Force route to Code Agent")
        print("  !dm ...        Force route to DM Agent")
        print("  !plan ...      Force route to Plan Agent")
        print("  !music ...     Force route to Music Agent")
        print()


def _show_agents(agent):
    if not agent or not agent.orchestrator:
        print("Agent not initialized.")
        return

    agents = agent.orchestrator.agents
    mode = agent.orchestrator.mode.value

    if HAS_RICH:
        table = Table(title=f"BMO Agents (mode: {mode})", show_header=True, header_style="bold cyan")
        table.add_column("Name", style="accent")
        table.add_column("Display Name")
        table.add_column("Temp", justify="right")
        table.add_column("Tools", justify="right")
        table.add_column("Nest")
        for name, a in sorted(agents.items()):
            table.add_row(
                a.config.name,
                a.config.display_name,
                f"{a.config.temperature}",
                str(len(a.config.tools)),
                "✓" if a.config.can_nest else "",
            )
        console.print(table)
    else:
        print(f"\nBMO Agents (mode: {mode}):")
        for name, a in sorted(agents.items()):
            nest = " [nesting]" if a.config.can_nest else ""
            print(f"  {a.config.display_name:20s} ({a.config.name}) temp={a.config.temperature}{nest}")
        print()


def _show_scratchpad(agent):
    if not agent or not agent.orchestrator:
        print("Agent not initialized.")
        return

    sections = agent.orchestrator.scratchpad.to_dict()
    if not sections:
        if HAS_RICH:
            console.print("[dim]Scratchpad is empty.[/dim]")
        else:
            print("Scratchpad is empty.")
        return

    if HAS_RICH:
        for name, content in sections.items():
            console.print(Panel(
                Markdown(content[:500] + ("..." if len(content) > 500 else "")),
                title=f"[accent]{name}[/accent]",
                border_style="cyan",
                padding=(0, 1),
            ))
    else:
        for name, content in sections.items():
            print(f"\n--- {name} ---")
            print(content[:500])
            if len(content) > 500:
                print("...")
        print()


def _show_mode(agent):
    if not agent or not agent.orchestrator:
        print("Agent not initialized.")
        return

    mode = agent.orchestrator.mode.value
    if HAS_RICH:
        console.print(f"  Orchestrator mode: [plan]{mode}[/plan]")
    else:
        print(f"  Orchestrator mode: {mode}")


def _do_init(directory: str):
    from agents.project_context import create_bmo_md
    abs_dir = os.path.abspath(directory)
    try:
        path = create_bmo_md(abs_dir)
        if HAS_RICH:
            console.print(f"  [step.done]✓[/step.done] Created [accent]{path}[/accent]")
        else:
            print(f"  ✓ Created {path}")
    except Exception as e:
        if HAS_RICH:
            console.print(f"  [error]✗ {e}[/error]")
        else:
            print(f"  ✗ {e}")


# ── Response Rendering ──────────────────────────────────────────────

def render_response(result: dict, event_handler: CLIEventHandler):
    """Render a chat response in the terminal."""
    text = result.get("text", "")
    agent_used = result.get("agent_used", "")
    commands = result.get("commands_executed", [])

    # Strip hardware tags from display (they're for the Pi)
    import re
    text = re.sub(r"\[(FACE|LED|SOUND|EMOTION|MUSIC|NPC):[^\]]+\]", "", text).strip()

    if HAS_RICH:
        console.print()
        # Show agent badge if not conversation
        if agent_used and agent_used != "conversation":
            badge = Text(f" {agent_used} ", style="on magenta")
            console.print(badge, end=" ")
        console.print(Markdown(text))
    else:
        print()
        if agent_used and agent_used != "conversation":
            print(f"[{agent_used}]")
        print(text)

    # Show executed commands
    if commands:
        for cmd in commands:
            action = cmd.get("action", "")
            success = cmd.get("success", False)
            if HAS_RICH:
                status = "[step.done]✓[/step.done]" if success else "[step.failed]✗[/step.failed]"
                console.print(f"  {status} {action}")
            else:
                status = "✓" if success else "✗"
                print(f"  {status} {action}")


# ── Main REPL ───────────────────────────────────────────────────────

def create_agent(event_handler: CLIEventHandler):
    """Create a BmoAgent instance with CLI event handler as socketio."""
    # Add the agents directory to path
    pi_dir = os.path.dirname(os.path.abspath(__file__))
    if pi_dir not in sys.path:
        sys.path.insert(0, pi_dir)

    from agent import BmoAgent
    return BmoAgent(services={}, socketio=event_handler)


def chat_with_spinner(agent, message: str, speaker: str, event_handler: CLIEventHandler) -> dict:
    """Send a message to BMO with a thinking spinner."""
    result = {}
    done = threading.Event()

    def _chat():
        nonlocal result
        try:
            result = agent.chat(message, speaker=speaker)
        except Exception as e:
            result = {"text": f"Error: {e}", "commands_executed": [], "tags": {}}
        done.set()

    thread = threading.Thread(target=_chat, daemon=True)
    thread.start()

    if HAS_RICH:
        with console.status("[bmo]BMO is thinking...[/bmo]", spinner="dots"):
            done.wait()
    else:
        sys.stdout.write("  BMO is thinking...")
        sys.stdout.flush()
        while not done.is_set():
            time.sleep(0.3)
            sys.stdout.write(".")
            sys.stdout.flush()
        sys.stdout.write("\r" + " " * 40 + "\r")

    return result


def interactive_repl(agent, speaker: str, event_handler: CLIEventHandler):
    """Run the interactive REPL loop."""
    if HAS_RICH:
        console.print(Panel(
            "[bmo]BMO is ready![/bmo] Type a message or /help for commands.",
            title="[bmo]BMO CLI[/bmo]",
            border_style="cyan",
            padding=(0, 1),
        ))
    else:
        print("\n=== BMO CLI ===")
        print("BMO is ready! Type a message or /help for commands.\n")

    while True:
        try:
            if HAS_RICH:
                prompt = console.input("[user]you>[/user] ")
            else:
                prompt = input("you> ")
        except (EOFError, KeyboardInterrupt):
            print()
            break

        message = prompt.strip()
        if not message:
            continue

        # Slash commands
        if message.startswith("/"):
            if not handle_slash_command(message, agent, event_handler):
                if HAS_RICH:
                    console.print(f"[error]Unknown command:[/error] {message}. Try /help")
                else:
                    print(f"Unknown command: {message}. Try /help")
            continue

        # Send to BMO
        result = chat_with_spinner(agent, message, speaker, event_handler)
        render_response(result, event_handler)
        if HAS_RICH:
            console.print()
        else:
            print()


def one_shot(agent, message: str, speaker: str, event_handler: CLIEventHandler):
    """Send a single message and print the response."""
    result = chat_with_spinner(agent, message, speaker, event_handler)
    render_response(result, event_handler)


def main():
    # Pre-load settings to read CLI defaults (before argparse)
    from agents.settings import BmoSettings
    _pre_settings = BmoSettings()
    default_speaker = _pre_settings.get("speaker.default_name", "gavin")
    default_color = _pre_settings.get("ui.color_enabled", True)

    parser = argparse.ArgumentParser(description="BMO CLI — Terminal interface for BMO's multi-agent system")
    parser.add_argument("message", nargs="*", help="Message to send (omit for interactive mode)")
    parser.add_argument("--speaker", "-s", default=default_speaker, help=f"Speaker name (default: {default_speaker})")
    parser.add_argument("--no-color", action="store_true", default=not default_color, help="Disable colored output")
    args = parser.parse_args()

    # Disable rich if requested
    global HAS_RICH, console
    if args.no_color:
        HAS_RICH = False
        console = None

    event_handler = CLIEventHandler()

    if HAS_RICH:
        with console.status("[bmo]Initializing BMO...[/bmo]", spinner="dots"):
            agent = create_agent(event_handler)
    else:
        print("Initializing BMO...")
        agent = create_agent(event_handler)

    if args.message:
        # One-shot mode
        message = " ".join(args.message)
        one_shot(agent, message, args.speaker, event_handler)
    else:
        # Interactive REPL
        interactive_repl(agent, args.speaker, event_handler)


if __name__ == "__main__":
    main()
