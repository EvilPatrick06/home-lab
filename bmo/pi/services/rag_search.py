"""RAG Search Engine — Multi-domain Okapi BM25 search.

Ported from VTT's TypeScript search-engine.ts, keyword-extractor.ts, chunk-builder.ts.
Supports multiple domains (dnd, personal, projects) with access control.

PHASE-24 24E — twin of the dnd-app engine: BM25 lexical scoring (k1=1.5, b=0.75)
replaces the old length-normalized TF-IDF (whose IDF went negative for common
terms, penalizing relevant chunks), and chunk IDs are content-stable SHA-256
hashes (index version 2). The hash recipe and BM25 constants MUST stay identical
to dnd-app/src/main/ai/{chunk-builder,search-engine}.ts — change both or neither.
"""

import hashlib
import json
import math
import os
import re
from pathlib import Path
from typing import Optional

# ── BM25 constants (canonical Okapi defaults; mirror search-engine.ts) ─────────
# k1 = term-frequency saturation, b = document-length normalization.
K1 = 1.5
B = 0.75

# ── D&D Compound Terms (preserved as phrases during tokenization) ──────────

DND_COMPOUND_TERMS = [
    "death saving throw", "ability score increase", "armor class bonus",
    "challenge rating", "character creation", "concentration check",
    "critical hit", "critical miss", "damage resistance", "damage immunity",
    "damage vulnerability", "difficulty class", "experience points",
    "flat footed", "hit point dice", "hit point maximum", "legendary action",
    "legendary resistance", "lair action", "magic item", "martial weapon",
    "melee attack", "natural weapon", "opportunity attack", "passive perception",
    "proficiency bonus", "ranged attack", "reaction trigger", "ritual casting",
    "saving throw", "simple weapon", "skill check", "sneak attack",
    "spell attack", "spell slot", "unarmed strike", "weapon mastery",
    "wild shape", "ability check", "ability modifier", "ability score",
    "action surge", "arcane focus", "attack roll", "bardic inspiration",
    "bonus action", "cantrip slot", "class feature", "creature type",
    "damage roll", "damage type", "dark vision", "darkvision", "death save",
    "divine smite", "epic boon", "extra attack", "fighting style",
    "free action", "grapple check", "half cover", "heroic inspiration",
    "hit dice", "hit points", "initiative order", "long rest", "magic missile",
    "movement speed", "multiclass", "origin feat", "short rest", "spell level",
    "spell list", "spell save", "spell scroll", "surprise round",
    "tool proficiency", "two handed", "weapon property",
    "blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled",
    "incapacitated", "invisible", "paralyzed", "petrified", "poisoned",
    "prone", "restrained", "stunned", "unconscious", "bloodied",
    "acid damage", "bludgeoning damage", "cold damage", "fire damage",
    "force damage", "lightning damage", "necrotic damage", "piercing damage",
    "poison damage", "psychic damage", "radiant damage", "slashing damage",
    "thunder damage",
    "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin",
    "ranger", "rogue", "sorcerer", "warlock", "wizard",
    "fireball", "shield", "counterspell", "healing word", "cure wounds",
    "eldritch blast", "thunderwave", "misty step", "revivify", "wish",
    "detect magic", "dispel magic", "identify", "mage hand", "prestidigitation",
]

STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "out", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "than", "too", "very", "just", "because", "but", "and",
    "or", "if", "while", "about", "up", "that", "this", "these", "those",
    "what", "which", "who", "whom", "it", "its", "i", "me", "my", "we",
    "our", "you", "your", "he", "him", "his", "she", "her", "they", "them",
    "their", "also", "get", "got", "like", "make", "take", "know", "think",
    "see", "come", "want", "look", "use", "go", "say", "tell", "work",
    "much", "many", "well", "back", "even", "give", "way", "new",
}

# Valid domains for access control
VALID_DOMAINS = {"dnd", "personal", "projects", "anime", "games", "movies", "music"}

# ── Tokenization ───────────────────────────────────────────────────────────


def tokenize(text: str) -> list[str]:
    """Tokenize text for TF-IDF indexing, removing stop words."""
    words = re.split(r"[^a-z0-9'\-]+", text.lower())
    return [w for w in words if len(w) > 1 and w not in STOP_WORDS]


def extract_keywords(text: str) -> list[str]:
    """Extract D&D-aware keywords, preserving compound terms as phrases."""
    lower = text.lower()
    keywords = []
    remaining = lower

    for term in DND_COMPOUND_TERMS:
        if term in remaining:
            keywords.append(term)
            remaining = remaining.replace(term, " ")

    words = re.split(r"[^a-z0-9'\-]+", remaining)
    for word in words:
        if len(word) > 1 and word not in STOP_WORDS:
            keywords.append(word)

    return list(dict.fromkeys(keywords))  # Deduplicate preserving order


