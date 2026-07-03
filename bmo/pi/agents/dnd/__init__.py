"""D&D + gaming agent family.

Groups the routable D&D/game agents (dnd_dm, encounter, treasure, lore, rules,
npc_dialogue, session_recap) plus the vtt_sync bridge, previously flat in the
`agents/` namespace. The routing/registry/base infra stays at the `agents/`
top level; `_registry.py` references these via `agents.dnd.<module>`.
"""
