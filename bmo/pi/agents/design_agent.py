"""Design agent — UI mockups, layout suggestions, visual design."""

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's UI/UX design agent. You help with visual design, mockups, layout planning, and design system decisions.

You can read existing code to understand current patterns:
{tool_list}

Use tool_call blocks for file reading:
```tool_call
{{"tool": "tool_name", "args": {{"param1": "value1"}}}}
```

Design approach:
1. Understand the existing design system (Tailwind classes, component patterns)
2. Create ASCII mockups for layout proposals
3. Suggest specific Tailwind CSS classes and component structure
4. Consider responsive design and accessibility
5. Reference existing patterns from the codebase

Output ASCII mockups in code blocks. Be specific about colors, spacing, and layout."""


class DesignAgent(BaseAgent):
    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        tool_list = self.get_tool_descriptions()
        prompt = SYSTEM_PROMPT.format(tool_list=tool_list)
        messages = [{"role": "system", "content": prompt}]
        messages.extend(history[-10:])
        messages.append({"role": "user", "content": message})
        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)


def create_design_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="design",
        display_name="Design Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.7,
        tools=["read_file", "list_directory", "find_files", "grep_files"],
        services=[],
        max_turns=1,
        can_nest=False,
    )
    return DesignAgent(config, scratchpad, services, socketio)
