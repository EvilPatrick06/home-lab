# Rules retrieval (dnd-app AI DM + BMO twin)

How the AI DM finds the right 5e rules (and, opt-in, the campaign's own
documents) to put in front of the model. Added in PHASE-24. This is the
authoritative reference for the retrieval stack across **both** engines: the
TypeScript one in `dnd-app/src/main/ai/` and its Python twin in
`bmo/pi/services/rag_search.py`.

The pipeline has three layers, each a strict superset fallback of the one below:

1. **BM25 lexical** (always on, the default) — Okapi BM25 over the bundled rule
   chunks. Deterministic, dependency-free, offline.
2. **Hybrid BM25 ⊕ vector** (opt-in, Ollama only) — adds a local embedding layer
   and fuses the two rankings with Reciprocal Rank Fusion. Any failure degrades
   silently to layer 1.
3. **Campaign documents** (opt-in, BM25-only, per campaign) — a parallel BM25
   index over the campaign's lore / journals / text handouts / public shared
   journal, retrieved into its own context block.

## 1. Chunk index (format v2, content-stable IDs)

Rule books (PHB 2024, DMG 2024, MM 2025) are pre-chunked at heading boundaries
into `resources/chunk-index.json` — **version 2, exactly 5,383 chunks** (PHB
1,655 / DMG 1,454 / MM 2,274). Each chunk carries `{ id, source, heading,
headingPath, content, tokenEstimate, keywords }`.

### Stable-ID recipe

Chunk IDs are content hashes, not positional counters, so PHASE-07's
`contextChunkIds` provenance survives an index rebuild (a positional `phb-101`
shifts whenever upstream markdown is edited above it; a content hash does not):

```
id = `${source.toLowerCase()}-${sha256([source, ...headingPath, content].join(' ')).hex.slice(0,16)}`
```

The parts are joined with a **single space** before hashing. Identical chunks
(same source + headingPath + content) are de-duplicated with `-2`, `-3` suffixes
in traversal order. Defined once per engine:

- TS: `stableChunkId` / `applyStableIds` in `dnd-app/src/main/ai/chunk-builder.ts`
- Py: `stable_chunk_id` / `_apply_stable_ids` in `bmo/pi/services/rag_search.py`

**The recipe must stay byte-identical between the two engines** (same join
separator, same hash, same dedup) — change both or neither.

### v1 → v2 migration at load

Old (v1, positional-ID) indexes are migrated **at load time**, in memory, by
recomputing every ID with the recipe above — never rewritten to disk. So a
stale `userData/chunk-index.json`, or BMO's tracked `chunk-index-*.json` files
(which stay v1 on disk; rebuilding them needs the Pi's absolute paths via
`build_rag_indexes.py`), keep working and yield IDs identical to a fresh v2
build of the same content.

### Rebuilding the bundled index

`cd dnd-app && npm run build:index` (`scripts/build/build-chunk-index.mjs`)
regenerates `resources/chunk-index.json` as v2. It resolves the book markdown
from `5.5e References/` inside or beside `dnd-app/`, then falls back to the
tracked copy at `bmo/pi/data/5e-references/{PHB2024,DMG2024,MM2025}`. On a CI
runner where neither is present it exits 0 and keeps the tracked index. Expect
`Done — 5383 chunks indexed`.

## 2. BM25 lexical scoring (replaces TF-IDF)

The default ranker is Okapi BM25, not the hand-rolled length-normalized TF-IDF
it replaced. BM25 adds the two things 5e exact-match lookups ("Grappled",
"Sneak Attack", "Opportunity Attack") need:

- **Term-frequency saturation (`k1 = 1.5`)** — the 50th repetition of "attack"
  in a long chapter adds almost nothing; a short condition chunk that says
  "grappled" once is not buried under it.
- **Document-length normalization (`b = 0.75`)** — a short authoritative chunk
  is not penalized against a long one that merely happens to repeat a term.

Per-term score:

```
idf(t)  = ln(1 + (N - df + 0.5) / (df + 0.5))           # always > 0
lenNorm = 1 - b + b * docLen / avgDocLen
score  += idf(t) * (tf * (k1 + 1)) / (tf + k1 * lenNorm)
          × 2 if t appears in the chunk's heading/headingPath  # heading boost
```

`k1 = 1.5`, `b = 0.75` (canonical defaults), heading boost ×2 (preserved from the
TF-IDF engine). Query expansion (D&D compound-term phrases + subword tokens) and
the `score > 0` filter are unchanged.

