"""MCP Client — Single-server Model Context Protocol client.

Supports three transports:
  - stdio: Spawn subprocess, communicate via JSON-RPC 2.0 over stdin/stdout
  - http:  Stateless HTTP POST for each JSON-RPC call
  - sse:   HTTP + Server-Sent Events for server notifications

Uses the standard JSON-RPC 2.0 protocol with Content-Length framing (LSP-style)
for stdio, and plain HTTP for http/sse transports.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from typing import Any


class McpClient:
    """Manages connection to a single MCP server."""

    def __init__(self, name: str, config: dict):
        self.name = name
        self.config = config
        self._transport = config.get("transport", "stdio")
        self._connected = False
        self._tools: list[dict] = []
        self._resources: list[dict] = []
        self._prompts: list[dict] = []
        self._process: subprocess.Popen | None = None
        self._http_client: Any = None
        self._sse_thread: threading.Thread | None = None
        self._sse_running = False
        self._lock = threading.Lock()
        self._request_id = 0
        self._server_capabilities: dict = {}
        self._message_endpoint: str | None = None  # For SSE transport

    # ── Connection ────────────────────────────────────────────────────

    def connect(self) -> bool:
        """Connect to the MCP server. Returns True on success."""
        with self._lock:
            if self._connected:
                return True

            try:
                if self._transport == "stdio":
                    return self._connect_stdio()
                elif self._transport == "http":
                    return self._connect_http()
                elif self._transport == "sse":
                    return self._connect_sse()
                else:
                    print(f"[mcp:{self.name}] Unknown transport: {self._transport}")
                    return False
            except Exception as e:
                print(f"[mcp:{self.name}] Connection failed: {e}")
                return False

    def disconnect(self) -> None:
        """Disconnect from the MCP server."""
        with self._lock:
            self._connected = False
            self._tools = []
            self._resources = []
            self._prompts = []

            if self._process:
                try:
                    self._process.stdin.close()
                    self._process.terminate()
                    self._process.wait(timeout=5)
                except Exception:
                    try:
                        self._process.kill()
                    except Exception:
                        pass
                self._process = None

            if self._sse_running:
                self._sse_running = False
                if self._sse_thread:
                    self._sse_thread.join(timeout=5)
                    self._sse_thread = None

            self._http_client = None

    def is_connected(self) -> bool:
        """Check if currently connected."""
        return self._connected

    # ── Tool Operations ───────────────────────────────────────────────

    def list_tools(self) -> list[dict]:
        """Return cached tool definitions."""
        return list(self._tools)

    def call_tool(self, tool_name: str, args: dict) -> dict:
        """Call a tool on the MCP server."""
        if not self._connected:
            return {"error": f"MCP server '{self.name}' not connected"}

        result = self._send_request("tools/call", {
            "name": tool_name,
            "arguments": args,
        })

        if "error" in result:
            return result

        # Extract content from MCP tool result format
        content = result.get("result", {}).get("content", [])
        if content:
            # Combine text content blocks
            texts = [c.get("text", "") for c in content if c.get("type") == "text"]
            return {"output": "\n".join(texts) if texts else json.dumps(content)}

        return {"output": json.dumps(result.get("result", {}))}

    # ── Resource Operations ───────────────────────────────────────────

    def list_resources(self) -> list[dict]:
        """Return cached resource list."""
        return list(self._resources)

    def read_resource(self, uri: str) -> dict:
        """Read a resource from the MCP server."""
        if not self._connected:
            return {"error": f"MCP server '{self.name}' not connected"}

        result = self._send_request("resources/read", {"uri": uri})
        if "error" in result:
            return result

        contents = result.get("result", {}).get("contents", [])
        if contents:
            texts = [c.get("text", "") for c in contents]
            return {"content": "\n".join(texts)}

        return {"content": json.dumps(result.get("result", {}))}

    # ── Prompt Operations ─────────────────────────────────────────────

    def list_prompts(self) -> list[dict]:
        """Return cached prompt list."""
        return list(self._prompts)

    def get_prompt(self, name: str, args: dict) -> dict:
        """Get a prompt from the MCP server."""
        if not self._connected:
            return {"error": f"MCP server '{self.name}' not connected"}

        result = self._send_request("prompts/get", {
            "name": name,
            "arguments": args,
        })
        if "error" in result:
            return result

        return result.get("result", {})

    # ── Status ────────────────────────────────────────────────────────

    def get_status(self) -> dict:
        """Return connection status and tool count."""
        return {
            "name": self.name,
            "transport": self._transport,
            "connected": self._connected,
            "tools": len(self._tools),
            "resources": len(self._resources),
            "prompts": len(self._prompts),
            "capabilities": self._server_capabilities,
        }

    # ── Transport: stdio ──────────────────────────────────────────────

    def _connect_stdio(self) -> bool:
        """Connect via stdio subprocess."""
        command = self.config.get("command", "")
        args = self.config.get("args", [])
        env_overrides = self.config.get("env", {})

        if not command:
            print(f"[mcp:{self.name}] No command specified for stdio transport")
            return False

        # Build environment
        env = dict(os.environ)
        env.update(env_overrides)

        # Build full command
        cmd = [command] + args

        try:
            self._process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                bufsize=0,
            )
        except FileNotFoundError:
            print(f"[mcp:{self.name}] Command not found: {command}")
            return False

        # Send initialize request
        init_result = self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "BMO", "version": "1.0"},
        })

        if "error" in init_result:
            print(f"[mcp:{self.name}] Initialize failed: {init_result['error']}")
            self._process.terminate()
            self._process = None
            return False

        self._server_capabilities = init_result.get("result", {}).get("capabilities", {})

        # Send initialized notification
        self._send_notification("notifications/initialized", {})

        # Discover tools, resources, prompts
        self._refresh_tools()
        self._refresh_resources()
        self._refresh_prompts()

        self._connected = True
        print(f"[mcp:{self.name}] Connected (stdio) — {len(self._tools)} tools")
        return True

    # ── Transport: HTTP ───────────────────────────────────────────────

    def _connect_http(self) -> bool:
        """Connect via HTTP (stateless)."""
        try:
            import httpx
        except ImportError:
            print(f"[mcp:{self.name}] httpx not installed — cannot use HTTP transport")
            return False

        url = self.config.get("url", "")
        headers = dict(self.config.get("headers", {}))

        if not url:
            print(f"[mcp:{self.name}] No URL specified for HTTP transport")
            return False

        self._http_client = httpx.Client(
            base_url=url,
            headers=headers,
            timeout=30.0,
        )

        # Initialize
        init_result = self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "BMO", "version": "1.0"},
        })

        if "error" in init_result:
            print(f"[mcp:{self.name}] Initialize failed: {init_result['error']}")
            self._http_client = None
            return False

        self._server_capabilities = init_result.get("result", {}).get("capabilities", {})
        self._send_notification("notifications/initialized", {})

        self._refresh_tools()
        self._refresh_resources()
        self._refresh_prompts()

        self._connected = True
        print(f"[mcp:{self.name}] Connected (HTTP) — {len(self._tools)} tools")
        return True

    # ── Transport: SSE ────────────────────────────────────────────────

    def _connect_sse(self) -> bool:
        """Connect via SSE (Server-Sent Events)."""
        try:
            import httpx
        except ImportError:
            print(f"[mcp:{self.name}] httpx not installed — cannot use SSE transport")
            return False

        url = self.config.get("url", "")
        headers = dict(self.config.get("headers", {}))

        if not url:
            print(f"[mcp:{self.name}] No URL specified for SSE transport")
            return False

        # The SSE endpoint returns the message endpoint URL in the first event
        self._http_client = httpx.Client(headers=headers, timeout=30.0)

        # Start SSE listener to get the message endpoint
        try:
            self._start_sse_listener(url, headers)
        except Exception as e:
            print(f"[mcp:{self.name}] SSE connection failed: {e}")
            self._http_client = None
            return False

        # Wait for message endpoint (up to 5 seconds)
        for _ in range(50):
            if self._message_endpoint:
                break
            time.sleep(0.1)

        if not self._message_endpoint:
            print(f"[mcp:{self.name}] No message endpoint received from SSE")
            self._sse_running = False
            self._http_client = None
            return False

        # Initialize
        init_result = self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "BMO", "version": "1.0"},
        })

        if "error" in init_result:
            print(f"[mcp:{self.name}] Initialize failed: {init_result['error']}")
            self._sse_running = False
            self._http_client = None
            return False

        self._server_capabilities = init_result.get("result", {}).get("capabilities", {})
        self._send_notification("notifications/initialized", {})

        self._refresh_tools()
        self._refresh_resources()
        self._refresh_prompts()

        self._connected = True
        print(f"[mcp:{self.name}] Connected (SSE) — {len(self._tools)} tools")
        return True

    def _start_sse_listener(self, url: str, headers: dict) -> None:
        """Start background thread to listen for SSE events."""
        self._sse_running = True

        def _listen():
            try:
                import httpx
                with httpx.stream("GET", url, headers={**headers, "Accept": "text/event-stream"}, timeout=None) as response:
                    buffer = ""
                    for chunk in response.iter_text():
                        if not self._sse_running:
                            break
                        buffer += chunk
                        while "\n\n" in buffer:
                            event_text, buffer = buffer.split("\n\n", 1)
                            self._handle_sse_event(event_text)
            except Exception as e:
                if self._sse_running:
                    print(f"[mcp:{self.name}] SSE listener error: {e}")
                    self._connected = False

        self._sse_thread = threading.Thread(target=_listen, daemon=True)
        self._sse_thread.start()

    def _handle_sse_event(self, event_text: str) -> None:
        """Parse and handle a single SSE event."""
        event_type = ""
        data_lines = []
        for line in event_text.split("\n"):
            if line.startswith("event:"):
                event_type = line[6:].strip()
            elif line.startswith("data:"):
                data_lines.append(line[5:].strip())

        data = "\n".join(data_lines)

        if event_type == "endpoint":
            # Server tells us where to send messages
            self._message_endpoint = data.strip()
        elif event_type == "message" and data:
            try:
                msg = json.loads(data)
                # Handle notifications
                method = msg.get("method", "")
                if method == "notifications/tools/list_changed":
                    self._refresh_tools()
                elif method == "notifications/resources/list_changed":
                    self._refresh_resources()
            except json.JSONDecodeError:
                pass

    # ── JSON-RPC Communication ────────────────────────────────────────

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _send_request(self, method: str, params: dict) -> dict:
        """Send a JSON-RPC 2.0 request and return the response."""
        msg = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method,
            "params": params,
        }

        if self._transport == "stdio":
            return self._stdio_send_receive(msg)
        elif self._transport == "http":
            return self._http_send(msg)
        elif self._transport == "sse":
            return self._http_send(msg)  # SSE uses HTTP POST for outbound
        else:
            return {"error": f"Unknown transport: {self._transport}"}

    def _send_notification(self, method: str, params: dict) -> None:
        """Send a JSON-RPC 2.0 notification (no response expected)."""
        msg = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }

        if self._transport == "stdio":
            self._stdio_send(msg)
        elif self._transport in ("http", "sse"):
            try:
                self._http_send(msg)
            except Exception:
                pass  # Notifications are fire-and-forget

    def _stdio_send(self, msg: dict) -> None:
        """Send a message via stdio (Content-Length framing)."""
        if not self._process or not self._process.stdin:
            return

        body = json.dumps(msg)
        header = f"Content-Length: {len(body)}\r\n\r\n"
        try:
            self._process.stdin.write(header.encode())
            self._process.stdin.write(body.encode())
            self._process.stdin.flush()
        except (BrokenPipeError, OSError):
            self._connected = False

    def _stdio_send_receive(self, msg: dict, timeout: float = 30) -> dict:
        """Send a message and read the response via stdio with timeout."""
        if not self._process or not self._process.stdin or not self._process.stdout:
            return {"error": "Process not running"}

        self._stdio_send(msg)

        # Read response with timeout to prevent indefinite blocking
        import concurrent.futures
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(self._stdio_read_message)
                return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            return {"error": f"Timeout ({timeout}s) reading response from MCP server"}
        except Exception as e:
            return {"error": f"Failed to read response: {e}"}

    def _stdio_read_message(self) -> dict:
        """Read a single JSON-RPC message from stdout using Content-Length framing."""
        stdout = self._process.stdout

        # Read headers until empty line
        content_length = -1
        while True:
            line = stdout.readline()
            if not line:
                return {"error": "EOF reading from MCP server"}

            line_str = line.decode("utf-8", errors="replace").strip()
            if not line_str:
                break  # Empty line = end of headers

            if line_str.lower().startswith("content-length:"):
                try:
                    content_length = int(line_str.split(":", 1)[1].strip())
                except ValueError:
                    pass

        if content_length < 0:
            # Try newline-delimited JSON fallback
            line = stdout.readline()
            if line:
                try:
                    return json.loads(line.decode("utf-8", errors="replace"))
                except json.JSONDecodeError:
                    return {"error": "Invalid JSON from MCP server"}
            return {"error": "No content-length header and no JSON line"}

        # Read exactly content_length bytes
        body = stdout.read(content_length)
        if len(body) < content_length:
            return {"error": "Incomplete message from MCP server"}

        try:
            return json.loads(body.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            return {"error": "Invalid JSON in MCP response"}

    def _http_send(self, msg: dict) -> dict:
        """Send a JSON-RPC message via HTTP POST."""
        if not self._http_client:
            return {"error": "HTTP client not initialized"}

        try:
            if self._transport == "sse" and self._message_endpoint:
                url = self._message_endpoint
                response = self._http_client.post(url, json=msg)
            else:
                response = self._http_client.post("/", json=msg)

            response.raise_for_status()

            if response.status_code == 204 or not response.text.strip():
                return {}  # Notification accepted

            return response.json()
        except Exception as e:
            return {"error": f"HTTP request failed: {e}"}

    # ── Discovery / Refresh ───────────────────────────────────────────

    def _refresh_tools(self) -> None:
        """Refresh the cached tool list from the server."""
        caps = self._server_capabilities
        if caps and not caps.get("tools"):
            return  # Server doesn't support tools

        result = self._send_request("tools/list", {})
        if "error" not in result:
            self._tools = result.get("result", {}).get("tools", [])

    def _refresh_resources(self) -> None:
        """Refresh the cached resource list from the server."""
        caps = self._server_capabilities
        if caps and not caps.get("resources"):
            return

        result = self._send_request("resources/list", {})
        if "error" not in result:
            self._resources = result.get("result", {}).get("resources", [])

    def _refresh_prompts(self) -> None:
        """Refresh the cached prompt list from the server."""
        caps = self._server_capabilities
        if caps and not caps.get("prompts"):
            return

        result = self._send_request("prompts/list", {})
        if "error" not in result:
            self._prompts = result.get("result", {}).get("prompts", [])
