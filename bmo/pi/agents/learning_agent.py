"""Learning/Memory agent — saves and recalls user preferences, long-term memory.

Manages a persistent memory file (BMO.md-style) for cross-session context.
"""

from __future__ import annotations

import json
import os

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

MEMORY_DIR = os.path.expanduser("~/home-lab/bmo/pi/data")
MEMORY_FILE = os.path.join(MEMORY_DIR, "memory.json")

SYSTEM_PROMPT = """You are BMO's learning/memory agent. You save and recall user preferences, facts, and context across sessions.

Current memory:
{memory_context}

When the user tells you to remember something:
1. Extract the key fact or preference
2. Save it to memory with a clear category
3. Confirm what you saved

When the user asks what you know or recalls something:
1. Search your memory for relevant entries
2. Present what you found

Categories: preferences, facts, people, projects, reminders, other

Keep memory entries concise and factual."""


class LearningAgent(BaseAgent):
    """Persistent memory agent — saves/recalls facts across sessions."""

    def __init__(self, config, scratchpad, services, socketio=None, orchestrator=None):
        super().__init__(config, scratchpad, services, socketio, orchestrator)
        self._memory = self._load_memory()

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        memory_context = self._format_memory()
        prompt = SYSTEM_PROMPT.format(memory_context=memory_context or "No memories saved yet.")

        messages = [{"role": "system", "content": prompt}]
        messages.extend(history[-6:])
        messages.append({"role": "user", "content": message})

        reply = self.llm_call(messages)

        # Check if the LLM wants to save something
        lower = message.lower()
        if any(kw in lower for kw in ["remember", "save this", "don't forget", "keep in mind"]):
            # Extract and save the memory
            self._save_from_message(message, reply)

        return AgentResult(text=reply, agent_name=self.config.name)

    def _load_memory(self) -> dict:
        """Load persistent memory from disk."""
        try:
            if os.path.exists(MEMORY_FILE):
                with open(MEMORY_FILE, encoding="utf-8") as f:
                    data = json.load(f)
                # Migrate old format to structured format
                if "entries" in data and "profile" not in data:
                    data = self._migrate_memory(data)
                return data
        except Exception as e:
            print(f"[learning] Failed to load memory: {e}")
        return {
            "profile": {},
            "preferences": {},
            "facts": [],
            "conversation_log": [],
            "entries": [],  # legacy compat
        }

    def _migrate_memory(self, old_data: dict) -> dict:
        """Migrate old flat entries to structured format."""
        new_data = {
            "profile": {},
            "preferences": {},
            "facts": [],
            "conversation_log": [],
            "entries": old_data.get("entries", []),
        }
        for entry in old_data.get("entries", []):
            cat = entry.get("category", "other")
            text = entry.get("text", "")
            if cat == "preferences":
                new_data["facts"].append({"text": text, "category": "preferences", "source": "migrated"})
            elif cat == "people":
                new_data["facts"].append({"text": text, "category": "personal", "source": "migrated"})
            else:
                new_data["facts"].append({"text": text, "category": cat, "source": "migrated"})
        return new_data

    def _save_memory(self):
        """Persist memory to disk."""
        try:
            os.makedirs(MEMORY_DIR, exist_ok=True)
            with open(MEMORY_FILE, "w", encoding="utf-8") as f:
                json.dump(self._memory, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[learning] Failed to save memory: {e}")

    def _format_memory(self) -> str:
        """Format memory for the system prompt."""
        parts = []

        # Profile
        profile = self._memory.get("profile", {})
        if profile:
            parts.append("User profile:")
            for k, v in profile.items():
                parts.append(f"  {k}: {v}")

        # Preferences
        prefs = self._memory.get("preferences", {})
        if prefs:
            parts.append("Preferences:")
            for category, values in prefs.items():
                if isinstance(values, dict):
                    for k, v in values.items():
                        parts.append(f"  {category}.{k}: {v}")
                else:
                    parts.append(f"  {category}: {values}")

        # Facts (last 20)
        facts = self._memory.get("facts", [])
        if facts:
            parts.append("Known facts:")
            for fact in facts[-20:]:
                cat = fact.get("category", "other")
                text = fact.get("text", "")
                parts.append(f"  [{cat}] {text}")

        # Legacy entries
        entries = self._memory.get("entries", [])
        if entries and not facts:
            parts.append("Remembered:")
            for entry in entries[-20:]:
                cat = entry.get("category", "other")
                text = entry.get("text", "")
                parts.append(f"  [{cat}] {text}")

        # Recent conversation summaries
        logs = self._memory.get("conversation_log", [])
        if logs:
            parts.append(f"Recent conversations ({len(logs)} logged):")
            for log in logs[-3:]:
                parts.append(f"  {log.get('date', '?')}: {log.get('summary', '')[:100]}")

        return "\n".join(parts) if parts else ""

    def _save_from_message(self, message: str, reply: str):
        """Extract and save a memory from the user's message."""
        lower = message.lower()

        # Determine category
        category = "other"
        if any(kw in lower for kw in ["prefer", "always use", "i like", "my favorite", "i love", "i hate"]):
            category = "preferences"
        elif any(kw in lower for kw in ["my name", "i am", "i work", "i live"]):
            category = "personal"
        elif any(kw in lower for kw in ["project", "codebase", "repo"]):
            category = "work"

        fact = {
            "text": message[:200],
            "category": category,
            "added_at": __import__("time").strftime("%Y-%m-%d"),
            "source": "conversation",
        }

        if "facts" not in self._memory:
            self._memory["facts"] = []
        self._memory["facts"].append(fact)

        # Also save to legacy entries for backward compat
        if "entries" not in self._memory:
            self._memory["entries"] = []
        self._memory["entries"].append({"category": category, "text": message[:200], "source": "user"})

        self._save_memory()
        print(f"[learning] Saved fact: [{category}] {message[:80]}")

    def get_profile(self) -> dict:
        """Return the user profile from memory."""
        return self._memory.get("profile", {})

    def search_memory(self, query: str) -> list[dict]:
        """Search facts by keyword."""
        query_lower = query.lower()
        results = []
        for fact in self._memory.get("facts", []):
            if query_lower in fact.get("text", "").lower():
                results.append(fact)
        return results

    def summarize_and_log(self, messages: list[dict]):
        """Summarize a conversation and add to conversation log."""
        if len(messages) < 4:
            return
        # Simple summary: extract user messages
        user_msgs = [m.get("content", "")[:50] for m in messages if m.get("role") == "user"]
        summary = "; ".join(user_msgs[:5])

        import time as _time
        log_entry = {
            "date": _time.strftime("%Y-%m-%d"),
            "summary": summary[:200],
            "message_count": len(messages),
        }

        if "conversation_log" not in self._memory:
            self._memory["conversation_log"] = []
        self._memory["conversation_log"].append(log_entry)
        # Keep last 30 logs
        if len(self._memory["conversation_log"]) > 30:
            self._memory["conversation_log"] = self._memory["conversation_log"][-30:]
        self._save_memory()
        print(f"[learning] Logged conversation: {summary[:60]}")


def create_learning_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="learning",
        display_name="Memory Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.5,
        tools=[],
        services=[],
        max_turns=1,
        can_nest=False,
    )
    return LearningAgent(config, scratchpad, services, socketio)
