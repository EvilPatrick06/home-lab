"""D&D / multiplayer-game service cluster for BMO.

Groups the D&D / game modules that were previously scattered in the flat
`services/` namespace, mirroring the `services/voice/` precedent:

- dnd_engine         — dice rolling + core D&D mechanics
- dnd_dm_data        — DM data structures / prompt data
- game_registry      — multiplayer game/session registry
- game_relay         — real-time relay transport (Phase 32a)
- campaign_memory    — per-campaign persistent memory
- scene_service      — scene state
- location_service   — location / map state
- pbp_store          — play-by-post turn queue store
- personality_engine — NPC personality config
- rag/               — RAG retrieval pair (rag_search + build_rag_indexes)

Import submodules explicitly, e.g. `from services.game.game_registry import
get_registry`. This package intentionally does NOT eagerly import its
submodules: several pull in heavy deps (RAG indexes, embeddings), so eager
re-exports here would force that cost (and risk import-order cycles) on anything
that merely touches `services.game`. Submodule access
(`from services.game import game_registry`) still works without eager imports.

Module file names are kept as-is per the "Service module names" rule in
bmo/docs/DESIGN-CONSTRAINTS.md (avoid stdlib-shadowing renames).
"""
