import type { Chunk, ChunkIndex, ScoredChunk } from '../types'
import { extractKeywords, tokenize } from './keyword-extractor'

interface TermFrequency {
  [term: string]: number
}

// PHASE-24 24B: Okapi BM25 canonical defaults. k1 = term-frequency saturation,
// b = document-length normalization. Replaces length-normalized TF-IDF — the
// standard lexical fix for exact-match-shaped 5e queries (see RULES-RETRIEVAL.md).
export const BM25_K1 = 1.5
export const BM25_B = 0.75

export class SearchEngine {
  private chunks: Chunk[] = []
  // Raw (unnormalized) term counts per chunk — BM25 does its own length normalization.
  private tfs: TermFrequency[] = []
  private idf: Map<string, number> = new Map()
  private headingTerms: Set<string>[] = []
  private docLens: number[] = []
  private avgDocLen = 1
  private byId: Map<string, Chunk> = new Map()

  load(index: ChunkIndex): void {
    this.chunks = index.chunks
    this.byId = new Map(this.chunks.map((c) => [c.id, c]))
    this.buildIndex()
  }

  private buildIndex(): void {
    const docCount = this.chunks.length
    const docFreq: Map<string, number> = new Map()
    this.docLens = []

    this.tfs = this.chunks.map((chunk) => {
      const tokens = tokenize(`${chunk.content} ${chunk.heading} ${chunk.headingPath.join(' ')}`)
      const tf: TermFrequency = {}
      for (const token of tokens) {
        tf[token] = (tf[token] || 0) + 1
      }
      this.docLens.push(tokens.length || 1)
      for (const term of new Set(tokens)) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1)
      }
      return tf
    })

    const totalLen = this.docLens.reduce((a, b) => a + b, 0)
    this.avgDocLen = docCount > 0 ? totalLen / docCount : 1

    for (const [term, df] of docFreq) {
      // BM25 IDF: ln(1 + (N - df + 0.5)/(df + 0.5)) — always > 0, so no clamp needed
      // (the old TF-IDF clamp existed precisely because its IDF went negative).
      this.idf.set(term, Math.log(1 + (docCount - df + 0.5) / (df + 0.5)))
    }

    this.headingTerms = this.chunks.map((chunk) => {
      const headingText = `${chunk.heading} ${chunk.headingPath.join(' ')}`
      return new Set(tokenize(headingText))
    })
  }

  search(query: string, topK: number = 5): ScoredChunk[] {
    if (this.chunks.length === 0) return []

    const queryTerms = extractKeywords(query)
    const allTerms = new Set<string>()
    for (const term of queryTerms) {
      allTerms.add(term)
      for (const subword of tokenize(term)) {
        allTerms.add(subword)
      }
    }

    const scores: { chunk: Chunk; score: number }[] = this.chunks.map((chunk, i) => {
      let score = 0
      const tf = this.tfs[i]
      const headingSet = this.headingTerms[i]
      const lenNorm = 1 - BM25_B + (BM25_B * this.docLens[i]) / this.avgDocLen

      for (const term of allTerms) {
        const termTf = tf[term] || 0
        if (termTf === 0) continue
        const termIdf = this.idf.get(term) || 0
        // BM25 saturation: tf*(k1+1) / (tf + k1*lenNorm)
        const norm = (termTf * (BM25_K1 + 1)) / (termTf + BM25_K1 * lenNorm)
        let termScore = termIdf * norm
        if (headingSet.has(term)) termScore *= 2 // preserve the existing heading boost
        score += termScore
      }

      return { chunk, score }
    })

    scores.sort((a, b) => b.score - a.score)

    return scores
      .slice(0, topK)
      .filter((s) => s.score > 0)
      .map((s) => ({ ...s.chunk, score: s.score }))
  }

  /** PHASE-24 24C/24D: id→chunk resolution for RRF fusion + provenance. */
  getChunkById(id: string): Chunk | undefined {
    return this.byId.get(id)
  }

  getChunkCount(): number {
    return this.chunks.length
  }
}
