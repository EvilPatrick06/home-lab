"""BMO Auto-Memory — Persistent per-project memory across sessions.

Stores memory files at ~/bmo/data/memory/<project_hash>/MEMORY.md
where project_hash is MD5 of the absolute working directory path.

BMO can write observations, patterns, and decisions to memory via LLM tools,
and memory is automatically loaded into the system prompt at session start.
"""

from __future__ import annotations

import hashlib
import os

MEMORY_BASE_DIR = os.path.expanduser("~/bmo/data/memory")
MEMORY_FILENAME = "MEMORY.md"


def _project_hash(working_dir: str) -> str:
    """Generate a stable hash for a working directory path."""
    normalized = os.path.realpath(os.path.expanduser(working_dir))
    return hashlib.md5(normalized.encode()).hexdigest()[:12]


def get_memory_path(working_dir: str) -> str:
    """Get the full path to the memory file for a project."""
    h = _project_hash(working_dir)
    return os.path.join(MEMORY_BASE_DIR, h, MEMORY_FILENAME)


def load_memory(working_dir: str, max_lines: int = 200) -> str:
    """Load the memory file for a project.

    Args:
        working_dir: The project's working directory.
        max_lines: Maximum number of lines to load (truncates with notice).

    Returns:
        The memory contents as a string, or empty string if no memory exists.
    """
    path = get_memory_path(working_dir)
    if not os.path.isfile(path):
        return ""

    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except Exception:
        return ""

    if len(lines) > max_lines:
        truncated = lines[:max_lines]
        truncated.append(f"\n... ({len(lines) - max_lines} lines truncated) ...\n")
        return "".join(truncated)

    return "".join(lines)


def save_memory(working_dir: str, content: str, append: bool = False) -> None:
    """Save content to the memory file for a project.

    Args:
        working_dir: The project's working directory.
        content: The content to write.
        append: If True, append to existing memory. If False, overwrite.
    """
    path = get_memory_path(working_dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    mode = "a" if append else "w"
    with open(path, mode, encoding="utf-8") as f:
        if append and os.path.isfile(path) and os.path.getsize(path) > 0:
            # Ensure there's a newline separator when appending
            f.write("\n")
        f.write(content)


def update_memory_section(working_dir: str, section: str, content: str) -> None:
    """Update or add a specific section in the memory file.

    Sections are identified by markdown headers (## Section Name).
    If the section exists, its content is replaced. If not, it's appended.

    Args:
        working_dir: The project's working directory.
        section: Section header (without ##).
        content: New section content.
    """
    path = get_memory_path(working_dir)
    existing = ""
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                existing = f.read()
        except Exception:
            pass

    header = f"## {section}"
    new_section = f"{header}\n{content}\n"

    if header in existing:
        # Replace existing section
        lines = existing.split("\n")
        result = []
        in_section = False
        section_replaced = False

        for line in lines:
            if line.strip().startswith("## "):
                if line.strip() == header:
                    # Start of our section — replace it
                    in_section = True
                    if not section_replaced:
                        result.append(new_section.rstrip())
                        section_replaced = True
                    continue
                else:
                    in_section = False

            if not in_section:
                result.append(line)

        existing = "\n".join(result)
    else:
        # Append new section
        if existing and not existing.endswith("\n"):
            existing += "\n"
        existing += "\n" + new_section

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(existing)


def clear_memory(working_dir: str) -> bool:
    """Clear the memory file for a project.

    Returns True if memory was cleared, False if no memory existed.
    """
    path = get_memory_path(working_dir)
    if os.path.isfile(path):
        os.remove(path)
        return True
    return False


def get_memory_guidance() -> str:
    """Return the system prompt guidance for auto-memory usage."""
    return """You have a persistent memory system. Use the write_memory and read_memory tools to save and recall information across sessions.

Save stable patterns:
- Project conventions confirmed across interactions
- Key file paths and architecture decisions
- User preferences for workflow and tools
- Solutions to recurring problems

Do NOT save:
- Session-specific context (current task details, temporary state)
- Speculative or unverified conclusions
- Duplicate information already in memory"""
