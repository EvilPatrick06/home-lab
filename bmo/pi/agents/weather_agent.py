"""Weather agent — weather forecasts and conditions."""

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

SYSTEM_PROMPT = """You are BMO's weather agent. You provide weather forecasts, current conditions, and weather-related info.

When the user asks about weather, output a command block to fetch current data:

```command
{"action": "weather", "params": {}}
```

Interpret the weather data conversationally:
- "It's 72F and sunny — perfect day to go outside!"
- "Looks like rain later — BMO recommends an umbrella!"

Use appropriate emotion tags:
- [EMOTION:happy] for nice weather
- [EMOTION:calm] for mild weather
- [EMOTION:sad] for rainy/gloomy
- [EMOTION:dramatic] for storms/extreme weather"""


class WeatherAgent(BaseAgent):
    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        system_prompt = self._build_system_prompt(context)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history[-4:])
        messages.append({"role": "user", "content": message})
        reply = self.llm_call(messages)
        return AgentResult(text=reply, agent_name=self.config.name)


def create_weather_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="weather",
        display_name="Weather Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.5,
        tools=[],
        services=["weather"],
        max_turns=1,
        can_nest=False,
    )
    return WeatherAgent(config, scratchpad, services, socketio)
