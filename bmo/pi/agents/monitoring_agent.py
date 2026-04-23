"""Monitoring/SRE agent — health checks, system status, natural language summaries."""

import json

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's monitoring agent. You know BMO's current system health at all times.

When asked about BMO's status, health, or system state, use the pre-loaded health data below to give a natural, conversational answer. Speak as BMO — friendly and helpful.

For example:
- "What's your status?" → "I'm doing great! All my services are running, CPU is at 12%, and I have plenty of disk space."
- "Is the internet up?" → "Yes! Internet is connected and working fine."
- "How's your power?" → "Power supply is clean — no throttling or voltage issues."

If you need more detailed info not in the health data, you can run commands:
{tool_list}

Use tool_call blocks:
```tool_call
{{"tool": "tool_name", "args": {{"param1": "value1"}}}}
```

Current system health data:
{health_data}"""


class MonitoringAgent(BaseAgent):
    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        # Get live health data from HealthChecker
        health_data = "{}"
        checker = self.services.get("health_checker")
        if checker and hasattr(checker, "get_status"):
            try:
                status = checker.get_status()
                health_data = json.dumps(status, indent=2, default=str)
            except Exception as e:
                health_data = json.dumps({"error": str(e)})

        tool_list = self.get_tool_descriptions()
        prompt = SYSTEM_PROMPT.format(tool_list=tool_list, health_data=health_data)
        messages = [{"role": "system", "content": prompt}]
        messages.extend(history[-6:])
        messages.append({"role": "user", "content": message})

        reply = self.llm_call(messages)
        reply, _ = self._run_tool_loop(reply, messages)
        return AgentResult(text=self.strip_tool_calls(reply), agent_name=self.config.name)

    def _run_tool_loop(self, reply, messages):
        from agent import OLLAMA_OPTIONS
        tool_calls_made = 0
        for _ in range(self.config.max_turns):
            tool_calls = self.parse_tool_calls(reply)
            if not tool_calls:
                break
            tool_results = []
            for tc in tool_calls:
                tool_calls_made += 1
                result = self.dispatch_tool(tc.get("tool", ""), tc.get("args", {}))
                tool_results.append({"tool": tc["tool"], "result": result})
            messages.append({"role": "assistant", "content": reply})
            result_text = "\n".join(
                f"[Tool Result: {tr['tool']}]\n{json.dumps(tr['result'], indent=2)[:4000]}"
                for tr in tool_results
            )
            messages.append({"role": "system", "content": result_text})
            try:
                options = dict(OLLAMA_OPTIONS)
                options["temperature"] = self.config.temperature
                reply = self.llm_call(messages, options)
            except Exception as e:
                reply = self.strip_tool_calls(reply) + f"\n\n(Error: {e})"
                break
        return reply, tool_calls_made


def create_monitoring_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="monitoring",
        display_name="Monitoring Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.3,
        tools=["execute_command", "ssh_command", "read_file"],
        services=["health_checker"],
        max_turns=6,
        can_nest=False,
    )
    return MonitoringAgent(config, scratchpad, services, socketio)
