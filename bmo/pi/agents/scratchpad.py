"""Shared scratchpad for inter-agent context passing.

Session-persistent text buffer with named sections. Any agent can read/write.
Survives across messages within a session but resets when the server restarts.
"""

from __future__ import annotations


class SharedScratchpad:
    """Session-persistent text buffer with named sections."""

    def __init__(self):
        self._sections: dict[str, str] = {}

    def write(self, section: str, content: str, append: bool = False) -> None:
        """Write content to a named section.

        Args:
            section: Section name (e.g. "Plan", "Research Notes", "Issues Found")
            content: Text content to write
            append: If True, append to existing content; if False, overwrite
        """
        if append and section in self._sections:
            self._sections[section] += "\n" + content
        else:
            self._sections[section] = content

    def read(self, section: str) -> str:
        """Read a named section. Returns empty string if section doesn't exist."""
        return self._sections.get(section, "")

    def read_all(self) -> str:
        """Read all sections, formatted with headers."""
        if not self._sections:
            return ""
        parts = []
        for name, content in self._sections.items():
            parts.append(f"## {name}\n{content}")
        return "\n\n".join(parts)

    def clear(self, section: str | None = None) -> None:
        """Clear a specific section, or all sections if none specified."""
        if section is None:
            self._sections.clear()
        else:
            self._sections.pop(section, None)

    def summary(self) -> str:
        """One-line summary per section, for context injection into prompts."""
        if not self._sections:
            return ""
        lines = []
        for name, content in self._sections.items():
            # First line or first 80 chars
            preview = content.split("\n")[0][:80]
            lines.append(f"- {name}: {preview}")
        return "\n".join(lines)

    def sections(self) -> list[str]:
        """Return list of section names."""
        return list(self._sections.keys())

    def has_content(self) -> bool:
        """Check if any sections have content."""
        return bool(self._sections)

    def to_dict(self) -> dict[str, str]:
        """Serialize to dict (for SocketIO/API)."""
        return dict(self._sections)
