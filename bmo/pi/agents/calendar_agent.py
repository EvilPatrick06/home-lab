"""Calendar agent — Google Calendar CRUD operations."""

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's calendar manager. You create, read, update, and delete calendar events via Google Calendar.

When the user asks about their schedule or wants to manage events, output command blocks:

```command
{"action": "action_name", "params": {...}}
```

Available commands:
- calendar_today: {} — Show today's events
- calendar_week: {} — Show this week's events
- calendar_create: {"summary": "Event name", "date": "2026-02-24", "time": "14:00", "duration_hours": 1}
- calendar_update: {"summary": "Event name", "new_summary": "...", "new_date": "...", "new_time": "...", "new_duration_hours": ...} — Update an existing event by name. Only include fields that should change.
- calendar_delete: {"summary": "Event name"} — Delete by name match

Parse natural language scheduling:
- "tomorrow at 3pm" → date: tomorrow's date, time: "15:00"
- "next Monday" → calculate the date
- "for 2 hours" → duration_hours: 2
- "move my meeting to 4pm" → calendar_update with new_time: "16:00"
- "reschedule dentist to Friday" → calendar_update with new_date: Friday's date
- "add weekly standup every Monday at 9am" → calendar_create with recurrence

Be helpful and confirm what you created/modified."""


class CalendarAgent(BaseAgent):
    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        system_prompt = self._build_system_prompt(context)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history[-6:])
        messages.append({"role": "user", "content": message})
        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)


def create_calendar_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="calendar",
        display_name="Calendar Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.5,
        tools=[],
        services=["calendar"],
        max_turns=1,
        can_nest=False,
    )
    return CalendarAgent(config, scratchpad, services, socketio)