# ── Chunk Types ────────────────────────────────────────────────────────────


class Chunk:
    __slots__ = ("id", "source", "domain", "heading_path", "heading",
                 "content", "token_estimate", "keywords", "metadata")

    def __init__(self, id: str, source: str, domain: str, heading_path: list[str],
                 heading: str, content: str, token_estimate: int,
                 keywords: list[str], metadata: Optional[dict] = None):
        self.id = id
        self.source = source
        self.domain = domain
        self.heading_path = heading_path
        self.heading = heading
        self.content = content
        self.token_estimate = token_estimate
        self.keywords = keywords
        self.metadata = metadata or {}

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "source": self.source,
            "domain": self.domain,
            "headingPath": self.heading_path,
            "heading": self.heading,
            "content": self.content,
            "tokenEstimate": self.token_estimate,
            "keywords": self.keywords,
        }
        if self.metadata:
            d["metadata"] = self.metadata
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Chunk":
        return cls(
            id=d["id"],
            source=d.get("source", ""),
            domain=d.get("domain", "dnd"),
            heading_path=d.get("headingPath", []),
            heading=d.get("heading", ""),
            content=d.get("content", ""),
            token_estimate=d.get("tokenEstimate", 0),
            keywords=d.get("keywords", []),
            metadata=d.get("metadata"),
        )


# ── Content-stable chunk IDs (index v2) ──────────────────────────────────────


def stable_chunk_id(source: str, heading_path: list[str], content: str) -> str:
    """`<source-lowercase>-<sha256(source heading_path… content) first 16 hex>`.

    Mirrors dnd-app chunk-builder.ts stableChunkId EXACTLY: the parts are joined
    with a single space before hashing (NOT a NUL byte) so the twin engines
    produce identical ids for identical (source, heading_path, content).
    """
    digest = hashlib.sha256(" ".join([source, *heading_path, content]).encode("utf-8")).hexdigest()[:16]
    return f"{source.lower()}-{digest}"


def _apply_stable_ids(chunks: list["Chunk"]) -> None:
    """Recompute every chunk id from content (idempotent), de-duping identical
    chunks with -2/-3 suffixes by traversal order. Mirrors applyStableIds in
    chunk-builder.ts so flatten_to_chunks and the v1→v2 load migration agree."""
    seen: dict[str, int] = {}
    for c in chunks:
        cid = stable_chunk_id(c.source, c.heading_path, c.content)
        n = seen.get(cid, 0) + 1
        seen[cid] = n
        if n > 1:
            cid = f"{cid}-{n}"
        c.id = cid


# ── Search Engine ──────────────────────────────────────────────────────────


