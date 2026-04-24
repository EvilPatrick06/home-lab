"""Session recap agent — summarizes recent D&D session events."""

from __future__ import annotations

from typing import Any

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

from agent import OLLAMA_PLAN_OPTIONS


RECAP_PROMPT = """You are a session recap narrator for D&D 5e. You summarize recent
game events into a compelling "Previously on..." narrative.

Guidelines:
1. Write in a dramatic narrator voice, like the intro to a TV episode
2. Focus on: where the party is, what they accomplished, ongoing threats, unresolved plot threads
3. Mention character names and their notable actions
4. Keep it to 3-5 sentences — enough to jog memory without being exhaustive
5. End with a hook that connects to where the session left off
6. Do NOT include mechanical details (HP, spell slots, etc.) — keep it narrative"""


class SessionRecapAgent(BaseAgent):
    """Generates narrative session recaps from conversation history."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        # Use more history for recap generation
        recent = history[-40:] if len(history) > 40 else history

        system = RECAP_PROMPT

        # If the orchestrator has a DnD DM agent, get its game state
        gamestate_context = ""
        if self.orchestrator:
            dm_agent = self.orchestrator.agents.get("dnd_dm")
            if dm_agent and hasattr(dm_agent, "get_gamestate"):
                gs = dm_agent.get_gamestate()
                if gs and gs.get("characters"):
                    chars = []
                    for name, state in gs["characters"].items():
                        hp = state.get("hp", "?")
                        hp_max = state.get("hp_max", "?")
                        conditions = state.get("conditions", [])
                        chars.append(f"{name}: HP {hp}/{hp_max}" + (f", Conditions: {', '.join(conditions)}" if conditions else ""))
                    gamestate_context = "\n\nCurrent party status:\n" + "\n".join(chars)

            # Get player names if available
            if dm_agent and hasattr(dm_agent, "get_player_names"):
                names = dm_agent.get_player_names()
                if names:
                    gamestate_context += f"\nPlayer characters: {', '.join(names)}"

        messages = [{"role": "system", "content": system + gamestate_context}]

        # Feed conversation history as context
        for msg in recent:
            role = msg.get("role", "user")
            text = msg.get("content", msg.get("text", ""))[:500]
            if text:
                messages.append({"role": role, "content": text})

        messages.append({
            "role": "user",
            "content": message or "Generate a 'Previously on...' session recap based on the conversation above."
        })

        reply = self.llm_call(messages, OLLAMA_PLAN_OPTIONS)
        return AgentResult(text=reply, agent_name=self.config.name)


def create_session_recap_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="session_recap",
        display_name="Session Recap",
        system_prompt=RECAP_PROMPT,
        temperature=0.8,
        tools=[],
        services=[],
        max_turns=1,
        can_nest=False,
    )
    return SessionRecapAgent(config, scratchpad, services, socketio)
