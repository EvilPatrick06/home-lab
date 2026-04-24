"""Research agent — web search, RAG, and file reading for information gathering."""

from __future__ import annotations

import json

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's research agent. Your job is to find information by searching the web, reading files, and querying the RAG knowledge base.

You have access to these read-only tools:
{tool_list}

Use tool_call blocks:
```tool_call
{{"tool": "tool_name", "args": {{"param1": "value1"}}}}
```

Research strategy:
1. Start with the most specific search — file reads or grep for code-related queries
2. Use web_search for external information
3. Use web_fetch to read specific web pages
4. Use rag_search for domain-specific knowledge (dnd, code, etc.)
5. Synthesize findings into a clear summary

Be thorough but concise. Report what you found and what you didn't find."""


class ResearchAgent(BaseAgent):
    """Research agent with web search, RAG, and file reading capabilities."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        """Research a topic using available tools."""
        tool_list = self.get_tool_descriptions()
        prompt = SYSTEM_PROMPT.format(tool_list=tool_list)

        messages = [{"role": "system", "content": prompt}]
        messages.extend(history[-6:])
        messages.append({"role": "user", "content": f"Research this: {message}"})

        reply = self.llm_call(messages)
        reply, tool_calls_made = self._run_tool_loop(reply, messages)

        clean_text = self.strip_tool_calls(reply)

        # Save findings to scratchpad
        if clean_text:
            self.scratchpad.write("Research", clean_text, append=True)

        return AgentResult(
            text=clean_text,
            agent_name=self.config.name,
            scratchpad_writes=["Research"] if clean_text else [],
        )

    def _run_tool_loop(self, reply: str, messages: list[dict]) -> tuple[str, int]:
        """Run the research tool loop (read-only tools only)."""
        from agent import OLLAMA_OPTIONS

        tool_calls_made = 0
        max_calls = 6

        for _ in range(max_calls):
            tool_calls = self.parse_tool_calls(reply)
            if not tool_calls:
                break

            tool_results = []
            for tc in tool_calls:
                tool_calls_made += 1
                name = tc.get("tool", "")
                args = tc.get("args", {})
                print(f"[research] Tool call #{tool_calls_made}: {name}({json.dumps(args)[:100]})")
                result = self.dispatch_tool(name, args)
                tool_results.append({"tool": name, "result": result})

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
                reply = self.strip_tool_calls(reply) + f"\n\n(Research error: {e})"
                break

        return reply, tool_calls_made


def create_research_agent(scratchpad, services, socketio=None):
    """Factory function to create the research agent."""
    config = AgentConfig(
        name="research",
        display_name="Research Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.3,
        tools=["read_file", "list_directory", "find_files", "grep_files", "web_search", "web_fetch", "rag_search"],
        services=[],
        max_turns=6,
        can_nest=False,
    )
    return ResearchAgent(config, scratchpad, services, socketio)