class SearchEngine:
    """Okapi BM25 search engine with domain-scoped indexes."""

    def __init__(self):
        self.domains: dict[str, list[Chunk]] = {}
        self._tfs: dict[str, list[dict[str, float]]] = {}
        self._idf: dict[str, dict[str, float]] = {}
        self._heading_terms: dict[str, list[set[str]]] = {}
        self._doc_lens: dict[str, list[int]] = {}
        self._avg_doc_len: dict[str, float] = {}

    def load_domain(self, domain: str, chunks: list[Chunk]) -> None:
        """Load chunks for a specific domain and build its index."""
        self.domains[domain] = chunks
        self._build_index(domain)

    def load_index_file(self, domain: str, path: str) -> int:
        """Load a chunk index JSON file for a domain. Returns chunk count.

        v1 indexes (positional ids) are migrated to content-stable ids at load
        time; the tracked JSON files stay v1 on disk (rebuilding them needs the
        Pi's absolute paths via build_rag_indexes.py)."""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, dict):
            raw_chunks = data.get("chunks", [])
            version = data.get("version", 1)
        else:
            raw_chunks = data
            version = 1
        chunks = []
        for raw in raw_chunks:
            chunk = Chunk.from_dict(raw)
            chunk.domain = domain
            chunks.append(chunk)

        if version < 2:
            _apply_stable_ids(chunks)

        self.load_domain(domain, chunks)
        return len(chunks)

    def _build_index(self, domain: str) -> None:
        """Build the BM25 index for a domain (raw term counts + doc lengths)."""
        chunks = self.domains[domain]
        doc_count = len(chunks)
        doc_freq: dict[str, int] = {}

        tfs = []
        doc_lens: list[int] = []
        for chunk in chunks:
            text = f"{chunk.content} {chunk.heading} {' '.join(chunk.heading_path)}"
            tokens = tokenize(text)
            # Raw (unnormalized) counts — BM25 does its own length normalization.
            tf: dict[str, float] = {}
            for token in tokens:
                tf[token] = tf.get(token, 0) + 1
            doc_lens.append(len(tokens) or 1)
            for term in set(tokens):
                doc_freq[term] = doc_freq.get(term, 0) + 1
            tfs.append(tf)

        total_len = sum(doc_lens)
        avg_doc_len = (total_len / doc_count) if doc_count > 0 else 1.0

        idf = {}
        for term, df in doc_freq.items():
            # BM25 IDF: ln(1 + (N - df + 0.5)/(df + 0.5)) — always > 0, so no clamp
            # (the old TF-IDF idf = log(N/(1+df)) went negative for common terms,
            # actively penalizing relevant chunks; this formula subsumes the fix).
            idf[term] = math.log(1 + (doc_count - df + 0.5) / (df + 0.5))

        heading_terms = []
        for chunk in chunks:
            heading_text = f"{chunk.heading} {' '.join(chunk.heading_path)}"
            heading_terms.append(set(tokenize(heading_text)))

        self._tfs[domain] = tfs
        self._idf[domain] = idf
        self._heading_terms[domain] = heading_terms
        self._doc_lens[domain] = doc_lens
        self._avg_doc_len[domain] = avg_doc_len

    def search(self, query: str, domain: str = "dnd", top_k: int = 5) -> list[dict]:
        """Search a specific domain. Returns scored chunks."""
        if domain not in self.domains:
            return []

        chunks = self.domains[domain]
        if not chunks:
            return []

        query_terms = extract_keywords(query)
        all_terms = set()
        for term in query_terms:
            all_terms.add(term)
            for subword in tokenize(term):
                all_terms.add(subword)

        tfs = self._tfs[domain]
        idf = self._idf[domain]
        heading_terms = self._heading_terms[domain]
        doc_lens = self._doc_lens[domain]
        avg_doc_len = self._avg_doc_len[domain]

        scores = []
        for i, chunk in enumerate(chunks):
            score = 0.0
            tf = tfs[i]
            heading_set = heading_terms[i]
            len_norm = 1 - B + (B * doc_lens[i]) / avg_doc_len

            for term in all_terms:
                term_tf = tf.get(term, 0)
                if term_tf == 0:
                    continue
                term_idf = idf.get(term, 0)
                # BM25 saturation: tf*(k1+1) / (tf + k1*lenNorm)
                norm = (term_tf * (K1 + 1)) / (term_tf + K1 * len_norm)
                term_score = term_idf * norm

                if term in heading_set:
                    term_score *= 2  # preserve the existing heading boost

                score += term_score

            if score > 0:
                scores.append({
                    **chunk.to_dict(),
                    "score": round(score, 6),
                })

        scores.sort(key=lambda x: x["score"], reverse=True)
        return scores[:top_k]

    def search_multi(self, query: str, domains: list[str], top_k: int = 5) -> list[dict]:
        """Search across multiple domains, merged and re-ranked."""
        all_results = []
        for domain in domains:
            if domain in self.domains:
                results = self.search(query, domain, top_k=top_k * 2)
                all_results.extend(results)

        all_results.sort(key=lambda x: x["score"], reverse=True)
        return all_results[:top_k]

    def get_chunk_count(self, domain: Optional[str] = None) -> dict[str, int]:
        """Get chunk counts per domain or for a specific domain."""
        if domain:
            return {domain: len(self.domains.get(domain, []))}
        return {d: len(chunks) for d, chunks in self.domains.items()}


# ── Chunk Builder ──────────────────────────────────────────────────────────

MAX_CHUNK_TOKENS = 4000
CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / CHARS_PER_TOKEN)


