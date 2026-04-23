#!/usr/bin/env python3
"""BMO MCP Server — D&D 5.5e data and RAG knowledge base.

Exposes the 62 markdown reference files (PHB2024, DMG2024, MM2025),
3000+ structured JSON data files, and the local RAG search engine
as MCP tools over stdio JSON-RPC 2.0.

Usage:
    python dnd_data_server.py
"""

import json
import os
import re
import sys
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────

MARKDOWN_ROOT = Path(os.environ.get(
    "DND_MARKDOWN_ROOT",
    os.path.expanduser("~/home-lab/bmo/pi/data/5e-references"),
))

JSON_DATA_ROOT = Path(os.environ.get(
    "DND_JSON_ROOT",
    os.path.expanduser("~/home-lab/bmo/pi/data/5e"),
))

RAG_DATA_DIR = Path(os.environ.get(
    "RAG_DATA_DIR",
    os.path.expanduser("~/home-lab/bmo/pi/data/rag_data"),
))

# ── Lazy RAG engine ──────────────────────────────────────────────────

_rag_engine = None


def _get_rag():
    global _rag_engine
    if _rag_engine is None:
        parent = str(Path(__file__).resolve().parent.parent)
        if parent not in sys.path:
            sys.path.insert(0, parent)
        from services.rag_search import SearchEngine
        _rag_engine = SearchEngine()
        for idx_file in RAG_DATA_DIR.glob("chunk-index-*.json"):
            _rag_engine.load_index_file(str(idx_file))
    return _rag_engine


# ── JSON-RPC 2.0 stdio transport ─────────────────────────────────────

def _read_message() -> dict | None:
    """Read a JSON-RPC message with Content-Length framing from stdin."""
    headers = {}
    while True:
        line = sys.stdin.readline()
        if not line:
            return None
        line = line.strip()
        if line == "":
            break
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip()] = value.strip()

    length = int(headers.get("Content-Length", 0))
    if length == 0:
        return None
    return json.loads(sys.stdin.read(length))


def _write_message(msg: dict):
    """Write a JSON-RPC message with Content-Length framing to stdout."""
    body = json.dumps(msg)
    sys.stdout.write(f"Content-Length: {len(body)}\r\n\r\n{body}")
    sys.stdout.flush()


def _result(id_val, result: dict):
    _write_message({"jsonrpc": "2.0", "id": id_val, "result": result})


def _error(id_val, code: int, message: str):
    _write_message({"jsonrpc": "2.0", "id": id_val, "error": {"code": code, "message": message}})


# ── Tool implementations ─────────────────────────────────────────────

def _list_markdown_files() -> list[dict]:
    """List all D&D markdown reference files."""
    files = []
    if MARKDOWN_ROOT.exists():
        for md in sorted(MARKDOWN_ROOT.rglob("*.md")):
            rel = md.relative_to(MARKDOWN_ROOT)
            files.append({
                "path": str(rel),
                "book": rel.parts[0] if rel.parts else "unknown",
                "size_kb": round(md.stat().st_size / 1024, 1),
            })
    return files


def _read_markdown(path: str) -> str:
    """Read a markdown file by relative path (with traversal guard)."""
    target = (MARKDOWN_ROOT / path).resolve()
    if not str(target).startswith(str(MARKDOWN_ROOT.resolve())):
        raise ValueError("Path traversal not allowed")
    if not target.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return target.read_text(encoding="utf-8")


def _search_markdown(query: str, max_results: int = 5) -> list[dict]:
    """Full-text search across all markdown reference files."""
    results = []
    if not MARKDOWN_ROOT.exists():
        return results
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    for md in MARKDOWN_ROOT.rglob("*.md"):
        text = md.read_text(encoding="utf-8", errors="replace")
        matches = list(pattern.finditer(text))
        if matches:
            m = matches[0]
            start = max(0, m.start() - 200)
            end = min(len(text), m.end() + 200)
            results.append({
                "file": str(md.relative_to(MARKDOWN_ROOT)),
                "match_count": len(matches),
                "context": text[start:end],
            })
            if len(results) >= max_results:
                break
    return results


def _list_json_categories() -> list[dict]:
    """List top-level JSON data categories."""
    cats = []
    if JSON_DATA_ROOT.exists():
        for d in sorted(JSON_DATA_ROOT.iterdir()):
            if d.is_dir():
                count = sum(1 for _ in d.rglob("*.json"))
                cats.append({"category": d.name, "file_count": count})
    return cats


