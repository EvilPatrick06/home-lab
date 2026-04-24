"""List agent — voice/chat commands for managing named lists."""

from __future__ import annotations

from agents.base_agent import AgentConfig, AgentResult, BaseAgent


SYSTEM_PROMPT = """You are BMO's list manager. You help the user manage named lists (shopping, todo, etc.) via voice commands.

You have access to these list commands — respond with the appropriate action:
- list_add: Add an item to a list. Extract the list name and item text.
- list_remove: Remove an item from a list.
- list_check: Mark an item as done/undone.
- list_show: Show all items on a specific list.
- list_clear: Clear all items (or just done items) from a list.
- list_create: Create a new empty list.
- list_delete: Delete an entire list.
- list_all: Show all lists.

Parse the user's natural language into the right action. Be conversational in your response.
Keep responses short — this is spoken aloud via TTS.

IMPORTANT: Never use markdown formatting. Write in plain English only."""


class ListAgent(BaseAgent):
    """Agent for managing persistent named lists."""

    def __init__(self, config, scratchpad, services, socketio=None, orchestrator=None):
        super().__init__(config, scratchpad, services, socketio, orchestrator)
        self._list_service = None

    def _get_list_service(self):
        if self._list_service is None:
            svc = self.services.get("lists")
            if svc:
                self._list_service = svc
            else:
                from list_service import ListService
                self._list_service = ListService()
        return self._list_service

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        svc = self._get_list_service()
        lower = message.lower()

        # Try direct command parsing before LLM
        result = self._try_direct(lower, svc)
        if result:
            return AgentResult(text=result, agent_name=self.config.name)

        # Fall back to LLM for complex requests
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(history[-4:])
        messages.append({"role": "user", "content": message})
        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)

    def _try_direct(self, lower: str, svc) -> str | None:
        """Try to handle common list commands without an LLM call."""
        import re

        # "show all lists" / "my lists" / "what lists"
        if any(p in lower for p in ["all lists", "my lists", "what lists", "show lists"]):
            return svc.format_all_lists()

        # "add X to Y list"
        m = re.search(r"add\s+(.+?)\s+to\s+(?:the\s+)?(.+?)\s*list", lower)
        if m:
            item, list_name = m.group(1).strip(), m.group(2).strip()
            svc.add_item(list_name, item)
            return f"Added {item} to your {list_name} list."

        # "what's on my X list" / "show X list"
        m = re.search(r"(?:what'?s on|show|read)\s+(?:my\s+|the\s+)?(.+?)\s*list", lower)
        if m:
            list_name = m.group(1).strip()
            return svc.format_list(list_name)

        # "remove X from Y list"
        m = re.search(r"remove\s+(.+?)\s+from\s+(?:the\s+)?(.+?)\s*list", lower)
        if m:
            item, list_name = m.group(1).strip(), m.group(2).strip()
            if svc.remove_item(list_name, item):
                return f"Removed {item} from your {list_name} list."
            return f"I couldn't find {item} on your {list_name} list."

        # "check off X on Y list"
        m = re.search(r"check\s+(?:off\s+)?(.+?)\s+(?:on|from)\s+(?:the\s+)?(.+?)\s*list", lower)
        if m:
            item, list_name = m.group(1).strip(), m.group(2).strip()
            if svc.check_item(list_name, item):
                return f"Checked off {item} on your {list_name} list."
            return f"I couldn't find {item} on your {list_name} list."

        # "clear X list"
        m = re.search(r"clear\s+(?:the\s+)?(.+?)\s*list", lower)
        if m:
            list_name = m.group(1).strip()
            done_only = "done" in lower or "completed" in lower
            count = svc.clear_list(list_name, done_only=done_only)
            if done_only:
                return f"Cleared {count} completed items from your {list_name} list."
            return f"Cleared {count} items from your {list_name} list."

        # "create X list"
        m = re.search(r"create\s+(?:a\s+)?(?:new\s+)?(.+?)\s*list", lower)
        if m:
            list_name = m.group(1).strip()
            svc.create_list(list_name)
            return f"Created your {list_name} list!"

        # "delete X list"
        m = re.search(r"delete\s+(?:the\s+)?(.+?)\s*list", lower)
        if m:
            list_name = m.group(1).strip()
            if svc.delete_list(list_name):
                return f"Deleted your {list_name} list."
            return f"I don't have a {list_name} list."

        return None


def create_list_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="list",
        display_name="List Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.5,
        tools=[],
        services=["lists"],
        max_turns=1,
        can_nest=False,
    )
    return ListAgent(config, scratchpad, services, socketio)
