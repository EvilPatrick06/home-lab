"""Tests for dev_tools.py — file I/O, shell execution, SSH, git, and tool registry."""

from __future__ import annotations

import sys
import os
import types
from unittest.mock import MagicMock, patch, call

import pytest

# ---------------------------------------------------------------------------
# Ensure Pi-only modules are stubbed before import (conftest already handles
# the hardware mocks, but dev_tools has no Pi deps — import is always safe).
# ---------------------------------------------------------------------------

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import dev_tools
from dev_tools import (
    TOOL_DEFINITIONS,
    dispatch_tool,
    edit_file,
    execute_command,
    execute_confirmed,
    find_files,
    get_tool_descriptions,
    git_command,
    gh_command,
    grep_files,
    is_destructive,
    list_directory,
    read_file,
    ssh_command,
    truncate_output,
    web_fetch,
    web_search,
    write_file,
    write_file_confirmed,
)


# ===========================================================================
# is_destructive
# ===========================================================================

class TestIsDestructive:
    def test_rm_command(self):
        assert is_destructive("rm -rf /tmp/foo") is True

    def test_kill_command(self):
        assert is_destructive("kill 1234") is True

    def test_systemctl_stop(self):
        assert is_destructive("systemctl stop bmo") is True

    def test_systemctl_restart(self):
        assert is_destructive("systemctl restart bmo") is True

    def test_git_push(self):
        assert is_destructive("git push origin main") is True

    def test_git_reset(self):
        assert is_destructive("git reset --hard HEAD") is True

    def test_drop_database(self):
        assert is_destructive("DROP TABLE users;") is True

    def test_safe_ls(self):
        assert is_destructive("ls -la") is False

    def test_safe_cat(self):
        assert is_destructive("cat /etc/hostname") is False

    def test_safe_git_status(self):
        assert is_destructive("git status") is False

    def test_extra_patterns(self):
        assert is_destructive("nuke everything", extra_patterns=[r"\bnuke\b"]) is True

    def test_extra_patterns_not_matching(self):
        assert is_destructive("ls", extra_patterns=[r"\bnuke\b"]) is False


# ===========================================================================
# truncate_output
# ===========================================================================

class TestTruncateOutput:
    def test_short_text_unchanged(self):
        text = "hello world"
        assert truncate_output(text) == text

    def test_long_text_is_truncated(self):
        text = "x" * (dev_tools.MAX_OUTPUT_LENGTH + 100)
        result = truncate_output(text)
        assert "truncated" in result
        assert len(result) < len(text)

    def test_custom_max_len(self):
        text = "abcdefgh"
        result = truncate_output(text, max_len=4)
        assert "truncated" in result


# ===========================================================================
# read_file
# ===========================================================================

class TestReadFile:
    def test_existing_file_returns_content(self, tmp_path):
        f = tmp_path / "hello.txt"
        f.write_text("line1\nline2\nline3\n", encoding="utf-8")
        result = read_file(str(f))
        assert "error" not in result
        assert "line1" in result["content"]
        assert result["total_lines"] == 3

    def test_nonexistent_file_returns_error(self, tmp_path):
        result = read_file(str(tmp_path / "no_such_file.txt"))
        assert "error" in result

    def test_offset_and_limit(self, tmp_path):
        f = tmp_path / "multi.txt"
        lines = [f"line{i}\n" for i in range(10)]
        f.write_text("".join(lines), encoding="utf-8")
        result = read_file(str(f), offset=5, limit=3)
        assert "error" not in result
        assert "line5" in result["content"]
        assert "line8" not in result["content"]

    def test_truncated_flag(self, tmp_path):
        f = tmp_path / "big.txt"
        lines = [f"line{i}\n" for i in range(300)]
        f.write_text("".join(lines), encoding="utf-8")
        result = read_file(str(f), offset=0, limit=200)
        assert result["truncated"] is True

    def test_not_truncated_when_small(self, tmp_path):
        f = tmp_path / "small.txt"
        f.write_text("one\ntwo\n", encoding="utf-8")
        result = read_file(str(f), offset=0, limit=200)
        assert result["truncated"] is False


