# PHASE-24 — Hybrid BM25+vector rules retrieval, contextual chunk headers, campaign-content indexing

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Upgrade the rules-retrieval pipeline that feeds the AI DM from a hand-rolled TF-IDF ranker to the current-standard stack for exact-match-shaped 5e queries ("Grappled", "Sneak Attack", "Opportunity Attack"): Okapi BM25 lexical scoring by default, an **opt-in** embedding/vector layer fused with BM25 via Reciprocal Rank Fusion when the local Ollama provider is available, and contextual chunk headers (the `PHB > Chapter 1 > Combat > Opportunity Attacks` breadcrumb) carried into the embedding representation. On top of that machinery, index the campaign's OWN content — lore entries, session-journal entries, text handouts, and public shared-journal entries — into a per-campaign retrieval index so the AI DM can answer from the campaign's documents instead of only the rulebooks (the "AI doesn't know my world doc" gap). Chunk IDs become content-stable (hash-based instead of positional) so the `contextChunkIds` provenance wired in PHASE-07 survives index rebuilds. The BMO copy of the engine (`bmo/pi/services/rag_search.py`, a line-for-line port of the TypeScript engine consumed by the agent runtime, the MCP D&D data server, and both Discord bots) gets the same BM25 + stable-ID upgrade plus its first test file, fixing a real port drift (its IDF goes negative for common terms; the TS engine clamps at zero).

## Dependencies & cross-phase notes

- **PHASE-01 (hard prerequisite, per PHASE-INDEX row 24).** Three reasons:
  1. 01A migrates `ollama-client.ts` to the native Ollama API; this phase adds a second native-API call (`POST /api/embed`) and reuses 01's URL plumbing (`getOllamaUrl()`).
  2. 01C replaces direct `TOKEN_BUDGETS.<section>` reads in `context-builder.ts` with `getEffectiveBudgets()` (interface `EffectiveBudgets`, per-section floors, window-scaled). Sub-phase 24D adds a `campaignDocs` budget key and MUST extend `token-budgets.json`, `EffectiveBudgets`, the floors table, and the recomputed `total` — verify 01C's final shape before editing (`grep -n "EffectiveBudgets" dnd-app/src/main/ai/token-budget.ts`).
  3. 01D reorders `buildContext`'s parts static-first/volatile-last for the Ollama prefix cache. The new campaign-documents block (24D) is query-volatile and must be pushed **adjacent to the rulebook-chunks push** (the volatile group), never before the semi-static campaign/character blocks.
- **PHASE-07 (runs before 24 by numeric order).** 07A changed `buildContext` to return `Promise<BuiltContext>` (`{ text, breakdown, chunkIds }`) and removed the `lastTokenBreakdown` module global; 07C threads `chunkIds` to the finalized assistant message (`ConversationMessage.contextChunkIds`). PHASE-07's plan states verbatim: "PHASE-24 (rules RAG) consumes the `contextChunkIds` provenance wired here and owns making chunk ids content-stable (today's ids are positional and only stable per index build)." Sub-phase 24A delivers the stable IDs; 24D appends campaign-doc chunk IDs to `BuiltContext.chunkIds`. Verify 07's landed shape with `grep -n "BuiltContext\|chunkIds" dnd-app/src/main/ai/context-builder.ts`.
- **PHASE-14 (runs before 24).** 14E built `ContextInspectorPanel` rendering one row per `ContextTokenBreakdown` section (seven rows at build time) plus the `chunkIds` provenance list. 24D adds the `campaignDocs` breakdown field and must add the eighth inspector row + i18n keys + test case. Verify with `grep -rn "contextInspector" dnd-app/src/renderer/src/components | head`.
- **PHASE-10 (runs before 24)** reworked `AiProviderSetup.tsx` / `AiDmCard.tsx` (provider prefill, dropdown states, wizard gating). 24C adds a retrieval section to `AiProviderSetup` — re-anchor by reading the post-10 file, not by the line numbers in this plan.
- **PHASE-13 (runs before 24)** extended `sanitizeCampaignId` across AI IPC handlers. 24's new IPC handlers take no campaignId argument (embedding index is global; campaign-doc indexing happens inside `buildContext` via the already-sanitized campaignId), so no new path-traversal surface is added — keep it that way: campaign-doc data is read exclusively through `loadCampaignById` (existing storage helper), never via caller-constructed paths.
- **PHASE-25 (`entity-memory-lore`, depends on 24)** owns player-editable lore pages joining AI context as labeled blocks and keyword/state-triggered world-info injection. Potential duplication: 24D *retrieves* lore-entry chunks into `[CONTEXT: Campaign Documents]` while `formatCampaignForContext` still inlines every lore entry into `[CAMPAIGN DATA]` (`campaign-context.ts` Lore section). 24D deliberately does NOT slim the inline lore block (avoids coupling two behavior changes); **PHASE-25 owns the dedup/injection policy** between inline lore, keyword-triggered injection, and 24D retrieval. Coordinate on `src/main/ai/campaign-context.ts` and the new `src/main/ai/campaign-docs.ts`.
- **PHASE-31 (recaps/Q&A)** will reuse the campaign-doc retrieval engine from 24D for the campaign Q&A side channel — keep `searchCampaignDocs()` exported and engine construction cheap/cached.
- **Shared-file collision map:** `context-builder.ts` (01D, 07A, 24C, 24D), `token-budget.ts`/`token-budgets.json` (01C, 24D), `types.ts` main-ai (01B, 07, 24A, 24D), `ipc-schemas.ts` + `ipc-channels.ts` + `preload/index.ts` + `preload/index.d.ts` (01B, 14, 24C), `AiProviderSetup.tsx`/`AiDmCard.tsx` (10, 24C), `ai-dm-routing.ts` (01B, 24C). All earlier phases land first (numeric order), so 24 edits the post-01/07/10/13/14 tree; every step below names a grep anchor instead of relying on line numbers where drift is likely.

## Verified findings

All citations verified against the live tree on 2026-06-10 (commit a685404a). Line numbers are pre-PHASE-01..23; each finding includes re-verification commands that are line-number-independent.

### F1 — The "search-engine/RAG infra" exists but is TF-IDF, not BM25, and has no vector layer at all

The audit said "the app already has the search-engine/RAG infra for rules" — confirmed — but the ranking is plain TF-IDF with length-normalized TF, not BM25, and nothing resembling embeddings exists anywhere in `dnd-app/src`:

- `dnd-app/src/main/ai/search-engine.ts` (96 lines): class `SearchEngine`; `buildIndex()` computes per-chunk term frequency normalized by token count (`tf[term] /= len`, :29-32), document frequency, and IDF as `Math.max(0, Math.log(docCount / (1 + df)))` (:44 — the clamp comment explains negative IDF "actively penalized relevant chunks"). `search(query, topK = 5)` (:53) scores `tf × idf` per term with a flat `×2` multiplier when the term appears in the chunk's heading/headingPath (:75-77), sorts, filters `score > 0`, returns `ScoredChunk[]`. No `k1`/`b` saturation, no document-length compensation beyond raw TF normalization (which over-rewards short chunks containing a term once and under-rewards long authoritative sections).
- No embeddings: `grep -rni "embedding\|/api/embed" dnd-app/src --include='*.ts' --include='*.tsx'` → only false positives (`boundary-allow … not data embedding` comments). No vector store, no cosine/dot-product code, no embedding model reference.
- Tokenization: `dnd-app/src/main/ai/keyword-extractor.ts` — `extractKeywords` (:150-170) preserves D&D compound terms (from `dnd-terms.ts`, which re-exports `src/main/data/dnd-terms.json`) as phrase tokens; `tokenize` (:175-180) lowercases, splits on `[^a-z0-9'-]+`, drops stop words and 1-char tokens. The SearchEngine indexes `${content} ${heading} ${headingPath.join(' ')}` (:24).

