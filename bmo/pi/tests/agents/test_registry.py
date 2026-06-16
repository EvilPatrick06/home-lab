"""PHASE-15 15A — agent-registry resilience.

Imports the REAL ``agents._registry`` (other test files install a MagicMock for it at
import time, so we pop/restore that entry around a fresh import) and verifies that a
failure in one agent spec (missing module OR a factory that raises) is isolated and
logged, never silently dropping the rest.
"""

import importlib
import sys
import types
from unittest.mock import MagicMock

import pytest


@pytest.fixture()
def registry():
    """Yield the REAL agents._registry.

    Sibling test files install ``sys.modules["agents"] = MagicMock()`` (the whole package)
    at import time, which makes ``import agents._registry`` fail with "'agents' is not a
    package". Snapshot every ``agents*`` entry, drop them so the real package + submodules
    import freshly, then restore the snapshot exactly on teardown.
    """
    snapshot = {k: v for k, v in sys.modules.items() if k == "agents" or k.startswith("agents.")}
    for k in list(snapshot):
        del sys.modules[k]
    try:
        yield importlib.import_module("agents._registry")
    finally:
        for k in [k for k in list(sys.modules) if k == "agents" or k.startswith("agents.")]:
            del sys.modules[k]
        sys.modules.update(snapshot)


def test_spec_table_has_23_unique_agents(registry):
    specs = registry._AGENT_SPECS
    assert len(specs) == 23
    assert len({m for m, _ in specs}) == 23  # module paths unique
    assert len({f for _, f in specs}) == 23  # factory names unique


def test_one_broken_agent_does_not_drop_the_rest(registry, monkeypatch, capsys):
    good = types.ModuleType("agents._fake_ok")
    good.create_fake = lambda sp, sv, so=None: MagicMock()  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "agents._fake_ok", good)
    monkeypatch.setattr(
        registry,
        "_AGENT_SPECS",
        (("agents._fake_ok", "create_fake"), ("agents._fake_missing", "create_missing")),
    )

    result = registry.create_all_agents(MagicMock(), {}, None)
    assert len(result) == 1  # the good one survived

    out = capsys.readouterr().out
    assert "[registry] FAILED" in out
    assert "agents._fake_missing" in out


def test_factory_exception_is_isolated_too(registry, monkeypatch, capsys):
    raiser = types.ModuleType("agents._fake_raise")

    def _boom(sp, sv, so=None):
        raise RuntimeError("ctor blew up")

    raiser.create_raise = _boom  # type: ignore[attr-defined]
    ok = types.ModuleType("agents._fake_ok2")
    ok.create_ok2 = lambda sp, sv, so=None: MagicMock()  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "agents._fake_raise", raiser)
    monkeypatch.setitem(sys.modules, "agents._fake_ok2", ok)
    monkeypatch.setattr(
        registry,
        "_AGENT_SPECS",
        (("agents._fake_raise", "create_raise"), ("agents._fake_ok2", "create_ok2")),
    )

    result = registry.create_all_agents(MagicMock(), {}, None)
    assert len(result) == 1  # the raising factory was isolated; the later good one landed

    out = capsys.readouterr().out
    assert "[registry] FAILED" in out
    assert "agents._fake_raise" in out
