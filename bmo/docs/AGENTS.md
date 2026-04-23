# BMO Agents

41 specialized AI agents, each owning one capability. The orchestrator picks which one(s) to invoke based on user intent.

## Agent list

### Core infrastructure (12)

| Agent | File | Role |
|---|---|---|
| **BaseAgent** | `base_agent.py` | Abstract base class. All agents inherit. |
| **Orchestrator** | `orchestrator.py` | Top-level director. Decomposes request, picks agents, merges responses. |
| **Router** | `router.py` | 3-tier intent classifier: explicit prefix (`!dm`, `!music`) → keyword match → LLM fallback. |
| **Conversation** | `conversation.py` | Conversation state, auto-compaction, turn history. |
| **Memory** | `memory.py` | Per-project memory files at `data/memory/<hash>/MEMORY.md`. |
| **Scratchpad** | `scratchpad.py` | Short-term agent scratch (ephemeral reasoning). |
| **Settings** | `settings.py` | User + project settings resolution (3-tier hierarchy). |
| **Hooks** | `hooks.py` | Pre/post agent-invocation hooks. |
| **Custom Commands** | `custom_commands.py` | User-defined slash commands (`.bmo/commands/*.md`). |
| **Project Context** | `project_context.py` | Loads user BMO.md config for personalization. |
| **MCP Client** | `mcp_client.py` | Connects to MCP servers for external tool use. |
| **MCP Manager** | `mcp_manager.py` | Manages MCP server lifecycle + discovery. |

### D&D + gaming (5)

| Agent | File | Role |
|---|---|---|
| **D&D DM** | `dnd_dm.py` | Dungeon Master brain. Narrates, adjudicates, voices NPCs. Uses Claude Opus. |
| **Encounter** | `encounter_agent.py` | Builds combat encounters tuned to party level/composition. |
| **Treasure** | `treasure_agent.py` | Generates loot tables + magic items by CR/party. |
| **Lore** | `lore_agent.py` | Worldbuilding: factions, history, NPCs, places. |
| **Rules** | `rules_agent.py` | Quick lookup + adjudication of 5e 2024 rules. |
| **NPC Dialogue** | `npc_dialogue_agent.py` | In-character NPC voice acting + branching dialogue. |
| **Session Recap** | `session_recap_agent.py` | End-of-session summary, "previously on..." intros. |
| **VTT Sync** | `vtt_sync.py` | **Special:** bridge between BMO and dnd-app (HTTP callbacks). |

### Everyday (8)

| Agent | File | Role |
|---|---|---|
| **Calendar** | `calendar_agent.py` | Google Calendar read/write. |
| **Weather** | `weather_agent.py` | Current + forecast weather. |
| **Music** | `music_agent.py` | YouTube Music search/play/queue. |
| **Timer** | `timer_agent.py` | Named countdown timers + alarms. |
| **Alert** | `alert_agent.py` | System alerts, notification management. |
| **Routine** | `routine_agent.py` | Scheduled recurring tasks (morning briefing, etc.). |
| **List** | `list_agent.py` | Shopping lists, todos. |
| **Smart Home** | `smart_home_agent.py` | Chromecast, TV, Hue lights via HA. |

### Dev / ops (10)

| Agent | File | Role |
|---|---|---|
| **Code** | `code_agent.py` | Self-modification. Edits BMO code, restarts services. |
| **Deploy** | `deploy_agent.py` | Git pull on Pi + systemctl restart via SSH. |
| **Docs** | `docs_agent.py` | Reads/searches/writes project docs. |
| **Design** | `design_agent.py` | UI/UX suggestions for the touchscreen kiosk. |
| **Learning** | `learning_agent.py` | Meta-agent: notices patterns, writes learnings to `data/`. |
| **Plan** | `plan_agent.py` | Breaks complex tasks into steps. |
| **Research** | `research_agent.py` | Web research via tool calls. |
| **Review** | `review_agent.py` | Code review on diffs. |
| **Security** | `security_agent.py` | Audit + harden (scans for secrets, etc.). |
| **Test** | `test_agent.py` | Runs pytest, interprets failures. |
| **Cleanup** | `cleanup_agent.py` | Archive stale files, prune logs, clear caches. |
| **Monitoring** | `monitoring_agent.py` | Reports on system/service health. |

