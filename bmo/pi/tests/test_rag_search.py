"""Tests for the BM25 RAG search engine (PHASE-24 24E).

Twin of dnd-app/src/main/ai/{search-engine,chunk-builder}.test.ts. Covers BM25
ranking (compound-term-first, length normalization, saturation), the negative-IDF
regression that motivated the BM25 port, content-stable ids + dedup, v1→v2 load
migration, the consumer dict contract, and domain isolation.
"""

import json

from services.rag_search import (
    B,
    K1,
    Chunk,
    SearchEngine,
    _apply_stable_ids,
    create_chunk,
    extract_keywords,
    load_index,
    save_index,
    stable_chunk_id,
    tokenize,
)


def mk_chunk(source: str, heading: str, content: str,
             heading_path=None, domain: str = "dnd") -> Chunk:
    hp = heading_path if heading_path is not None else [heading]
    return create_chunk("", source, domain, hp, heading, content)


def engine_with(chunks, domain="dnd") -> SearchEngine:
    eng = SearchEngine()
    eng.load_domain(domain, chunks)
    return eng


# ── Tokenization / keyword extraction ────────────────────────────────────────


def test_extract_keywords_preserves_compound_terms():
    kws = extract_keywords("Taking the Attack action provokes an opportunity attack")
    assert "opportunity attack" in kws  # compound phrase survives as one token


def test_tokenize_drops_stop_words_and_one_char_tokens():
    toks = tokenize("The grappled creature is a x prone")
    assert "grappled" in toks and "prone" in toks
    assert "the" not in toks and "is" not in toks and "a" not in toks and "x" not in toks


# ── BM25 ranking ──────────────────────────────────────────────────────────────


def test_compound_term_chunk_ranks_first():
    chunks = [
        mk_chunk("PHB", "Melee Attack", "When you make a melee attack you roll to hit. An attack with a weapon."),
        mk_chunk("PHB", "Ranged Attack", "A ranged attack lets you attack at a distance with a bow attack."),
        mk_chunk("PHB", "Opportunity Attack",
                 "You can make an opportunity attack when a hostile creature you can see moves out of your reach."),
    ]
    results = engine_with(chunks).search("opportunity attack", domain="dnd")
    assert results
    assert results[0]["heading"] == "Opportunity Attack"


def test_length_normalization_favors_short_chunk():
    filler = " ".join(f"word{i}" for i in range(2000))
    chunks = [
        mk_chunk("PHB", "Short", "A creature can grapple a target nearby."),
        mk_chunk("PHB", "Long", f"A creature can grapple a target nearby. {filler}"),
    ]
    results = engine_with(chunks).search("grapple", domain="dnd")
    assert results[0]["heading"] == "Short"  # short doc wins for one occurrence


def test_term_frequency_saturates_sublinearly():
    # Equal-length docs; only the count of the query term differs.
    pad_one = " ".join(f"pad{i}" for i in range(49))
    one = mk_chunk("PHB", "One", f"grapple {pad_one}")
    many = mk_chunk("PHB", "Many", " ".join(["grapple"] * 50))
    eng = engine_with([one, many])
    res = {r["heading"]: r["score"] for r in eng.search("grapple", domain="dnd")}
    assert res["Many"] > res["One"]  # more occurrences still ranks higher
    assert res["Many"] / res["One"] < 10  # ...but sub-linearly (50x → <10x), the BM25 saturation


def test_negative_idf_regression_ubiquitous_term_never_penalizes():
    # A term present in EVERY chunk: the old TF-IDF idf = log(N/(1+df)) went
    # negative here, dropping relevant chunks (score>0 filter). BM25 idf is > 0.
    chunks = [
        mk_chunk("PHB", "Rules A", "These rules govern combat and rules apply broadly."),
        mk_chunk("PHB", "Rules B", "The rules of magic follow rules and rules of casting."),
        mk_chunk("PHB", "Rules C", "Exploration rules and social rules round out the rules."),
    ]
    eng = engine_with(chunks)
    assert eng._idf["dnd"]["rules"] > 0  # never negative
    results = eng.search("rules", domain="dnd")
    assert len(results) == 3  # none penalized out by a negative contribution
    assert all(r["score"] > 0 for r in results)


# ── Content-stable ids + dedup ───────────────────────────────────────────────


def test_stable_chunk_id_is_deterministic_and_content_sensitive():
    a = stable_chunk_id("PHB", ["Combat", "Grapple"], "Grab the target.")
    b = stable_chunk_id("PHB", ["Combat", "Grapple"], "Grab the target.")
    c = stable_chunk_id("PHB", ["Combat", "Grapple"], "Grab a different target.")
    assert a == b
    assert a != c
    assert a.startswith("phb-") and len(a.split("-", 1)[1]) == 16