Re-verify:
```bash
grep -n "tf\[term\] /= len\|Math.max(0, Math.log" dnd-app/src/main/ai/search-engine.ts
grep -rni "embedding" dnd-app/src/main --include='*.ts' | grep -v boundary-allow
```

### F2 — Markdown-header chunking ALREADY exists; contextual headers exist at injection time; the gap is the embed-time/ranking representation (correction vs the audit)

The audit bullet reads as if "markdown-header chunking + contextual chunk headers" must be built. Reality:

- `dnd-app/src/main/ai/chunk-builder.ts` already implements heading-tree chunking: `parseMarkdownStructure` (:89-143) builds a level-aware heading tree with full `headingPath` breadcrumbs; `flattenToChunks` (:187-224) emits one chunk per heading node (parents with >100 chars of own prose also chunked), splitting nodes over `MAX_CHUNK_TOKENS = 4000` (:8, `CHARS_PER_TOKEN = 4` :9) at paragraph boundaries via `splitAtParagraphs` (:145-169) with `(Part N)` heading suffixes.
- Contextual chunk headers already exist **at prompt-injection time**: `context-builder.ts formatChunks` (:362-369) renders `--- ${chunk.source}: ${chunk.headingPath.join(' > ')} ---` above each chunk's content. They also already participate in **lexical** retrieval (heading + headingPath tokens are indexed and ×2-boosted, F1).
- What's genuinely missing: a breadcrumb-prefixed representation for the (new) embedding side — the "contextual chunk headers" of the recommendation literature apply to what gets *embedded*. 24C defines `embeddingText(chunk) = "${source} > ${headingPath.join(' > ')}\n${content}"` for exactly this.
- One real chunker bug found during verification: `parseMarkdownStructure` **drops any content that appears before the first heading** — `flushContent()` (:95-100) only writes into `stack[stack.length-1]` and the stack is empty until the first heading line. Irrelevant for the rulebooks (every file starts with a heading) but fatal for campaign documents (free-text lore/journal entries usually have NO headings). 24D wraps every campaign doc in a synthetic `# ${title}` heading before parsing to guarantee capture.

Re-verify:
```bash
grep -n "headingPath.join(' > ')" dnd-app/src/main/ai/context-builder.ts
node -e "const{parseMarkdownStructure}=0;" # structural check instead:
grep -n "if (stack.length > 0 && currentContent.length > 0)" dnd-app/src/main/ai/chunk-builder.ts
```

### F3 — Chunk IDs are positional (`phb-101`) and only stable per index build; PHASE-07 assigned the fix here

