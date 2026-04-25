"""Claude native tool use — convert dev_tools to Claude API format and run tool loop."""

from __future__ import annotations

import json
import threading

from dev.dev_tools import TOOL_DEFINITIONS

# Thread-local auto-approve flag — set by IDE autopilot mode
_auto_approve_local = threading.local()

def set_auto_approve(enabled: bool):
    """Set whether the current thread auto-approves destructive operations."""
    _auto_approve_local.enabled = enabled

def get_auto_approve() -> bool:
    """Check if auto-approve is enabled for current thread."""
    return getattr(_auto_approve_local, 'enabled', False)


def _param_to_schema(desc: str) -> dict:
    """Convert our param description to JSON Schema type."""
    optional = "optional" in desc.lower()
    if "int" in desc or "integer" in desc:
        return {"type": "integer", "description": desc}
    return {"type": "string", "description": desc}


def tools_to_claude_format(tool_names: set[str]) -> list[dict]:
    """Convert TOOL_DEFINITIONS to Claude API tools format for allowed tools only."""
    result = []
    for t in TOOL_DEFINITIONS:
        if t["name"] not in tool_names:
            continue
        properties = {}
        required = []
        for param, desc in t["parameters"].items():
            properties[param] = _param_to_schema(desc)
            if "optional" not in desc.lower():
                required.append(param)
        result.append({
            "name": t["name"],
            "description": t["description"],
            "input_schema": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        })
    return result


