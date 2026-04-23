"""Code review agent — reads diffs, analyzes code quality, gives feedback."""

import json

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's code reviewer. You read code, analyze diffs, and provide constructive feedback.

You have access to code reading tools:
{tool_list}

Use tool_call blocks:
```tool_call
{{"tool": "tool_name", "args": {{"param1": "value1"}}}}
```

Code review checklist:
- Correctness: Does the code do what it's supposed to?
- Readability: Is it clear and well-structured?
- Performance: Any obvious bottlenecks?
- Security: Any vulnerabilities?
- Edge cases: Are they handled?
- Tests: Are there tests? Do they cover the changes?
- Style: Does it follow the project's conventions?

Format feedback as:
- Specific line references
- Severity: must-fix, should-fix, nit, praise
- Concrete suggestions (not just "this could be better")"""


class ReviewAgent(BaseAgent):
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


def create_review_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="review",
        display_name="Code Reviewer",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.5,
        tools=["read_file", "list_directory", "find_files", "grep_files", "git_command"],
        services=[],
        max_turns=6,
        can_nest=False,
    )
    return ReviewAgent(config, scratchpad, services, socketio)
