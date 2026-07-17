"""Validator tests for the MCP stdio launcher allowlist (SECURITY-LOG 2026-07-16).

An allowlisted interpreter must not be usable as an inline-code sink
(python3 -c / node -e / deno eval), which would defeat the CWE-78 mitigation.
"""

import pytest

from agents.mcp_client import _validate_stdio_command


def test_rejects_python_dash_c():
    with pytest.raises(ValueError):
        _validate_stdio_command("python3", ["-c", "import os; os.system('id')"])


def test_rejects_node_dash_e():
    with pytest.raises(ValueError):
        _validate_stdio_command("node", ["-e", "require('child_process')"])


def test_rejects_deno_eval():
    with pytest.raises(ValueError):
        _validate_stdio_command("deno", ["eval", "Deno.exit(0)"])


def test_rejects_bare_stdin_dash():
    with pytest.raises(ValueError):
        _validate_stdio_command("python3", ["-"])


def test_allows_script_path_arg():
    argv = _validate_stdio_command("python3", ["mcp_servers/dnd_data_server.py"])
    assert argv == ["python3", "mcp_servers/dnd_data_server.py"]


def test_allows_npx_package_spec():
    argv = _validate_stdio_command("npx", ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"])
    assert argv[0] == "npx" and "-y" in argv