def test_apply_stable_ids_dedups_identical_chunks_with_suffixes():
    dupes = [
        mk_chunk("PHB", "Grapple", "Grab the target."),
        mk_chunk("PHB", "Grapple", "Grab the target."),
        mk_chunk("PHB", "Grapple", "Grab the target."),
    ]
    _apply_stable_ids(dupes)
    base = stable_chunk_id("PHB", ["Grapple"], "Grab the target.")
    assert dupes[0].id == base
    assert dupes[1].id == f"{base}-2"
    assert dupes[2].id == f"{base}-3"


# ── v1 → v2 load migration ───────────────────────────────────────────────────


def _write_v1_index(path):
    payload = {
        "version": 1,
        "chunks": [
            {"id": "phb2024-1", "source": "PHB2024", "domain": "dnd",
             "headingPath": ["Combat", "Grapple"], "heading": "Grapple",
             "content": "You attempt to grab a creature.", "tokenEstimate": 6, "keywords": []},
            {"id": "phb2024-2", "source": "PHB2024", "domain": "dnd",
             "headingPath": ["Combat", "Shove"], "heading": "Shove",
             "content": "You shove a creature to knock it prone.", "tokenEstimate": 8, "keywords": []},
        ],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_load_index_migrates_v1_positional_ids(tmp_path):
    p = tmp_path / "chunk-index-dnd.json"
    _write_v1_index(p)
    chunks = load_index(str(p))
    assert len(chunks) == 2
    assert chunks[0].id != "phb2024-1"
    assert chunks[0].id == stable_chunk_id("PHB2024", ["Combat", "Grapple"], "You attempt to grab a creature.")


def test_load_index_file_migrates_v1_and_search_uses_hash_ids(tmp_path):
    p = tmp_path / "chunk-index-dnd.json"
    _write_v1_index(p)
    eng = SearchEngine()
    count = eng.load_index_file("dnd", str(p))
    assert count == 2
    results = eng.search("grapple", domain="dnd")
    assert results
    assert all(not r["id"].startswith("phb2024-1") and not r["id"].startswith("phb2024-2") for r in results)
    assert results[0]["id"].startswith("phb2024-")  # <source-lc>-<hash>


def test_v2_index_is_not_remigrated(tmp_path):
    p = tmp_path / "chunk-index-v2.json"
    payload = {
        "version": 2,
        "chunks": [
            {"id": "custom-stable-id", "source": "PHB2024", "domain": "dnd",
             "headingPath": ["Combat"], "heading": "Grapple",
             "content": "You attempt to grab a creature.", "tokenEstimate": 6, "keywords": []},
        ],
    }
    p.write_text(json.dumps(payload), encoding="utf-8")
    chunks = load_index(str(p))
    assert chunks[0].id == "custom-stable-id"  # passthrough, no rewrite


def test_save_index_writes_version_2(tmp_path):
    p = tmp_path / "out.json"
    save_index([mk_chunk("PHB", "Grapple", "You attempt to grab a creature.")], str(p))
    data = json.loads(p.read_text(encoding="utf-8"))
    assert data["version"] == 2


# ── Consumer contract + domain isolation ─────────────────────────────────────


def test_search_returns_consumer_dict_shape():
    eng = engine_with([mk_chunk("PHB", "Grapple", "You attempt to grab a creature in a grapple.")])
    results = eng.search("grapple", domain="dnd")
    assert results
    r = results[0]
    for key in ("id", "source", "headingPath", "heading", "content", "score"):
        assert key in r
    assert isinstance(r["score"], float)
    assert isinstance(r["headingPath"], list)


def test_domain_isolation_dnd_search_ignores_personal_chunks():
    eng = SearchEngine()
    eng.load_domain("dnd", [mk_chunk("PHB", "Grapple", "Rules for grappling a creature.", domain="dnd")])
    eng.load_domain("personal", [mk_chunk("NOTES", "Diary", "The secret passphrase is swordfish.", domain="personal")])
    assert eng.search("secret swordfish", domain="dnd") == []
    assert eng.search("secret swordfish", domain="personal")
    # search_multi scoped to dnd must not leak the personal chunk
    assert eng.search_multi("secret swordfish", ["dnd"]) == []


def test_bm25_constants_match_canonical_defaults():
    assert K1 == 1.5
    assert B == 0.75