def claude_chat_with_tools(
    messages: list[dict],
    tools: list[dict],
    tool_dispatch,
    model: str = "claude-opus-4-6",
    temperature: float = 0.3,
    max_tokens: int = 65536,
    max_iterations: int = 10,
    on_progress=None,
    pending_confirmations_out: list | None = None,
) -> str:
    """Run Claude Messages API with native tool use. Returns final text."""
    from services.cloud_providers import (
        ANTHROPIC_API_KEY,
        ANTHROPIC_BASE,
        _claude_model_id,
        _claude_session,
    )

    model_id = _claude_model_id(model)
    system_text = None
    api_messages = []

    for msg in messages:
        if msg["role"] == "system":
            if system_text is None:
                system_text = msg["content"]
        else:
            content = msg["content"]
            if isinstance(content, list):
                api_messages.append({"role": msg["role"], "content": content})
            else:
                api_messages.append({"role": msg["role"], "content": content})

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    if max_tokens > 8192:
        headers["anthropic-beta"] = "output-128k-2025-02-19"

    payload = {
        "model": model_id,
        "messages": api_messages,
        "tools": tools,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if system_text:
        payload["system"] = system_text

    for iteration in range(max_iterations):
        r = _claude_session.post(
            f"{ANTHROPIC_BASE}/messages",
            json=payload,
            headers=headers,
            timeout=180,
        )
        if not r.ok:
            err = r.text[:2000] if r.text else "(no body)"
            print(f"[claude_tools] API error {r.status_code}: {err}")
            r.raise_for_status()

        data = r.json()
        content_blocks = data.get("content", [])
        stop_reason = data.get("stop_reason", "end_turn")

        text_parts = []
        tool_uses = []
        for b in content_blocks:
            if b.get("type") == "text":
                text_parts.append(b.get("text", ""))
            elif b.get("type") == "tool_use":
                tool_uses.append(b)

        # Log what tools are being used
        tool_names_used = [tu.get("name", "?") for tu in tool_uses]
        print(f"[claude_tools] iter={iteration + 1} stop={stop_reason} tools=[{', '.join(tool_names_used) if tool_names_used else 'none'}]")

        if not tool_uses:
            return "".join(text_parts)

        tool_results = []
        pending_confirm = None
        for tu in tool_uses:
            tool_id = tu.get("id", "")
            name = tu.get("name", "")
            args = tu.get("input", {}) or {}

            # Descriptive tool logging — show what the agent is actually doing
            if name in ("read_file", "write_file", "edit_file", "create_file"):
                path = args.get("path", args.get("file_path", "?"))
                print(f"  [tool] {name} → {path}")
            elif name == "run_command":
                cmd = args.get("command", "?")
                print(f"  [tool] {name} → {cmd[:120]}")
            elif name == "search_files":
                q = args.get("query", args.get("pattern", "?"))
                print(f"  [tool] {name} → {q}")
            elif name == "list_directory":
                d = args.get("path", args.get("directory", "?"))
                print(f"  [tool] {name} → {d}")
            else:
                brief_args = ", ".join(f"{k}={str(v)[:40]}" for k, v in list(args.items())[:3])
                print(f"  [tool] {name}({brief_args})")

            if on_progress:
                on_progress(name, "running", "")
            result = tool_dispatch(name, args)
            if on_progress:
                preview = str(result)[:200] if isinstance(result, (str, dict)) else ""
                on_progress(name, "done", preview)

            if isinstance(result, dict) and result.get("needs_confirmation"):
                if get_auto_approve():
                    # Autopilot mode — auto-execute the confirmed version
                    cmd = result.get("command", "")
                    path = result.get("path", "")
                    print(f"  [autopilot] Auto-approving: {cmd or path}")
                    from dev.dev_tools import execute_confirmed, write_file_confirmed
                    if name == "execute_command" and cmd:
                        result = execute_confirmed(cmd, args.get("cwd"))
                    elif name == "ssh_command" and cmd:
                        # SSH confirmed — just run it directly
                        result = execute_confirmed(cmd)
                    elif name == "write_file" and path:
                        result = write_file_confirmed(path, args.get("content", ""))
                    elif name == "git_command" and cmd:
                        result = execute_confirmed(cmd)
                    elif name == "gh_command" and cmd:
                        result = execute_confirmed(cmd)
                    else:
                        result = execute_confirmed(cmd or "echo 'auto-approved'")
                    content = json.dumps(result, indent=2)[:8000]
                else:
                    pending_confirm = result
                    if pending_confirmations_out is not None:
                        pending_confirmations_out.append({
                            "tool": name,
                            "args": args,
                            "reason": result.get("reason", ""),
                            "command": result.get("command", ""),
                        })
                    content = json.dumps(
                        {"needs_confirmation": True, "reason": result.get("reason", ""), "command": result.get("command", "")},
                        indent=2,
                    )
            else:
                content = json.dumps(result, indent=2)[:8000]
            tool_results.append({"type": "tool_result", "tool_use_id": tool_id, "content": content})
            if pending_confirm:
                break

        if pending_confirm:
            reason = pending_confirm.get("reason", "Destructive operation")
            cmd = pending_confirm.get("command", "")
            return (
                "".join(text_parts)
                + f"\n\nBMO needs your permission: {reason}\n"
                + (f"Command: {cmd}\n" if cmd else "")
                + "Say 'yes' to confirm or 'no' to cancel."
            )

        api_messages.append({"role": "assistant", "content": content_blocks})
        api_messages.append({"role": "user", "content": tool_results})
        payload["messages"] = api_messages

    # Hit max iterations — we already appended tool results to payload but never got the model's reply.
    # Make one final call with tools=[] so the model must return text (summary) not more tool_uses.
    if tool_uses:
        final_messages = list(payload["messages"])
        final_messages.append({"role": "user", "content": "[You've reached the iteration limit.] Provide a brief summary of your findings for the user. Do not make more tool calls."})
        final_payload = {**payload, "messages": final_messages, "tools": []}
        r = _claude_session.post(f"{ANTHROPIC_BASE}/messages", json=final_payload, headers=headers, timeout=180)
        if r.ok:
            data = r.json()
            for b in data.get("content", []):
                if b.get("type") == "text":
                    summary = b.get("text", "").strip()
                    if summary:
                        return summary
    return "".join(text_parts) if text_parts else "(Max iterations reached)"
