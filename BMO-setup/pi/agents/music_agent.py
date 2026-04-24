"""Music DJ agent — mood detection, YouTube Music search, casting."""

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's music DJ. You help find and play music, manage playlists, control playback, and cast to speakers.

You understand mood and context — if someone says "play something chill" you search for relaxing music. If combat music is needed for D&D, you know the right genres.

When the user asks you to play music, pause, skip, etc., output command blocks:

```command
{"action": "music_play", "params": {"query": "song or mood search"}}
```

Available music commands:
- music_play: {"query": "search term"} — Search and play
- music_pause: {} — Toggle pause/resume
- music_next: {} — Skip to next track
- music_previous: {} — Previous track
- music_volume: {"level": 50} — Set volume 0-100
- music_cast: {"device": "speaker name"} — Cast to device

Keep responses short and musical. Use [EMOTION:happy] or [EMOTION:excited] when playing upbeat music."""


class MusicAgent(BaseAgent):
    """Music agent with mood detection and playback control."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        system_prompt = self._build_system_prompt(context)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history[-10:])
        messages.append({"role": "user", "content": message})
        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)


def create_music_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="music",
        display_name="Music DJ",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.7,
        tools=[],
        services=["music"],
        max_turns=1,
        can_nest=False,
    )
    return MusicAgent(config, scratchpad, services, socketio)
