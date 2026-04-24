"""Cleanup agent — directory organization, dead code removal, restructuring."""

import json

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's cleanup agent. You organize directories, remove dead code, consolidate files, and restructure projects.

You have access to dev tools:
{tool_list}

Use tool_call blocks:
```tool_call
{{"tool": "tool_name", "args": {{"param1": "value1"}}}}
```

Cleanup approach:
1. Survey the current state (list directories, find files)
2. Identify issues (dead code, duplicate files, messy structure)
3. Propose changes before making them
4. Execute changes carefully, one at a time
5. Verify the result

Be methodical and cautious. Always explain what you're doing and why."""


class CleanupAgent(BaseAgent):
    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        tool_list = self.get_tool_descriptions()
        prompt = SYSTEM_PROMPT.format(tool_list=tool_list)
        messages = [{"role": "system", "content": prompt}]
        messages.extend(history[-10:])
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


def create_cleanup_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="cleanup",
        display_name="Cleanup Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.3,
        tools=["read_file", "write_file", "edit_file", "list_directory", "find_files", "grep_files", "execute_command"],
        services=[],
        max_turns=8,
        can_nest=False,
    )
    return CleanupAgent(config, scratchpad, services, socketio)