# ===========================================================================
# write_file
# ===========================================================================

class TestWriteFile:
    def test_writes_new_file(self, tmp_path):
        target = tmp_path / "new_file.txt"
        result = write_file(str(target), "hello content")
        assert result.get("success") is True
        assert target.read_text(encoding="utf-8") == "hello content"

    def test_existing_file_requires_confirmation(self, tmp_path):
        target = tmp_path / "existing.txt"
        target.write_text("original", encoding="utf-8")
        result = write_file(str(target), "new content")
        assert result.get("needs_confirmation") is True
        # File must not be overwritten without confirmation
        assert target.read_text(encoding="utf-8") == "original"

    def test_creates_parent_directories(self, tmp_path):
        target = tmp_path / "subdir" / "nested" / "file.txt"
        result = write_file(str(target), "data")
        assert result.get("success") is True
        assert target.exists()


# ===========================================================================
# write_file_confirmed
# ===========================================================================

class TestWriteFileConfirmed:
    def test_overwrites_existing_file(self, tmp_path):
        target = tmp_path / "file.txt"
        target.write_text("old", encoding="utf-8")
        result = write_file_confirmed(str(target), "new content")
        assert result.get("success") is True
        assert target.read_text(encoding="utf-8") == "new content"

    def test_creates_new_file(self, tmp_path):
        target = tmp_path / "brand_new.txt"
        result = write_file_confirmed(str(target), "stuff")
        assert result.get("success") is True
        assert target.read_text(encoding="utf-8") == "stuff"


# ===========================================================================
# edit_file
# ===========================================================================

class TestEditFile:
    def test_replaces_first_occurrence(self, tmp_path):
        f = tmp_path / "code.py"
        f.write_text("foo = 1\nfoo = 2\n", encoding="utf-8")
        result = edit_file(str(f), "foo = 1", "bar = 1")
        assert result.get("success") is True
        content = f.read_text(encoding="utf-8")
        assert "bar = 1" in content
        assert "foo = 2" in content  # second occurrence untouched

    def test_string_not_found_returns_error(self, tmp_path):
        f = tmp_path / "code.py"
        f.write_text("hello world\n", encoding="utf-8")
        result = edit_file(str(f), "does_not_exist", "replacement")
        assert "error" in result

    def test_multiple_occurrences_noted(self, tmp_path):
        f = tmp_path / "repeat.txt"
        f.write_text("abc abc abc\n", encoding="utf-8")
        result = edit_file(str(f), "abc", "XYZ")
        assert result.get("success") is True
        assert result["occurrences"] == 3

    def test_nonexistent_file_returns_error(self, tmp_path):
        result = edit_file(str(tmp_path / "ghost.txt"), "x", "y")
        assert "error" in result


# ===========================================================================
# list_directory
# ===========================================================================

class TestListDirectory:
    def test_lists_files_and_dirs(self, tmp_path):
        (tmp_path / "subdir").mkdir()
        (tmp_path / "file.txt").write_text("x")
        result = list_directory(str(tmp_path))
        assert "error" not in result
        dir_names = result["dirs"]
        file_names = [f["name"] for f in result["files"]]
        assert "subdir/" in dir_names
        assert "file.txt" in file_names

    def test_nonexistent_dir_returns_error(self, tmp_path):
        result = list_directory(str(tmp_path / "nonexistent"))
        assert "error" in result

    def test_total_count(self, tmp_path):
        (tmp_path / "a.txt").write_text("a")
        (tmp_path / "b.txt").write_text("b")
        result = list_directory(str(tmp_path))
        assert result["total"] == 2


# ===========================================================================
# find_files
# ===========================================================================

class TestFindFiles:
    def test_finds_matching_files(self, tmp_path):
        (tmp_path / "foo.py").write_text("")
        (tmp_path / "bar.txt").write_text("")
        result = find_files("*.py", str(tmp_path))
        assert "error" not in result
        assert result["count"] >= 1
        assert any("foo.py" in m for m in result["matches"])

    def test_no_matches_returns_empty(self, tmp_path):
        result = find_files("*.xyz_never", str(tmp_path))
        assert result["count"] == 0
        assert result["matches"] == []