def clean_content(text: str) -> str:
    """Strip HTML stubs, image refs, and normalize whitespace."""
    text = re.sub(r'<table class="rd__b-special[\s\S]*?</table>', '', text)
    text = re.sub(r'!\[.*?\]\(img/.*?\)', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def parse_markdown_structure(markdown: str) -> list[dict]:
    """Parse markdown into a heading tree structure."""
    lines = markdown.split('\n')
    root = []
    stack = []
    current_content = []

    def flush_content():
        if stack and current_content:
            stack[-1]["node"]["content"] += '\n'.join(current_content)
        current_content.clear()

    for line in lines:
        match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if match:
            flush_content()
            level = len(match.group(1))
            heading = match.group(2).strip()

            heading_path = []
            for s in stack:
                if s["level"] < level:
                    heading_path.append(s["node"]["heading"])
            heading_path.append(heading)

            node = {
                "level": level,
                "heading": heading,
                "headingPath": heading_path,
                "content": "",
                "children": [],
            }

            while stack and stack[-1]["level"] >= level:
                stack.pop()

            if stack:
                stack[-1]["node"]["children"].append(node)
            else:
                root.append(node)

            stack.append({"level": level, "node": node})
        else:
            current_content.append(line)

    flush_content()
    return root


def split_at_paragraphs(text: str, max_tokens: int) -> list[str]:
    """Split text at paragraph boundaries to respect token limits."""
    max_chars = max_tokens * CHARS_PER_TOKEN
    parts = []
    remaining = text

    while len(remaining) > max_chars:
        split_at = remaining.rfind('\n\n', 0, max_chars)
        if split_at < max_chars * 0.3:
            split_at = remaining.rfind('. ', 0, max_chars)
            if split_at < max_chars * 0.3:
                split_at = max_chars
            else:
                split_at += 1
        parts.append(remaining[:split_at].strip())
        remaining = remaining[split_at:].strip()

    if remaining:
        parts.append(remaining)

    return parts


def create_chunk(chunk_id: str, source: str, domain: str, heading_path: list[str],
                 heading: str, content: str) -> Chunk:
    """Create a chunk with auto-extracted keywords."""
    keyword_source = f"{heading} {content[:500]}".lower()
    words = re.split(r"[^a-z0-9'\-]+", keyword_source)
    keywords = list(dict.fromkeys(w for w in words if len(w) > 2))[:20]

    return Chunk(
        id=chunk_id,
        source=source,
        domain=domain,
        heading_path=heading_path,
        heading=heading,
        content=content,
        token_estimate=estimate_tokens(content),
        keywords=keywords,
    )


def flatten_to_chunks(nodes: list[dict], source: str, domain: str,
                      id_prefix: str = "") -> list[Chunk]:
    """Flatten heading tree into chunks with content-stable ids (index v2).

    `id_prefix` is retained for call-site compatibility but no longer used —
    ids now come from stable_chunk_id(source, heading_path, content)."""
    chunks = []

    def process_node(node: dict):
        content = clean_content(node["content"])

        if node["children"]:
            if len(content) > 100:
                chunks.append(create_chunk(
                    "", source, domain,
                    node["headingPath"], node["heading"], content
                ))
            for child in node["children"]:
                process_node(child)
        else:
            if len(content) < 50:
                return

            if estimate_tokens(content) > MAX_CHUNK_TOKENS:
                parts = split_at_paragraphs(content, MAX_CHUNK_TOKENS)
                for i, part in enumerate(parts):
                    heading = f"{node['heading']} (Part {i + 1})" if len(parts) > 1 else node["heading"]
                    chunks.append(create_chunk(
                        "", source, domain,
                        node["headingPath"], heading, part
                    ))
            else:
                chunks.append(create_chunk(
                    "", source, domain,
                    node["headingPath"], node["heading"], content
                ))

    for node in nodes:
        process_node(node)

    _apply_stable_ids(chunks)
    return chunks


def build_index_from_markdown(source_dir: str, source_name: str, domain: str,
                              on_progress=None) -> list[Chunk]:
    """Build chunk index from a directory of markdown files."""
    md_files = sorted(Path(source_dir).rglob("*.md"))

    if not md_files:
        return []

    if on_progress:
        on_progress(0, f"Processing {source_name}...")

    markdown = ""
    for f in md_files:
        markdown += f.read_text(encoding="utf-8") + "\n\n"
    markdown = markdown.replace('\r\n', '\n')

    tree = parse_markdown_structure(markdown)
    chunks = flatten_to_chunks(tree, source_name, domain, source_name.lower())

    if on_progress:
        on_progress(100, f"Done — {len(chunks)} chunks from {source_name}")

    return chunks


def build_index_from_text(text: str, source_name: str, domain: str,
                          metadata: Optional[dict] = None) -> list[Chunk]:
    """Build chunks from raw text content (for adding notes, articles, etc.)."""
    tree = parse_markdown_structure(text)
    chunks = flatten_to_chunks(tree, source_name, domain, source_name.lower())
    if metadata:
        for chunk in chunks:
            chunk.metadata = metadata
    return chunks


def save_index(chunks: list[Chunk], path: str, source_hash: str | None = None) -> None:
    """Save chunk index to JSON file (version 2 = content-stable ids).

    If source_hash is given it is stamped as sourceHash so the RAG
    freshness guard (services/rag_freshness.py) can detect when the generating
    source has drifted from the committed index. Callers that omit it produce a
    legacy-shaped index (guard reports "legacy", never falsely "stale").
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = {
        "version": 2,
        "createdAt": __import__("datetime").datetime.now().isoformat(),
        "chunks": [c.to_dict() for c in chunks],
    }
    if source_hash is not None:
        data["sourceHash"] = source_hash
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


def load_index(path: str) -> list[Chunk]:
    """Load chunk index from JSON file, migrating v1 ids to content-stable ones."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        raw_chunks = data.get("chunks", [])
        version = data.get("version", 1)
    else:
        raw_chunks = data
        version = 1
    chunks = [Chunk.from_dict(c) for c in raw_chunks]
    if version < 2:
        _apply_stable_ids(chunks)
    return chunks
