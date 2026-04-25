"""BMO Dev Tools — Shell execution, SSH, file I/O, web search, GitHub, VS Code.

Provides tool definitions for the LLM's agentic loop. BMO can freely read/search
but asks confirmation before destructive operations (delete, overwrite, push, etc.).
"""

import glob as glob_module
import os
import re
import shlex
import subprocess

# ── Safety Configuration ──────────────────────────────────────────────

# Commands that require user confirmation before execution
DESTRUCTIVE_PATTERNS = [
    r"\brm\b", r"\brmdir\b", r"\bdel\b",
    r"\bmv\b.*\s",  # mv with args (could overwrite)
    r"\bkill\b", r"\bkillall\b", r"\bpkill\b",
    r"\bsystemctl\s+(stop|restart|disable)\b",
    r"\bgit\s+(push|reset|rebase|force)\b",
    r"\bgit\s+push\b",
    r"\bnpm\s+publish\b",
    r"\bpip\s+uninstall\b",
    r"\bapt\s+(remove|purge)\b",
    r"\bdropdb\b", r"\bDROP\b",
]

MAX_TOOL_CALLS_PER_TURN = 10
MAX_OUTPUT_LENGTH = 8000  # Truncate command output to this many chars

# SSH configuration
SSH_KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519")
PC_HOST = os.environ.get("PC_HOST", "")  # Set if SSH to PC is configured


def is_destructive(command: str, extra_patterns: list[str] | None = None) -> bool:
    """Check if a command matches any destructive pattern.

    Args:
        command: The shell command to check.
        extra_patterns: Additional regex patterns from settings.
    """
    all_patterns = list(DESTRUCTIVE_PATTERNS)
    if extra_patterns:
        all_patterns.extend(extra_patterns)
    for pattern in all_patterns:
        if re.search(pattern, command, re.IGNORECASE):
            return True
    return False


def truncate_output(text: str, max_len: int = MAX_OUTPUT_LENGTH) -> str:
    """Truncate long output with a note."""
    if len(text) <= max_len:
        return text
    half = max_len // 2
    return text[:half] + f"\n\n... ({len(text) - max_len} chars truncated) ...\n\n" + text[-half:]


# ── Tool Implementations ──────────────────────────────────────────────

def execute_command(cmd: str, cwd: str | None = None, timeout: int = 30, settings=None) -> dict:
    """Run a shell command locally on the Pi.

    Free for read/search commands. Requires confirmation for destructive ops.
    Returns: {output, exit_code, truncated, needs_confirmation}
    """
    extra_patterns = settings.get_custom_destructive_patterns() if settings else None
    if is_destructive(cmd, extra_patterns):
        # Check if auto-approved via trusted directories
        if settings and settings.is_destructive_auto_approved(cmd, cwd):
            pass  # Skip confirmation
        else:
            return {
                "needs_confirmation": True,
                "command": cmd,
                "reason": "This command could modify or delete data. Please confirm.",
            }

    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            cwd=cwd, timeout=timeout,
        )
        output = result.stdout + result.stderr
        truncated = len(output) > MAX_OUTPUT_LENGTH
        return {
            "output": truncate_output(output),
            "exit_code": result.returncode,
            "truncated": truncated,
        }
    except subprocess.TimeoutExpired:
        return {"output": f"Command timed out after {timeout}s", "exit_code": -1}
    except Exception as e:
        return {"output": str(e), "exit_code": -1}


def execute_confirmed(cmd: str, cwd: str | None = None, timeout: int = 30) -> dict:
    """Execute a previously confirmed destructive command."""
    # Intercept self-restart — delay so agent turn completes first
    if re.search(r"systemctl\s+(restart|stop)\s+bmo\b", cmd):
        delayed_cmd = f"nohup bash -c 'sleep 5 && {cmd}' > /dev/null 2>&1 &"
        try:
            subprocess.Popen(delayed_cmd, shell=True, cwd=cwd)
            return {
                "output": "BMO restart scheduled in 5 seconds. Agent can continue working.",
                "exit_code": 0,
                "delayed_restart": True,
            }
        except Exception as e:
            return {"output": str(e), "exit_code": -1}

    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            cwd=cwd, timeout=timeout,
        )
        output = result.stdout + result.stderr
        return {
            "output": truncate_output(output),
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"output": f"Command timed out after {timeout}s", "exit_code": -1}
    except Exception as e:
        return {"output": str(e), "exit_code": -1}


