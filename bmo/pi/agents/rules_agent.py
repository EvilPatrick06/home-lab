"""Rules arbiter agent — answers rules questions with citations."""

from __future__ import annotations

import json
import os

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

from agent import DND_DATA_DIR


RULES_PROMPT = """You are a D&D 5e (2024 edition) rules arbiter. You answer rules questions
accurately, citing specific page numbers and sections when possible.

Key principles:
1. Always cite the source: "PHB 2024, p.XX" or "DMG 2024, Chapter X"
2. Distinguish between RAW (Rules As Written), RAI (Rules As Intended), and common house rules
3. When rules are ambiguous, present both interpretations and the most common ruling
4. For combat rules, show the complete mechanical flow step by step
5. Note any differences between 2014 and 2024 PHB rules when relevant
6. If a rule was errata'd or clarified in Sage Advice, mention it

Common topics you handle:
- Action economy (Action, Bonus Action, Reaction, Free Interaction, Movement)
- Spellcasting rules (concentration, components, targeting, AOE)
- Combat mechanics (attack rolls, saving throws, damage types, conditions)
- Skill checks and ability checks
- Multiclassing rules and prerequisites
- Feat prerequisites and interactions
- Class feature interactions
- Equipment, armor, and weapon properties"""


class RulesAgent(BaseAgent):
    """Answers D&D 5e rules questions with citations."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        # Search SRD data for relevant rules
        rules_context = self._search_rules(message)

        system = RULES_PROMPT
        if rules_context:
            system += f"\n\nRelevant SRD/rules data:\n{rules_context}"

        messages = [{"role": "system", "content": system}]
        messages.extend(history[-10:])
        messages.append({"role": "user", "content": message})

        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)

    def _search_rules(self, query: str) -> str:
        """Search SRD and rules data files for relevant information."""
        results = []
        query_lower = query.lower()
        keywords = set(query_lower.split())

        # Search conditions, spells, class features, etc.
        search_paths = [
            os.path.join(DND_DATA_DIR, "conditions"),
            os.path.join(DND_DATA_DIR, "spells"),
            os.path.join(DND_DATA_DIR, "classes"),
            os.path.join(DND_DATA_DIR, "rules"),
            os.path.join(DND_DATA_DIR, "equipment"),
        ]

        for search_dir in search_paths:
            if not os.path.isdir(search_dir):
                continue
            for fname in os.listdir(search_dir):
                if not fname.endswith(".json"):
                    continue
                # Quick relevance check from filename
                fname_words = set(fname.lower().replace("-", " ").replace(".json", "").split())
                if not keywords.intersection(fname_words) and len(keywords) > 1:
                    continue
                fpath = os.path.join(search_dir, fname)
                try:
                    with open(fpath, encoding="utf-8") as f:
                        data = json.load(f)
                    text = json.dumps(data).lower()
                    matches = sum(1 for k in keywords if k in text)
                    if matches >= max(1, len(keywords) // 3):
                        results.append(f"[{fname}]\n{json.dumps(data)[:4000]}")
                except Exception:
                    pass

        return "\n\n".join(results[:3]) if results else ""


def create_rules_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="rules",
        display_name="Rules Arbiter",
        system_prompt=RULES_PROMPT,
        temperature=0.3,
        tools=["read_file", "list_directory", "grep_files"],
        services=[],
        max_turns=1,
        can_nest=False,
    )
    return RulesAgent(config, scratchpad, services, socketio)
