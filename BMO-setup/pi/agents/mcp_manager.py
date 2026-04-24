"""MCP Manager — Multi-server management, tool namespacing, and routing.

Manages multiple MCP server connections. All MCP tools are namespaced as
mcp__<servername>__<toolname> to avoid collisions with BMO's built-in tools.

Supports per-agent tool assignment via glob patterns in settings:
    "mcp": {
        "agent_tools": {
            "code": ["mcp__github__*"],
            "smart_home": ["mcp__hass__*"]
        }
    }
"""

from __future__ import annotations

import fnmatch
import threading
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from agents.mcp_client import McpClient

if TYPE_CHECKING:
    from agents.settings import BmoSettings


@dataclass
class McpToolInfo:
    """Cached info about an MCP tool."""
    server_name: str
    tool_name: str
    namespaced_name: str
    description: str
    input_schema: dict


class McpManager:
    """Manages multiple MCP servers and provides unified tool access."""

    def __init__(self, settings: Any):
        self._settings = settings
        self._clients: dict[str, McpClient] = {}
        self._tools: dict[str, McpToolInfo] = {}  # namespaced_name → info
        self._lock = threading.Lock()

    def initialize(self) -> None:
        """Read mcp.servers from settings, create clients, connect non-lazy ones."""
        servers = self._settings.get("mcp.servers", {}) if self._settings else {}
        if not servers:
            return

        for name, config in servers.items():
            self.add_server(name, config, auto_connect=not config.get("lazy", False))

    def add_server(self, name: str, config: dict, auto_connect: bool = True) -> bool:
        """Add and optionally connect a new MCP server.

        Returns True if server was added (and connected if auto_connect).
        """
        with self._lock:
            # Disconnect existing server with same name
            if name in self._clients:
                self._clients[name].disconnect()
                self._remove_server_tools(name)

            client = McpClient(name, config)
            self._clients[name] = client

        if auto_connect:
            success = client.connect()
            if success:
                self._index_server_tools(name)
            return success

        return True

    def remove_server(self, name: str) -> None:
        """Disconnect and remove an MCP server."""
        with self._lock:
            client = self._clients.pop(name, None)
            if client:
                client.disconnect()
            self._remove_server_tools(name)

    def connect_server(self, name: str) -> bool:
        """Connect (or reconnect) a specific server."""
        client = self._clients.get(name)
        if not client:
            return False

        if client.is_connected():
            client.disconnect()
            self._remove_server_tools(name)

        success = client.connect()
        if success:
            self._index_server_tools(name)
        return success

    def disconnect_server(self, name: str) -> bool:
        """Disconnect a specific server."""
        client = self._clients.get(name)
        if not client:
            return False

        client.disconnect()
        self._remove_server_tools(name)
        return True

    # ── Tool Access ───────────────────────────────────────────────────

    def get_all_tools(self) -> list[dict]:
        """Return all MCP tool definitions in BMO tool format."""
        tools = []
        for info in self._tools.values():
            tools.append(self._tool_info_to_definition(info))
        return tools

    def get_tools_for_agent(self, agent_name: str) -> list[dict]:
        """Return MCP tool definitions matching this agent's allowed patterns.

        Uses mcp.agent_tools settings for per-agent assignment.
        If no agent_tools are configured, all MCP tools are available to all agents.
        """
        agent_tools_config = self._settings.get("mcp.agent_tools", {}) if self._settings else {}

        # If no agent_tools configured, return all MCP tools
        if not agent_tools_config:
            return self.get_all_tools()

        # Get patterns for this agent
        patterns = agent_tools_config.get(agent_name, [])
        if not patterns:
            return []

        # Filter tools by patterns
        tools = []
        for name, info in self._tools.items():
            if any(fnmatch.fnmatch(name, p) for p in patterns):
                tools.append(self._tool_info_to_definition(info))
        return tools

    def get_readonly_tools(self) -> list[str]:
        """Return namespaced names of MCP tools considered read-only.

        Uses mcp.readonly_tools glob patterns from settings.
        """
        readonly_patterns = self._settings.get("mcp.readonly_tools", []) if self._settings else []
        if not readonly_patterns:
            return []

        result = []
        for name in self._tools:
            if any(fnmatch.fnmatch(name, p) for p in readonly_patterns):
                result.append(name)
        return result

    def dispatch_tool(self, namespaced_name: str, args: dict) -> dict:
        """Route a tool call to the correct MCP server.

        Parses "mcp__github__create_issue" → server="github", tool="create_issue"
        """
        info = self._tools.get(namespaced_name)
        if not info:
            return {"error": f"Unknown MCP tool: {namespaced_name}"}

        client = self._clients.get(info.server_name)
        if not client:
            return {"error": f"MCP server '{info.server_name}' not found"}

        # Lazy connect if needed
        if not client.is_connected():
            if not client.connect():
                return {"error": f"Failed to connect to MCP server '{info.server_name}'"}
            self._index_server_tools(info.server_name)

        # Truncate output if needed
        result = client.call_tool(info.tool_name, args)
        max_output = 25000
        if self._settings:
            max_output = self._settings.get("mcp.output_max_tokens", 25000)

        output = result.get("output", "")
        if len(output) > max_output:
            result["output"] = output[:max_output] + f"\n... (truncated, {len(output)} total chars)"
            result["truncated"] = True

        return result

    # ── Status ────────────────────────────────────────────────────────

    def get_status(self) -> dict:
        """Return status of all MCP servers."""
        servers = {}
        for name, client in self._clients.items():
            servers[name] = client.get_status()

        return {
            "servers": servers,
            "total_tools": len(self._tools),
            "connected": sum(1 for c in self._clients.values() if c.is_connected()),
            "total": len(self._clients),
        }

    def get_tool_names(self) -> list[str]:
        """Return all namespaced tool names."""
        return list(self._tools.keys())

    def shutdown(self) -> None:
        """Disconnect all servers."""
        for name, client in list(self._clients.items()):
            try:
                client.disconnect()
            except Exception as e:
                print(f"[mcp] Error disconnecting {name}: {e}")
        self._clients.clear()
        self._tools.clear()

    # ── Internal ──────────────────────────────────────────────────────

    def _index_server_tools(self, server_name: str) -> None:
        """Cache tool definitions from a connected server."""
        client = self._clients.get(server_name)
        if not client or not client.is_connected():
            return

        with self._lock:
            # Remove old tools for this server
            self._remove_server_tools(server_name)

            # Add new tools
            for tool in client.list_tools():
                tool_name = tool.get("name", "")
                if not tool_name:
                    continue

                namespaced = f"mcp__{server_name}__{tool_name}"
                self._tools[namespaced] = McpToolInfo(
                    server_name=server_name,
                    tool_name=tool_name,
                    namespaced_name=namespaced,
                    description=tool.get("description", ""),
                    input_schema=tool.get("inputSchema", {}),
                )

    def _remove_server_tools(self, server_name: str) -> None:
        """Remove all cached tools for a server."""
        prefix = f"mcp__{server_name}__"
        to_remove = [k for k in self._tools if k.startswith(prefix)]
        for k in to_remove:
            del self._tools[k]

    def _tool_info_to_definition(self, info: McpToolInfo) -> dict:
        """Convert McpToolInfo to the BMO tool definition format."""
        # Extract parameter descriptions from JSON Schema
        params = {}
        schema = info.input_schema
        if schema and "properties" in schema:
            required = set(schema.get("required", []))
            for prop_name, prop_schema in schema["properties"].items():
                type_str = prop_schema.get("type", "string")
                desc = prop_schema.get("description", "")
                optional = "" if prop_name in required else " (optional)"
                params[prop_name] = f"{type_str}{optional}" + (f" — {desc}" if desc else "")

        return {
            "name": info.namespaced_name,
            "description": f"[MCP:{info.server_name}] {info.description}",
            "parameters": params,
            "mcp": True,  # Flag to identify MCP tools
        }
