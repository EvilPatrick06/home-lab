/**
 * PHASE-24 24D — index the campaign's OWN documents (lore / journal / text handouts /
 * public shared-journal) into a per-campaign BM25 engine so the AI DM can answer from
 * the campaign's world, not only the rulebooks. BM25-only: campaign queries are
 * proper-noun/exact-match-shaped, and embedding per-campaign would couple saves to
 * rebuild churn (Research notes). The AI DM acts AS the DM, so DM-only content is
 * indexed; private player notes are not.
 */

import { chunksFromText, stableChunkId } from './chunk-builder'
import { SearchEngine } from './search-engine'
import type { Chunk, ScoredChunk } from './types'

export type CampaignDocType = 'lore' | 'journal' | 'handout' | 'shared-journal'

export interface CampaignDoc {
  docType: CampaignDocType
  title: string
  text: string
}

interface Rec {
  [k: string]: unknown
}
const asArray = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Collect indexable docs per the visibility policy (24D step 3). */
export function collectCampaignDocs(campaign: Record<string, unknown>): CampaignDoc[] {
  const docs: CampaignDoc[] = []

  // Lore — ALL entries; category prefix on the title.
  for (const e of asArray(campaign.lore)) {
    const content = str(e.content)
    if (!content) continue
    const category = str(e.category)
    docs.push({ docType: 'lore', title: `${category ? `[${category}] ` : ''}${str(e.title)}`, text: content })
  }

  // Session journal — ALL entries (DM-owned record; private = DM notes, included).
  const journal = campaign.journal as Rec | undefined
  for (const e of asArray(journal?.entries)) {
    const content = str(e.content)
    if (!content) continue
    docs.push({ docType: 'journal', title: `Session ${e.sessionNumber ?? '?'}: ${str(e.title)}`, text: content })
  }

  const gs = campaign.savedGameState as Rec | undefined

  // Handouts — text content only (never base64 image blobs); dm-only included.
  for (const h of asArray(gs?.handouts)) {
    const title = str(h.title) || 'Handout'
    if (h.contentType === 'text' && str(h.content)) {
      docs.push({ docType: 'handout', title, text: str(h.content) })
    }
    for (const p of asArray(h.pages)) {
      if (p.contentType === 'text' && str(p.content)) {
        const label = str(p.label) || `Page ${asArray(h.pages).indexOf(p) + 1}`
        docs.push({ docType: 'handout', title: `${title} — ${label}`, text: str(p.content) })
      }
    }
  }

  // Shared journal — ONLY public entries (private player notes stay author-only).
  for (const e of asArray(gs?.sharedJournal)) {
    if (e.visibility !== 'public') continue
    const content = str(e.content)
    if (!content) continue
    docs.push({ docType: 'shared-journal', title: `${str(e.title)} — ${str(e.authorName)}`, text: content })
  }

  return docs
}

/** Build a SearchEngine over the campaign docs. headingPath is docType-prefixed so
 *  formatChunks renders `CAMPAIGN: lore > [world] The Sundering > …`; ids are
 *  recomputed from the prefixed path so they're stable + distinct. */
export function buildCampaignDocEngine(campaign: Record<string, unknown>): {
  engine: SearchEngine
  chunkCount: number
} {
  const allChunks: Chunk[] = []
  for (const doc of collectCampaignDocs(campaign)) {
    for (const chunk of chunksFromText('CAMPAIGN', doc.title, doc.text)) {
      chunk.headingPath = [doc.docType, ...chunk.headingPath]
      chunk.id = stableChunkId('CAMPAIGN', chunk.headingPath, chunk.content)
      allChunks.push(chunk)
    }
  }
  const engine = new SearchEngine()
  engine.load({ version: 2, createdAt: '', sources: [], chunks: allChunks })
  return { engine, chunkCount: allChunks.length }
}

// Per-campaign cache keyed on save timestamps.
const cache = new Map<string, { cacheKey: string; engine: SearchEngine; chunkCount: number }>()

function cacheKeyFor(campaign: Record<string, unknown>): string {
  const gs = campaign.savedGameState as { lastSaveTimestamp?: number } | undefined
  return `${String(campaign.updatedAt ?? '')}:${String(gs?.lastSaveTimestamp ?? '')}`
}

/** Retrieve the top campaign-doc excerpts for a query (rebuilds the engine on save change). */
export function searchCampaignDocs(
  campaignId: string,
  campaign: Record<string, unknown>,
  query: string,
  topK = 3
): ScoredChunk[] {
  const key = cacheKeyFor(campaign)
  let entry = cache.get(campaignId)
  if (!entry || entry.cacheKey !== key) {
    const built = buildCampaignDocEngine(campaign)
    entry = { cacheKey: key, engine: built.engine, chunkCount: built.chunkCount }
    cache.set(campaignId, entry)
  }
  return entry.engine.search(query, topK)
}

export function clearCampaignDocCache(campaignId?: string): void {
  if (campaignId) cache.delete(campaignId)
  else cache.clear()
}
