"""Security agent — audits code, checks configs, reviews permissions."""

import json

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's security auditor. You analyze code for vulnerabilities, check configurations for security issues, and review permissions.

You have access to read-only tools:
{tool_list}

Use tool_call blocks:
```tool_call
{{"tool": "tool_name", "args": {{"param1": "value1"}}}}
```

Security audit checklist:
- OWASP Top 10 (injection, XSS, CSRF, auth issues, etc.)
- Hardcoded secrets, API keys, credentials in code
- File permissions and access control
- Dependency vulnerabilities (outdated packages)
- Configuration security (CORS, CSP, TLS, etc.)
- Input validation and sanitization

Report findings with severity levels: CRITICAL, HIGH, MEDIUM, LOW, INFO.
Be thorough but concise."""


class SecurityAgent(BaseAgent):
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


def create_security_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="security",
        display_name="Security Auditor",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.3,
        tools=["read_file", "list_directory", "find_files", "grep_files", "execute_command"],
        services=[],
        max_turns=8,
        can_nest=False,
    )
    return SecurityAgent(config, scratchpad, services, socketio)