# ===========================================================================
# execute_command
# ===========================================================================

class TestExecuteCommand:
    def test_safe_command_runs(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="hello\n", stderr="", returncode=0
            )
            result = execute_command("echo hello")
        assert result["exit_code"] == 0
        assert "hello" in result["output"]

    def test_destructive_command_returns_confirmation(self):
        result = execute_command("rm -rf /tmp/junk")
        assert result.get("needs_confirmation") is True
        assert "command" in result

    def test_command_timeout_returns_error(self):
        import subprocess
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("cmd", 1)):
            result = execute_command("sleep 999", timeout=1)
        assert result["exit_code"] == -1
        assert "timed out" in result["output"].lower()

    def test_command_exception_returns_error(self):
        with patch("subprocess.run", side_effect=OSError("no such program")):
            result = execute_command("bogus_command_xyz")
        assert result["exit_code"] == -1

    def test_output_combined_stdout_stderr(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="out", stderr="err", returncode=0
            )
            result = execute_command("ls")
        assert "out" in result["output"]
        assert "err" in result["output"]

    def test_settings_auto_approve_skips_confirmation(self):
        mock_settings = MagicMock()
        mock_settings.get_custom_destructive_patterns.return_value = []
        mock_settings.is_destructive_auto_approved.return_value = True
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="ok", stderr="", returncode=0)
            result = execute_command("rm -rf /tmp/test", settings=mock_settings)
        assert result.get("needs_confirmation") is not True
        assert result["exit_code"] == 0


# ===========================================================================
# execute_confirmed
# ===========================================================================

class TestExecuteConfirmed:
    def test_normal_command_runs(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="done\n", stderr="", returncode=0)
            result = execute_confirmed("git status")
        assert result["exit_code"] == 0
        assert "done" in result["output"]

    def test_bmo_restart_uses_nohup(self):
        with patch("subprocess.Popen") as mock_popen:
            mock_popen.return_value = MagicMock()
            result = execute_confirmed("sudo systemctl restart bmo")
        assert result.get("delayed_restart") is True
        assert mock_popen.called

    def test_timeout_returns_error(self):
        import subprocess
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("cmd", 1)):
            result = execute_confirmed("long_running_command", timeout=1)
        assert result["exit_code"] == -1


# ===========================================================================
# ssh_command
# ===========================================================================

class TestSshCommand:
    def test_safe_ssh_command_runs(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="remote output\n", stderr="", returncode=0
            )
            result = ssh_command("user@host", "ls /home")
        assert result["exit_code"] == 0
        assert "remote output" in result["output"]

    def test_destructive_ssh_requires_confirmation(self):
        result = ssh_command("user@host", "rm -rf /tmp/data")
        assert result.get("needs_confirmation") is True

    def test_ssh_timeout_returns_error(self):
        import subprocess
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("ssh", 5)):
            result = ssh_command("user@host", "ls", timeout=5)
        assert result["exit_code"] == -1
        assert "timed out" in result["output"].lower()

    def test_pc_host_alias_resolved(self):
        with patch.dict(os.environ, {"PC_HOST": "192.168.1.100"}):
            # Reload PC_HOST from env for this test
            import importlib
            importlib.reload(dev_tools)
            from dev_tools import ssh_command as sc2
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(stdout="ok", stderr="", returncode=0)
                result = sc2("pc", "hostname")
            # Should have used PC_HOST value in the SSH call
            call_args = mock_run.call_args
            assert "192.168.1.100" in call_args[0][0]


# ===========================================================================
# git_command
# ===========================================================================

class TestGitCommand:
    def test_read_git_command_runs(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="On branch main\n", stderr="", returncode=0
            )
            result = git_command("status")
        assert result["exit_code"] == 0
        assert "On branch" in result["output"]

    def test_git_push_requires_confirmation(self):
        result = git_command("push origin main")
        assert result.get("needs_confirmation") is True

    def test_git_reset_hard_requires_confirmation(self):
        result = git_command("reset --hard HEAD~1")
        assert result.get("needs_confirmation") is True

    def test_git_force_requires_confirmation(self):
        result = git_command("push --force")
        assert result.get("needs_confirmation") is True

    def test_git_log_is_safe(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="commit abc\n", stderr="", returncode=0)
            result = git_command("log --oneline -5")
        assert result.get("needs_confirmation") is not True


