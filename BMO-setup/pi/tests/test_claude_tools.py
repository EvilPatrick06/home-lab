"""Tests for claude_tools.py — tool format conversion, auto-approve flag, and chat loop."""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import MagicMock, patch, call

import pytest

# ---------------------------------------------------------------------------
# Stub cloud_providers before importing claude_tools so we never hit the
# real Anthropic API during tests.
# ---------------------------------------------------------------------------

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Minimal cloud_providers stub
_cloud_stub = MagicMock()
_cloud_stub.ANTHROPIC_API_KEY = "test-key"
_cloud_stub.ANTHROPIC_BASE = "https://api.anthropic.com/v1"
_cloud_stub._claude_model_id = lambda m: m
_cloud_stub._claude_session = MagicMock()
sys.modules.setdefault("cloud_providers", _cloud_stub)

import claude_tools
from claude_tools import (
    _param_to_schema,
    get_auto_approve,
    set_auto_approve,
    tools_to_claude_format,
)
from dev_tools import TOOL_DEFINITIONS


# ===========================================================================
# Thread-local auto-approve flag
# ===========================================================================

class TestAutoApproveFlag:
    def test_default_is_false(self):
        # Fresh import — should be off
        set_auto_approve(False)
        assert get_auto_approve() is False

    def test_set_true(self):
        set_auto_approve(True)
        assert get_auto_approve() is True
        set_auto_approve(False)  # reset for other tests

    def test_set_false(self):
        set_auto_approve(True)
        set_auto_approve(False)
        assert get_auto_approve() is False

    def test_flag_is_thread_local(self):
        """Flag in another thread must start as False regardless of main thread value."""
        import threading
        results = {}

        def worker():
            results["worker_before"] = get_auto_approve()
            set_auto_approve(True)
            results["worker_after"] = get_auto_approve()

        set_auto_approve(True)  # main thread = True
        t = threading.Thread(target=worker)
        t.start()
        t.join()

        # Worker's initial value should be False (thread-local, not inherited)
        assert results["worker_before"] is False
        # Worker can set its own value
        assert results["worker_after"] is True
        # Main thread value unchanged
        assert get_auto_approve() is True
        set_auto_approve(False)  # cleanup


# ===========================================================================
# _param_to_schema
# ===========================================================================

class TestParamToSchema:
    def test_int_description(self):
        schema = _param_to_schema("integer offset")
        assert schema["type"] == "integer"

    def test_string_description(self):
        schema = _param_to_schema("the path string")
        assert schema["type"] == "string"

    def test_description_preserved(self):
        desc = "some parameter (optional)"
        schema = _param_to_schema(desc)
        assert schema["description"] == desc

    def test_optional_in_description(self):
        schema = _param_to_schema("int (optional)")
        assert schema["type"] == "integer"


# ===========================================================================
# tools_to_claude_format
# ===========================================================================

