"""BMO List Service — Persistent named lists via voice and touch.

Manages named lists (shopping, todo, etc.) with CRUD operations.
Data persisted to ~/home-lab/bmo/pi/data/lists.json.
"""

import json
import os
import re
import time
import uuid


DATA_DIR = os.path.expanduser("~/home-lab/bmo/pi/data")
LISTS_FILE = os.path.join(DATA_DIR, "lists.json")


def _slug(name: str) -> str:
    """Normalize list name to lowercase slug."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


class ListService:
    """Named lists with persistent JSON storage."""

    def __init__(self):
        self._data = self._load()

    # ── CRUD ──────────────────────────────────────────────────────────

    def create_list(self, name: str) -> dict:
        """Create a new empty list. Returns the list dict."""
        slug = _slug(name)
        if slug in self._data["lists"]:
            return self._data["lists"][slug]
        lst = {
            "name": name,
            "slug": slug,
            "items": [],
            "created_at": time.time(),
        }
        self._data["lists"][slug] = lst
        self._save()
        return lst

    def delete_list(self, name: str) -> bool:
        """Delete a list by name. Returns True if deleted."""
        slug = _slug(name)
        if slug in self._data["lists"]:
            del self._data["lists"][slug]
            self._save()
            return True
        return False

    def get_list(self, name: str) -> dict | None:
        """Get a list by name."""
        slug = _slug(name)
        return self._data["lists"].get(slug)

    def get_all_lists(self) -> dict:
        """Get all lists."""
        return self._data["lists"]

    def add_item(self, list_name: str, text: str) -> dict:
        """Add an item to a list. Auto-creates the list if it doesn't exist."""
        slug = _slug(list_name)
        if slug not in self._data["lists"]:
            self.create_list(list_name)
        item = {
            "id": str(uuid.uuid4())[:8],
            "text": text,
            "done": False,
            "added_at": time.time(),
        }
        self._data["lists"][slug]["items"].append(item)
        self._save()
        return item

    def remove_item(self, list_name: str, text: str) -> bool:
        """Remove an item by fuzzy text match. Returns True if removed."""
        slug = _slug(list_name)
        lst = self._data["lists"].get(slug)
        if not lst:
            return False
        text_lower = text.lower().strip()
        for i, item in enumerate(lst["items"]):
            if item["text"].lower().strip() == text_lower:
                lst["items"].pop(i)
                self._save()
                return True
        # Fuzzy: substring match
        for i, item in enumerate(lst["items"]):
            if text_lower in item["text"].lower():
                lst["items"].pop(i)
                self._save()
                return True
        return False

    def check_item(self, list_name: str, text: str, done: bool = True) -> bool:
        """Toggle done status of an item by text match."""
        slug = _slug(list_name)
        lst = self._data["lists"].get(slug)
        if not lst:
            return False
        text_lower = text.lower().strip()
        for item in lst["items"]:
            if text_lower in item["text"].lower():
                item["done"] = done
                self._save()
                return True
        return False

    def clear_list(self, list_name: str, done_only: bool = False) -> int:
        """Clear items from a list. Returns count removed."""
        slug = _slug(list_name)
        lst = self._data["lists"].get(slug)
        if not lst:
            return 0
        if done_only:
            before = len(lst["items"])
            lst["items"] = [i for i in lst["items"] if not i["done"]]
            removed = before - len(lst["items"])
        else:
            removed = len(lst["items"])
            lst["items"] = []
        self._save()
        return removed

    # ── Formatting ────────────────────────────────────────────────────

    def format_list(self, name: str) -> str:
        """Format a list for TTS/display."""
        lst = self.get_list(name)
        if not lst:
            return f"I don't have a {name} list."
        items = lst["items"]
        if not items:
            return f"Your {lst['name']} list is empty."
        lines = [f"Your {lst['name']} list has {len(items)} item{'s' if len(items) != 1 else ''}:"]
        for item in items:
            check = "done" if item["done"] else ""
            lines.append(f"  {'[x]' if item['done'] else '[ ]'} {item['text']}")
        return "\n".join(lines)

    def format_all_lists(self) -> str:
        """Format all lists summary for TTS/display."""
        lists = self._data["lists"]
        if not lists:
            return "You don't have any lists yet."
        lines = [f"You have {len(lists)} list{'s' if len(lists) != 1 else ''}:"]
        for slug, lst in lists.items():
            total = len(lst["items"])
            done = sum(1 for i in lst["items"] if i["done"])
            lines.append(f"  {lst['name']}: {total} items ({done} done)")
        return "\n".join(lines)

    # ── Persistence ───────────────────────────────────────────────────

    def _load(self) -> dict:
        """Load lists from disk."""
        try:
            if os.path.exists(LISTS_FILE):
                with open(LISTS_FILE, encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print(f"[lists] Failed to load: {e}")
        return {"lists": {}}

    def _save(self):
        """Persist lists to disk."""
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(LISTS_FILE, "w", encoding="utf-8") as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[lists] Failed to save: {e}")
