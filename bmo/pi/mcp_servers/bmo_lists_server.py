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


def _svc():
    # Fresh instance per call so external edits to lists.json are picked up.
    from services.list_service import ListService
    return ListService()


def _read_message():
    headers = {}
    while True:
        line = sys.stdin.readline()
        if not line:
            return None
        line = line.strip()
        if line == "":
            break
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip()] = v.strip()
    length = int(headers.get("Content-Length", 0))
    if length == 0:
        return None
    return json.loads(sys.stdin.read(length))


def _write_message(msg):
    body = json.dumps(msg)
    sys.stdout.write(f"Content-Length: {len(body)}\r\n\r\n{body}")
    sys.stdout.flush()


def _result(id_val, result):
    _write_message({"jsonrpc": "2.0", "id": id_val, "result": result})


def _error(id_val, code, message):
    _write_message({"jsonrpc": "2.0", "id": id_val, "error": {"code": code, "message": message}})


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
    while True:
        msg = _read_message()
        if msg is None:
            break
        method = msg.get("method", "")
        msg_id = msg.get("id")
        params = msg.get("params", {})
        if method == "initialize":
            _result(msg_id, {"protocolVersion": "2024-11-05",
                             "capabilities": {"tools": {"listChanged": False}},
                             "serverInfo": {"name": "bmo-lists", "version": "1.0.0"}})
        elif method == "notifications/initialized":
            pass
        elif method == "tools/list":
            _result(msg_id, {"tools": TOOLS})
        elif method == "tools/call":
            try:
                content = _handle_tool_call(params.get("name", ""), params.get("arguments", {}))
                _result(msg_id, {"content": content})
            except Exception as e:
                _result(msg_id, {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True})
        elif method == "ping":
            _result(msg_id, {})
        elif msg_id is not None:
            _error(msg_id, -32601, f"Method not found: {method}")


if __name__ == "__main__":
    main()
