#!/usr/bin/env python3
"""BMO MCP Server — named lists (shopping/todo/etc).

Exposes BMO's file-backed ListService (data/lists.json) as MCP tools over stdio
JSON-RPC so other MCP clients (Claude Desktop/Code, LAN agents) can read and edit
BMO's lists with the same persistence the voice/touch UI uses. Lists are
file-backed, so a standalone process stays in sync with the app. Write tools are
gated behind require_confirmation in mcp_settings.json. (BMO-SUGGESTIONS.)

Usage: python bmo_lists_server.py
"""
import json
import os
import sys

_PI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PI_ROOT not in sys.path:
    sys.path.insert(0, _PI_ROOT)

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
from _stdio_server import serve  # shared JSON-RPC stdio transport


def _svc():
    # Fresh instance per call so external edits to lists.json are picked up.
    from services.list_service import ListService
    return ListService()


TOOLS = [
    {"name": "list_all_lists", "description": "Show all named lists and their items.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_list", "description": "Show one list's items.",
     "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "create_list", "description": "Create a new named list.",
     "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "delete_list", "description": "Delete a named list.",
     "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "add_item", "description": "Add an item to a list (creates the list if missing).",
     "inputSchema": {"type": "object", "properties": {"list_name": {"type": "string"}, "text": {"type": "string"}}, "required": ["list_name", "text"]}},
    {"name": "remove_item", "description": "Remove an item from a list.",
     "inputSchema": {"type": "object", "properties": {"list_name": {"type": "string"}, "text": {"type": "string"}}, "required": ["list_name", "text"]}},
    {"name": "check_item", "description": "Mark an item done (or undone with done=false).",
     "inputSchema": {"type": "object", "properties": {"list_name": {"type": "string"}, "text": {"type": "string"}, "done": {"type": "boolean"}}, "required": ["list_name", "text"]}},
    {"name": "clear_list", "description": "Clear a list (done_only=true keeps unchecked items).",
     "inputSchema": {"type": "object", "properties": {"list_name": {"type": "string"}, "done_only": {"type": "boolean"}}, "required": ["list_name"]}},
]


def _handle_tool_call(name, args):
    ls = _svc()
    handlers = {
        "list_all_lists": lambda: ls.format_all_lists(),
        "get_list": lambda: ls.format_list(args["name"]),
        "create_list": lambda: ls.create_list(args["name"]),
        "delete_list": lambda: {"deleted": ls.delete_list(args["name"])},
        "add_item": lambda: ls.add_item(args["list_name"], args["text"]),
        "remove_item": lambda: {"removed": ls.remove_item(args["list_name"], args["text"])},
        "check_item": lambda: {"updated": ls.check_item(args["list_name"], args["text"], args.get("done", True))},
        "clear_list": lambda: {"cleared": ls.clear_list(args["list_name"], args.get("done_only", False))},
    }
    handler = handlers.get(name)
    if not handler:
        raise ValueError(f"Unknown tool: {name}")
    result = handler()
    text = result if isinstance(result, str) else json.dumps(result, indent=2)
    return [{"type": "text", "text": text}]


def main():
    serve("bmo-lists", "1.0.0", TOOLS, _handle_tool_call)


if __name__ == "__main__":
    main()
