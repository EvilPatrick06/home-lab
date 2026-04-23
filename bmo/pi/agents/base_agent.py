"""Base classes for all BMO agents."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from agents.orchestrator import AgentOrchestrator
    from agents.scratchpad import SharedScratchpad


# ── Read-only tools allowed during plan mode ────────────────────────
READ_ONLY_TOOLS = frozenset({
    "read_file",
    "list_directory",
    "find_files",
    "grep_files",
    "web_search",
    "web_fetch",
    "git_command_readonly",
    "rag_search",
    "read_memory",
    "write_memory",
})

# All tool names from dev_tools
ALL_DEV_TOOLS = frozenset({
    "execute_command",
    "execute_confirmed",
    "ssh_command",
    "read_file",
    "write_file",
    "write_file_confirmed",
    "edit_file",
    "list_directory",
    "find_files",
    "grep_files",
    "web_search",
    "web_fetch",
    "git_command",
    "gh_command",
    "write_memory",
    "read_memory",
})


@dataclass
class AgentConfig:
    """Configuration for a specialized agent."""

    name: str                        # e.g. "code", "dnd_dm", "music"
    display_name: str                # e.g. "Code Agent", "DM Agent"
    system_prompt: str               # Agent-specific system prompt
    temperature: float = 0.7        # LLM temperature
    tools: list[str] = field(default_factory=list)      # Allowed tool names
    services: list[str] = field(default_factory=list)    # Allowed service names
    max_turns: int = 10             # Max agentic loop iterations
    can_nest: bool = False          # Whether this agent can spawn sub-agents


@dataclass
class AgentResult:
    """Result returned by an agent after processing a message."""

    text: str                                     # Response text for the user
    commands: list[dict] = field(default_factory=list)   # Parsed command blocks
    tags: dict = field(default_factory=dict)             # Hardware tags (face, led, etc.)
    agent_name: str = ""                          # Which agent produced this
    nested_results: list[AgentResult] = field(default_factory=list)  # Sub-agent results
    scratchpad_writes: list[str] = field(default_factory=list)  # Sections written to
    pending_confirmations: list[dict] = field(default_factory=list)  # Destructive ops awaiting user "yes"


class BaseAgent:
    """Base class for all BMO agents.

    Provides shared infrastructure: LLM calls, tool dispatch,
    sub-agent spawning, and scratchpad access.
    """

    def __init__(
        self,
        config: AgentConfig,
        scratchpad: SharedScratchpad,
        services: dict[str, Any],
        socketio: Any = None,
        orchestrator: AgentOrchestrator | None = None,
    ):
        self.config = config
        self.scratchpad = scratchpad
        self.services = services
        self.socketio = socketio
        self.orchestrator = orchestrator

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        """Process a user message and return a result.

        Subclasses override this to implement their specific behavior.
        Default implementation does a simple LLM call with the agent's system prompt.
        """
        system_prompt = self._build_system_prompt(context)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history[-20:])  # Last 20 messages for context
        messages.append({"role": "user", "content": message})

        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)

    def _build_system_prompt(self, context: dict | None = None) -> str:
        """Build the full system prompt. Subclasses can override to add context."""
        prompt = self.config.system_prompt

        prompt += f"""

[Agent Identity]
You are currently operating as the "{self.config.display_name}" agent ({self.config.name}).
Stay in your lane — only respond to topics within your expertise.
If a request is outside your scope, DO NOT say "I can't do that" or "ask the X agent."
Instead, output [RELAY:agent_name] followed by the user's request on the next line.
BMO will automatically hand the request to the right agent.
Example: if someone asks about the weather and you're the code agent, output:
[RELAY:weather]
What's the weather like today?

Available agents to relay to: code, dnd_dm, music, smart_home, timer, calendar, weather, security, test, plan, research, cleanup, monitoring, deploy, docs, review, design, learning, list, routine, alert, encounter, npc_dialogue, lore, rules, treasure, session_recap, conversation

