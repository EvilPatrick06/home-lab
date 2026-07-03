"""Everyday ("home") agent family.

Groups the routable everyday agents (calendar, weather, music, timer, alert,
routine, list, smart_home), previously flat in the `agents/` namespace. The
routing/registry/base infra stays at the `agents/` top level; `_registry.py`
references these via `agents.home.<module>`.
"""