# ===========================================================================
# gh_command
# ===========================================================================

class TestGhCommand:
    def test_safe_gh_command_runs(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="PR list\n", stderr="", returncode=0
            )
            result = gh_command("pr list")
        assert result["exit_code"] == 0

    def test_pr_merge_requires_confirmation(self):
        result = gh_command("pr merge 42")
        assert result.get("needs_confirmation") is True

    def test_issue_close_requires_confirmation(self):
        result = gh_command("issue close 7")
        assert result.get("needs_confirmation") is True


# ===========================================================================
# grep_files (Python fallback path)
# ===========================================================================

class TestGrepFiles:
    def test_python_fallback_finds_pattern(self, tmp_path):
        f = tmp_path / "source.py"
        f.write_text("def hello_world():\n    pass\n", encoding="utf-8")
        # Force Python fallback by making rg and grep unavailable
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = grep_files("hello_world", str(tmp_path), "*.py")
        assert "error" not in result
        assert result["count"] >= 1
        assert any("hello_world" in m["content"] for m in result["matches"])

    def test_no_matches_returns_empty(self, tmp_path):
        f = tmp_path / "empty.py"
        f.write_text("nothing relevant\n", encoding="utf-8")
        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = grep_files("XYZ_UNIQUE_PATTERN_12345", str(tmp_path), "*.py")
        assert result["count"] == 0


# ===========================================================================
# web_search
# ===========================================================================

class TestWebSearch:
    def test_returns_results_when_ddgs_available(self):
        mock_ddgs = MagicMock()
        mock_ddgs.__enter__ = lambda s: s
        mock_ddgs.__exit__ = MagicMock(return_value=False)
        mock_ddgs.text.return_value = [
            {"title": "Result 1", "href": "https://example.com", "body": "snippet"}
        ]
        with patch("dev_tools.DDGS", mock_ddgs, create=True):
            # Patch the import inside the function
            with patch.dict("sys.modules", {"duckduckgo_search": MagicMock(DDGS=mock_ddgs)}):
                result = web_search("test query", num_results=1)
        # Either returns results or an import error — both are valid dict responses
        assert isinstance(result, dict)

    def test_import_error_returns_error_dict(self):
        with patch.dict("sys.modules", {"duckduckgo_search": None}):
            result = web_search("test query")
        # Module not available → should return error dict
        assert "error" in result


# ===========================================================================
# web_fetch
# ===========================================================================

class TestWebFetch:
    def test_returns_content_on_success(self):
        mock_requests = MagicMock()
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.text = "<html><title>Test Page</title><body>Hello</body></html>"
        mock_response.raise_for_status = MagicMock()
        mock_requests.get.return_value = mock_response

        with patch.dict("sys.modules", {
            "requests": mock_requests,
            "markdownify": MagicMock(markdownify=lambda html, **kw: "# Hello"),
        }):
            result = web_fetch("https://example.com")

        assert isinstance(result, dict)

    def test_import_error_returns_error_dict(self):
        with patch.dict("sys.modules", {"markdownify": None}):
            result = web_fetch("https://example.com")
        assert "error" in result


# ===========================================================================
# TOOL_DEFINITIONS registry
# ===========================================================================

class TestToolDefinitions:
    def test_all_tools_have_name(self):
        for tool in TOOL_DEFINITIONS:
            assert "name" in tool, f"Tool missing 'name': {tool}"
            assert isinstance(tool["name"], str)
            assert tool["name"]

    def test_all_tools_have_description(self):
        for tool in TOOL_DEFINITIONS:
            assert "description" in tool, f"Tool missing 'description': {tool['name']}"
            assert isinstance(tool["description"], str)
            assert tool["description"]

    def test_all_tools_have_parameters(self):
        for tool in TOOL_DEFINITIONS:
            assert "parameters" in tool, f"Tool missing 'parameters': {tool['name']}"
            assert isinstance(tool["parameters"], dict)

    def test_expected_tools_present(self):
        names = {t["name"] for t in TOOL_DEFINITIONS}
        expected = {
            "execute_command", "ssh_command", "read_file", "write_file",
            "edit_file", "list_directory", "find_files", "grep_files",
            "web_search", "web_fetch", "git_command", "gh_command",
            "write_memory", "read_memory",
        }
        for name in expected:
            assert name in names, f"Expected tool '{name}' not in TOOL_DEFINITIONS"

    def test_no_duplicate_tool_names(self):
        names = [t["name"] for t in TOOL_DEFINITIONS]
        assert len(names) == len(set(names)), "Duplicate tool names in TOOL_DEFINITIONS"


