/**
 * PHASE-24 24C — flat-matrix vector store for rule embeddings. 5,383 × 768 float32
 * ≈ 16.5 MB fits trivially in RAM; brute-force dot product over ~5k rows is
 * sub-millisecond, so no native DB dependency. Vectors are L2-normalized (Ollama),
 * so dot product = cosine similarity.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { logToFile } from '../../log'
import type { ChunkIndex } from '../types'

export const VECTOR_STORE_VERSION = 1

export interface VectorStoreMeta {
  version: number
  model: string
  dims: number
  indexFingerprint: string
  ids: string[]
}

export interface LoadedVectorStore {
  ids: string[]
  dims: number
  vectors: Float32Array // row-major, row i = ids[i]
}

function storeDir(): string {
  return join(app.getPath('userData'), 'rules-embeddings')
}
function metaPath(): string {
  return join(storeDir(), 'meta.json')
}
function vectorsPath(): string {
  return join(storeDir(), 'vectors.bin')
}

/** Fingerprint the index by its (content-stable, post-24A) chunk ids, so the store
 *  is invalidated whenever the chunk set changes. */
export function computeIndexFingerprint(index: ChunkIndex): string {
  return createHash('sha256')
    .update(index.chunks.map((c) => c.id).join('\n'))
    .digest('hex')
}

export function saveVectorStore(meta: VectorStoreMeta, vectors: Float32Array): void {
  mkdirSync(storeDir(), { recursive: true })
  writeFileSync(metaPath(), JSON.stringify(meta))
  writeFileSync(vectorsPath(), Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength))
}

/** Load the store iff it matches the expected fingerprint + model + size. Null otherwise. */
export function loadVectorStore(expectedFingerprint: string, model: string): LoadedVectorStore | null {
  try {
    if (!existsSync(metaPath()) || !existsSync(vectorsPath())) return null
    const meta = JSON.parse(readFileSync(metaPath(), 'utf-8')) as VectorStoreMeta
    if (meta.version !== VECTOR_STORE_VERSION) return null
    if (meta.model !== model || meta.indexFingerprint !== expectedFingerprint) return null
    const buf = readFileSync(vectorsPath())
    const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
    if (vectors.length !== meta.ids.length * meta.dims) return null
    return { ids: meta.ids, dims: meta.dims, vectors }
  } catch (err) {
    logToFile('WARN', `[vector-store] load failed: ${String(err)}`)
    return null
  }
}

export function deleteVectorStore(): void {
  try {
    for (const p of [metaPath(), vectorsPath()]) {
      if (existsSync(p)) writeFileSync(p, '') // truncate; loadVectorStore will reject empty
    }
  } catch {
    // best-effort
  }
}

/** Top-K rows by dot product with `queryVec` (descending). */
export function searchVectors(
  store: LoadedVectorStore,
  queryVec: number[],
  topK: number
): Array<{ id: string; score: number }> {
  const { ids, dims, vectors } = store
  const scored: Array<{ id: string; score: number }> = []
  for (let row = 0; row < ids.length; row++) {
    let dot = 0
    const base = row * dims
    for (let d = 0; d < dims; d++) dot += vectors[base + d] * queryVec[d]
    scored.push({ id: ids[row], score: dot })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}
