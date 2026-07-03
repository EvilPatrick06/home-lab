"""RAG retrieval pair for the D&D / game subsystem.

- rag_search        — the SearchEngine retrieval API
- build_rag_indexes — offline index builder (imports rag_search)

Kept as a nested package so the retrieval code has a clear home separate from
the game-state services. Import submodules explicitly, e.g.
`from services.game.rag.rag_search import SearchEngine`.
"""
