"""Agent registry — creates and returns all specialized agents.

This is imported by BmoAgent.__init__ to register all agents with the orchestrator.
Core agents (conversation, code, dnd_dm, plan, research) are registered separately.
This file registers every non-core specialized agent listed in `_AGENT_SPECS`.
"""

from __future__ import annotations

import importlib
from typing import Any

from agents.scratchpad import SharedScratchpad

# (module path, factory name) for every non-core specialized agent. Order matches the
# historical registration order. PHASE-15 15A — a failure in ONE entry (ImportError,
# AttributeError, or a constructor raising) costs exactly that agent, never all of them.
_AGENT_SPECS: tuple[tuple[str, str], ...] = (
    ("agents.music_agent", "create_music_agent"),
    ("agents.smart_home_agent", "create_smart_home_agent"),
    ("agents.testing_agent", "create_test_agent"),
    ("agents.security_agent", "create_security_agent"),
    ("agents.design_agent", "create_design_agent"),
    ("agents.cleanup_agent", "create_cleanup_agent"),
    ("agents.monitoring_agent", "create_monitoring_agent"),
    ("agents.deploy_agent", "create_deploy_agent"),
    ("agents.review_agent", "create_review_agent"),
    ("agents.docs_agent", "create_docs_agent"),
    ("agents.timer_agent", "create_timer_agent"),
    ("agents.calendar_agent", "create_calendar_agent"),
    ("agents.weather_agent", "create_weather_agent"),
    ("agents.learning_agent", "create_learning_agent"),
    ("agents.list_agent", "create_list_agent"),
    ("agents.alert_agent", "create_alert_agent"),
    ("agents.routine_agent", "create_routine_agent"),
    # D&D-specific agents
    ("agents.encounter_agent", "create_encounter_agent"),
    ("agents.npc_dialogue_agent", "create_npc_dialogue_agent"),
    ("agents.lore_agent", "create_lore_agent"),
    ("agents.rules_agent", "create_rules_agent"),
    ("agents.treasure_agent", "create_treasure_agent"),
    ("agents.session_recap_agent", "create_session_recap_agent"),
)


def _agent_key(module_name: str, factory_name: str) -> str:
    """Readable per-agent key for status/metrics (e.g. music for
    create_music_agent). Falls back to the module tail."""
    name = factory_name
    if name.startswith("create_"):
        name = name[len("create_"):]
    if name.endswith("_agent"):
        name = name[: -len("_agent")]
    return name or module_name.rsplit(".", 1)[-1]


def create_all_agents(
    scratchpad: SharedScratchpad,
    services: dict[str, Any],
    socketio: Any = None,
    status_out: dict[str, dict] | None = None,
) -> list:
    """Create every non-core agent; a failure in one never drops the rest.

    When status_out is provided it is populated with a per-agent
    {agent_key: {ok: bool, error: str | None}} map (mirrors the service-side
    service_init_status) so a silently-dropped agent surfaces on
    /api/health/full and degrades health instead of only printing to stdout. On
    failure we also bump a Prometheus counter and log through the structured
    logger. BMO-SUGGESTIONS 2026-06-28.
    """
    from services.bmo_logging import get_logger

    log = get_logger("registry")
    agents = []
    for module_name, factory_name in _AGENT_SPECS:
        key = _agent_key(module_name, factory_name)
        try:
            module = importlib.import_module(module_name)
            factory = getattr(module, factory_name)
            agents.append(factory(scratchpad, services, socketio))
            if status_out is not None:
                status_out[key] = {"ok": True, "error": None}
        except Exception as e:  # ImportError, AttributeError, ctor errors alike
            print(f"[registry] FAILED to create agent {module_name}.{factory_name}: {e!r} - continuing without it")
            try:
                from services import metrics_counters

                metrics_counters.incr("bmo_agent_init_failed_total")
            except Exception:
                pass
            try:
                log.exception("[registry] FAILED to create agent %s.%s", module_name, factory_name)
            except Exception:
                pass
            if status_out is not None:
                status_out[key] = {"ok": False, "error": repr(e)}
    return agents