**Why the rewrite, concretely:** the old IDF was `ln(N / (1 + df))`, which goes
**negative** for any term present in more than ~half the chunks — those terms
*subtracted* from a chunk's score and could push relevant chunks below the
`score > 0` cutoff entirely. BM25's `ln(1 + (N − df + 0.5)/(df + 0.5))` is always
positive, so common terms contribute little but never penalize. The TS engine had
been clamping the old formula at zero; the Python twin had not (the
"negative-IDF drift" — see the regression test in `test_rag_search.py`). BM25
removes the bug class from both.

No new dependency: ~40 lines of math over a static 5,383-doc corpus. `minisearch`
/ `lunr` / `okapibm25` were rejected (the engine was already custom; the corpus is
tiny and static).

## 3. Opt-in embedding layer + RRF fusion (Ollama)

Off by default. When the user is on the **local Ollama provider** and ticks
**Semantic rules search (experimental)** in the AI DM setup, the app embeds every
rule chunk once with a local embedding model and fuses vector similarity with BM25
at query time.

### Enabling it

1. Provider must be Ollama.
2. Install the embedding model: `ollama pull nomic-embed-text` (the app does
   **not** auto-pull it — a 404 from `/api/embed` surfaces as
   `Model "<model>" is not installed on Ollama. Install it with: ollama pull <model>`).
3. Tick the checkbox. The model field defaults to `nomic-embed-text` and is
   user-editable (`qwen3-embedding:0.6b` and `embeddinggemma` are alternatives).
4. The vector index builds in the background with progress events; a status row
   shows `building 42%` → `ready — 5,383 chunks`, with a **Rebuild** button.

### How it works

- **Embedded text** is the heading breadcrumb prepended to the content —
  `embeddingText(chunk) = `${source} > ${headingPath.join(' > ')}\n${content}``
  — the deterministic, zero-cost cousin of Anthropic's contextual retrieval
  (most of the benefit on a heading-rich corpus without 5,383 LLM calls).
- **Embed call:** `POST /api/embed` with `{ model, input: batch, truncate: true,
  options: { num_ctx: 8192 }, keep_alive: '60m' }`. The `num_ctx: 8192` is
  **required** — nomic's Ollama card defaults to a 2k window while rule chunks
  reach ~2,423 tokens, so without it long chunks are silently truncated at embed
  time. `nomic-embed-text` was trained with task prefixes (`search_document: ` /
  `search_query: `) that Ollama does not auto-apply, so the client adds them per a
  small per-model table (unknown models → no prefix). `/api/embed` returns
  **L2-normalized** vectors, so cosine ≡ dot product.
- **Build cost:** 5,383 chunks in batches of 32 ≈ **169 requests**. Minutes on
  CPU, seconds on GPU. One-time per model/content fingerprint.
- **Vector store:** `userData/rules-embeddings/` — `meta.json`
  (`{ version, model, dims, indexFingerprint, ids[] }`) + `vectors.bin` (a flat
  `Float32Array`, row order = `ids`). The fingerprint is the sha256 of the chunk
  IDs (content hashes, post-§1), so any content change forces a rebuild; a model
  change forces a rebuild (meta records the model). ~16.5 MB in RAM for the whole
  matrix — brute-force dot product over 5k rows is sub-millisecond, so no vector
  DB / native dependency.
- **Fusion:** Reciprocal Rank Fusion, `score(d) = Σ_lists 1/(k + rank_d)`,
  **k = 60**. Both sub-searches draw from pools of **50** (`FUSION_POOL`); the
  fused list is cut to the top **8** (`HYBRID_TOP_K`). RRF needs no score
  normalization between incommensurable BM25 scores and cosine similarities — it
  uses only rank positions.

### Silent fallback ladder

Every failure mode degrades to pure BM25 (top-5) with a `WARN` log — never a
user-facing retrieval error:

| Condition | Result |
|---|---|
| Checkbox off (or config field absent) | **BM25 top-5, byte-identical to layer 1** |
| No vector store loaded (not built / fingerprint or model mismatch) | BM25 top-5 |
| Embedding endpoint down / model missing / query embed throws | BM25 top-5 |
| Both succeed | RRF-fused top-8 |

The "off" path is the regression guard: with the config field absent, retrieval
output is asserted byte-identical to the BM25-only engine (`hybrid-search.test.ts`).

## 4. Campaign-document retrieval (opt-in, BM25-only)

Tick **"Let the AI DM search this campaign's lore, journals, and text handouts"**
(provider-independent; lexical-only) and the AI DM retrieves relevant excerpts
from the campaign's own content into a budgeted `[CONTEXT: Campaign Documents]`
block. Pre-checked for **new** configs; absent in previously-saved configs = off
(no behavior change for existing campaigns). Per-campaign corpora are tiny and
proper-noun-heavy — BM25's home turf — so there is no per-campaign embedding cost.

