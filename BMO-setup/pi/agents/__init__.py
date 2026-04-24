"""BMO Multi-Agent Orchestration System.

Specialized sub-agents routed by a conductor. Each agent has its own
system prompt, tool access, temperature, and can spawn nested sub-agents.
All agents share a session-persistent scratchpad for context.
"""

from agents.base_agent import AgentConfig, AgentResult, BaseAgent
from agents.scratchpad import SharedScratchpad
from agents.router import AgentRouter
from agents.orchestrator import AgentOrchestrator

__all__ = [
    "AgentConfig",
    "AgentResult",
    "BaseAgent",
    "SharedScratchpad",
    "AgentRouter",
    "AgentOrchestrator",
]