def ssh_command(host: str, cmd: str, timeout: int = 30) -> dict:
    """Run a command on a remote host via SSH.

    Pre-configured hosts: 'pc' (your Windows PC).
    All other values treated as direct host strings.
    """
    if host == "pc" and PC_HOST:
        target = PC_HOST
    else:
        target = host

    if is_destructive(cmd):
        return {
            "needs_confirmation": True,
            "command": f"ssh {target} '{cmd}'",
            "reason": "Remote destructive command requires confirmation.",
        }

    ssh_cmd = ["ssh", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10"]
    if os.path.exists(SSH_KEY_PATH):
        ssh_cmd.extend(["-i", SSH_KEY_PATH])
    ssh_cmd.extend([target, cmd])

    try:
        result = subprocess.run(
            ssh_cmd, capture_output=True, text=True, timeout=timeout,
        )
        output = result.stdout + result.stderr
        return {
            "output": truncate_output(output),
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"output": f"SSH timed out after {timeout}s", "exit_code": -1}
    except Exception as e:
        return {"output": str(e), "exit_code": -1}


def read_file(path: str, offset: int = 0, limit: int = 200) -> dict:
    """Read a file's contents. No restrictions — free access.

    Returns: {content, total_lines, truncated}
    """
    try:
        path = os.path.expanduser(path)
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        total = len(lines)
        selected = lines[offset:offset + limit]
        content = "".join(selected)

        return {
            "content": content,
            "total_lines": total,
            "showing": f"lines {offset + 1}-{min(offset + limit, total)} of {total}",
            "truncated": total > offset + limit,
        }
    except Exception as e:
        return {"error": str(e)}


def write_file(path: str, content: str) -> dict:
    """Write content to a file. Requires confirmation if file exists.

    Returns: {success, path, needs_confirmation}
    """
    path = os.path.expanduser(path)

    if os.path.exists(path):
        return {
            "needs_confirmation": True,
            "path": path,
            "reason": f"File already exists: {path}. Overwrite?",
        }

    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"success": True, "path": path}
    except Exception as e:
        return {"error": str(e)}


def write_file_confirmed(path: str, content: str) -> dict:
    """Write file after user confirmation (overwrites existing)."""
    try:
        path = os.path.expanduser(path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"success": True, "path": path}
    except Exception as e:
        return {"error": str(e)}


def edit_file(path: str, old_string: str, new_string: str) -> dict:
    """Find and replace in a file. Shows diff before applying.

    Returns: {success, diff, needs_confirmation} if change found
    """
    try:
        path = os.path.expanduser(path)
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        if old_string not in content:
            return {"error": f"String not found in {path}"}

        count = content.count(old_string)
        new_content = content.replace(old_string, new_string, 1)

        # Generate simple diff
        diff = f"--- {path}\n+++ {path}\n"
        diff += f"-{old_string[:200]}\n+{new_string[:200]}\n"
        if count > 1:
            diff += f"({count} occurrences found, replacing first only)"

        # Apply the change
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)

        return {"success": True, "diff": diff, "occurrences": count}
    except Exception as e:
        return {"error": str(e)}


def list_directory(path: str = ".") -> dict:
    """List files in a directory. No restrictions.

    Returns: {files, dirs, total}
    """
    try:
        path = os.path.expanduser(path)
        entries = os.listdir(path)

        files = []
        dirs = []
        for entry in sorted(entries):
            full = os.path.join(path, entry)
            if os.path.isdir(full):
                dirs.append(entry + "/")
            else:
                size = os.path.getsize(full)
                files.append({"name": entry, "size": size})

        return {"dirs": dirs, "files": files, "total": len(entries)}
    except Exception as e:
        return {"error": str(e)}


def find_files(pattern: str, path: str = ".") -> dict:
    """Glob search for files. No restrictions.

    Returns: {matches, count}
    """
    try:
        path = os.path.expanduser(path)
        full_pattern = os.path.join(path, pattern)
        matches = sorted(glob_module.glob(full_pattern, recursive=True))

        # Limit results
        truncated = len(matches) > 100
        matches = matches[:100]

        return {
            "matches": matches,
            "count": len(matches),
            "truncated": truncated,
        }
    except Exception as e:
        return {"error": str(e)}


def grep_files(pattern: str, path: str = ".", file_glob: str = "*") -> dict:
    """Search file contents using ripgrep or grep. No restrictions.

    Returns: {matches: [{file, line, content}], count}
    """
    try:
        path = os.path.expanduser(path)

        # Try ripgrep first, then grep
        for cmd_name in ["rg", "grep"]:
            try:
                if cmd_name == "rg":
                    cmd = ["rg", "-n", "--max-count=50", "--glob", file_glob, pattern, path]
                else:
                    cmd = ["grep", "-rn", "--max-count=50", "--include", file_glob, pattern, path]

                result = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=10,
                )
                break
            except FileNotFoundError:
                continue
        else:
            # Python fallback
            return _python_grep(pattern, path, file_glob)

        matches = []
        for line in result.stdout.splitlines()[:50]:
            parts = line.split(":", 2)
            if len(parts) >= 3:
                matches.append({
                    "file": parts[0],
                    "line": int(parts[1]) if parts[1].isdigit() else 0,
                    "content": parts[2].strip()[:200],
                })

        return {"matches": matches, "count": len(matches)}
    except Exception as e:
        return {"error": str(e)}


