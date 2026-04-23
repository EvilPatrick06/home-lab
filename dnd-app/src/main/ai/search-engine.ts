import { extractKeywords, tokenize } from './keyword-extractor'
import type { Chunk, ChunkIndex, ScoredChunk } from './types'

interface TermFrequency {
  [term: string]: number
}

export class SearchEngine {
  private chunks: Chunk[] = []
  private tfs: TermFrequency[] = []
  private idf: Map<string, number> = new Map()
  private headingTerms: Set<string>[] = []

  load(index: ChunkIndex): void {
    this.chunks = index.chunks
    this.buildIndex()
  }

  private buildIndex(): void {
    const docCount = this.chunks.length
    const docFreq: Map<string, number> = new Map()

    this.tfs = this.chunks.map((chunk) => {
      const tokens = tokenize(`${chunk.content} ${chunk.heading} ${chunk.headingPath.join(' ')}`)
      const tf: TermFrequency = {}
      for (const token of tokens) {
        tf[token] = (tf[token] || 0) + 1
      }
      const len = tokens.length || 1
      for (const term in tf) {
        tf[term] /= len
      }
      const uniqueTerms = new Set(tokens)
      for (const term of uniqueTerms) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1)
      }
      return tf
    })

    for (const [term, df] of docFreq) {
      this.idf.set(term, Math.log(docCount / (1 + df)))
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

      for (const term of allTerms) {
        const termTf = tf[term] || 0
        const termIdf = this.idf.get(term) || 0
        let termScore = termTf * termIdf

        if (headingSet.has(term)) {
          termScore *= 2
        }

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

  getChunkCount(): number {
    return this.chunks.length
  }
}
