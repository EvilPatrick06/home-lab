"""Agent orchestrator — routes messages to specialized agents, manages plan mode."""

from __future__ import annotations

import re
from enum import Enum
from typing import Any

from agents.base_agent import AgentResult, BaseAgent
from agents.router import AgentRouter
from agents.scratchpad import SharedScratchpad


class OrchestratorMode(Enum):
    """State machine for the orchestrator."""

    NORMAL = "normal"              # Direct routing, no planning
    PLAN_EXPLORE = "explore"       # Read-only exploration phase
    PLAN_DESIGN = "design"         # Writing the plan
    PLAN_REVIEW = "review"         # Presenting plan, awaiting approval
    EXECUTING = "executing"        # Running approved plan steps


class AgentOrchestrator:
    """Routes messages to specialized agents and manages the plan mode workflow.

    This is the central conductor. It:
    1. Routes messages via AgentRouter (3-tier)
    2. Manages OrchestratorMode state machine
    3. Supports unlimited agent nesting
    4. Maintains the shared scratchpad
    5. Emits SocketIO events for UI updates
    """

    def __init__(self, services: dict[str, Any], socketio: Any = None, llm_func=None, settings=None):
        self.services = services
        self.socketio = socketio
        self.settings = settings
        self.scratchpad = SharedScratchpad()
        self.mode = OrchestratorMode.NORMAL
        self._nesting_depth = 0
        self._plan_task: str | None = None  # Task being planned
        self._llm_func = llm_func  # Shared llm_chat function

        # Router uses the shared LLM function for tier 3
        self.router = AgentRouter(llm_func=llm_func, settings=settings)

        # Agent registry — populated by register_agent()
        self.agents: dict[str, BaseAgent] = {}

        # MCP manager — initialized by BmoAgent if MCP servers are configured
        self.mcp_manager = None

    def register_agent(self, agent: BaseAgent) -> None:
        """Register a specialized agent, applying settings overrides."""
        if self.settings:
            cfg = self.settings.get_effective_agent_config(agent.config.name)

            # Skip disabled agents
            if not cfg.get("enabled", True):
                print(f"[orchestrator] Agent '{agent.config.name}' disabled by settings")
                return

            # Apply overrides (None = keep agent default)
            if cfg.get("temperature") is not None:
                agent.config.temperature = cfg["temperature"]
            if cfg.get("max_turns") is not None:
                agent.config.max_turns = cfg["max_turns"]
            if cfg.get("can_nest") is not None:
                agent.config.can_nest = cfg["can_nest"]
            if cfg.get("system_prompt_append"):
                agent.config.system_prompt += "\n\n" + cfg["system_prompt_append"]

        agent.orchestrator = self
        self.agents[agent.config.name] = agent

    def register_agents(self, agents: list[BaseAgent]) -> None:
        """Register multiple agents at once."""
        for agent in agents:
            self.register_agent(agent)

    def handle(self, message: str, speaker: str, history: list[dict], services: dict, agent_override: str | None = None) -> dict:
        """Route a message to the best agent and return the result.

        This is the main entry point called by BmoAgent.chat().
        If agent_override is set, bypasses the router and uses that agent directly.

        Returns dict with: text, commands_executed, tags, agent_used
        """
        from agents.router import AgentRouter
        clean_message = AgentRouter.strip_prefix(message)

        if self.mode == OrchestratorMode.PLAN_REVIEW:
            return self._handle_plan_review(message, speaker, history)

        if self.mode == OrchestratorMode.EXECUTING:
            return self._handle_plan_execution(message, speaker, history)

        if agent_override and agent_override != "auto" and agent_override in self.agents:
            agent_name = agent_override
            print(f"[orchestrator] Agent override: {agent_name}")
        else:
            agent_name = self.router.route(message)

        # Announce agent selection
        self._emit("agent_selected", {
            "agent": agent_name,
            "display_name": self._get_display_name(agent_name),
            "speaker": speaker,
        })

        # Check if this should trigger plan mode
        if agent_name == "plan" and self.mode == OrchestratorMode.NORMAL:
            return self._enter_plan_mode(clean_message, speaker, history)

        # Run the selected agent
        result = self.run_agent(agent_name, clean_message, history=history)

        return self._result_to_dict(result, speaker)

    def run_agent(
        self,
        agent_name: str,
        message: str,
        history: list[dict] | None = None,
        context: dict | None = None,
        _relay_depth: int = 0,
    ) -> AgentResult:
        """Run a specific agent. Used for both direct routing and sub-agent spawning."""
        agent = self.agents.get(agent_name)
        if not agent:
            # Fall back to conversation agent
            agent = self.agents.get("conversation")
            if not agent:
                return AgentResult(
                    text=f"BMO doesn't have a '{agent_name}' agent yet!",
                    agent_name="unknown",
                )

        self._nesting_depth += 1
        try:
            result = agent.run(message, history or [], context)
            result.agent_name = agent.config.name

            # Check if the agent wants to relay to another agent
            if _relay_depth < 2:  # Prevent infinite relay loops
                relayed = self._check_relay(result.text, message, history or [], _relay_depth)
                if relayed:
                    return relayed

            return result
        except Exception as e:
            print(f"[orchestrator] Agent '{agent_name}' failed: {e}")
            return AgentResult(
                text=f"BMO's {agent_name} agent had a problem: {e}",
                agent_name=agent_name,
            )
        finally:
            self._nesting_depth -= 1

    def _check_relay(self, reply: str, original_message: str, history: list[dict], relay_depth: int) -> AgentResult | None:
        """Detect relay directives and re-route the first valid one."""
        matches = list(re.finditer(
            r"\[RELAY:(\w+)\]\s*(.*?)(?=(?:\s*\[RELAY:\w+\])|$)",
            reply,
            re.DOTALL,
        ))
        if not matches:
            return None

        for match in matches:
            target_agent = match.group(1).strip()
            relay_message = match.group(2).strip() or original_message
            if target_agent not in self.agents:
                continue

            print(f"[orchestrator] Relaying to {target_agent}: {relay_message[:80]}")
            self._emit("agent_relay", {
                "from": "previous_agent",
                "to": target_agent,
                "display_name": self._get_display_name(target_agent),
            })
            return self.run_agent(target_agent, relay_message, history=history, _relay_depth=relay_depth + 1)

        return None

    # ── Plan Mode ────────────────────────────────────────────────────

    def _enter_plan_mode(self, task: str, speaker: str, history: list[dict]) -> dict:
        """Enter plan mode: explore → design → review → execute."""
        self.mode = OrchestratorMode.PLAN_EXPLORE
        self._plan_task = task
        self.scratchpad.clear("Plan")

        self._emit("plan_mode_entered", {"task": task, "mode": self.mode.value})

        # Run plan agent in explore mode (tools restricted to read-only)
        result = self.run_agent("plan", task, history=history, context={"phase": "explore"})

        # After exploration, move to design phase
        self.mode = OrchestratorMode.PLAN_DESIGN
        design_result = self.run_agent("plan", task, history=history, context={"phase": "design"})

        # Move to review — present the plan
        self.mode = OrchestratorMode.PLAN_REVIEW

        plan_text = self.scratchpad.read("Plan")
        if plan_text:
            review_text = (
                "[EMOTION:calm] BMO is going to think this out!\n\n"
                f"{plan_text}\n\n"
                "Should BMO proceed with this plan? Say **yes** to approve, **no** to cancel, "
                "or tell BMO what to change."
            )
        else:
            review_text = design_result.text + "\n\nShould BMO proceed?"

        self._emit("plan_mode_review", {
            "plan": plan_text,
            "task": task,
        })

        return {
            "text": review_text,
            "commands_executed": [],
            "tags": {"emotion": "calm"},
            "agent_used": "plan",
        }

    def _handle_plan_review(self, message: str, speaker: str, history: list[dict]) -> dict:
        """Handle user response during plan review."""
        # Auto-approve plans if settings say so
        auto_approve = False
        if self.settings:
            auto_approve = self.settings.get("plan_mode.auto_approve_plans", False)

        lower = message.strip().lower()

        if auto_approve or lower in ("yes", "y", "approve", "do it", "go ahead", "proceed"):
            return self._approve_plan(speaker, history)
        elif lower in ("no", "n", "cancel", "abort", "stop"):
            return self._exit_plan_mode(
                "[EMOTION:calm] Okay, BMO cancelled the plan!",
                speaker,
            )
        else:
            # User wants changes — re-run design with feedback
            self.mode = OrchestratorMode.PLAN_DESIGN
            context = {"phase": "redesign", "feedback": message}
            result = self.run_agent("plan", self._plan_task or message, history=history, context=context)
            self.mode = OrchestratorMode.PLAN_REVIEW

            plan_text = self.scratchpad.read("Plan")
            review_text = f"{plan_text}\n\nBMO updated the plan. Should BMO proceed now?"

            self._emit("plan_mode_review", {
                "plan": plan_text,
                "task": self._plan_task,
            })

            return {
                "text": review_text,
                "commands_executed": [],
                "tags": {},
                "agent_used": "plan",
            }

    def _approve_plan(self, speaker: str, history: list[dict]) -> dict:
        """Approve and execute the plan."""
        self.mode = OrchestratorMode.EXECUTING
        self._emit("plan_mode_executing", {"task": self._plan_task})

        plan_text = self.scratchpad.read("Plan")
        steps = self._parse_plan_steps(plan_text)

        if not steps:
            return self._exit_plan_mode(
                "[EMOTION:sad] Hmm, BMO couldn't find any steps in the plan...",
                speaker,
            )

        # Enforce max plan steps from settings
        max_steps = 20
        if self.settings:
            max_steps = self.settings.get("plan_mode.max_plan_steps", 20)
        if len(steps) > max_steps:
            steps = steps[:max_steps]
            print(f"[orchestrator] Plan truncated to {max_steps} steps (settings limit)")

        results = []
        failed_step = None

        for i, step in enumerate(steps):
            step_num = i + 1
            agent_name = step.get("agent", "code")
            description = step.get("description", f"Step {step_num}")

            # Update step status: in progress
            self._update_plan_step(plan_text, step_num, "~")
            self._emit("plan_step_start", {
                "step": step_num,
                "total": len(steps),
                "description": description,
                "agent": agent_name,
            })

            # Execute step
            step_result = self.run_agent(
                agent_name,
                description,
                history=history,
                context={"plan_step": step_num, "plan_total": len(steps)},
            )
            results.append(step_result)

            if "error" in step_result.text.lower() or "failed" in step_result.text.lower():
                # Step might have failed — mark it
                self._update_plan_step(plan_text, step_num, "!")
                self._emit("plan_step_failed", {
                    "step": step_num,
                    "description": description,
                    "error": step_result.text[:200],
                })
                failed_step = step_num
                break
            else:
                # Step succeeded
                self._update_plan_step(plan_text, step_num, "x")
                self._emit("plan_step_done", {
                    "step": step_num,
                    "description": description,
                })

        # Plan execution complete
        completed = len(results)
        total = len(steps)

        if failed_step:
            text = (
                f"[EMOTION:sad] Hmm, BMO hit a problem on step {failed_step}...\n\n"
                f"Completed {completed - 1}/{total} steps. "
                f"Step {failed_step} failed: {results[-1].text[:200]}\n\n"
                "Should BMO retry this step, skip it, or abort the plan?"
            )
            # Stay in EXECUTING mode to handle retry/skip/abort
        else:
            text = (
                f"[EMOTION:excited] BMO finished the plan! {completed}/{total} steps done.\n\n"
                + "\n".join(f"- Step {i+1}: {r.text[:100]}" for i, r in enumerate(results))
            )
            self.mode = OrchestratorMode.NORMAL
            self._plan_task = None
            self._emit("plan_mode_exited", {"reason": "completed"})

        return {
            "text": text,
            "commands_executed": [],
            "tags": {},
            "agent_used": "plan",
        }

    def _handle_plan_execution(self, message: str, speaker: str, history: list[dict]) -> dict:
        """Handle user input during plan execution (retry/skip/abort)."""
        lower = message.strip().lower()

        if lower in ("retry", "try again"):
            # Re-run the failed step
            return self._approve_plan(speaker, history)
        elif lower in ("skip", "next"):
            # Skip and continue
            return self._approve_plan(speaker, history)
        elif lower in ("abort", "stop", "cancel"):
            return self._exit_plan_mode(
                "[EMOTION:calm] BMO stopped the plan.",
                speaker,
            )
        else:
            # Treat as a new message — exit plan mode and route normally
            self.mode = OrchestratorMode.NORMAL
            self._plan_task = None
            self._emit("plan_mode_exited", {"reason": "new_message"})
            return self.handle(message, speaker, history, self.services)

    def _exit_plan_mode(self, text: str, speaker: str) -> dict:
        """Exit plan mode and return to normal."""
        self.mode = OrchestratorMode.NORMAL
        self._plan_task = None
        self._emit("plan_mode_exited", {"reason": "cancelled"})
        return {
            "text": text,
            "commands_executed": [],
            "tags": {},
            "agent_used": "plan",
        }

    def _parse_plan_steps(self, plan_text: str) -> list[dict]:
        """Parse numbered steps from a plan in the scratchpad.

        Expected format:
            1. [ ] Step description (agent: code_agent)
            2. [ ] Step description (agent: test_agent)
        """
        steps = []
        pattern = r"(\d+)\.\s*\[[ x~!]\]\s*(.+?)(?:\(agent:\s*(\w+)\))?$"
        for match in re.finditer(pattern, plan_text, re.MULTILINE):
            step_num = int(match.group(1))
            description = match.group(2).strip()
            agent = match.group(3) or "code"
            # Normalize agent name
            agent = agent.replace("_agent", "").strip()
            steps.append({
                "number": step_num,
                "description": description,
                "agent": agent,
            })
        return steps

    def _update_plan_step(self, plan_text: str, step_num: int, status_char: str) -> None:
        """Update a step's checkbox in the scratchpad plan.

        status_char: ' ' (pending), '~' (in progress), 'x' (done), '!' (failed)
        """
        current = self.scratchpad.read("Plan")
        if not current:
            return

        # Replace the checkbox for this step number
        pattern = rf"({step_num}\.\s*)\[[ x~!]\]"
        replacement = rf"\g<1>[{status_char}]"
        updated = re.sub(pattern, replacement, current, count=1)
        self.scratchpad.write("Plan", updated)

    # ── Helpers ──────────────────────────────────────────────────────

    def _get_display_name(self, agent_name: str) -> str:
        """Get the display name for an agent."""
        agent = self.agents.get(agent_name)
        if agent:
            return agent.config.display_name
        return agent_name.replace("_", " ").title() + " Agent"

    def _result_to_dict(self, result: AgentResult, speaker: str) -> dict:
        """Convert AgentResult to the dict format expected by BmoAgent.chat()."""
        out = {
            "text": result.text,
            "commands_executed": result.commands,
            "tags": result.tags,
            "agent_used": result.agent_name,
        }
        if result.pending_confirmations:
            out["pending_confirmations"] = result.pending_confirmations
        return out

    def _emit(self, event: str, data: dict) -> None:
        """Emit a SocketIO event if available."""
        if self.socketio:
            self.socketio.emit(event, data)

    @property
    def is_plan_mode(self) -> bool:
        """Check if currently in any plan mode state."""
        return self.mode != OrchestratorMode.NORMAL
