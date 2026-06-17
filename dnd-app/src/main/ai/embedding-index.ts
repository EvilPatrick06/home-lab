/**
 * PHASE-24 24C — background job manager for the rule-embedding vector store.
 * Builds (or loads) the store, tracks status, and never throws to callers (any
 * failure → status 'error' + a WARN log; retrieval silently falls back to BM25).
 */

import { logToFile } from '../log'
import { embedTexts, prefixesFor } from './embedding-client'
import type { Chunk, ChunkIndex } from './types'
import {
  computeIndexFingerprint,
  deleteVectorStore,
  type LoadedVectorStore,
  loadVectorStore,
  saveVectorStore,
  searchVectors,
  VECTOR_STORE_VERSION
} from './vector-store'

const BATCH_SIZE = 32

export type EmbedIndexState = {
  status: 'disabled' | 'idle' | 'building' | 'ready' | 'error'
  model?: string
  chunkCount?: number
  percent?: number
  error?: string
}

let state: EmbedIndexState = { status: 'idle' }
let activeStore: LoadedVectorStore | null = null
let inFlight: Promise<void> | null = null

export function getEmbedIndexStatus(): EmbedIndexState {
  return { ...state }
}

export function getActiveVectorStore(): LoadedVectorStore | null {
  return activeStore
}

/** Breadcrumb-prefixed text that gets embedded (contextual chunk headers, F2). */
export function embeddingText(chunk: Chunk): string {
  return `${chunk.source} > ${chunk.headingPath.join(' > ')}\n${chunk.content}`
}

export function clearEmbeddingIndex(): void {
  deleteVectorStore()
  activeStore = null
  state = { status: 'idle' }
  inFlight = null // abort the single-flight guard so the next build can run
}

/**
 * Ensure the vector store exists for `index`+`model`. Cache hit → ready instantly;
 * miss → embed in batches (reporting percent), save, set ready. Single-flight: a
 * second call while building returns the in-flight promise.
 */
export async function ensureEmbeddingIndex(
  index: ChunkIndex,
  model: string,
  baseUrl: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  if (inFlight) return inFlight
  const run = async (): Promise<void> => {
    try {
      const fingerprint = computeIndexFingerprint(index)
      const cached = loadVectorStore(fingerprint, model)
      if (cached) {
        activeStore = cached
        state = { status: 'ready', model, chunkCount: cached.ids.length }
        return
      }

      state = { status: 'building', model, chunkCount: index.chunks.length, percent: 0 }
      const docPrefix = prefixesFor(model).document
      const ids: string[] = []
      const rows: number[][] = []
      const chunks = index.chunks
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE)
        const vecs = await embedTexts(
          model,
          batch.map((c) => docPrefix + embeddingText(c)),
          baseUrl
        )
        for (let j = 0; j < batch.length; j++) {
          ids.push(batch[j].id)
          rows.push(vecs[j])
        }
        const percent = Math.round(((i + batch.length) / chunks.length) * 100)
        state = { ...state, percent }
        onProgress?.(percent)
      }

      const dims = rows[0]?.length ?? 0
      const flat = new Float32Array(ids.length * dims)
      for (let r = 0; r < rows.length; r++) flat.set(rows[r], r * dims)
      saveVectorStore({ version: VECTOR_STORE_VERSION, model, dims, indexFingerprint: fingerprint, ids }, flat)
      activeStore = { ids, dims, vectors: flat }
      state = { status: 'ready', model, chunkCount: ids.length }
    } catch (err) {
      logToFile('WARN', `[embedding-index] build failed (falling back to BM25-only): ${String(err)}`)
      state = { status: 'error', model, error: String(err) }
      activeStore = null
    } finally {
      inFlight = null
    }
  }
  inFlight = run()
  return inFlight
}

// Re-export the similarity helper so hybrid-search imports from one place.
export { searchVectors }