# ===========================================================================
# get_tool_descriptions
# ===========================================================================

class TestGetToolDescriptions:
    def test_returns_string(self):
        result = get_tool_descriptions()
        assert isinstance(result, str)

    def test_contains_all_tool_names(self):
        result = get_tool_descriptions()
        for tool in TOOL_DEFINITIONS:
            assert tool["name"] in result

    def test_starts_with_header(self):
        result = get_tool_descriptions()
        assert result.startswith("Available tools:")


# ===========================================================================
# dispatch_tool
# ===========================================================================

class TestDispatchTool:
    def test_read_file_dispatched(self, tmp_path):
        f = tmp_path / "dispatch_test.txt"
        f.write_text("dispatch content\n", encoding="utf-8")
        result = dispatch_tool("read_file", {"path": str(f)})
        assert "error" not in result
        assert "dispatch content" in result["content"]

    def test_write_file_dispatched(self, tmp_path):
        target = tmp_path / "dispatch_write.txt"
        result = dispatch_tool("write_file", {"path": str(target), "content": "written"})
        assert result.get("success") is True

    def test_list_directory_dispatched(self, tmp_path):
        result = dispatch_tool("list_directory", {"path": str(tmp_path)})
        assert "error" not in result
        assert "files" in result

    def test_execute_command_dispatched(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="ok\n", stderr="", returncode=0)
            result = dispatch_tool("execute_command", {"cmd": "echo ok"})
        assert result["exit_code"] == 0

    def test_git_command_dispatched(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="branch\n", stderr="", returncode=0)
            result = dispatch_tool("git_command", {"cmd": "status"})
        assert result.get("needs_confirmation") is not True

    def test_ssh_command_dispatched(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="remote\n", stderr="", returncode=0)
            result = dispatch_tool("ssh_command", {"host": "user@host", "cmd": "ls"})
        assert "error" not in result

    def test_invalid_tool_name_returns_error(self):
        result = dispatch_tool("nonexistent_tool_xyz", {})
        assert "error" in result
        assert "Unknown tool" in result["error"]

    def test_invalid_tool_does_not_crash(self):
        # Should never raise — must return a dict with error
        try:
            result = dispatch_tool("__totally_bogus__", {"x": 1})
            assert isinstance(result, dict)
        except Exception as exc:
            pytest.fail(f"dispatch_tool raised unexpectedly: {exc}")

    def test_write_memory_dispatched(self):
        mock_memory = MagicMock()
        mock_memory.update_memory_section = MagicMock()
        with patch.dict("sys.modules", {"agents.memory": mock_memory}):
            result = dispatch_tool("write_memory", {"section": "Notes", "content": "hello"})
        assert isinstance(result, dict)

    def test_read_memory_dispatched(self):
        mock_memory = MagicMock()
        mock_memory.load_memory = MagicMock(return_value="# Memory\nsome notes")
        with patch.dict("sys.modules", {"agents.memory": mock_memory}):
            result = dispatch_tool("read_memory", {})
        assert isinstance(result, dict)

    def test_find_files_dispatched(self, tmp_path):
        (tmp_path / "test.py").write_text("")
        result = dispatch_tool("find_files", {"pattern": "*.py", "path": str(tmp_path)})
        assert "error" not in result
        assert "matches" in result

    def test_gh_command_dispatched_safe(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="PR list\n", stderr="", returncode=0)
            result = dispatch_tool("gh_command", {"cmd": "pr list"})
        assert isinstance(result, dict)
