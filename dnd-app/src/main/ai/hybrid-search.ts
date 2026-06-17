/**
 * PHASE-24 24C — BM25 ⊕ vector retrieval fused with Reciprocal Rank Fusion.
 * The DEFAULT (embeddings off, or no vector store) path returns exactly today's
 * BM25 top-5 — the regression guard. Any embedding failure degrades silently.
 */

import { logToFile } from '../log'
import { embedQuery } from './embedding-client'
import { getActiveVectorStore, searchVectors } from './embedding-index'
import type { SearchEngine } from './search-engine'
import type { ScoredChunk } from './types'

export const RRF_K = 60
export const HYBRID_TOP_K = 8
export const FUSION_POOL = 50
const DEFAULT_TOP_K = 5

export interface RetrievalOpts {
  embeddingsEnabled: boolean
  model: string
  baseUrl: string
}

export async function searchRules(query: string, engine: SearchEngine, opts: RetrievalOpts): Promise<ScoredChunk[]> {
  const bm25 = engine.search(query, FUSION_POOL)

  const store = getActiveVectorStore()
  if (!opts.embeddingsEnabled || store === null) {
    return bm25.slice(0, DEFAULT_TOP_K) // byte-identical to the pre-24C default path
  }

  let vector: Array<{ id: string; score: number }>
  try {
    const qv = await embedQuery(opts.model, query, opts.baseUrl)
    vector = searchVectors(store, qv, FUSION_POOL)
  } catch (err) {
    logToFile('WARN', `[hybrid-search] embed query failed, BM25-only: ${String(err)}`)
    return bm25.slice(0, DEFAULT_TOP_K)
  }

  // Reciprocal Rank Fusion: score(id) = Σ_lists 1/(RRF_K + rank), rank 1-based.
  const rrf = new Map<string, number>()
  const accrue = (ranked: Array<{ id: string }>): void => {
    ranked.forEach((r, i) => {
      rrf.set(r.id, (rrf.get(r.id) ?? 0) + 1 / (RRF_K + i + 1))
    })
  }
  accrue(bm25)
  accrue(vector)

  const fused = [...rrf.entries()].sort((a, b) => b[1] - a[1])
  const out: ScoredChunk[] = []
  for (const [id, score] of fused) {
    const chunk = engine.getChunkById(id)
    if (chunk) out.push({ ...chunk, score })
    if (out.length >= HYBRID_TOP_K) break
  }
  return out
}