## Routing (how user intent → agent)

User speaks or types a message. Flow:

```
message
  └─► router.py
       ├─► Tier 1: EXPLICIT PREFIX ("!dm", "!music", "!code")
       │    └─► direct to that agent
       ├─► Tier 2: KEYWORD MATCH (fast regex over patterns per agent)
       │    └─► score all agents, pick highest
       └─► Tier 3: LLM FALLBACK (if no keyword match)
            └─► Gemini Flash decides which agent
  └─► orchestrator.py
       ├─► single-agent: invoke + return
       └─► multi-agent: break into sub-tasks, parallel, merge
```

### Explicit prefixes

| Prefix | Target |
|---|---|
| `!dm`, `!dnd` | `dnd_dm` |
| `!music`, `!m` | `music_agent` |
| `!code` | `code_agent` |
| `!calendar`, `!cal` | `calendar_agent` |
| `!weather` | `weather_agent` |
| `!timer` | `timer_agent` |
| `!list`, `!todo` | `list_agent` |
| `!smart`, `!home` | `smart_home_agent` |
| `!deploy` | `deploy_agent` |
| `!docs` | `docs_agent` |
| `!plan` | `plan_agent` |
| `!research` | `research_agent` |
| `!recap` | `session_recap_agent` |

Configurable via `data/settings.json`.

### Keyword patterns (Tier 2)

Each agent has a list of regex patterns. Examples:

- `music_agent`: `play`, `skip`, `song`, `album`, `artist`, `pause`, `queue`
- `weather_agent`: `weather`, `temperature`, `forecast`, `rain`, `snow`
- `calendar_agent`: `schedule`, `event`, `meeting`, `appointment`, `remind me`
- `timer_agent`: `set a timer`, `alarm`, `remind me in`, `countdown`

Scores summed, highest wins. Ties go to the LLM fallback.

### LLM fallback (Tier 3)

When no prefix + no keyword match, router sends:

```
Message: "Hey, what should I do this weekend?"
Options: [conversation, routine_agent, research_agent, lore_agent, ...]
```

Gemini Flash returns agent name. If result is nonsense, falls back to `conversation`.

## Adding a new agent

1. Create `bmo/pi/agents/my_agent.py`:
   ```python
   from services.cloud_providers import call_llm
   from agents.base_agent import BaseAgent

   class MyAgent(BaseAgent):
       name = "my_agent"
       description = "does X"

       async def invoke(self, user_msg, context):
           response = await call_llm(user_msg, model="claude-sonnet-4")
           return {"text": response, "agent": self.name}
   ```

2. Register in `agents/_registry.py`:
   ```python
   from agents.my_agent import MyAgent
   REGISTRY["my_agent"] = MyAgent
   ```

3. Add keywords in `agents/router.py`:
   ```python
   KEYWORD_PATTERNS["my_agent"] = [r"\bmy\s+thing\b", ...]
   ```

4. Add test `bmo/pi/tests/agents/test_my_agent.py`.

5. Document in this file.

6. Restart: `sudo systemctl restart bmo`

## Memory model

Agents can persist state between turns:

- **Short-term (in-conversation):** `conversation.py` tracks last N turns
- **Medium-term (per-project):** `memory.py` writes to `data/memory/<hash>/MEMORY.md`, read by agents on invocation
- **Long-term (per-campaign):** `campaign_memory.db` SQLite (for `dnd_dm`)

## Cost awareness

Each agent has a `model` pref. High-capability agents use Claude Opus (expensive), simple ones use Gemini Flash (cheap).

Configured in `settings.py`:

```python
BMO_PRIMARY_MODEL = "gemini-3-pro"          # general assistant
BMO_ROUTER_MODEL = "gemini-3-flash"         # fast routing (cheap)
BMO_DND_MODEL = "claude-opus-4.6"           # DM brain (expensive, worth it)
```

## References

- Source: `bmo/pi/agents/`
- Tests: `bmo/pi/tests/agents/`
- Architecture: [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- Services that agents use: [`SERVICES.md`](./SERVICES.md)