class TestToolsToClaudeFormat:
    def test_empty_set_returns_empty_list(self):
        result = tools_to_claude_format(set())
        assert result == []

    def test_single_tool_included(self):
        result = tools_to_claude_format({"read_file"})
        assert len(result) == 1
        assert result[0]["name"] == "read_file"

    def test_excluded_tools_not_present(self):
        result = tools_to_claude_format({"read_file"})
        names = [t["name"] for t in result]
        assert "write_file" not in names
        assert "execute_command" not in names

    def test_all_registered_tools_convertible(self):
        all_names = {t["name"] for t in TOOL_DEFINITIONS}
        result = tools_to_claude_format(all_names)
        assert len(result) == len(TOOL_DEFINITIONS)

    def test_output_has_required_claude_fields(self):
        result = tools_to_claude_format({"read_file"})
        tool = result[0]
        assert "name" in tool
        assert "description" in tool
        assert "input_schema" in tool

    def test_input_schema_structure(self):
        result = tools_to_claude_format({"read_file"})
        schema = result[0]["input_schema"]
        assert schema["type"] == "object"
        assert "properties" in schema
        assert "required" in schema

    def test_required_fields_are_non_optional_params(self):
        result = tools_to_claude_format({"read_file"})
        tool = result[0]
        required = tool["input_schema"]["required"]
        # 'path' is required; 'offset' and 'limit' are optional
        assert "path" in required
        assert "offset" not in required
        assert "limit" not in required

    def test_optional_params_not_in_required(self):
        """No parameter marked optional in description should appear in required list."""
        result = tools_to_claude_format({t["name"] for t in TOOL_DEFINITIONS})
        for tool in result:
            for param_name in tool["input_schema"].get("required", []):
                prop = tool["input_schema"]["properties"].get(param_name, {})
                desc = prop.get("description", "")
                assert "optional" not in desc.lower(), (
                    f"Tool '{tool['name']}' has optional param '{param_name}' in required list"
                )

    def test_tool_with_no_params(self):
        """read_memory has no parameters — should produce empty properties and required."""
        result = tools_to_claude_format({"read_memory"})
        assert len(result) == 1
        schema = result[0]["input_schema"]
        assert schema["properties"] == {}
        assert schema["required"] == []

    def test_execute_command_schema(self):
        result = tools_to_claude_format({"execute_command"})
        tool = result[0]
        props = tool["input_schema"]["properties"]
        assert "cmd" in props
        assert "cmd" in tool["input_schema"]["required"]

    def test_ssh_command_schema(self):
        result = tools_to_claude_format({"ssh_command"})
        tool = result[0]
        required = tool["input_schema"]["required"]
        assert "host" in required
        assert "cmd" in required

    def test_write_file_schema(self):
        result = tools_to_claude_format({"write_file"})
        tool = result[0]
        required = tool["input_schema"]["required"]
        assert "path" in required
        assert "content" in required

    def test_edit_file_schema(self):
        result = tools_to_claude_format({"edit_file"})
        tool = result[0]
        required = tool["input_schema"]["required"]
        assert "path" in required
        assert "old_string" in required
        assert "new_string" in required

    def test_git_command_schema(self):
        result = tools_to_claude_format({"git_command"})
        tool = result[0]
        assert "cmd" in tool["input_schema"]["required"]

    def test_web_search_schema(self):
        result = tools_to_claude_format({"web_search"})
        tool = result[0]
        assert "query" in tool["input_schema"]["required"]
        # num_results is optional
        assert "num_results" not in tool["input_schema"]["required"]

    def test_web_fetch_schema(self):
        result = tools_to_claude_format({"web_fetch"})
        tool = result[0]
        assert "url" in tool["input_schema"]["required"]

    def test_write_memory_schema(self):
        result = tools_to_claude_format({"write_memory"})
        tool = result[0]
        required = tool["input_schema"]["required"]
        assert "section" in required
        assert "content" in required

    def test_find_files_schema(self):
        result = tools_to_claude_format({"find_files"})
        tool = result[0]
        assert "pattern" in tool["input_schema"]["required"]

    def test_grep_files_schema(self):
        result = tools_to_claude_format({"grep_files"})
        tool = result[0]
        assert "pattern" in tool["input_schema"]["required"]

    def test_list_directory_schema(self):
        result = tools_to_claude_format({"list_directory"})
        tool = result[0]
        # path is optional
        assert "path" not in tool["input_schema"]["required"]

    def test_gh_command_schema(self):
        result = tools_to_claude_format({"gh_command"})
        tool = result[0]
        assert "cmd" in tool["input_schema"]["required"]


# ===========================================================================
# claude_chat_with_tools — mock the HTTP session
# ===========================================================================

def _make_response(content_blocks, stop_reason="end_turn"):
    """Build a fake Anthropic Messages API response dict."""
    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {
        "content": content_blocks,
        "stop_reason": stop_reason,
    }
    return mock_resp


