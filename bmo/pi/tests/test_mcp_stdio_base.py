"""Guard the shared MCP stdio transport (_stdio_server) + that both servers use it.

Added with the dedup that extracted the JSON-RPC Content-Length framing out of
bmo_lists_server / dnd_data_server into mcp_servers/_stdio_server.serve.
"""
import importlib
import io
import json
import os
import sys

import pytest

MCP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mcp_servers")
if MCP_DIR not in sys.path:
    sys.path.insert(0, MCP_DIR)


def test_framing_roundtrip():
    base = importlib.import_module("_stdio_server")
    obj = {"jsonrpc": "2.0", "id": 7, "result": {"ok": True, "u": "é"}}
    body = json.dumps(obj)
    wire = f"Content-Length: {len(body)}\r\n\r\n{body}"
    saved = sys.stdin
    sys.stdin = io.StringIO(wire)
    try:
        assert base.read_message() == obj
    finally:
        sys.stdin = saved


def test_read_message_eof_returns_none():
    base = importlib.import_module("_stdio_server")
    saved = sys.stdin
    sys.stdin = io.StringIO("")
    try:
        assert base.read_message() is None
    finally:
        sys.stdin = saved


@pytest.mark.parametrize("mod_name", ["bmo_lists_server", "dnd_data_server"])
def test_server_uses_shared_serve(mod_name):
    mod = importlib.import_module(mod_name)
    base = importlib.import_module("_stdio_server")
    # both servers expose a tool manifest + a tool-call handler
    assert isinstance(mod.TOOLS, list) and mod.TOOLS
    assert callable(mod._handle_tool_call)
    # main() delegates to the shared serve()
    assert mod.serve is base.serve