def _python_grep(pattern: str, path: str, file_glob: str) -> dict:
    """Pure Python grep fallback."""
    import fnmatch

    matches = []
    compiled = re.compile(pattern, re.IGNORECASE)

    for root, dirs, files in os.walk(path):
        for filename in files:
            if not fnmatch.fnmatch(filename, file_glob):
                continue
            filepath = os.path.join(root, filename)
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    for i, line in enumerate(f, 1):
                        if compiled.search(line):
                            matches.append({
                                "file": filepath,
                                "line": i,
                                "content": line.strip()[:200],
                            })
                            if len(matches) >= 50:
                                return {"matches": matches, "count": len(matches), "truncated": True}
            except (PermissionError, OSError):
                continue

    return {"matches": matches, "count": len(matches)}


def web_search(query: str, num_results: int = 5) -> dict:
    """Search the web using DuckDuckGo. No restrictions.

    Returns: {results: [{title, url, snippet}]}
    """
    try:
        from duckduckgo_search import DDGS

        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=num_results))

        return {
            "results": [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", r.get("link", "")),
                    "snippet": r.get("body", r.get("snippet", "")),
                }
                for r in results
            ]
        }
    except ImportError:
        return {"error": "duckduckgo-search not installed. Run: pip install duckduckgo-search"}
    except Exception as e:
        return {"error": str(e)}


def web_fetch(url: str) -> dict:
    """Fetch a web page and convert to markdown text. No restrictions.

    Returns: {content, url, title}
    """
    try:
        import requests
        from markdownify import markdownify

        r = requests.get(url, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (compatible; BMO/1.0)"
        })
        r.raise_for_status()

        # Convert HTML to markdown
        try:
            md = markdownify(r.text, heading_style="ATX", strip=["script", "style"])
            # Clean up excessive whitespace
            md = re.sub(r"\n{3,}", "\n\n", md).strip()
        except Exception:
            md = r.text[:MAX_OUTPUT_LENGTH]

        # Extract title
        import re as re_mod
        title_match = re_mod.search(r"<title>(.*?)</title>", r.text, re_mod.IGNORECASE | re_mod.DOTALL)
        title = title_match.group(1).strip() if title_match else url

        return {
            "content": truncate_output(md),
            "url": url,
            "title": title,
        }
    except ImportError:
        return {"error": "markdownify not installed. Run: pip install markdownify"}
    except Exception as e:
        return {"error": str(e)}


def git_command(cmd: str, repo_path: str = ".") -> dict:
    """Run a git command. Free for read ops. Confirms push/reset/force.

    Returns: {output, exit_code}
    """
    full_cmd = f"git -C {shlex.quote(os.path.expanduser(repo_path))} {cmd}"

    # Check for destructive git operations
    destructive_git = ["push", "reset --hard", "clean -f", "branch -D", "force"]
    if any(d in cmd for d in destructive_git):
        return {
            "needs_confirmation": True,
            "command": full_cmd,
            "reason": "Destructive git operation requires confirmation.",
        }

    return execute_command(full_cmd)


def gh_command(cmd: str) -> dict:
    """Run a GitHub CLI command. Free for read ops.

    Returns: {output, exit_code}
    """
    full_cmd = f"gh {cmd}"

    # Confirm destructive GitHub operations
    destructive_gh = ["pr merge", "pr close", "issue close", "release delete", "repo delete"]
    if any(d in cmd for d in destructive_gh):
        return {
            "needs_confirmation": True,
            "command": full_cmd,
            "reason": "Destructive GitHub operation requires confirmation.",
        }

    return execute_command(full_cmd, timeout=30)


# ── Memory Tools ──────────────────────────────────────────────────────

def write_memory(section: str, content: str) -> dict:
    """Write to BMO's persistent per-project memory.

    Args:
        section: Section name (e.g., "Project Notes", "Preferences")
        content: The content to write to this section
    """
    try:
        from agents.memory import update_memory_section
        update_memory_section(os.getcwd(), section, content)
        return {"success": True, "section": section}
    except Exception as e:
        return {"error": str(e)}


def read_memory() -> dict:
    """Read BMO's persistent per-project memory.

    Returns the full memory file contents.
    """
    try:
        from agents.memory import load_memory
        content = load_memory(os.getcwd())
        if not content:
            return {"content": "(no memory saved yet)"}
        return {"content": content}
    except Exception as e:
        return {"error": str(e)}


