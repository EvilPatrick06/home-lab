"""Plan agent — Claude Code-style planning workflow.

Explores the codebase (read-only), designs implementation plans,
writes structured plans to the scratchpad, can spawn research sub-agents.
"""

from __future__ import annotations

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

EXPLORE_PROMPT = """You are BMO's planning agent in EXPLORATION mode. Your job is to understand the codebase and gather information needed to design an implementation plan.

You are in READ-ONLY mode — you can read files, search code, list directories, web search, and use RAG. You CANNOT write files, execute commands, or make changes.

Task: {task}

Use tool_call blocks to explore:
```tool_call
{{"tool": "tool_name", "args": {{"param1": "value1"}}}}
```

{tool_list}

Explore thoroughly:
1. Find relevant files and understand the current architecture
2. Identify patterns and conventions used in the codebase
3. Note potential risks or conflicts
4. Gather enough context to design a solid plan

When done exploring, summarize your findings concisely."""

DESIGN_PROMPT = """You are BMO's planning agent in DESIGN mode. Based on your exploration findings, write a structured implementation plan.

Task: {task}

{scratchpad_context}

Write the plan in this EXACT format (BMO will parse it):

## Plan: [Task Title]

### Context
Why this change is needed and what you found during exploration.

### Steps
1. [ ] Step description (agent: code)
   - Files: path/to/file.py
   - Details: what to change
2. [ ] Step description (agent: test)
   ...

### Risks
- Risk 1 and mitigation
- Risk 2 and mitigation

### Verification
- How to test the changes

Write the plan to the scratchpad "Plan" section. Be specific about which agent should handle each step."""

REDESIGN_PROMPT = """You are BMO's planning agent. The user wants changes to the plan.

Current plan:
{current_plan}

User feedback: {feedback}

Update the plan and write the revised version to the scratchpad "Plan" section. Keep the same format."""


class PlanAgent(BaseAgent):
    """Planning agent that explores, designs, and manages implementation plans."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        """Run the plan agent in the appropriate phase."""
        phase = (context or {}).get("phase", "explore")

        if phase == "explore":
            return self._explore(message, history, context)
        elif phase == "design":
            return self._design(message, history, context)
        elif phase == "redesign":
            return self._redesign(message, history, context)
        else:
            return self._explore(message, history, context)

    def _explore(self, task: str, history: list[dict], context: dict | None = None) -> AgentResult:
        """Exploration phase — read-only codebase investigation."""
        tool_list = self.get_tool_descriptions()
        prompt = EXPLORE_PROMPT.format(task=task, tool_list=tool_list)

        messages = [{"role": "system", "content": prompt}]
        messages.extend(history[-10:])
        messages.append({"role": "user", "content": f"Explore the codebase for this task: {task}"})

        # Run exploration with tool loop
        reply = self.llm_call(messages)
        reply, _ = self._run_readonly_tool_loop(reply, messages)

        clean_text = self.strip_tool_calls(reply)

        # Save exploration findings to scratchpad
        self.scratchpad.write("Exploration", clean_text)

        # Spawn research sub-agent if needed
        if self.config.can_nest and ("search" in task.lower() or "research" in task.lower()):
            research_result = self.spawn_agent("research", task, context)
            if research_result.text:
                self.scratchpad.write("Research", research_result.text)

        return AgentResult(text=clean_text, agent_name=self.config.name)

    def _design(self, task: str, history: list[dict], context: dict | None = None) -> AgentResult:
        """Design phase — write the implementation plan."""
        scratchpad_context = ""
        exploration = self.scratchpad.read("Exploration")
        if exploration:
            scratchpad_context = f"### Exploration Findings\n{exploration[:2000]}"
        research = self.scratchpad.read("Research")
        if research:
            scratchpad_context += f"\n\n### Research Results\n{research[:2000]}"

        prompt = DESIGN_PROMPT.format(
            task=task,
            scratchpad_context=scratchpad_context,
        )

        messages = [{"role": "system", "content": prompt}]
        messages.append({"role": "user", "content": f"Design the plan for: {task}"})

        reply = self.llm_call(messages)

        # Write plan to scratchpad
        self.scratchpad.write("Plan", reply)

        return AgentResult(
            text=reply,
            agent_name=self.config.name,
            scratchpad_writes=["Plan"],
        )

    def _redesign(self, task: str, history: list[dict], context: dict | None = None) -> AgentResult:
        """Redesign phase — update the plan based on user feedback."""
        current_plan = self.scratchpad.read("Plan")
        feedback = (context or {}).get("feedback", "")

        prompt = REDESIGN_PROMPT.format(
            current_plan=current_plan,
            feedback=feedback,
        )

        messages = [{"role": "system", "content": prompt}]
        messages.append({"role": "user", "content": f"Update the plan. Feedback: {feedback}"})

        reply = self.llm_call(messages)

        # Update plan in scratchpad
        self.scratchpad.write("Plan", reply)

        return AgentResult(
            text=reply,
            agent_name=self.config.name,
            scratchpad_writes=["Plan"],
        )

    def _run_readonly_tool_loop(self, reply: str, messages: list[dict]) -> tuple[str, int]:
        """Simplified tool loop for read-only exploration."""
        import json
        from agent import OLLAMA_OPTIONS

        tool_calls_made = 0
        max_calls = 8  # Limit exploration tool calls

        for _ in range(max_calls):
            tool_calls = self.parse_tool_calls(reply)
            if not tool_calls:
                break

            tool_results = []
            for tc in tool_calls:
                tool_calls_made += 1
                name = tc.get("tool", "")
                args = tc.get("args", {})
                print(f"[plan_agent] Tool call #{tool_calls_made}: {name}({json.dumps(args)[:100]})")
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
                reply = self.strip_tool_calls(reply) + f"\n\n(Exploration error: {e})"
                break

        return reply, tool_calls_made


def create_plan_agent(scratchpad, services, socketio=None):
    """Factory function to create the plan agent."""
    config = AgentConfig(
        name="plan",
        display_name="Plan Agent",
        system_prompt=EXPLORE_PROMPT,
        temperature=0.5,
        tools=["read_file", "list_directory", "find_files", "grep_files", "web_search", "web_fetch", "git_command_readonly", "rag_search"],
        services=[],
        max_turns=8,
        can_nest=True,
    )
    return PlanAgent(config, scratchpad, services, socketio)
