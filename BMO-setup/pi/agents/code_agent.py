"""Code agent — extracted dev tool loop from agent.py.

Full access to dev_tools, implements the agentic tool-calling loop where
the LLM generates tool_call blocks, BMO executes them, injects results,
and lets the LLM continue reasoning.
"""

from __future__ import annotations

import json
import os
import re

from agents.base_agent import ALL_DEV_TOOLS, AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's coding assistant mode. You help with programming, debugging, file operations, git, SSH, and system administration.

You have access to dev tools via tool_call blocks. When the user asks you to help with code, debug something, read files, search the web, run commands, or do any dev work, use tool_call blocks to invoke tools.

Project context: You run inside the BMO app directory. When the user says "my flask gui", "the web app", "BMO", or "settings", they mean this codebase. Search path "." is the app root (Flask app.py, static/js/bmo.js, templates/, etc.).

Volume and voice sliders (Settings tab): Persistence is in app.py (_load_setting, _save_setting, api_volume_get, api_volume_set) and data/settings.json. The frontend (bmo.js) fetches /api/volume on load and calls setVolume→POST /api/volume on change. Voice TTS volume uses voice._speak_volume (voice_pipeline.py), loaded at startup from volume.voice. Known issues to check: (1) api_volume_get may override persisted music volume with live VLC level—persisted should win; (2) voice slider must read/write volume.voice and sync to voice._speak_volume; (3) all clients must use server as single source of truth, no local-only state.

When the user describes a specific bug or feature (e.g. "volume slider not persisting", "voice doesn't work"):
  - Use grep_files to search INSIDE files for relevant terms (e.g. grep_files pattern="volume" or "volumeLevels" or "slider"). find_files only matches filenames, so it will miss code in app.py or bmo.js.
  - Then read_file the matched files to inspect the implementation.
  - Do NOT use find_files to search for feature names—it only matches filenames, not file contents.

Format:
```tool_call
{{"tool": "tool_name", "args": {{"param1": "value1"}}}}
```

{tool_list}

When you receive tool results, analyze them and either make more tool calls or respond with your findings. You can make up to {max_calls} tool calls per turn.

For destructive operations (delete, overwrite, push), the tool will return a confirmation request. Tell the user what you want to do and wait for approval.