### What is and isn't indexed (the AI DM acts as the DM)

| Source | Indexed | Notes |
|---|---|---|
| `lore[]` | **All** entries | Title prefixed with `[${category}]` |
| `journal.entries[]` | **All**, incl. `isPrivate` | DM-owned session record; title `Session N: …` |
| `handouts[]` text content | **Yes**, incl. `dm-only` | Top-level + `pages[]` where `contentType === 'text'`; page label appended |
| `handouts[]` image content | **Never** | base64 blobs would poison the index |
| `sharedJournal[]` | **Public only** | `visibility === 'private'` entries are author-only by design |

Free-text entries usually have no markdown heading, and the chunker drops content
before the first heading — so each doc is wrapped in a synthetic `# ${title}`
before parsing (`chunksFromText` in `chunk-builder.ts`). Chunk IDs use the same
stable recipe with source tag `CAMPAIGN`; `headingPath` is prefixed by docType so
`formatChunks` renders `CAMPAIGN: lore > [world] The Sundering > …`.

### Cache + budget

- **Per-campaign engine cache** keyed on
  `${campaign.updatedAt}:${savedGameState.lastSaveTimestamp}` — rebuilt only when
  the campaign changes (`campaign-docs.ts`). `searchCampaignDocs()` is exported and
  cheap to call (PHASE-31's Q&A side-channel reuses it).
- **Token budget:** `campaignDocs: 2000` in `token-budgets.json` (window-scaled
  via `getEffectiveBudgets()`, floor 200); top-3 excerpts. Storage is read only
  through `loadCampaignById` — no fs path is ever derived from `campaignId`.

Note: this layer only **retrieves** lore; `formatCampaignForContext` still inlines
the full lore block into `[CAMPAIGN DATA]`. De-duplicating the two is **PHASE-25**'s
job, not this one.

## Provenance

Retrieved chunk IDs (rule + campaign-doc) flow through `BuiltContext.chunkIds`
(PHASE-07), are wired onto the finalized assistant message as
`ConversationMessage.contextChunkIds` (07C), and are surfaced in the PHASE-14
**Context Inspector** — which also shows the per-section token breakdown including
the `campaignDocs` row added here.

## The BMO twin engine

`bmo/pi/services/rag_search.py` is a line-for-line Python port consumed by the
agent runtime, the MCP D&D data server, and both Discord bots. It carries the
**same** BM25 scoring and **same** stable-ID recipe as the TS engine. Parity rules:

- Same hash recipe (space-join, sha256, 16 hex, `-N` dedup) — §1.
- Same BM25 constants (`K1 = 1.5`, `B = 0.75`), same IDF formula, same heading ×2.
- v1 indexes migrate at load in both; tracked `chunk-index-*.json` stay v1 on disk.
- Public API unchanged (`SearchEngine.load_index_file / load_domain / search /
  search_multi / get_chunk_count`, list-of-dicts results with `score`) so no
  consumer needed edits.

**Change one engine, change the other** (or the two drift — which is exactly how
the negative-IDF bug got into the Python copy in the first place). Tests:
`dnd-app/src/main/ai/search-engine.test.ts` + `chunk-builder.test.ts` and
`bmo/pi/tests/test_rag_search.py`.

## Related

- Context-window / `num_ctx` / `keep_alive` / KV-cache tuning — see
  [OLLAMA-TUNING.md](./OLLAMA-TUNING.md). The embedding model is a **second**
  Ollama runner with its own independent `keep_alive`/memory footprint.

## Sources

- BM25 over TF-IDF for exact-match queries —
  https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026 ·
  https://dev.to/vf-insights/dense-vs-sparse-retrieval-mastering-faiss-bm25-and-hybrid-search-4kb1
- Reciprocal Rank Fusion (k = 60) —
  https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking ·
  https://avchauzov.github.io/blog/2025/hybrid-retrieval-rrf-rank-fusion/ ·
  https://glaforge.dev/posts/2026/02/10/advanced-rag-understanding-reciprocal-rank-fusion-in-hybrid-search/
- Contextual chunk headers —
  https://www.anthropic.com/news/contextual-retrieval ·
  https://dev.to/kartikeyraj/free-contextual-chunk-headers-heading-aware-chunking-for-hybrid-retrieval-560
- Ollama embeddings API —
  https://docs.ollama.com/api/embed · https://docs.ollama.com/capabilities/embeddings
- Embedding model choice —
  https://ollama.com/library/nomic-embed-text · https://ollama.com/blog/embedding-models ·
  https://www.morphllm.com/ollama-embedding-models
- Campaign-content indexing prior art —
  https://foundryvtt.com/packages/rpgx-ai-assistant · https://fables.gg/
