"""Routine agent — manage automation routines via voice/chat."""

from __future__ import annotations

import re

from agents.base_agent import AgentConfig, AgentResult, BaseAgent


SYSTEM_PROMPT = """You are BMO's routine manager. You help create, list, trigger, and manage automation routines.

Commands:
- routine_create: Create a new routine with triggers and actions
- routine_list: List all routines
- routine_trigger: Manually trigger a routine by name
- routine_enable/disable: Enable or disable a routine
- routine_delete: Delete a routine

Keep responses brief — this is spoken aloud via TTS.
IMPORTANT: Never use markdown formatting. Write in plain English only."""


class RoutineAgent(BaseAgent):
    """Agent for managing automation routines."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        routine_svc = self.services.get("routines")
        if not routine_svc:
            return AgentResult(
                text="Routine service isn't running right now.",
                agent_name=self.config.name,
            )

        lower = message.lower()

        # List routines
        if any(p in lower for p in ["list routine", "my routine", "all routine", "show routine", "what routine"]):
            routines = routine_svc.get_all()
            if not routines:
                return AgentResult(text="You don't have any routines yet.", agent_name=self.config.name)
            lines = [f"You have {len(routines)} routine{'s' if len(routines) != 1 else ''}:"]
            for r in routines:
                status = "enabled" if r.get("enabled", True) else "disabled"
                triggers = [t.get("type", "?") for t in r.get("triggers", [])]
                actions_count = len(r.get("actions", []))
                lines.append(f"  {r['name']} ({status}) - {', '.join(triggers)} trigger, {actions_count} actions")
            return AgentResult(text="\n".join(lines), agent_name=self.config.name)

        # Trigger a routine manually
        m = re.search(r"(?:trigger|run|start|activate)\s+(?:the\s+)?(.+?)\s*routine", lower)
        if m:
            name = m.group(1).strip()
            routine = routine_svc.find_by_name(name)
            if routine:
                import threading
                threading.Thread(
                    target=routine_svc.trigger_routine,
                    args=(routine["id"],),
                    daemon=True,
                ).start()
                return AgentResult(text=f"Running {routine['name']} routine!", agent_name=self.config.name)
            return AgentResult(text=f"I don't have a routine called {name}.", agent_name=self.config.name)

        # Enable/disable
        m = re.search(r"(enable|disable)\s+(?:the\s+)?(.+?)\s*routine", lower)
        if m:
            action, name = m.group(1), m.group(2).strip()
            routine = routine_svc.find_by_name(name)
            if routine:
                enabled = action == "enable"
                routine_svc.enable_routine(routine["id"], enabled)
                return AgentResult(
                    text=f"{routine['name']} routine {'enabled' if enabled else 'disabled'}.",
                    agent_name=self.config.name,
                )
            return AgentResult(text=f"I don't have a routine called {name}.", agent_name=self.config.name)

        # Delete
        m = re.search(r"delete\s+(?:the\s+)?(.+?)\s*routine", lower)
        if m:
            name = m.group(1).strip()
            routine = routine_svc.find_by_name(name)
            if routine:
                routine_svc.delete_routine(routine["id"])
                return AgentResult(text=f"Deleted the {routine['name']} routine.", agent_name=self.config.name)
            return AgentResult(text=f"I don't have a routine called {name}.", agent_name=self.config.name)

        # Fallback to LLM
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(history[-4:])
        messages.append({"role": "user", "content": message})
        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)


def create_routine_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="routine",
        display_name="Routine Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.5,
        tools=[],
        services=["routines"],
        max_turns=1,
        can_nest=False,
    )
    return RoutineAgent(config, scratchpad, services, socketio)
