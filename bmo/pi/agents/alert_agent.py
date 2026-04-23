"""Alert agent — query and configure proactive alerts via voice."""

from __future__ import annotations

from agents.base_agent import AgentConfig, AgentResult, BaseAgent


SYSTEM_PROMPT = """You are BMO's alert manager. You help the user check and configure proactive alerts.

Commands:
- alert_history: Show recent alerts
- alert_config: Show/update alert settings (quiet hours, sources)

Keep responses brief — this is spoken aloud via TTS.
IMPORTANT: Never use markdown formatting. Write in plain English only."""


class AlertAgent(BaseAgent):
    """Agent for querying and configuring alerts."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        alert_svc = self.services.get("alerts")
        if not alert_svc:
            return AgentResult(
                text="Alert service isn't running right now.",
                agent_name=self.config.name,
            )

        lower = message.lower()

        # Show recent alerts
        if any(p in lower for p in ["recent alert", "alert history", "what alerts", "any alerts"]):
            alerts = alert_svc.get_history(limit=5)
            if not alerts:
                return AgentResult(text="No recent alerts.", agent_name=self.config.name)
            lines = [f"Here are your last {len(alerts)} alerts:"]
            for a in alerts:
                import time
                ts = time.strftime("%I:%M %p", time.localtime(a["timestamp"]))
                lines.append(f"  {ts} - {a['title']} ({a['priority']})")
            return AgentResult(text="\n".join(lines), agent_name=self.config.name)

        # Show config
        if any(p in lower for p in ["alert settings", "alert config", "quiet hours"]):
            config = alert_svc.get_config()
            quiet = config.get("quiet_hours", {})
            lines = ["Alert settings:"]
            if quiet.get("enabled"):
                lines.append(f"  Quiet hours: {quiet.get('start', 23)}:00 to {quiet.get('end', 7)}:00")
            else:
                lines.append("  Quiet hours: disabled")
            sources = config.get("sources", {})
            enabled = [s for s, v in sources.items() if v]
            lines.append(f"  Active sources: {', '.join(enabled)}")
            return AgentResult(text="\n".join(lines), agent_name=self.config.name)

        # Toggle quiet hours
        if "disable quiet" in lower or "turn off quiet" in lower:
            alert_svc.update_config(quiet_hours={"enabled": False})
            return AgentResult(text="Quiet hours disabled.", agent_name=self.config.name)
        if "enable quiet" in lower or "turn on quiet" in lower:
            alert_svc.update_config(quiet_hours={"enabled": True, "start": 23, "end": 7})
            return AgentResult(text="Quiet hours enabled from 11 PM to 7 AM.", agent_name=self.config.name)

        # Fallback to LLM
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(history[-4:])
        messages.append({"role": "user", "content": message})
        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)


def create_alert_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="alert",
        display_name="Alert Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.5,
        tools=[],
        services=["alerts"],
        max_turns=1,
        can_nest=False,
    )
    return AlertAgent(config, scratchpad, services, socketio)