- `flattenToChunks` assigns `${idPrefix}-${counter}` with a build-order counter (`chunk-builder.ts:188-218`; same in `scripts/build/build-chunk-index.mjs:165-222`). Any upstream markdown edit shifts every subsequent ID. PHASE-07's plan (Dependencies section) explicitly states PHASE-24 "owns making chunk ids content-stable".
- Bundled index: `dnd-app/resources/chunk-index.json` (5.2 MB, tracked in git) — `version: 1`, **5,383 chunks** (PHB 1,655 / DMG 1,454 / MM 2,274), avg `tokenEstimate` 151, max 2,423. Sample: `{ id: "phb-101", source: "PHB", heading: "Mounted Combat", headingPath: ["Chapter 1: Playing the Game", "Combat", "Mounted Combat"] }`.
- Load order: `loadChunkIndex()` (`chunk-builder.ts:302-324`) prefers the bundled `resources/chunk-index.json` (packaged: `getResourcePath('chunk-index.json')`), falls back to `userData/chunk-index.json`. `initFromSavedConfig()` (`ai-service.ts:405-411`) calls `loadIndex()` at app start; `buildIndex()` (`ai-service.ts:432-442`) is dev-only (`app.isPackaged` throws). IPC: `AI_BUILD_INDEX` / `AI_LOAD_INDEX` / `AI_GET_CHUNK_COUNT` (`ipc-channels.ts:63-65`), handlers at `ai-handlers.ts:177-202`, progress event `AI_INDEX_PROGRESS` (:135) → preload `onIndexProgress` (`preload/index.ts:201`).
- Rebuild prerequisite: `build-chunk-index.mjs` resolves `5.5e References/` inside or beside `dnd-app/` (:226-232) and **exits 0 keeping the tracked index when absent** (:240-247 — the CI path). Verified absent in this tree — BUT the identical book markdown IS tracked at `bmo/pi/data/5e-references/{PHB2024/markdown,DMG2024/markdown,MM2025/Markdown}` (matches the script's `SOURCES` dir layout exactly, including the capital-M `MM2025/Markdown`). 24A adds that path as a third fallback so the v2 index can actually be rebuilt in this repo.

Re-verify:
```bash
node -e "const i=require('./dnd-app/resources/chunk-index.json');console.log(i.version,i.chunks.length,i.chunks[100].id)"
ls "dnd-app/5.5e References" "5.5e References" 2>&1 | head -2   # both absent
ls bmo/pi/data/5e-references/PHB2024/markdown | head -3          # present, tracked
```

### F4 — Retrieval call site, budget, and the `BuiltContext` contract

- `buildContext` (`context-builder.ts:164-326`, post-07 returns `BuiltContext`) section 1 (:193-203): `searchEngine.search(query, 5)` → `formatChunks` → `[CONTEXT: Rulebook Excerpts]` trimmed to the retrieved-chunks budget (raw `token-budgets.json` value 8000; post-01C the effective value comes from `getEffectiveBudgets().retrievedChunks`). The breakdown records `rulebookChunks` tokens. The engine instance is module-global via `setSearchEngine`/`getSearchEngine` (:144-153).
- `ContextTokenBreakdown` (`token-budget.ts:8-19`): `{ rulebookChunks, srdData, characterData, campaignData, creatures, gameState, memory, total, truncated? }` — no campaign-docs key.
- `src/main/data/token-budgets.json`: `retrievedChunks: 8000`, `campaignData: 2000`; no `campaignDocs` key. (Post-01C the file also carries the corrected `systemPrompt`/`total`; re-read it before editing.)
- Five chunks × avg 151 tokens ≈ 800–1,200 tokens typical — far under the 8,000 budget, so raising hybrid top-K to 8 stays comfortably inside it.

Re-verify:
```bash
grep -n "searchEngine.search(query" dnd-app/src/main/ai/context-builder.ts
cat dnd-app/src/main/data/token-budgets.json
grep -n "campaignDocs" dnd-app/src/main/ai/token-budget.ts   # expect: no hits before 24D
```

### F5 — Campaign content exists in well-defined shapes and (almost) none of it reaches AI context

- **Lore**: `Campaign.lore?: LoreEntry[]` (`src/renderer/src/types/campaign.ts:112`, interface :52-58 — `{ id, title, content, category: 'world'|'faction'|'location'|'item'|'other', isVisibleToPlayers, createdAt }`). Currently injected **in full** into `[CAMPAIGN DATA]` by `formatCampaignForContext` (`src/main/ai/campaign-context.ts:62-76`) — then blind-trimmed by the `campaignData` budget (2,000 tokens), so large lore sets get truncated wholesale with no relevance ordering.
- **Session journal**: `Campaign.journal: SessionJournal` (`campaign.ts:119`, interfaces :235-248 — entries `{ id, sessionNumber, date, title, content, isPrivate, authorId, createdAt }`). Only the 5 most recent entries, truncated to **300 chars each**, are injected (`campaign-context.ts:244-260`). Older/longer journal content is invisible to the AI.
- **Handouts**: `SavedGameState.handouts: Handout[]` (`campaign.ts:256-276`; `Handout` in `src/renderer/src/types/game-state.ts:242-251` — `{ id, title, contentType: 'image'|'text', content, visibility: 'all'|'dm-only', createdAt, pages?: HandoutPage[] }`, `HandoutPage` :234-240 with per-page `contentType`/`content`/`label`/`dmOnly`). **Never reach AI context**: `grep -rn "handout" dnd-app/src/main --include='*.ts'` hits only the `share_handout` DM action (creation path, `ai-schemas.ts:1248`, `dm-actions.ts:474-475`) — nothing reads them back.
- **Shared journal**: `SavedGameState.sharedJournal` (`campaign.ts:278`; `SharedJournalEntry` in `game-state.ts:252-261` — `{ id, title, content, authorPeerId, authorName, visibility: 'public'|'private', createdAt, updatedAt }`, store slice `src/renderer/src/stores/game/journal-slice.ts`). Never reaches AI context.
- **Persistence path (main-process readable)**: `buildSavableCampaign` (`src/renderer/src/services/io/game-state-saver.ts:8-41`) writes `handouts` (:27) and `sharedJournal` (:30) into `campaign.savedGameState`, persisted as `userData/campaigns/<id>.json` (`src/main/storage/campaign-storage.ts:13-27`). `loadCampaignById` (`src/main/ai/campaign-context.ts:3-9`) returns the full record, so the main process can read all four content types with zero new IPC.

Re-verify:
```bash
grep -n "lore?: LoreEntry\|journal: SessionJournal" dnd-app/src/renderer/src/types/campaign.ts
grep -n "handouts: gs.handouts\|sharedJournal: gs.sharedJournal" dnd-app/src/renderer/src/services/io/game-state-saver.ts
grep -rn "handout" dnd-app/src/main --include='*.ts' | grep -v test    # only share_handout action
```

### F6 — Config/IPC plumbing pattern this phase extends

- `AiConfigSchema` (`src/shared/ipc-schemas.ts:5-13`) zod-parses `AI_CONFIGURE` payloads (`src/main/ipc/ai-handlers.ts:108-122`); persisted by `ai-service.ts configure()` (atomic write) and read by `getConfig()`/`initFromSavedConfig()`. Renderer chain: `Campaign.aiDm` (`AiDmConfig`, `src/renderer/src/types/campaign.ts:63-74`) → `configureAiFromCampaign` (`src/renderer/src/services/ai-dm-routing.ts:27-48`) → preload `window.api.ai.configure` (`AiConfigData`, `src/preload/index.d.ts`). PHASE-01B added `contextLength` through this exact chain — 24C's two retrieval fields copy that recipe.
- IPC channel constants live in `src/shared/ipc-channels.ts` (AI invoke channels :58-129, AI event channels :132-140); main-side handlers use the `handle()` wrapper and `sendToWindow(win, channel, payload)` with the destroyed-window guard (`ai-handlers.ts:77-83`).
- i18n: keys under `campaign.aiProviderSetup.*` in `src/renderer/src/i18n/locales/en.json` + `es.json`; regenerate the key union with `npm run i18n:gen-keys` (`scripts/i18n/gen-key-union.mjs`).
- Main-process test convention: `vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp/test'), getAppPath: vi.fn(() => '/app') } }))` (see `chunk-builder.test.ts:1-21`), `vi.mock('../log')`, and `vi.stubGlobal('fetch', …)` for HTTP.

### F7 — BMO carries a parallel engine with a real port drift (negative IDF) and zero tests

- `bmo/pi/services/rag_search.py` (485 lines) — docstring: "Ported from VTT's TypeScript search-engine.ts, keyword-extractor.ts, chunk-builder.ts." Multi-domain TF-IDF (`VALID_DOMAINS` :70), same chunker (`parse_markdown_structure` :296-342, `flatten_to_chunks` :387-428, positional ids), same compound-terms list inlined (:16-49), `Chunk` with `domain` + `metadata` extras (:103-147), `save_index`/`load_index` (:467-484).
- **Port drift (bug)**: `_build_index` computes `idf[term] = math.log(doc_count / (1 + df))` (:204) with **no `max(0, …)` clamp** — the TS engine clamps (`search-engine.ts:41-44`) precisely because negative IDF for terms in >half the chunks "actively penalized relevant chunks". The Python engine still has the pre-fix behavior. The BM25 rewrite (24E) removes the bug class entirely (BM25's `ln(1 + (N−df+0.5)/(df+0.5))` is always positive).
- Consumers (all keep working if `search()`'s signature and list-of-dicts return shape are preserved): `agent.py:310-334` (`_get_rag_engine` loads `data/rag_data/chunk-index-{dnd,personal,projects}.json`, tool `rag_search`), `mcp_servers/dnd_data_server.py:46-47,170,236,260` (MCP tool `rag_search`), `bots/discord_dm_bot.py:609-619` (loads dnd index on ready), `:703-705` (DM-chat context, `top_k=3`), `:1527-1532` (`/lookup`-style command), `bots/discord_social_bot.py:1071-1073`.
- Prebuilt indexes tracked in-repo: `bmo/pi/data/rag_data/chunk-index-dnd.json` — `version: 1`, **5,383 chunks** (same books), ids like `phb2024-101`; plus anime/games/movies/music indexes built from generated KBs by `services/build_rag_indexes.py` (writes to `~/home-lab/bmo/pi/data/rag_data` — Pi-absolute paths; do NOT run it from the worktree, the load-time ID migration in 24E covers old files).
- No test file: `ls bmo/pi/tests | grep -i rag` → empty. `bmo/pi/tests/conftest.py` mocks Pi hardware so pure-Python service tests run anywhere.

Re-verify:
```bash
grep -n "math.log(doc_count / (1 + df))" bmo/pi/services/rag_search.py   # no clamp
grep -rn "from services.rag_search import" bmo/pi --include='*.py'
python3 -c "import json;d=json.load(open('bmo/pi/data/rag_data/chunk-index-dnd.json'));print(d['version'],len(d['chunks']),d['chunks'][100]['id'])"
```

### F8 — Citation correction: RPGX AI Librarian is deprecated

The audit's source for the campaign-content pattern, `https://foundryvtt.com/packages/rpgx-ai-librarian`, now reads "This module is no longer supported or needed and has been replaced by the new RPGX AI Assistant module" (verified 2026-06-10). Use `https://foundryvtt.com/packages/rpgx-ai-assistant` as the living citation; the pattern (ingest journals/handouts/notes so the AI answers from campaign documents) is unchanged.

## Sub-phases

### 24A — Content-stable chunk IDs (index v2) + rebuildable bundled index

**Objective:** chunk IDs become deterministic content hashes so PHASE-07's `contextChunkIds` provenance survives index rebuilds; the bundled index is regenerated as v2 from the in-repo book markdown.

**Files:** `src/main/ai/chunk-builder.ts`, `src/main/ai/chunk-builder.test.ts`, `src/main/ai/types.ts`, `scripts/build/build-chunk-index.mjs`, `resources/chunk-index.json` (regenerated).

**Steps:**

1. `types.ts`: bump the doc comment on `ChunkIndex.version` (no type change — it's `number`) noting `2 = content-stable ids`. Add to `Chunk.id`'s JSDoc: "Content-stable: `<source-lowercase>-<sha256(source\0headingPath\0content) first 16 hex>`; deduplicated with a `-2`, `-3` suffix on (rare) identical chunks."
2. `chunk-builder.ts`:
   - Add and export `stableChunkId(source: string, headingPath: string[], content: string): string` using `node:crypto` `createHash('sha256').update([source, ...headingPath, content].join(' ')).digest('hex').slice(0, 16)`, returning `${source.toLowerCase()}-${hash}`.
   - `flattenToChunks`: replace the positional `${idPrefix}-${counter}` with `stableChunkId(source, node.headingPath, content)`; keep a local `Map<string, number>` to append `-2`/`-3` on duplicate IDs within one build (deterministic by traversal order). Delete the now-unused `counter`/`idPrefix` parameter (update both call sites in `buildChunkIndex`).
   - `buildChunkIndex`: write `version: 2`.
   - `loadChunkIndex`: after JSON.parse, if `index.version < 2`, migrate in place: recompute every `chunk.id` via `stableChunkId(chunk.source, chunk.headingPath, chunk.content)` with the same dedup map, set `version = 2`, and return (no re-write to disk — pure load-time migration so old userData/bundled indexes keep working).
3. `scripts/build/build-chunk-index.mjs`: mirror the same `stableChunkId` (inline `crypto` import — the script can't import TS) and `version: 2`; in `resolve5eReferencesFromDndApp`, add a third fallback `join(dndAppRoot, '..', 'bmo', 'pi', 'data', '5e-references')` (the tracked book markdown verified in F3) before the CI keep-tracked-index branch.
4. Regenerate: `cd dnd-app && npm run build:index` — expect "Done — 5383 chunks indexed" (count must be **exactly 5,383**; the source markdown is byte-identical to what produced the v1 index). Spot-check: `node -e "const i=require('./resources/chunk-index.json'); console.log(i.version, i.chunks.length, i.chunks[100].id)"` → `2 5383 phb-<16hex>`.
5. Tests (`chunk-builder.test.ts`): `stableChunkId` determinism (same inputs → same id; changed content → changed id); duplicate-content dedup suffixes; `loadChunkIndex` v1→v2 migration (feed a mocked v1 JSON via the existing `readFileSync` mock, assert ids are rewritten and version is 2); v2 passthrough (no rewrite).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/chunk-builder.test.ts src/main/ai/search-engine.test.ts`.

**Acceptance:** bundled index is v2 with hash IDs and 5,383 chunks; loading a v1 index yields identical IDs to a fresh v2 build of the same markdown; `npm run build:index` works in this repo (bmo fallback) and still no-ops gracefully on CI runners if the bmo path were absent.

### 24B — Okapi BM25 scoring in `SearchEngine` (replaces TF-IDF; new default)

**Objective:** rank with BM25 (term-frequency saturation + document-length normalization) instead of length-normalized TF-IDF — the standard lexical fix for exact-match-shaped 5e queries. Deterministic, dependency-free, same public API.

**Files:** `src/main/ai/search-engine.ts`, `src/main/ai/search-engine.test.ts`.

**Steps:**

1. Export constants `BM25_K1 = 1.5` and `BM25_B = 0.75` (the canonical defaults; see Research notes).
2. Rework `buildIndex()`: store **raw** term counts per chunk (drop the `/= len` normalization), per-chunk token length `docLens: number[]`, corpus `avgDocLen`, and BM25 IDF `idf(term) = Math.log(1 + (N - df + 0.5) / (df + 0.5))` (always > 0 — delete the `Math.max(0, …)` clamp and its comment; the formula subsumes it). Keep the `headingTerms` sets.
3. Rework `search()` scoring per term:
   ```ts
   const tf = rawTf[term] ?? 0
   const norm = tf > 0 ? (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + (BM25_B * docLens[i]) / avgDocLen)) : 0
   let termScore = idf * norm
   if (headingSet.has(term)) termScore *= 2   // preserve existing heading boost
   ```
   Keep query expansion (`extractKeywords` + subword `tokenize`), the `score > 0` filter, `topK` default 5, and the `ScoredChunk` return shape unchanged.
4. Add `getChunkById(id: string): Chunk | undefined` backed by a `Map` built in `load()` (24C/24D need id→chunk resolution for fusion and provenance).
5. Tests: keep all existing assertions passing (they assert relative relevance, which BM25 preserves); add — (a) length normalization: two chunks with one occurrence of a query term, one 20 tokens and one 2,000 tokens of filler → short chunk scores higher; (b) TF saturation: 50 repetitions of a term scores < 50× a single occurrence (compute both, assert ratio < 10); (c) compound-term ranking: corpus with an "Opportunity Attacks" chunk and decoys mentioning "attack" → query "opportunity attack" ranks it first; (d) ubiquitous term (present in every chunk) contributes > 0 but does not flip an otherwise-clear ranking; (e) `getChunkById` round-trip.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/search-engine.test.ts src/main/ai/context-builder.test.ts`.

**Acceptance:** all SearchEngine tests green including the five new ones; no public-API change (`context-builder.ts` compiles untouched).

### 24C — Opt-in embedding layer + BM25⊕vector Reciprocal Rank Fusion (Ollama `/api/embed`)

**Objective:** when the user opts in (off by default) and the Ollama provider is configured, embed all rulebook chunks once with a local embedding model, then fuse vector and BM25 rankings with RRF (k = 60) at query time. Any failure (model missing, endpoint down, store stale) degrades silently to today's BM25-only path.

**Files:** new `src/main/ai/embedding-client.ts` + `.test.ts`; new `src/main/ai/vector-store.ts` + `.test.ts`; new `src/main/ai/embedding-index.ts` + `.test.ts`; new `src/main/ai/hybrid-search.ts` + `.test.ts`; `src/main/ai/types.ts`; `src/main/ai/ai-service.ts`; `src/main/ai/context-builder.ts`; `src/shared/ipc-schemas.ts`; `src/shared/ipc-channels.ts`; `src/main/ipc/ai-handlers.ts`; `src/preload/index.ts`; `src/preload/index.d.ts`; `src/renderer/src/types/campaign.ts`; `src/renderer/src/services/ai-dm-routing.ts`; `src/renderer/src/components/campaign/AiProviderSetup.tsx` (+ its test); `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` (+ its test); `src/renderer/src/i18n/locales/en.json`, `es.json` (+ `npm run i18n:gen-keys`).

**Steps:**

1. **`embedding-client.ts`** (leaf module; imports only `./types`):
   - `export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text'`.
   - `export const EMBEDDING_MODEL_PREFIXES: Record<string, { document: string; query: string }> = { 'nomic-embed-text': { document: 'search_document: ', query: 'search_query: ' } }` with a `prefixesFor(model)` helper (prefix-match on the base name before `:`, default `{ document: '', query: '' }`) — nomic v1.5 was trained with task prefixes; Ollama does not add them (Research notes).
   - `export async function embedTexts(model: string, inputs: string[], baseUrl: string, timeoutMs = 120_000): Promise<number[][]>` — `POST ${baseUrl}/api/embed` body `{ model, input: inputs, truncate: true, options: { num_ctx: 8192 }, keep_alive: '60m' }`, `AbortSignal.timeout(timeoutMs)`; on 404 throw `Model "<model>" is not installed on Ollama. Install it with: ollama pull <model>` (mirrors `ollamaHttpError`); parse `{ embeddings: number[][] }`, throw if length mismatch. The `num_ctx: 8192` is required: the nomic Ollama card defaults to a 2k window while rulebook chunks reach 2,423 estimated tokens (F3) — without it long chunks get silently truncated at embed time. `/api/embed` returns L2-normalized vectors, so similarity = dot product.
   - `export async function embedQuery(model, text, baseUrl): Promise<number[]>` — single input, `prefixesFor(model).query + text`, 10s timeout.
2. **`vector-store.ts`**: persistence + similarity over a flat matrix.
   - Files under `join(app.getPath('userData'), 'rules-embeddings')`: `meta.json` (`{ version: 1, model, dims, indexFingerprint, ids: string[] }`) + `vectors.bin` (concatenated `Float32Array`, row order = `ids`).
   - `computeIndexFingerprint(index: ChunkIndex): string` = sha256 hex of `index.chunks.map(c => c.id).join('\n')` (post-24A IDs are content hashes, so the fingerprint tracks content).
   - `saveVectorStore(meta, vectors: Float32Array)`, `loadVectorStore(expectedFingerprint: string, model: string): { ids: string[]; dims: number; vectors: Float32Array } | null` (null on missing/fingerprint-or-model mismatch/size mismatch).
   - `searchVectors(store, queryVec: number[], topK: number): Array<{ id: string; score: number }>` — dot product per row, partial-sort topK.
3. **`embedding-index.ts`** (job manager; module state like `ai-service`'s):
   - State: `type EmbedIndexState = { status: 'disabled' | 'idle' | 'building' | 'ready' | 'error'; model?: string; chunkCount?: number; percent?: number; error?: string }`; `getEmbedIndexStatus()`.
   - `ensureEmbeddingIndex(index: ChunkIndex, model: string, baseUrl: string, onProgress?: (percent: number) => void): Promise<void>` — try `loadVectorStore`; on hit set `ready`; on miss embed `embeddingText(chunk) = \`${chunk.source} > ${chunk.headingPath.join(' > ')}\n${chunk.content}\`` with the document prefix, in batches of 32 (5,383 chunks → 169 requests; report percent per batch), then `saveVectorStore`. Single-flight guard (a second call while `building` returns the in-flight promise). Errors → `status: 'error'` + `logToFile('WARN', …)`, never throw to callers.
   - `getActiveVectorStore()` — the loaded store or null.
   - `clearEmbeddingIndex()` for model changes (delete files, reset state).
4. **`hybrid-search.ts`**:
   - `export const RRF_K = 60`, `export const HYBRID_TOP_K = 8`, `export const FUSION_POOL = 50`.
   - `export async function searchRules(query: string, engine: SearchEngine, opts: { embeddingsEnabled: boolean; model: string; baseUrl: string }): Promise<ScoredChunk[]>`:
     - BM25 list: `engine.search(query, FUSION_POOL)`.
     - If `!opts.embeddingsEnabled` or `getActiveVectorStore() === null` → return `bm25.slice(0, 5)` (**byte-identical to today's behavior** — the off path is the regression guard).
     - Else `embedQuery` (10s timeout; on throw → log + BM25-only fallback), `searchVectors(store, qv, FUSION_POOL)`, fuse: `rrf(id) = Σ_lists 1/(RRF_K + rank)` (rank 1-based), sort desc, resolve ids via `engine.getChunkById`, return top `HYBRID_TOP_K` as `ScoredChunk` (score = RRF score).
5. **Config plumbing** (copy PHASE-01B's `contextLength` recipe end-to-end):
   - `types.ts` `AiConfig` += `ragEmbeddingsEnabled?: boolean` (JSDoc: "Opt-in semantic rules search. Absent/false = lexical-only (today's behavior).") and `ragEmbeddingModel?: string` ("Ollama embedding model id; default nomic-embed-text").
   - `ipc-schemas.ts` `AiConfigSchema` += `ragEmbeddingsEnabled: z.boolean().optional()`, `ragEmbeddingModel: z.string().min(1).max(100).optional()`.
   - `ai-service.ts`: extend `currentConfig` + `configure()` persistence + `getConfig()`; in `configure()` and `initFromSavedConfig()`, after the index is loaded, if `provider === 'ollama' && ragEmbeddingsEnabled` fire-and-forget `ensureEmbeddingIndex(loadedIndex, ragEmbeddingModel ?? DEFAULT_EMBEDDING_MODEL, getOllamaUrl(), p => sendEmbedProgress(p))`; if the model differs from the stored meta's, `clearEmbeddingIndex()` first. Keep a module accessor `getRetrievalOpts()` for context-builder.
   - `preload/index.d.ts` `AiConfigData` += both fields; `renderer/types/campaign.ts` `AiDmConfig` += both; `ai-dm-routing.ts configureAiFromCampaign` passes both.
6. **IPC**: `ipc-channels.ts` += `AI_EMBED_INDEX_STATUS: 'ai:embed-index-status'`, `AI_EMBED_INDEX_REBUILD: 'ai:embed-index-rebuild'` (invoke) and `AI_EMBED_INDEX_PROGRESS: 'ai:embed-index-progress'` (event). Handlers in `ai-handlers.ts` next to the existing index block (F3): status returns `getEmbedIndexStatus()`; rebuild calls `clearEmbeddingIndex()` then `ensureEmbeddingIndex(…)` (no-op `{ success: false, error }` when embeddings are disabled or provider isn't ollama). Progress uses the existing `sendToWindow` guard. Preload: `getEmbedIndexStatus()`, `rebuildEmbedIndex()`, `onEmbedIndexProgress(cb)` (+ `index.d.ts` types, mirroring `onIndexProgress`).
7. **`context-builder.ts`**: replace the section-1 `searchEngine.search(query, 5)` call with `await searchRules(query, searchEngine, getRetrievalOpts())` (import from `./hybrid-search`; `buildContext` is already async). Chunk-id provenance keeps flowing through the post-07 `BuiltContext.chunkIds` collection unchanged (ids come from the returned `ScoredChunk[]`).
8. **Renderer UI** (`AiProviderSetup.tsx`, inside the Ollama-provider branch — re-anchor on the post-PHASE-10 file): an "Advanced retrieval" group with (a) checkbox `campaign.aiProviderSetup.semanticSearch` ("Semantic rules search (experimental) — requires a local embedding model"), default **unchecked**; (b) when checked, a model text input defaulting to `nomic-embed-text` with helper text `campaign.aiProviderSetup.semanticSearchModelHint` ("Pulled automatically? No — run: ollama pull nomic-embed-text"); (c) a status row driven by `getEmbedIndexStatus()` + `onEmbedIndexProgress` (`building 42%` / `ready — 5,383 chunks` / error text) and a "Rebuild" button calling `rebuildEmbedIndex()`. `AiDmCard.tsx`: thread the two fields through its local config state and the saved `aiDm` object (anchor: the existing `claudeApiKey`/`ollamaUrl` handling). Add the en/es keys; run `npm run i18n:gen-keys`.
9. **Tests**: `embedding-client.test.ts` (stubbed fetch: body shape incl. `truncate`/`options.num_ctx`/prefixes; 404 → actionable error; length-mismatch throw). `vector-store.test.ts` (electron+fs mocked: save/load round-trip; fingerprint mismatch → null; dot-product ordering with hand-built normalized vectors). `embedding-index.test.ts` (cache-hit path skips embedding; build path batches and saves; error path sets status without throwing; single-flight). `hybrid-search.test.ts` (disabled → exactly `engine.search(q,50).slice(0,5)`; RRF math on fixed ranked lists — a doc ranked 1st+3rd beats 2nd+4th; embed failure falls back to BM25-only; topK=8 cap). Renderer: extend `AiProviderSetup` tests for the toggle gating + status rendering; `AiDmCard` test asserts the fields persist into the saved `aiDm`.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/main/ai/embedding-client.test.ts src/main/ai/vector-store.test.ts src/main/ai/embedding-index.test.ts src/main/ai/hybrid-search.test.ts src/main/ai/context-builder.test.ts`.

**Acceptance:** with both new config fields absent, every retrieval result is byte-identical to 24B's BM25-only output (assert in hybrid-search test); enabling the toggle with a mocked embed endpoint produces an RRF-fused top-8; all failure modes (no model, endpoint down, stale store) silently yield BM25-only with a WARN log; config round-trips renderer→zod→disk.

### 24D — Campaign-document indexing (lore / journal / handouts / shared journal) + retrieval block

**Objective:** the AI DM retrieves relevant excerpts from the campaign's own documents into a budgeted `[CONTEXT: Campaign Documents]` block. BM25-only (campaign queries are proper-noun/exact-match-shaped; no embedding cost per campaign). Default-on for **new** configs via a visible pre-checked checkbox; absent in previously-saved configs = off (no silent behavior change for existing campaigns).

**Files:** new `src/main/ai/campaign-docs.ts` + `.test.ts`; `src/main/ai/chunk-builder.ts` (export helpers); `src/main/ai/types.ts`; `src/main/ai/context-builder.ts` + `.test.ts`; `src/main/data/token-budgets.json`; `src/main/ai/token-budget.ts` + `.test.ts`; `src/main/ai/ai-service.ts`; `src/shared/ipc-schemas.ts`; `src/preload/index.d.ts`; `src/renderer/src/types/campaign.ts`; `src/renderer/src/services/ai-dm-routing.ts`; `src/renderer/src/components/campaign/AiProviderSetup.tsx`; `src/renderer/src/pages/campaign-detail/AiDmCard.tsx`; the PHASE-14 `ContextInspectorPanel` + its test + en/es locales.

**Steps:**

1. **Types** (`types.ts`): `export type ChunkSourceTag = BookSource | 'CAMPAIGN'`; change `Chunk.source` to `ChunkSourceTag`. Update `chunk-builder.ts` signatures (`createChunk`, `flattenToChunks`) from `BookSource` to `ChunkSourceTag`; the book `SOURCES` array keeps `BookSource`, so book builds are unaffected (`ChunkSource.book` stays `BookSource`). Run tsc — `formatChunks` and the SearchEngine are source-agnostic (verified F1/F2).
2. **`chunk-builder.ts`**: export `parseMarkdownStructure` and `flattenToChunks` (currently module-private), or add a thin exported `chunksFromText(sourceTag: ChunkSourceTag, docTitle: string, text: string): Chunk[]` that wraps `parseMarkdownStructure(\`# ${docTitle}\n\n${text}\`)` → `flattenToChunks` — the synthetic `# title` wrapper is REQUIRED because pre-heading content is dropped by the parser (F2 bug note). Prefer the wrapper (keeps privates private). Lower the chunker's minimum-content threshold path NOT at all — entries under 50 chars are deliberately skipped (same rule as books).
3. **`campaign-docs.ts`**:
   - `collectCampaignDocs(campaign: Record<string, unknown>): Array<{ docType: 'lore' | 'journal' | 'handout' | 'shared-journal'; title: string; text: string }>` with the visibility policy (the AI DM acts as the DM):
     - `campaign.lore[]` — ALL entries (`title`, `content`, prepend `[${category}] ` to the title).
     - `campaign.journal.entries[]` — ALL entries (DM-owned session record; `isPrivate` entries included — they are DM notes); title `Session ${sessionNumber}: ${title}`.
     - `campaign.savedGameState.handouts[]` — text content only: top-level `contentType === 'text'` content, plus `pages[]` entries with `contentType === 'text'` (label or `Page N` appended to the title). **Never** index `'image'` content (base64 blobs would poison the index). Include `dm-only` handouts (DM knowledge).
     - `campaign.savedGameState.sharedJournal[]` — ONLY `visibility === 'public'` entries (private player notes are author-only by design; do not expose them to the AI), title suffixed with `— ${authorName}`.
   - `buildCampaignDocEngine(campaignId: string, campaign): SearchEngine` — `chunksFromText('CAMPAIGN', title, text)` per doc, with `headingPath` prefixed by the docType (e.g. `['lore', '[world] The Sundering', …]` — implement by passing `\`# ${title}\`` and then prepending `docType` to each resulting chunk's `headingPath` so `formatChunks` renders `CAMPAIGN: lore > [world] The Sundering > …`); chunk IDs from `stableChunkId('CAMPAIGN', headingPath, content)`.
   - Per-campaign cache: `Map<string, { cacheKey: string; engine: SearchEngine; chunkCount: number }>` where `cacheKey = String(campaign.updatedAt ?? '') + ':' + String((campaign.savedGameState as { lastSaveTimestamp?: number } | undefined)?.lastSaveTimestamp ?? '')`; rebuild on mismatch. Export `searchCampaignDocs(campaignId, campaign, query, topK = 3): ScoredChunk[]` and `clearCampaignDocCache(campaignId?)` (PHASE-31 reuses the former).
4. **Budget**: `token-budgets.json` += `"campaignDocs": 2000` and recompute `"total"` as the sum of consumed dynamic sections per the post-01C convention (e.g. 21,500 → 23,500 — read the file first, 01C set the exact numbers). `token-budget.ts`: `ContextTokenBreakdown` += `campaignDocs: number`; `EffectiveBudgets` += `campaignDocs`; floors table += `campaignDocs: 200`; the `TOKEN_BUDGETS` literal type += the key. Extend `token-budget.test.ts` scaling arithmetic for the extra section.
5. **`context-builder.ts`**: initialize `breakdown.campaignDocs = 0`; immediately after the rulebook-chunks push (volatile group per 01D), when `campaignId` is set AND `getRetrievalOpts().campaignDocsEnabled`:
   ```ts
   const campaign = await loadCampaignById(campaignId)        // NOTE: reuse the section-4 load — hoist the existing
   // loadCampaignById call above section 1 and share the result between the campaign-docs and campaign-data sections
   const docResults = campaign ? searchCampaignDocs(campaignId, campaign, query, 3) : []
   if (docResults.length > 0) {
     const trimmed = trimTracked(`[CONTEXT: Campaign Documents]\n${formatChunks(docResults)}`, budgets.campaignDocs)
     breakdown.campaignDocs = estimateTokens(trimmed)
     parts.push(trimmed)
     chunkIds.push(...docResults.map((c) => c.id))            // post-07 provenance collection
   }
   ```
   Do NOT modify the existing `[CAMPAIGN DATA]` lore/journal inlining (PHASE-25 owns the dedup policy — Dependencies).
6. **Config plumbing**: `AiConfig`/`AiConfigSchema`/`currentConfig`/`configure()`/`getConfig()`/`AiConfigData`/`AiDmConfig`/`configureAiFromCampaign` += `ragCampaignDocsEnabled: z.boolean().optional()` (absent = **off**). `getRetrievalOpts()` exposes it as `campaignDocsEnabled`. Renderer: checkbox `campaign.aiProviderSetup.campaignDocSearch` ("Let the AI DM search this campaign's lore, journals, and text handouts") — **pre-checked in `AiDmCard`'s initial state for configs that have never been saved** (the `campaign.aiDm == null` branch of its `useState`/effect initializer) and reflecting the saved value otherwise; provider-independent (renders for all providers — it's lexical-only).
7. **Inspector row** (PHASE-14 surface): add the `campaignDocs` row to `ContextInspectorPanel`'s section list with i18n keys (`game.contextInspector.sections.campaignDocs` en: "Campaign documents" / es translation), update its "renders all section rows" test from seven to eight rows.
8. **Tests**: `campaign-docs.test.ts` — collection policy (image handouts excluded; private shared-journal excluded; dm-only handouts + private journal included; lore category prefix; page labels); headingless lore content survives chunking (synthetic-heading regression test); cache hit on same `cacheKey`, rebuild on changed `lastSaveTimestamp`; `searchCampaignDocs` finds a proper noun ("Volo's debt to the Zhentarim" retrieved for query "Volo Zhentarim"). `context-builder.test.ts` — with a mocked campaign containing lore + the flag enabled: block present, breakdown field set, chunk ids appended; flag absent → no block, `campaignDocs: 0` (regression guard).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/main/ai/campaign-docs.test.ts src/main/ai/context-builder.test.ts src/main/ai/token-budget.test.ts`.

**Acceptance:** with the flag off (all existing configs), `buildContext` output is unchanged (test-asserted); with it on, campaign-doc excerpts appear under their own budget with breadcrumbs and provenance ids; no new fs path is derived from `campaignId` (storage goes through `loadCampaignById` only).

### 24E — BMO engine parity: BM25 + stable IDs + first test file

**Objective:** port 24A/24B to `bmo/pi/services/rag_search.py` (fixing the negative-IDF drift), preserving the exact public API every consumer uses (`SearchEngine().load_index_file/load_domain/search/search_multi/get_chunk_count`, list-of-dicts results with `score`), and add `bmo/pi/tests/test_rag_search.py`.

**Files:** `bmo/pi/services/rag_search.py`; new `bmo/pi/tests/test_rag_search.py`.

**Steps:**

1. `stable_chunk_id(source: str, heading_path: list[str], content: str) -> str` using `hashlib.sha256("\x00".join([source, *heading_path, content]).encode()).hexdigest()[:16]`, returning `f"{source.lower()}-{digest}"`; same `-2`/`-3` dedup map in `flatten_to_chunks` (drop the positional counter); `save_index` writes `"version": 2`; `load_index` AND `load_index_file` migrate `version < 2` payloads at load (recompute ids; the tracked `chunk-index-*.json` files stay v1 on disk — do NOT regenerate them from the worktree, `build_rag_indexes.py` writes Pi-absolute paths).
2. BM25 in `_build_index`/`search` mirroring 24B exactly: raw counts, `doc_lens`, `avg_doc_len`, `idf = math.log(1 + (doc_count - df + 0.5) / (df + 0.5))` (replaces the unclamped negative-IDF line :204), `K1 = 1.5`, `B = 0.75` module constants, heading-set ×2 boost preserved, `score > 0` filter, `round(score, 6)` and dict shape unchanged, `search_multi` untouched (it re-sorts merged dicts by `score` — BM25 scores from different domains are roughly comparable; note in a comment that cross-domain score comparison is approximate, same as before).
3. New `bmo/pi/tests/test_rag_search.py` (pure-Python, no hardware; conftest mocks suffice): tokenize/extract_keywords compound-term preservation ("opportunity attack" survives as a phrase); BM25 ranking — compound-term chunk first, length normalization, saturation; **negative-IDF regression test**: a term present in ALL chunks must contribute ≥ 0 to every score (this fails on the old code); stable-id determinism + dedup; v1→v2 load migration via a tmp_path JSON file with positional ids; `search` returns dicts with `score`/`headingPath` keys (consumer contract); domain isolation (`search(domain='dnd')` ignores `personal` chunks).
4. Run `cd bmo/pi && python -m pytest tests/test_rag_search.py -q` — and since Pi code is touched, the end-of-phase gate includes the full `pytest bmo/pi/tests/` per INSTRUCTIONS.md rule 5.

**Cheap checks:** `cd bmo/pi && python -m pytest tests/test_rag_search.py -q`.

**Acceptance:** all consumers' call shapes unchanged (`grep -rn "\.search(" bmo/pi/agent.py bmo/pi/mcp_servers/dnd_data_server.py bmo/pi/bots/discord_dm_bot.py bmo/pi/bots/discord_social_bot.py` — no edits needed in any of them); new test file green; loading the tracked v1 `chunk-index-dnd.json` yields 5,383 chunks with hash ids.

### 24F — Operator documentation + locale parity

**Objective:** document the retrieval stack for operators and future phases; ensure en/es locale parity for every key added in 24C/24D.

**Files:** new `dnd-app/docs/RULES-RETRIEVAL.md`; `src/renderer/src/i18n/locales/en.json` / `es.json` (verification pass); `dnd-app/docs/OLLAMA-TUNING.md` (one cross-reference line, created by PHASE-01E — append, don't restructure).

**Steps:**

1. `RULES-RETRIEVAL.md` covering: the v2 chunk-index format + stable-ID recipe (and that v1 indexes migrate at load); BM25 parameters (k1 = 1.5, b = 0.75, heading ×2) and why TF-IDF was replaced; the opt-in embedding layer — how to enable (checkbox + `ollama pull nomic-embed-text`), where vectors live (`userData/rules-embeddings/`), build cost (~169 batched requests for 5,383 chunks; minutes on CPU, seconds on GPU), the RRF fusion (k = 60, pools of 50, top-8) and the silent BM25-only fallback ladder; campaign-document indexing — what is/isn't indexed (visibility policy table from 24D step 3, image handouts never), the per-campaign cache key, the `campaignDocs` token budget; provenance (`contextChunkIds`, PHASE-14 inspector); the BMO twin engine and its parity rules (same hash recipe, same BM25 constants — change both or neither). Cite the source URLs from Research notes.
2. Append to `OLLAMA-TUNING.md`: one paragraph noting the embedding model is a SECOND Ollama runner (its `keep_alive`/memory is independent of the chat model; budget ~0.5 GB for nomic-embed-text) with a pointer to `RULES-RETRIEVAL.md`.
3. Locale parity check: `node -e` diff of the key sets touched under `campaign.aiProviderSetup.*` and `game.contextInspector.*` in en vs es; run `npm run i18n:gen-keys` and confirm a clean `git status` on `generated-keys.ts` (or commit the regenerated union).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json` (generated-keys union) and a grep that every new `t('…')` key exists in both locales.

**Acceptance:** docs exist with all sources cited; no missing-locale-key drift; generated key union committed.

## Research notes

- **BM25 over TF-IDF for exact-match-shaped queries.** Okapi BM25's two improvements over plain TF-IDF — term-frequency saturation (k1) and document-length normalization (b) — are exactly what 5e rule lookups need: a short "Grappled" condition chunk should not lose to a long chapter chunk that happens to repeat "attack" many times. Canonical defaults k1 ∈ [1.2, 2.0] (1.5 chosen), b = 0.75. Hand-rolled (~40 lines) rather than a dependency (`minisearch`/`lunr`/`okapibm25`): the existing engine is already custom, the corpus is static and small (5,383 docs), and the repo avoids new deps for trivially-implementable math. Sources: https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026, https://dev.to/vf-insights/dense-vs-sparse-retrieval-mastering-faiss-bm25-and-hybrid-search-4kb1.
- **Reciprocal Rank Fusion (k = 60).** RRF fuses ranked lists using only rank positions — no score normalization needed between BM25 scores and cosine similarities (incommensurable scales). `score(d) = Σ 1/(k + rank_i(d))`; k = 60 is the standard default (Elasticsearch, Azure AI Search) from the original 2009 SIGIR paper; lower k weights top ranks harder. Best practice: apply identical filters to both sub-searches and fuse from pools larger than the final cut (50 → 8 here). Sources: https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking, https://avchauzov.github.io/blog/2025/hybrid-retrieval-rrf-rank-fusion/, https://glaforge.dev/posts/2026/02/10/advanced-rag-understanding-reciprocal-rank-fusion-in-hybrid-search/.
- **Contextual chunk headers.** Anthropic's contextual-retrieval results: contextual embeddings cut retrieval failures 35% (5.7% → 3.7%), + contextual BM25 49%, + reranking 67%; BM25 specifically wins on exact identifiers/technical terms (their "Error code TS-999" example ≈ our spell/condition names). Their context is LLM-generated (50–100 tokens/chunk — costly); the deterministic cousin used here prepends the document's own heading breadcrumb to the embedded text, which captures most of the benefit for heading-structured corpora at zero cost. The lexical side already indexes headings (F2); 24C extends the same breadcrumb to the embedding representation. They also found top-20 retrieval most performant of {5, 10, 20}; this plan uses 8 hybrid (budget-bounded; 20 × 151 avg tokens ≈ 3k tokens would crowd the 8k chunk budget alongside SRD/monster blocks on small local windows). Sources: https://www.anthropic.com/news/contextual-retrieval, https://dev.to/kartikeyraj/free-contextual-chunk-headers-heading-aware-chunking-for-hybrid-retrieval-560.
- **Ollama embeddings API.** `POST /api/embed` accepts `{ model, input: string | string[], truncate (default true), dimensions, keep_alive, options (incl. num_ctx) }`, returns `{ embeddings: number[][], prompt_eval_count, … }`; vectors are **L2-normalized**, so cosine ≡ dot product. Batch input in one request is supported and is how the 169-batch build stays fast. Sources: https://docs.ollama.com/api/embed, https://docs.ollama.com/capabilities/embeddings.
- **Embedding model choice.** Default `nomic-embed-text` (v1.5): 137M params, 274 MB, 768 dims, MTEB 62.28, runs CPU-only — the proven small local default. Caveats baked into 24C: (a) its Ollama card ships a **2k default context window** while its native window is 8k and our max chunk is ~2.4k estimated tokens → pass `options: { num_ctx: 8192 }` on embed calls; (b) it was trained with task prefixes (`search_document:` / `search_query:`) that Ollama does not auto-apply → the client adds them (the Ollama model card omits this; the upstream Nomic docs require it). The model field stays user-editable: `qwen3-embedding:0.6b` (1024 dims, MTEB 64.33) is the quality bump, `embeddinggemma` (768 dims) the Google option — the per-model prefix table defaults to no prefixes for unknown models, and the vector store records the model so a swap forces a rebuild. Sources: https://www.morphllm.com/ollama-embedding-models, https://ollama.com/library/nomic-embed-text, https://ollama.com/blog/embedding-models.
- **Campaign-content indexing prior art.** Foundry's RPGX line ships the "AI answers from the campaign's journals/handouts" pattern; the original AI Librarian module is deprecated into RPGX AI Assistant (F8). Friends & Fables exposes player-authored lore to its GM via dynamic context (PHASE-25 territory; 24D supplies the retrieval substrate). Sources: https://foundryvtt.com/packages/rpgx-ai-assistant, https://foundryvtt.com/packages/rpgx-ai-librarian (deprecation notice), https://fables.gg/.
- **Alternatives considered.** (a) sqlite-vec / LanceDB / vectra for the vector store — rejected: 5,383 × 768 float32 ≈ 16.5 MB fits trivially in RAM as one `Float32Array`; brute-force dot product over 5k rows is sub-millisecond; a DB adds a native dep to the Electron main process for nothing. (b) Cloud embeddings (OpenAI/Gemini) — rejected for this phase: the AI DM must work fully offline with Ollama; cloud providers can ride the same `embedTexts` interface later if wanted (logged as future work, not built). (c) Embedding campaign docs too — rejected: per-campaign corpora are tiny and proper-noun-heavy (BM25's home turf), and it would couple campaign saves to embedding rebuild churn. (d) LLM-generated chunk context (full Anthropic contextual retrieval) — rejected: 5,383 generation calls per index build on local hardware; the heading-breadcrumb variant is free and the corpus is heading-rich. (e) Replacing the `score > 0` semantic with RRF scores everywhere — kept localized: RRF only applies on the opt-in hybrid path; the default path's scores remain BM25.

## Test plan

- **24A:** `chunk-builder.test.ts` — stable-ID determinism/dedup, v1→v2 load migration, v2 passthrough.
- **24B:** `search-engine.test.ts` — existing suite green unchanged + length-normalization, saturation, compound-term-first, ubiquitous-term-non-negative, `getChunkById`.
- **24C:** new `embedding-client.test.ts`, `vector-store.test.ts`, `embedding-index.test.ts`, `hybrid-search.test.ts` (the disabled-path byte-identity test is the key regression guard); extended `context-builder.test.ts`, `AiProviderSetup` tests, `AiDmCard.test.tsx`.
- **24D:** new `campaign-docs.test.ts` (visibility policy, synthetic-heading capture, cache invalidation, retrieval); extended `context-builder.test.ts` (flag on/off), `token-budget.test.ts` (eighth section), `ContextInspectorPanel` test (eight rows).
- **24E:** new `bmo/pi/tests/test_rag_search.py` (BM25 ranking, negative-IDF regression, stable ids, v1 migration, consumer dict contract, domain isolation).
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run` — **plus** `cd bmo/pi && python -m pytest tests/` because 24E touches Pi code.

## Acceptance criteria

- [ ] Bundled `resources/chunk-index.json` is version 2 with content-stable hash IDs and exactly 5,383 chunks; v1 indexes (userData, BMO's tracked files) migrate identically at load.
- [ ] Default retrieval (no new config set) is BM25-ranked, same API, and `context-builder` output for a fixed fixture changes only by ranking — no schema/shape changes; with `ragEmbeddingsEnabled` absent the hybrid module returns exactly the BM25 top-5.
- [ ] With embeddings opted in (Ollama provider): the vector store builds in the background with progress events, persists with model+fingerprint stamps, fuses via RRF(k=60) to a top-8, and every failure mode falls back to BM25-only with a WARN log — never a user-facing error from retrieval.
- [ ] With `ragCampaignDocsEnabled` on, queries retrieve lore/journal/text-handout/public-shared-journal excerpts into a `[CONTEXT: Campaign Documents]` block under its own `campaignDocs` budget, with breadcrumbs, breakdown accounting, inspector row, and chunk-id provenance; image handouts and private shared-journal entries are never indexed; existing saved configs see zero behavior change.
- [ ] BMO's `rag_search.py` scores with BM25 (negative-IDF drift gone, regression-tested), keeps every consumer call-compatible without edits, and has a green `test_rag_search.py`.
- [ ] All four dnd-app gates + bmo pytest green; one phase commit; plan moved to `completed/`.

## Out of scope

- **Player-editable lore pages as labeled context blocks, keyword/state-triggered world-info injection, and the inline-lore dedup policy** — PHASE-25 (which builds on this phase's `searchCampaignDocs` + stable IDs).
- **Entity/temporal memory upgrade** (flat-JSON memory files → entity records) — PHASE-25.
- **Scene-boundary summarization** and its KV-cache interplay — PHASE-26.
- **Campaign Q&A side-channel assistant / session recaps** (consumes `searchCampaignDocs`) — PHASE-31.
- **Surfacing retrieval provenance/token breakdown in UI beyond the one new inspector row** — PHASE-14 owns the inspector; this phase only adds its `campaignDocs` row.
- **`num_ctx`/`keep_alive`/budget-window mechanics for the chat model** — PHASE-01 (landed; this phase only consumes `getEffectiveBudgets`/`getOllamaUrl`).
- **Cloud-provider embeddings, rerankers (cross-encoders), sqlite-vec/LanceDB storage, LLM-generated chunk context** — deliberately not built (Research notes, Alternatives); log a SUGGESTIONS entry only if a concrete need appears during execution.
- **Regenerating BMO's tracked `chunk-index-*.json` files** — they migrate at load; rebuilding requires the Pi's absolute paths (`build_rag_indexes.py`) and belongs to a Pi maintenance session, not this phase.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
