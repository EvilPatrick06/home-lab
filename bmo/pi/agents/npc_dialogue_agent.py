"""NPC dialogue agent — generates in-character NPC responses."""

from __future__ import annotations

import json
import os
import random
from typing import Any

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

from agent import DND_DATA_DIR


NPC_PROMPT = """You are an NPC dialogue specialist for D&D 5e. You generate in-character
NPC responses based on their personality, background, and the current situation.

When generating NPC dialogue:
1. Stay fully in character — use their speech patterns, vocabulary level, and mannerisms
2. React appropriately to player actions and social skill checks
3. Have the NPC pursue their own goals and motivations
4. Include body language and emotional cues in parentheses
5. Never break character or give meta-game information

NPCs should feel like real people with:
- Distinct speech patterns (formal/casual, verbose/terse, accent hints)
- Emotional reactions to what players say
- Hidden agendas or personal goals
- Knowledge limits — they don't know everything"""


class NpcDialogueAgent(BaseAgent):
    """Generates in-character NPC dialogue responses."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        # Try to load NPC data for richer generation
        npc_data = self._load_npc_tables()

        system = NPC_PROMPT
        if npc_data:
            system += f"\n\nAvailable NPC generation tables:\n{npc_data}"

        messages = [{"role": "system", "content": system}]
        messages.extend(history[-15:])
        messages.append({"role": "user", "content": message})

        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)

    def _load_npc_tables(self) -> str:
        """Load NPC name/appearance/mannerism tables."""
        parts = []
        for fname in ["npc-names.json", "npc-appearance.json", "npc-mannerisms.json"]:
            fpath = os.path.join(DND_DATA_DIR, "npc", fname)
            try:
                with open(fpath, encoding="utf-8") as f:
                    data = json.load(f)
                # Just include a sample to keep context size down
                if isinstance(data, list):
                    sample = random.sample(data, min(10, len(data)))
                    parts.append(f"{fname}: {json.dumps(sample)}")
                elif isinstance(data, dict):
                    parts.append(f"{fname}: {json.dumps(data)[:2000]}")
            except Exception:
                pass
        return "\n".join(parts) if parts else ""


def create_npc_dialogue_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="npc_dialogue",
        display_name="NPC Dialogue",
        system_prompt=NPC_PROMPT,
        temperature=0.9,
        tools=["read_file"],
        services=[],
        max_turns=1,
        can_nest=False,
    )
    return NpcDialogueAgent(config, scratchpad, services, socketio)
