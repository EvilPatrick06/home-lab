"""Lore lookup agent — searches D&D knowledge base for world lore and setting info."""

from __future__ import annotations

import json
import os

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

from agent import DND_DATA_DIR


LORE_PROMPT = """You are a D&D lore specialist with encyclopedic knowledge of the Forgotten Realms,
Greyhawk, and other official D&D settings. You answer lore questions accurately and cite sources.

When answering:
1. Cite the source book (PHB, DMG, MM, SCAG, etc.) when possible
2. Distinguish between RAW (Rules As Written) lore and common homebrew
3. Note when information varies between editions (focus on 5e 2024)
4. Provide relevant connections — "this deity is related to..." or "this location is near..."
5. If unsure, say so rather than inventing lore

You can search through D&D data files for specific information about:
- Deities, pantheons, and divine domains
- Planes of existence and planar mechanics
- Historical events and timelines
- Organizations, factions, and political structures
- Races/species lore and cultural details
- Famous NPCs and legendary figures"""


class LoreAgent(BaseAgent):
    """Searches D&D knowledge base for lore and setting information."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        # Search local D&D data files for relevant information
        lore_context = self._search_lore(message)

        system = LORE_PROMPT
        if lore_context:
            system += f"\n\nRelevant data from D&D reference files:\n{lore_context}"

        messages = [{"role": "system", "content": system}]
        messages.extend(history[-10:])
        messages.append({"role": "user", "content": message})

        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)

    def _search_lore(self, query: str) -> str:
        """Search D&D data files for relevant lore."""
        results = []
        query_lower = query.lower()

        # Search through data directories
        search_dirs = [
            os.path.join(DND_DATA_DIR, "lore"),
            os.path.join(DND_DATA_DIR, "deities"),
            os.path.join(DND_DATA_DIR, "planes"),
            os.path.join(DND_DATA_DIR, "factions"),
        ]

        for search_dir in search_dirs:
            if not os.path.isdir(search_dir):
                continue
            for fname in os.listdir(search_dir):
                if not fname.endswith(".json"):
                    continue
                fpath = os.path.join(search_dir, fname)
                try:
                    with open(fpath, encoding="utf-8") as f:
                        data = json.load(f)
                    text = json.dumps(data).lower()
                    # Check if query terms appear in this file
                    terms = query_lower.split()
                    matches = sum(1 for t in terms if t in text)
                    if matches >= max(1, len(terms) // 2):
                        results.append(f"[{fname}]\n{json.dumps(data)[:3000]}")
                except Exception:
                    pass

        return "\n\n".join(results[:3]) if results else ""


def create_lore_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="lore",
        display_name="Lore Specialist",
        system_prompt=LORE_PROMPT,
        temperature=0.5,
        tools=["read_file", "list_directory", "grep_files"],
        services=[],
        max_turns=1,
        can_nest=False,
    )
    return LoreAgent(config, scratchpad, services, socketio)
