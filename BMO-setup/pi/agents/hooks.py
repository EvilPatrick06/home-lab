"""BMO Hooks — Pre/post tool execution hooks for auto-formatting, linting, safety.

Hooks are configured in settings under "hooks.preToolUse" and "hooks.postToolUse".
Each hook has a "matcher" (exact name, glob, or "*") and a "command" to run.

Pre-hooks can block tool execution (non-zero exit) or modify tool args (JSON on stdout).
Post-hooks can add context to results (stdout/stderr captured as additional info).
"""

from __future__ import annotations

import fnmatch
import json
import os
import subprocess
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from agents.settings import BmoSettings


@dataclass
class HookResult:
    """Result of running pre-hooks for a tool call."""
    allowed: bool = True
    modified_args: dict | None = None
    context: str = ""
    blocked_by: str = ""


def _matches(matcher: str, tool_name: str) -> bool:
    """Check if a hook matcher matches a tool name.

    Supports:
      - Exact match: "write_file" matches only "write_file"
      - Glob: "mcp__github__*" matches all GitHub MCP tools
      - "*" matches everything
    """
    return fnmatch.fnmatch(tool_name, matcher)


def _run_hook_command(
    command: str,
    stdin_data: dict,
    cwd: str | None = None,
    timeout: int = 10,
) -> tuple[int, str, str]:
    """Run a hook command with JSON on stdin.

    Returns: (exit_code, stdout, stderr)
    """
    try:
        result = subprocess.run(
            command,
            shell=True,
            input=json.dumps(stdin_data),
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=timeout,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", f"Hook timed out after {timeout}s: {command}"
    except FileNotFoundError:
        return -1, "", f"Hook command not found: {command}"
    except Exception as e:
        return -1, "", f"Hook failed: {e}"


def run_pre_hooks(
    tool_name: str,
    args: dict,
    settings: Any,
    cwd: str | None = None,
) -> HookResult:
    """Run preToolUse hooks. Can block or modify tool inputs.

    Args:
        tool_name: The tool being called (e.g., "write_file", "mcp__github__create_issue")
        args: The tool arguments dict
        settings: BmoSettings instance
        cwd: Working directory for hook commands

    Returns:
        HookResult with allowed=True/False, optional modified args and context
    """
    hooks = settings.get("hooks.preToolUse", []) if settings else []
    if not hooks:
        return HookResult()

    result = HookResult()
    context_parts = []

    for hook in hooks:
        matcher = hook.get("matcher", "")
        command = hook.get("command", "")
        if not matcher or not command:
            continue

        if not _matches(matcher, tool_name):
            continue

        # Run the hook
        stdin_data = {"tool": tool_name, "args": args}
        exit_code, stdout, stderr = _run_hook_command(command, stdin_data, cwd)

        if exit_code != 0:
            # Hook blocked the tool
            result.allowed = False
            result.blocked_by = command
            if stderr:
                result.context = stderr
            elif stdout:
                result.context = stdout
            else:
                result.context = f"Blocked by pre-hook: {command}"
            return result

        # Check for modified args in stdout
        if stdout:
            try:
                modifications = json.loads(stdout)
                if isinstance(modifications, dict) and "args" in modifications:
                    args = modifications["args"]
                    result.modified_args = args
            except json.JSONDecodeError:
                # Not JSON — treat as additional context
                context_parts.append(stdout)

        # Capture stderr as additional context
        if stderr:
            context_parts.append(stderr)

    if context_parts:
        result.context = "\n".join(context_parts)

    return result


def run_post_hooks(
    tool_name: str,
    args: dict,
    tool_result: dict,
    settings: Any,
    cwd: str | None = None,
) -> dict:
    """Run postToolUse hooks. Can add context to the result.

    Args:
        tool_name: The tool that was called
        args: The tool arguments that were used
        tool_result: The result dict from the tool
        settings: BmoSettings instance
        cwd: Working directory for hook commands

    Returns:
        The tool result dict, potentially with added "hook_context" key
    """
    hooks = settings.get("hooks.postToolUse", []) if settings else []
    if not hooks:
        return tool_result

    context_parts = []

    for hook in hooks:
        matcher = hook.get("matcher", "")
        command = hook.get("command", "")
        if not matcher or not command:
            continue

        if not _matches(matcher, tool_name):
            continue

        # Run the hook
        stdin_data = {"tool": tool_name, "args": args, "result": tool_result}
        exit_code, stdout, stderr = _run_hook_command(command, stdin_data, cwd)

        # Capture any output as additional context
        if stdout:
            context_parts.append(stdout)
        if stderr:
            context_parts.append(stderr)

    if context_parts:
        tool_result = dict(tool_result)
        tool_result["hook_context"] = "\n".join(context_parts)

    return tool_result
