"""BMO Custom Slash Commands — User-defined /commands from markdown files.

Discovers commands from:
  1. .bmo/commands/  — project-specific (higher priority)
  2. ~/bmo/data/commands/ — user-global

Command files are markdown where filename = command name.
The special placeholder $ARGUMENTS is replaced with user-provided args.

Example file: .bmo/commands/deploy.md
    Deploy the current project. Run tests first, then build, then deploy.
    $ARGUMENTS
"""

from __future__ import annotations

import os


USER_COMMANDS_DIR = os.path.expanduser("~/bmo/data/commands")


def discover_commands(working_dir: str | None = None) -> dict[str, str]:
    """Find all custom commands.

    Returns: {command_name: file_path}
    Project commands override user commands with the same name.
    """
    commands: dict[str, str] = {}

    # 1. User-global commands (lower priority)
    if os.path.isdir(USER_COMMANDS_DIR):
        for entry in os.listdir(USER_COMMANDS_DIR):
            if entry.endswith(".md"):
                name = entry[:-3]  # Strip .md
                commands[name] = os.path.join(USER_COMMANDS_DIR, entry)

    # 2. Project-local commands (higher priority — overrides user)
    if working_dir:
        project_dir = os.path.join(working_dir, ".bmo", "commands")
        if os.path.isdir(project_dir):
            for entry in os.listdir(project_dir):
                if entry.endswith(".md"):
                    name = entry[:-3]
                    commands[name] = os.path.join(project_dir, entry)

    return commands


def load_command(file_path: str, arguments: str = "") -> str:
    """Load a command file and substitute $ARGUMENTS.

    Args:
        file_path: Path to the .md command file.
        arguments: User-provided arguments string.

    Returns:
        The expanded command text ready to send to the agent.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        return f"Failed to load command: {e}"

    # Replace $ARGUMENTS placeholder
    content = content.replace("$ARGUMENTS", arguments.strip())

    return content.strip()


def list_commands(working_dir: str | None = None) -> list[dict]:
    """List all available custom commands with metadata.

    Returns list of {name, path, source, preview}
    """
    commands = discover_commands(working_dir)
    result = []

    for name, path in sorted(commands.items()):
        # Determine source
        if working_dir and path.startswith(os.path.join(working_dir, ".bmo")):
            source = "project"
        else:
            source = "user"

        # Read first line as preview
        preview = ""
        try:
            with open(path, "r", encoding="utf-8") as f:
                first_line = f.readline().strip()
                # Skip HTML comments
                if first_line.startswith("<!--"):
                    first_line = f.readline().strip()
                preview = first_line[:80]
        except Exception:
            pass

        result.append({
            "name": name,
            "path": path,
            "source": source,
            "preview": preview,
        })

    return result
