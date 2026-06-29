#!/usr/bin/env python3
"""Shared JSON-RPC 2.0 over Content-Length-framed stdio transport for BMO MCP servers.

`bmo_lists_server` and `dnd_data_server` independently re-implemented the same
stdio plumbing (Content-Length framing, result/error wrappers, and an
initialize -> tools/list -> tools/call dispatch loop). This module owns that
transport so a concrete server is just: define a TOOLS manifest + a
`handle_tool_call(name, arguments)` function, then call `serve(...)`.

New BMO MCP servers (timers/calendar/smart-home/music) become a tool table over
an existing in-process service rather than another protocol re-implementation.
"""
import json
import sys


def read_message():
    """Read one JSON-RPC message with Content-Length framing from stdin (None at EOF)."""
    headers = {}
    while True:
        line = sys.stdin.readline()
        if not line:
            return None
        line = line.strip()
        if line == "":
            break
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip()] = value.strip()
    length = int(headers.get("Content-Length", 0))
    if length == 0:
        return None
    return json.loads(sys.stdin.read(length))


def write_message(msg):
    """Write a JSON-RPC message with Content-Length framing to stdout."""
    body = json.dumps(msg)
    sys.stdout.write(f"Content-Length: {len(body)}\r\n\r\n{body}")
    sys.stdout.flush()


def result(id_val, result_obj):
    write_message({"jsonrpc": "2.0", "id": id_val, "result": result_obj})


def error(id_val, code, message):
    write_message({"jsonrpc": "2.0", "id": id_val, "error": {"code": code, "message": message}})


def serve(server_name, version, tools, handle_tool_call):
    """Run the stdio JSON-RPC dispatch loop until EOF.

    handle_tool_call(name, arguments) -> list[content-dict]; may raise (errors are
    surfaced as an isError tool result, matching the prior per-server behaviour).
    """
    while True:
        msg = read_message()
        if msg is None:
            break
        method = msg.get("method", "")
        msg_id = msg.get("id")
        params = msg.get("params", {})
        if method == "initialize":
            result(msg_id, {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": server_name, "version": version},
            })
        elif method == "notifications/initialized":
            pass
        elif method == "tools/list":
            result(msg_id, {"tools": tools})
        elif method == "tools/call":
            try:
                content = handle_tool_call(params.get("name", ""), params.get("arguments", {}))
                result(msg_id, {"content": content})
            except Exception as e:
                result(msg_id, {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True})
        elif method == "ping":
            result(msg_id, {})
        elif msg_id is not None:
            error(msg_id, -32601, f"Method not found: {method}")
