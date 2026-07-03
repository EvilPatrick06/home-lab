"""Agent tool implementations for BMO (production, not dev-only).

These modules are PRODUCTION runtime dependencies of the agents + IDE,
relocated out of the misleadingly-named `dev/` folder so the directory name
does not invite a "dev/ is non-prod, safe to skip/delete" mistake:

- dev_tools    — TOOL_DEFINITIONS + the file/shell/git tool dispatch surface
                 the agents and IDE call (dispatch_tool, git_command_args, etc.).
- claude_tools — Claude tool-use bridge (claude_chat_with_tools, auto-approve),
                 imports dev_tools.
"""