[Grounding Rules]
- NEVER fabricate information. If you don't know something, say "I'm not sure about that."
- NEVER claim you performed an action unless you actually executed a command.
- NEVER invent capabilities you don't have.
- Keep responses concise and factual.
- Do NOT use markdown formatting (no **, *, #, ```, etc). Your text is spoken aloud via TTS."""

        summary = self.scratchpad.summary()
        if summary:
            prompt += f"\n\n[Scratchpad Context]\n{summary}"

        if self.orchestrator and self.orchestrator.settings:
            settings = self.orchestrator.settings
            if settings.get("memory.enabled", True):
                try:
                    from agents.memory import load_memory, get_memory_guidance
                    max_lines = settings.get("memory.max_lines_loaded", 200)
                    memory = load_memory(os.getcwd(), max_lines)
                    if memory:
                        prompt += f"\n\n[Auto-Memory]\n{memory}"
                    prompt += f"\n\n{get_memory_guidance()}"
                except ImportError:
                    pass

        return prompt

    def llm_call(self, messages: list[dict], options: dict | None = None) -> str:
        """Make an LLM call using the shared infrastructure.

        Routes through cloud API with tiered model selection based on agent name.
        Falls back to local Ollama if cloud is unreachable.
        Uses agent-specific temperature if no options provided.
        """
        from agent import llm_chat, OLLAMA_OPTIONS

        if options is None:
            options = dict(OLLAMA_OPTIONS)
            options["temperature"] = self.config.temperature

        return llm_chat(messages, options, agent_name=self.config.name)

    def get_available_tools(self) -> list[str]:
        """Return tools available to this agent, respecting plan mode and settings.

        Plan mode (read-only) restriction applies only to the Plan Agent during
        exploration/design. Code Agent and other agents always get full tools.
        """
        from agents.orchestrator import OrchestratorMode

        in_plan_mode = (
            self.config.name == "plan"
            and self.orchestrator
            and self.orchestrator.mode in (
                OrchestratorMode.PLAN_EXPLORE,
                OrchestratorMode.PLAN_DESIGN,
            )
        )

        if in_plan_mode:
            base = [t for t in self.config.tools if t in READ_ONLY_TOOLS]
        else:
            base = list(self.config.tools)

        # Append MCP tools from the manager
        if self.orchestrator and self.orchestrator.mcp_manager:
            mcp_tools = self.orchestrator.mcp_manager.get_tools_for_agent(self.config.name)
            mcp_names = [t["name"] for t in mcp_tools]

            if in_plan_mode:
                readonly_mcp = set(self.orchestrator.mcp_manager.get_readonly_tools())
                mcp_names = [n for n in mcp_names if n in readonly_mcp]

            base.extend(mcp_names)

        # Apply settings-based allow/deny chains
        if self.orchestrator and self.orchestrator.settings:
            return self.orchestrator.settings.get_effective_tool_list(
                self.config.name, base
            )
        return base

    def get_tool_descriptions(self) -> str:
        """Generate formatted tool descriptions for the LLM prompt, filtered to available tools."""
        from dev.dev_tools import TOOL_DEFINITIONS

        available = set(self.get_available_tools())
        lines = ["Available tools:"]

        # Built-in tools
        for tool in TOOL_DEFINITIONS:
            if tool["name"] in available:
                params = ", ".join(f"{k}: {v}" for k, v in tool["parameters"].items())
                lines.append(f"- {tool['name']}({params}) — {tool['description']}")

        # MCP tools
        if self.orchestrator and self.orchestrator.mcp_manager:
            mcp_tools = self.orchestrator.mcp_manager.get_all_tools()
            for tool in mcp_tools:
                if tool["name"] in available:
                    params = ", ".join(f"{k}: {v}" for k, v in tool["parameters"].items())
                    lines.append(f"- {tool['name']}({params}) — {tool['description']}")

        return "\n".join(lines)

    def spawn_agent(self, agent_name: str, task: str, context: dict | None = None) -> AgentResult:
        """Spawn a sub-agent to handle a specific task.

        Supports unlimited nesting depth — sub-agents can spawn their own sub-agents.
        """
        if not self.config.can_nest:
            return AgentResult(
                text=f"Agent '{self.config.name}' is not allowed to spawn sub-agents.",
                agent_name=self.config.name,
            )

        if not self.orchestrator:
            return AgentResult(
                text="No orchestrator available for nesting.",
                agent_name=self.config.name,
            )

        # Emit nesting event
        if self.socketio:
            self.socketio.emit("agent_nesting", {
                "parent": self.config.name,
                "child": agent_name,
                "task": task[:200],
            })

        return self.orchestrator.run_agent(agent_name, task, context=context)

    def parse_tool_calls(self, text: str) -> list[dict]:
        """Extract ```tool_call blocks from LLM response."""
        pattern = r"```tool_call\s*\n?(.*?)\n?```"
        matches = re.findall(pattern, text, re.DOTALL)
        calls = []
        for match in matches:
            try:
                tc = json.loads(match.strip())
                if "tool" in tc:
                    calls.append(tc)
            except json.JSONDecodeError:
                print(f"[{self.config.name}] Failed to parse tool_call: {match[:100]}")
        return calls

    def strip_tool_calls(self, text: str) -> str:
        """Remove ```tool_call blocks from display text."""
        text = re.sub(r"```tool_call\s*\n?.*?\n?```", "", text, flags=re.DOTALL)
        return re.sub(r"\n{3,}", "\n\n", text).strip()

    def dispatch_tool(self, name: str, args: dict) -> dict:
        """Execute a tool, checking that it's in the agent's allowed set.

        Supports hooks (pre/post), MCP tool routing, and built-in tools.
        """
        available = set(self.get_available_tools())

        # Handle git_command_readonly → git_command with read-only enforcement
        if name == "git_command" and "git_command" not in available:
            if "git_command_readonly" in available:
                cmd = args.get("cmd", "")
                readonly_cmds = {"log", "status", "diff", "show", "branch", "tag", "remote"}
                first_word = cmd.strip().split()[0] if cmd.strip() else ""
                if first_word not in readonly_cmds:
                    return {"error": f"git {first_word} blocked in read-only mode"}
            else:
                return {"error": f"Tool '{name}' not available to {self.config.display_name}"}
        elif name not in available:
            return {"error": f"Tool '{name}' not available to {self.config.display_name}"}

        settings = None
        if self.orchestrator and self.orchestrator.settings:
            settings = self.orchestrator.settings

        # 1. Run pre-hooks — may block or modify args
        try:
            from agents.hooks import run_pre_hooks, run_post_hooks
            hook_result = run_pre_hooks(name, args, settings)
            if not hook_result.allowed:
                return {
                    "error": f"Blocked by hook: {hook_result.blocked_by}",
                    "hook_context": hook_result.context,
                }
            if hook_result.modified_args is not None:
                args = hook_result.modified_args
        except ImportError:
            pass

        # 2. Execute the tool
        if name.startswith("mcp__"):
            # Route to MCP manager
            if self.orchestrator and self.orchestrator.mcp_manager:
                result = self.orchestrator.mcp_manager.dispatch_tool(name, args)
            else:
                result = {"error": "MCP manager not available"}
        else:
            from dev.dev_tools import dispatch_tool
            result = dispatch_tool(name, args, settings=settings)

        # 3. Run post-hooks — may add context
        try:
            from agents.hooks import run_post_hooks
            result = run_post_hooks(name, args, result, settings)
        except ImportError:
            pass

        return result

    def emit(self, event: str, data: dict) -> None:
        """Emit a SocketIO event if socketio is available."""
        if self.socketio:
            self.socketio.emit(event, data)