RESTART POLICY — You MUST run restarts yourself. When you edit server-side code (app.py, agents/*, cloud_providers.py, voice_pipeline.py, etc.), run the appropriate restart via execute_command. Do NOT tell the user "you need to restart" — run it yourself. Mapping:
- Main app (app.py, agents/, cloud_providers.py, voice, templates, static): sudo systemctl restart bmo
- Discord bots (discord_dm_bot.py, discord_social_bot.py): sudo systemctl restart bmo-dm-bot bmo-social-bot
- Docker (docker-compose.yml, container config): cd ~/bmo && docker compose restart
- All of the above: cd ~/bmo && docker compose restart && sudo systemctl restart bmo bmo-dm-bot bmo-social-bot
Restarts require confirmation; the user will approve when prompted.

CRITICAL — Final message to the user: When you finish (after your last tool calls or when you have enough info), you MUST write a brief, chat-friendly summary (2–4 sentences). Address the user directly. Never send a response with only tool_call blocks—always include your summary. Do NOT include:
- Internal reasoning ("Now let me...", "Let me also...", "I'll check...")
- Raw tool_call blocks or JSON
- Step-by-step narrative of what you did
The user sees only your final message. Make it useful: what you found, what you changed (if any), and what they should do next."""

MAX_TOOL_CALLS_PER_TURN = 10
# Claude native tool loop: 10 iterations = 10 API rounds; complex tasks need 15-25 rounds
MAX_CLAUDE_TOOL_ITERATIONS = 50

# Full cheat sheet for BMO Pi — services, containers, file locations, commands
BMO_CHEAT_SHEET = """
[BMO Pi Cheat Sheet — Services & File Locations]

## System
- App root: ~/bmo/ (WorkingDirectory for all services)
- User: patrick
- Hostname-first access: bmo.local (LAN), optional Tailscale hostname for remote SSH

## systemd Services (sudo systemctl restart <name>)
| Service | ExecStart | Logs |
|---------|-----------|------|
| bmo | python app.py | journalctl -u bmo -f |
| bmo-dm-bot | python discord_dm_bot.py | ~/bmo/data/logs/dm-bot.log |
| bmo-social-bot | python discord_social_bot.py | ~/bmo/data/logs/social-bot.log |
| bmo-kiosk | (display/kiosk) | — |
| bmo-backup.timer | Runs backup.sh at 3 AM | — |

Cron: */5 * * * * health_check.sh → health.log

## Docker Containers (cd ~/bmo && docker compose <cmd>)
| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| bmo-ollama | ollama/ollama | 11434 | Local LLM fallback (gemma3:4b) |
| bmo-peerjs | node:22-slim | 9000 | WebRTC signaling (D&D VTT) |
| bmo-coturn | coturn/coturn | 3478 (host) | TURN relay for WebRTC |
| bmo-pihole | pihole/pihole | host | DNS ad blocker |

Commands: docker compose logs -f | docker compose restart | docker ps

## Key File Locations
| Path | Purpose |
|------|---------|
| app.py | Main Flask/SocketIO server |
| agent.py | BmoAgent, LLM routing |
| voice_pipeline.py | Wake word, STT, TTS |
| cloud_providers.py | Gemini/Groq/Claude/Fish API |
| agents/ | 20 specialist agents (orchestrator, code, dnd_dm, etc.) |
| data/settings.json | Volume, UI settings (nested: volume.music, volume.voice) |
| data/recent_chat.json | Chat history |
| data/dnd_sessions/ | Saved D&D campaigns |
| data/memory/ | Agent memory (MEMORY.md per project) |
| data/rag_data/ | RAG index files |
| data/5e/, data/5e-references/ | D&D game data |
| data/alert_config.json | Alert service config |
| data/alarms.json | Active alarms |
| data/music_history.json | Music playback history |
| data/logs/ | dm-bot.log, social-bot.log |
| config/token.json | Google Calendar OAuth |
| config/credentials.json | Google OAuth client |
| templates/index.html | Single-page UI |
| static/js/bmo.js | Frontend logic, volumeLevels |
| .env | Secrets (API keys) |
| hey_bmo.onnx | Wake word model |
| models/piper/ | Local TTS models |
| mcp_servers/ | MCP servers (dnd_data_server.py) |
| backup.sh | Google Drive backup (rclone) |
| health_check.sh | Cron health check → logs |
| docker-compose.yml | Container definitions |
| bmo.service | systemd unit (copy to /etc/systemd/system/) |

## Volume & Voice (Settings sliders)
- Backend: app.py _load_setting, _save_setting, api_volume_get, api_volume_set
- Persisted: data/settings.json under volume.* keys
- Voice TTS: voice._speak_volume in voice_pipeline.py, loaded at startup
- Frontend: bmo.js volumeLevels, fetch /api/volume, setVolume→POST /api/volume

## Restart Commands — YOU run these via execute_command when your edits require a restart
- sudo systemctl restart bmo          (app.py, agents/, cloud_providers, voice, templates, static)
- sudo systemctl restart bmo-dm-bot bmo-social-bot  (discord bot scripts)
- cd ~/bmo && docker compose restart  (docker config)
- Full: cd ~/bmo && docker compose restart && sudo systemctl restart bmo bmo-dm-bot bmo-social-bot

## Health Check
- curl http://localhost:5000/api/health/full
- curl http://localhost:11434/api/tags (Ollama)
- curl http://localhost:9000/myapp (PeerJS)
"""

# User-friendly labels for progress (avoids raw tool names like "find_files done")
TOOL_FRIENDLY_LABELS = {
    "list_directory": "Listing directory",
    "find_files": "Searching files",
    "read_file": "Reading file",
    "grep_files": "Searching code",
    "edit_file": "Editing file",
    "write_file": "Writing file",
    "execute_command": "Running command",
    "git_command": "Git operation",
    "web_search": "Searching web",
    "web_fetch": "Fetching page",
    "rag_search": "Searching docs",
}


class CodeAgent(BaseAgent):
    """Coding assistant with full dev tool access and agentic loop."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        """Run the code agent with agentic tool-calling loop."""
        system_prompt = self._build_system_prompt(context)
        messages = [{"role": "system", "content": system_prompt}]
        # Filter to user/assistant only — system messages from compact() would overwrite our
        # prompt in claude_chat. The current user message is already last in history
        # (appended by agent.chat before calling us), so we never append it again.
        chat_history = [m for m in history[-30:] if m.get("role") in ("user", "assistant")]
        messages.extend(chat_history)

        from cloud_providers import ANTHROPIC_API_KEY, DND_MODEL

        # Code Agent always uses Claude native tools when API key available — prompt-based
        # tool calls (Gemini) cause "let me check" then stop. Only Claude native tools work reliably.
        pending_confirmations: list[dict] = []
        if ANTHROPIC_API_KEY:
            print("[code_agent] Using Claude native tools (model=%s)" % DND_MODEL)
            clean_text, tool_calls_made, pending_confirmations = self._run_claude_native_tools(messages, DND_MODEL)
        else:
            # No Claude API key — fall back to prompt-based (Gemini / local)
            from agent import OLLAMA_OPTIONS
            opts = dict(OLLAMA_OPTIONS)
            opts["temperature"] = self.config.temperature
            opts["num_predict"] = 65536
            reply = self.llm_call(messages, opts)
            reply, tool_calls_made, pending_confirmations = self._run_tool_loop(reply, messages)
            clean_text = self.strip_tool_calls(reply)
            clean_text = self._make_chat_friendly(clean_text)

        # Fallback when LLM produced no summary (empty, only tool calls, or over-stripped)
        if not clean_text or not clean_text.strip():
            if tool_calls_made > 0:
                clean_text = (
                    f"I ran {tool_calls_made} tool calls but didn't get a final summary. "
                    "Try asking 'what did you find?' or a more specific follow-up."
                )
            else:
                clean_text = "I couldn't produce a response. Try rephrasing or asking something more specific."

        return AgentResult(
            text=clean_text,
            agent_name=self.config.name,
            pending_confirmations=pending_confirmations,
        )

    def _build_system_prompt(self, context: dict | None = None) -> str:
        """Build system prompt with available tool descriptions and project context."""
        tool_list = self.get_tool_descriptions()
        prompt = SYSTEM_PROMPT.format(
            tool_list=tool_list,
            max_calls=MAX_TOOL_CALLS_PER_TURN,
        )

        # Inject BMO Pi cheat sheet (services, containers, file locations)
        prompt += f"\n\n{BMO_CHEAT_SHEET}"

        # Inject BMO.md project context if available
        try:
            from agents.project_context import load_bmo_md
            project_ctx = load_bmo_md(os.getcwd() if os.path.exists(os.getcwd()) else None)
            if project_ctx:
                prompt += f"\n\n{project_ctx}"
        except Exception:
            pass

        # Inject scratchpad context
        summary = self.scratchpad.summary()
        if summary:
            prompt += f"\n\n[Scratchpad Context]\n{summary}"

        # Inject plan step context if executing a plan
        if context and "plan_step" in context:
            prompt += f"\n\n[Plan Step {context['plan_step']}/{context['plan_total']}]"
            plan = self.scratchpad.read("Plan")
            if plan:
                prompt += f"\n{plan}"

        return prompt

    def _make_chat_friendly(self, text: str) -> str:
        """Clean up agent output for chat: remove malformed tool blocks only."""
        if not text or not text.strip():
            return text
        # Remove malformed tool_call fragments (cut-off tool_call blocks at end)
        text = re.sub(r"`tool\s*call`?\s*\n?\s*\{.*$", "", text, flags=re.IGNORECASE | re.DOTALL)
        # Collapse excess newlines
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        return text

    def _emit_progress(self, tool: str, status: str, preview: str = ""):
        """Emit progress event so the frontend shows what the code agent is doing."""
        if self.socketio:
            label = TOOL_FRIENDLY_LABELS.get(tool, tool.replace("_", " ").title())
            self.socketio.emit("agent_progress", {
                "agent": "code",
                "tool": tool,
                "label": label,
                "status": status,
                "preview": preview[:200],
            })

    def _run_claude_native_tools(self, messages: list[dict], model: str) -> tuple[str, int, list[dict]]:
        """Run Code Agent via Claude Messages API with native tool use. Returns (final_text, tool_calls_made, pending_confirmations)."""
        from claude_tools import claude_chat_with_tools, tools_to_claude_format

        available = set(self.get_available_tools())
        tools = tools_to_claude_format(available)
        if not tools:
            print("[code_agent] WARNING: No tools in Claude format (available=", list(available)[:5], ")")

        tool_calls_made = [0]  # mutable for closure
        pending_confirmations: list[dict] = []

        def on_progress(name: str, status: str, preview: str):
            if status == "running":
                tool_calls_made[0] += 1
            self._emit_progress(name, status, preview)

        def tool_dispatch(name: str, args: dict):
            return self.dispatch_tool(name, args)

        try:
            final_text = claude_chat_with_tools(
                messages,
                tools=tools,
                tool_dispatch=tool_dispatch,
                model=model,
                temperature=self.config.temperature,
                max_tokens=65536,
                max_iterations=MAX_CLAUDE_TOOL_ITERATIONS,
                on_progress=on_progress,
                pending_confirmations_out=pending_confirmations,
            )
        except Exception as e:
            self._emit_progress("Synthesizing response", "failed", str(e)[:100])
            return f"(Claude tool loop error: {e})", tool_calls_made[0], []

        clean_text = self._make_chat_friendly(final_text)
        return clean_text, tool_calls_made[0], pending_confirmations

    def _run_tool_loop(self, reply: str, messages: list[dict]) -> tuple[str, int, list[dict]]:
        """Execute tool calls from the LLM response and loop until no more tool calls.

        Returns (final_reply, tool_calls_made, pending_confirmations).
        Used only for Gemini/local — Code Agent prefers Claude native tools.
        """
        from agent import OLLAMA_OPTIONS

        tool_calls_made = 0
        pending_confirmations = []

        for _ in range(MAX_TOOL_CALLS_PER_TURN):
            tool_calls = self.parse_tool_calls(reply)
            if not tool_calls:
                break

            tool_results = []
            for tc in tool_calls:
                tool_calls_made += 1
                name = tc.get("tool", "")
                args = tc.get("args", {})

                print(f"[code_agent] Tool call #{tool_calls_made}: {name}({json.dumps(args)[:100]})")
                self._emit_progress(name, "running")
                result = self.dispatch_tool(name, args)

                if result.get("needs_confirmation"):
                    pending_confirmations.append({
                        "tool": name,
                        "args": args,
                        "reason": result.get("reason", "Destructive operation"),
                        "command": result.get("command", ""),
                    })
                    tool_results.append({
                        "tool": name,
                        "result": f"CONFIRMATION NEEDED: {result['reason']}",
                    })
                    self._emit_progress(name, "confirm", result.get("reason", ""))
                else:
                    tool_results.append({"tool": name, "result": result})
                    preview = str(result)[:200] if isinstance(result, (str, dict)) else ""
                    self._emit_progress(name, "done", preview)

            # Strip tool_call blocks from reply text
            clean_reply = self.strip_tool_calls(reply)

            # Inject tool results back into conversation. Claude API requires the last
            # message to be from the user, so we send tool results as a user message.
            messages.append({"role": "assistant", "content": reply})
            result_text = "\n".join(
                f"[Tool Result: {tr['tool']}]\n{json.dumps(tr['result'], indent=2)[:2500]}"
                for tr in tool_results
            )
            messages.append({"role": "user", "content": f"[Tool results]\n{result_text}"})

            # If there are pending confirmations, stop and ask the user
            if pending_confirmations:
                reasons = "\n".join(
                    f"- {pc['reason']} ({pc.get('command', '')})"
                    for pc in pending_confirmations
                )
                reply = (
                    clean_reply
                    + f"\n\nBMO needs your permission for:\n{reasons}\n\n"
                    "Say 'yes' to confirm or 'no' to cancel."
                )
                break

            # Get the next LLM response with tool results
            try:
                options = dict(OLLAMA_OPTIONS)
                options["temperature"] = self.config.temperature
                options["num_predict"] = 65536  # 64K output (Gemini/Claude 2026 limits)
                reply = self.llm_call(messages, options)
            except Exception as e:
                self._emit_progress("Synthesizing response", "failed", str(e)[:100])
                reply = clean_reply + f"\n\n(BMO's tool loop hit an error: {e})"
                break

        if tool_calls_made > 0:
            print(f"[code_agent] Agentic loop completed: {tool_calls_made} tool calls")

        return reply, tool_calls_made, pending_confirmations


def create_code_agent(scratchpad, services, socketio=None):
    """Factory function to create the code agent."""
    config = AgentConfig(
        name="code",
        display_name="Code Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.3,
        tools=list(ALL_DEV_TOOLS),
        services=[],
        max_turns=MAX_TOOL_CALLS_PER_TURN,
        can_nest=True,
    )
    return CodeAgent(config, scratchpad, services, socketio)