class TestClaudeChatWithTools:
    """Tests for claude_chat_with_tools using a mocked HTTP session."""

    def setup_method(self, method):
        """Reset the session mock before every test so side_effect/return_value don't bleed."""
        session = sys.modules["cloud_providers"]._claude_session
        session.reset_mock()
        # Remove any lingering side_effect from a previous test
        session.post.side_effect = None
        session.post.return_value = MagicMock()

    def _get_session_mock(self):
        return sys.modules["cloud_providers"]._claude_session

    def test_returns_text_on_end_turn(self):
        session = self._get_session_mock()
        session.post.return_value = _make_response(
            [{"type": "text", "text": "Hello from Claude"}]
        )
        result = claude_tools.claude_chat_with_tools(
            messages=[{"role": "user", "content": "hi"}],
            tools=[],
            tool_dispatch=lambda n, a: {},
        )
        assert result == "Hello from Claude"

    def test_tool_use_calls_dispatch(self):
        session = self._get_session_mock()

        # First response: tool_use
        session.post.side_effect = [
            _make_response(
                [{"type": "tool_use", "id": "tu1", "name": "read_file", "input": {"path": "/tmp/x"}}],
                stop_reason="tool_use",
            ),
            # Second response: final text
            _make_response([{"type": "text", "text": "Done"}]),
        ]

        dispatch_mock = MagicMock(return_value={"content": "file contents"})
        result = claude_tools.claude_chat_with_tools(
            messages=[{"role": "user", "content": "read a file"}],
            tools=[],
            tool_dispatch=dispatch_mock,
        )

        dispatch_mock.assert_called_once_with("read_file", {"path": "/tmp/x"})
        assert result == "Done"

    def test_needs_confirmation_halts_loop(self):
        session = self._get_session_mock()
        session.post.side_effect = [
            _make_response(
                [{"type": "tool_use", "id": "tu2", "name": "execute_command", "input": {"cmd": "rm -rf /"}}],
                stop_reason="tool_use",
            ),
        ]

        dispatch_mock = MagicMock(return_value={
            "needs_confirmation": True,
            "reason": "Destructive operation",
            "command": "rm -rf /",
        })

        result = claude_tools.claude_chat_with_tools(
            messages=[{"role": "user", "content": "delete everything"}],
            tools=[],
            tool_dispatch=dispatch_mock,
        )

        assert "BMO needs your permission" in result
        assert "rm -rf /" in result

    def test_auto_approve_executes_confirmed_command(self):
        session = self._get_session_mock()
        session.post.side_effect = [
            _make_response(
                [{"type": "tool_use", "id": "tu3", "name": "execute_command", "input": {"cmd": "rm -rf /tmp/junk"}}],
                stop_reason="tool_use",
            ),
            _make_response([{"type": "text", "text": "Cleaned up"}]),
        ]

        confirmation_result = {
            "needs_confirmation": True,
            "reason": "Destructive",
            "command": "rm -rf /tmp/junk",
        }
        confirmed_result = {"output": "removed", "exit_code": 0}

        dispatch_mock = MagicMock(return_value=confirmation_result)

        set_auto_approve(True)
        try:
            with patch("dev_tools.execute_confirmed", return_value=confirmed_result):
                result = claude_tools.claude_chat_with_tools(
                    messages=[{"role": "user", "content": "clean up"}],
                    tools=[],
                    tool_dispatch=dispatch_mock,
                )
        finally:
            set_auto_approve(False)

        assert result == "Cleaned up"

    def test_pending_confirmations_out_populated(self):
        session = self._get_session_mock()
        session.post.side_effect = [
            _make_response(
                [{"type": "tool_use", "id": "tu4", "name": "write_file",
                  "input": {"path": "/etc/hosts", "content": "evil"}}],
                stop_reason="tool_use",
            ),
        ]

        dispatch_mock = MagicMock(return_value={
            "needs_confirmation": True,
            "reason": "File exists",
            "command": "",
        })

        pending: list = []
        claude_tools.claude_chat_with_tools(
            messages=[{"role": "user", "content": "overwrite hosts"}],
            tools=[],
            tool_dispatch=dispatch_mock,
            pending_confirmations_out=pending,
        )

        assert len(pending) == 1
        assert pending[0]["tool"] == "write_file"

    def test_on_progress_called_for_each_tool(self):
        session = self._get_session_mock()
        session.post.side_effect = [
            _make_response(
                [{"type": "tool_use", "id": "tu5", "name": "list_directory", "input": {"path": "."}}],
                stop_reason="tool_use",
            ),
            _make_response([{"type": "text", "text": "Listed"}]),
        ]

        progress_calls = []

        def on_progress(name, status, preview=""):
            progress_calls.append((name, status))

        claude_tools.claude_chat_with_tools(
            messages=[{"role": "user", "content": "list files"}],
            tools=[],
            tool_dispatch=lambda n, a: {"dirs": [], "files": [], "total": 0},
            on_progress=on_progress,
        )

        tool_events = [(n, s) for n, s in progress_calls if n == "list_directory"]
        assert ("list_directory", "running") in tool_events
        assert ("list_directory", "done") in tool_events

    def test_api_error_raises(self):
        session = self._get_session_mock()
        bad_resp = MagicMock()
        bad_resp.ok = False
        bad_resp.status_code = 401
        bad_resp.text = "Unauthorized"
        bad_resp.raise_for_status.side_effect = Exception("401 Unauthorized")
        # Use return_value (not side_effect on session.post) so it doesn't get consumed
        session.post.return_value = bad_resp
        session.post.side_effect = None

        with pytest.raises(Exception):
            claude_tools.claude_chat_with_tools(
                messages=[{"role": "user", "content": "hello"}],
                tools=[],
                tool_dispatch=lambda n, a: {},
            )

    def test_max_iterations_returns_summary(self):
        """When max_iterations is reached, function must return a string (not crash)."""
        session = self._get_session_mock()

        # Always return tool_use so we never get end_turn
        always_tool = _make_response(
            [{"type": "tool_use", "id": "tuN", "name": "read_file", "input": {"path": "/tmp/x"}}],
            stop_reason="tool_use",
        )
        # Final summary call (tools=[])
        summary_resp = _make_response([{"type": "text", "text": "Summary after limit"}])

        session.post.side_effect = [always_tool] * 3 + [summary_resp]

        result = claude_tools.claude_chat_with_tools(
            messages=[{"role": "user", "content": "loop forever"}],
            tools=[],
            tool_dispatch=lambda n, a: {"content": "ok"},
            max_iterations=3,
        )

        assert isinstance(result, str)

    def test_system_message_extracted(self):
        """System role messages are pulled out and sent as the system field."""
        session = self._get_session_mock()
        session.post.side_effect = [
            _make_response([{"type": "text", "text": "Response with system"}]),
        ]

        claude_tools.claude_chat_with_tools(
            messages=[
                {"role": "system", "content": "You are a test assistant."},
                {"role": "user", "content": "hello"},
            ],
            tools=[],
            tool_dispatch=lambda n, a: {},
        )

        call_kwargs = session.post.call_args
        payload = call_kwargs[1]["json"]
        assert payload.get("system") == "You are a test assistant."

    def test_multiple_text_blocks_concatenated(self):
        session = self._get_session_mock()
        session.post.return_value = _make_response([
            {"type": "text", "text": "Part one. "},
            {"type": "text", "text": "Part two."},
        ])

        result = claude_tools.claude_chat_with_tools(
            messages=[{"role": "user", "content": "hello"}],
            tools=[],
            tool_dispatch=lambda n, a: {},
        )

        assert result == "Part one. Part two."

    def test_large_max_tokens_sets_beta_header(self):
        """max_tokens > 8192 should trigger the anthropic-beta header."""
        session = self._get_session_mock()
        session.post.return_value = _make_response([{"type": "text", "text": "ok"}])

        claude_tools.claude_chat_with_tools(
            messages=[{"role": "user", "content": "hi"}],
            tools=[],
            tool_dispatch=lambda n, a: {},
            max_tokens=65536,
        )

        call_kwargs = session.post.call_args
        headers = call_kwargs[1]["headers"]
        assert "anthropic-beta" in headers

    def test_small_max_tokens_no_beta_header(self):
        """max_tokens <= 8192 should NOT set the anthropic-beta header."""
        session = self._get_session_mock()
        session.post.return_value = _make_response([{"type": "text", "text": "ok"}])

        claude_tools.claude_chat_with_tools(
            messages=[{"role": "user", "content": "hi"}],
            tools=[],
            tool_dispatch=lambda n, a: {},
            max_tokens=4096,
        )

        call_kwargs = session.post.call_args
        headers = call_kwargs[1]["headers"]
        assert "anthropic-beta" not in headers