def _list_json_files(category: str) -> list[str]:
    """List JSON files in a data category."""
    cat_dir = (JSON_DATA_ROOT / category).resolve()
    if not str(cat_dir).startswith(str(JSON_DATA_ROOT.resolve())):
        raise ValueError("Path traversal not allowed")
    if not cat_dir.exists():
        raise FileNotFoundError(f"Category not found: {category}")
    return sorted(str(f.relative_to(cat_dir)) for f in cat_dir.rglob("*.json"))


def _read_json(category: str, filename: str) -> dict:
    """Read a specific JSON data file."""
    target = (JSON_DATA_ROOT / category / filename).resolve()
    if not str(target).startswith(str(JSON_DATA_ROOT.resolve())):
        raise ValueError("Path traversal not allowed")
    if not target.exists():
        raise FileNotFoundError(f"File not found: {category}/{filename}")
    return json.loads(target.read_text(encoding="utf-8"))


def _rag_search(query: str, domain: str = "dnd", top_k: int = 5) -> list[dict]:
    """Search the RAG knowledge base."""
    engine = _get_rag()
    return engine.search(query, domain=domain, top_k=top_k)


# ── Tool definitions ─────────────────────────────────────────────────

TOOLS = [
    {
        "name": "list_books",
        "description": "List all D&D 5.5e markdown reference files (PHB2024, DMG2024, MM2025)",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "read_book_section",
        "description": "Read a D&D reference markdown file by path (e.g. 'PHB2024/markdown/03-character-classes.md')",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to markdown file"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "search_books",
        "description": "Search across all D&D reference markdown files for a text pattern",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Text to search for"},
                "max_results": {"type": "integer", "description": "Max results (default 5)", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_data_categories",
        "description": "List available D&D structured data categories (classes, spells, monsters, etc.)",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_data_files",
        "description": "List JSON files in a D&D data category",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Category name (e.g. 'spells', 'classes')"},
            },
            "required": ["category"],
        },
    },
    {
        "name": "read_data",
        "description": "Read a specific D&D JSON data file (spell, monster, class, etc.)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Category name"},
                "filename": {"type": "string", "description": "JSON filename"},
            },
            "required": ["category", "filename"],
        },
    },
    {
        "name": "rag_search",
        "description": "Search the D&D RAG knowledge base with TF-IDF semantic matching",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language search query"},
                "domain": {"type": "string", "description": "Search domain: dnd, personal, or projects", "default": "dnd"},
                "top_k": {"type": "integer", "description": "Number of results (default 5)", "default": 5},
            },
            "required": ["query"],
        },
    },
]


def _handle_tool_call(name: str, args: dict) -> list[dict]:
    """Dispatch a tool call, return MCP content blocks."""
    handlers = {
        "list_books": lambda: _list_markdown_files(),
        "read_book_section": lambda: _read_markdown(args["path"]),
        "search_books": lambda: _search_markdown(args["query"], args.get("max_results", 5)),
        "list_data_categories": lambda: _list_json_categories(),
        "list_data_files": lambda: _list_json_files(args["category"]),
        "read_data": lambda: _read_json(args["category"], args["filename"]),
        "rag_search": lambda: _rag_search(args["query"], args.get("domain", "dnd"), args.get("top_k", 5)),
    }

    handler = handlers.get(name)
    if not handler:
        raise ValueError(f"Unknown tool: {name}")

    result = handler()
    text = result if isinstance(result, str) else json.dumps(result, indent=2)
    return [{"type": "text", "text": text}]


# ── Main loop ─────────────────────────────────────────────────────────

def main():
    while True:
        msg = _read_message()
        if msg is None:
            break

        method = msg.get("method", "")
        msg_id = msg.get("id")
        params = msg.get("params", {})

        if method == "initialize":
            _result(msg_id, {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "bmo-dnd-data", "version": "1.0.0"},
            })
        elif method == "notifications/initialized":
            pass
        elif method == "tools/list":
            _result(msg_id, {"tools": TOOLS})
        elif method == "tools/call":
            try:
                content = _handle_tool_call(params.get("name", ""), params.get("arguments", {}))
                _result(msg_id, {"content": content})
            except Exception as e:
                _result(msg_id, {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True})
        elif method == "ping":
            _result(msg_id, {})
        elif msg_id is not None:
            _error(msg_id, -32601, f"Method not found: {method}")


if __name__ == "__main__":
    main()