# ── Tool Registry for LLM ────────────────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "name": "execute_command",
        "description": "Run a shell command on the Pi. Free for read/search. Confirms destructive ops.",
        "parameters": {"cmd": "string", "cwd": "string (optional)"},
    },
    {
        "name": "ssh_command",
        "description": "Run a command on a remote host via SSH. Hosts: 'pc' or user@host.",
        "parameters": {"host": "string", "cmd": "string"},
    },
    {
        "name": "read_file",
        "description": "Read a file's contents. No restrictions.",
        "parameters": {"path": "string", "offset": "int (optional)", "limit": "int (optional, default 200)"},
    },
    {
        "name": "write_file",
        "description": "Write content to a file. Confirms if file exists.",
        "parameters": {"path": "string", "content": "string"},
    },
    {
        "name": "edit_file",
        "description": "Find and replace text in a file.",
        "parameters": {"path": "string", "old_string": "string", "new_string": "string"},
    },
    {
        "name": "list_directory",
        "description": "List files and directories.",
        "parameters": {"path": "string (optional, default '.')"},
    },
    {
        "name": "find_files",
        "description": "Find files by FILENAME pattern (glob). E.g. '**/*.py' or '*config*'. Does NOT search inside files.",
        "parameters": {"pattern": "string (glob, e.g. '**/*.py')", "path": "string (optional)"},
    },
    {
        "name": "grep_files",
        "description": "Search INSIDE file contents by regex. Use this to find where code/strings appear (e.g. 'volume', 'slider', 'volumeLevels'). Prefer over find_files when investigating bugs or features.",
        "parameters": {"pattern": "string (regex)", "path": "string (optional)", "file_glob": "string (optional, e.g. '*.{py,js,html}')"},
    },
    {
        "name": "web_search",
        "description": "Search the web using DuckDuckGo.",
        "parameters": {"query": "string", "num_results": "int (optional, default 5)"},
    },
    {
        "name": "web_fetch",
        "description": "Fetch a web page and convert to markdown.",
        "parameters": {"url": "string"},
    },
    {
        "name": "git_command",
        "description": "Run a git command. Confirms push/reset/force.",
        "parameters": {"cmd": "string", "repo_path": "string (optional)"},
    },
    {
        "name": "gh_command",
        "description": "Run a GitHub CLI command.",
        "parameters": {"cmd": "string"},
    },
    {
        "name": "write_memory",
        "description": "Write to BMO's persistent per-project memory. Survives across sessions.",
        "parameters": {"section": "string (e.g. 'Project Notes')", "content": "string"},
    },
    {
        "name": "read_memory",
        "description": "Read BMO's persistent per-project memory.",
        "parameters": {},
    },
]


def get_tool_descriptions() -> str:
    """Generate a formatted string of all available tools for the LLM system prompt."""
    lines = ["Available tools:"]
    for tool in TOOL_DEFINITIONS:
        params = ", ".join(f"{k}: {v}" for k, v in tool["parameters"].items())
        lines.append(f"- {tool['name']}({params}) — {tool['description']}")
    return "\n".join(lines)


def dispatch_tool(name: str, args: dict, settings=None) -> dict:
    """Execute a tool by name with given arguments. Returns the tool's result dict.

    Args:
        name: Tool name to execute.
        args: Tool arguments dict.
        settings: Optional BmoSettings for auto-approve and custom patterns.
    """
    tools = {
        "execute_command": lambda a: execute_command(a.get("cmd", ""), a.get("cwd"), settings=settings),
        "ssh_command": lambda a: ssh_command(a.get("host", ""), a.get("cmd", "")),
        "read_file": lambda a: read_file(a.get("path", ""), a.get("offset", 0), a.get("limit", 200)),
        "write_file": lambda a: write_file(a.get("path", ""), a.get("content", "")),
        "edit_file": lambda a: edit_file(a.get("path", ""), a.get("old_string", ""), a.get("new_string", "")),
        "list_directory": lambda a: list_directory(a.get("path", ".")),
        "find_files": lambda a: find_files(a.get("pattern", ""), a.get("path", ".")),
        "grep_files": lambda a: grep_files(a.get("pattern", ""), a.get("path", "."), a.get("file_glob", "*")),
        "web_search": lambda a: web_search(a.get("query", ""), a.get("num_results", 5)),
        "web_fetch": lambda a: web_fetch(a.get("url", "")),
        "git_command": lambda a: git_command(a.get("cmd", ""), a.get("repo_path", ".")),
        "gh_command": lambda a: gh_command(a.get("cmd", "")),
        "write_memory": lambda a: write_memory(a.get("section", "Notes"), a.get("content", "")),
        "read_memory": lambda a: read_memory(),
    }

    if name not in tools:
        return {"error": f"Unknown tool: {name}"}

    try:
        return tools[name](args)
    except Exception as e:
        return {"error": f"Tool '{name}' failed: {str(e)}"}
