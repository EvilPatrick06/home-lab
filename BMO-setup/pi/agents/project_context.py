"""BMO.md project context loader — auto-discovers and loads project instructions.

Like Claude Code's CLAUDE.md, BMO looks for BMO.md files in working directories
and loads them into agent context. Supports:
- Project root BMO.md (auto-discovered)
- User-level config at ~/bmo/data/BMO.md
- /init slash command to create a new BMO.md

Context files are loaded hierarchically: user-level → project-level → subdirectory-level.
"""

from __future__ import annotations

import os
from pathlib import Path

# Default locations to search for BMO.md files
USER_BMO_MD = os.path.expanduser("~/bmo/data/BMO.md")
PROJECT_CONFIGS_DIR = os.path.expanduser("~/bmo/data/projects")


def find_bmo_md(working_dir: str | None = None) -> list[str]:
    """Find all BMO.md files from user-level to working directory.

    Returns paths in load order (user → project root → subdirectory).
    """
    found = []

    # 1. User-level BMO.md (always loaded)
    if os.path.isfile(USER_BMO_MD):
        found.append(USER_BMO_MD)

    if not working_dir:
        return found

    # 2. Walk up from working_dir to find BMO.md files
    current = Path(working_dir).resolve()
    candidates = []

    # Walk up to root (max 10 levels to prevent infinite loops)
    for _ in range(10):
        bmo_path = current / "BMO.md"
        if bmo_path.is_file():
            candidates.append(str(bmo_path))

        # Also check .bmo/ directory
        bmo_dir_path = current / ".bmo" / "BMO.md"
        if bmo_dir_path.is_file():
            candidates.append(str(bmo_dir_path))

        parent = current.parent
        if parent == current:
            break
        current = parent

    # Reverse so parent BMO.md comes before child BMO.md
    candidates.reverse()
    found.extend(candidates)

    return found


def load_bmo_md(working_dir: str | None = None) -> str:
    """Load and concatenate all BMO.md files for the given working directory.

    Returns the combined context string, or empty string if no files found.
    """
    paths = find_bmo_md(working_dir)
    if not paths:
        return ""

    sections = []
    for path in paths:
        try:
            with open(path, encoding="utf-8") as f:
                content = f.read().strip()
            if content:
                # Add a header to distinguish different context files
                rel_path = os.path.relpath(path)
                sections.append(f"# Project Context ({rel_path})\n{content}")
        except Exception as e:
            print(f"[project_context] Failed to read {path}: {e}")

    return "\n\n---\n\n".join(sections)


def create_bmo_md(directory: str, content: str | None = None) -> str:
    """Create a new BMO.md file in the given directory.

    Args:
        directory: Where to create BMO.md
        content: Initial content. If None, uses a template.

    Returns:
        Path to the created file.
    """
    if content is None:
        content = _default_template(directory)

    path = os.path.join(directory, "BMO.md")
    os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"[project_context] Created {path}")
    return path


def _default_template(directory: str) -> str:
    """Generate a default BMO.md template for a project."""
    project_name = os.path.basename(os.path.abspath(directory))
    return f"""# BMO.md — Project Instructions for {project_name}

This file provides guidance to BMO when working with code in this project.
BMO automatically loads this file when working in this directory.

## Project Overview

<!-- Describe what this project does -->

## Build & Dev Commands

<!-- Key commands BMO should know -->
| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Start development server |
| `npm test` | Run tests |

## Architecture

<!-- Key architectural decisions and patterns -->

## Key Conventions

<!-- Coding conventions BMO should follow -->
-

## Important Paths

<!-- Key files and directories -->
| Path | Purpose |
|------|---------|
| `src/` | Source code |

## Notes

<!-- Anything else BMO should know -->
"""


def save_project_config(project_path: str, config: dict) -> None:
    """Save project-specific configuration (for /init persistence)."""
    import json

    os.makedirs(PROJECT_CONFIGS_DIR, exist_ok=True)

    # Use project path hash as filename
    import hashlib
    key = hashlib.md5(os.path.abspath(project_path).encode()).hexdigest()[:12]
    config_path = os.path.join(PROJECT_CONFIGS_DIR, f"{key}.json")

    data = {
        "project_path": os.path.abspath(project_path),
        "project_name": os.path.basename(os.path.abspath(project_path)),
        **config,
    }

    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def load_project_config(project_path: str) -> dict | None:
    """Load project-specific configuration."""
    import json
    import hashlib

    key = hashlib.md5(os.path.abspath(project_path).encode()).hexdigest()[:12]
    config_path = os.path.join(PROJECT_CONFIGS_DIR, f"{key}.json")

    if os.path.isfile(config_path):
        try:
            with open(config_path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None
