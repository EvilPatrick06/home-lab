import { describe, expect, it } from 'vitest'
import { clearCampaignDocCache, collectCampaignDocs, searchCampaignDocs } from './campaign-docs'

const campaign = {
  updatedAt: '2026-01-01T00:00:00Z',
  lore: [
    {
      id: 'l1',
      title: 'The Sundering',
      content: 'Long ago the world cracked apart in the Sundering.',
      category: 'world'
    }
  ],
  journal: {
    entries: [
      { id: 'j1', sessionNumber: 3, title: 'The Heist', content: 'The party robbed the vault.', isPrivate: true }
    ]
  },
  savedGameState: {
    lastSaveTimestamp: 1000,
    handouts: [
      {
        id: 'h1',
        title: 'Letter',
        contentType: 'text',
        content: 'Volo owes a debt to the Zhentarim.',
        visibility: 'dm-only'
      },
      { id: 'h2', title: 'Portrait', contentType: 'image', content: 'data:image/png;base64,AAAA', visibility: 'all' },
      {
        id: 'h3',
        title: 'Map Notes',
        contentType: 'text',
        content: 'x',
        pages: [{ contentType: 'text', content: 'Secret door behind the tapestry.', label: 'North Wing' }]
      }
    ],
    sharedJournal: [
      {
        id: 's1',
        title: 'Public Recap',
        content: 'Everyone survived the dragon.',
        authorName: 'Aria',
        visibility: 'public'
      },
      {
        id: 's2',
        title: 'Private Note',
        content: 'I do not trust the wizard.',
        authorName: 'Korgan',
        visibility: 'private'
      }
    ]
  }
}

describe('campaign-docs (PHASE-24 24D)', () => {
  describe('collectCampaignDocs', () => {
    const docs = collectCampaignDocs(campaign)

    it('prefixes lore with its category', () => {
      expect(docs.find((d) => d.docType === 'lore')?.title).toBe('[world] The Sundering')
    })
    it('includes private journal entries (DM notes)', () => {
      expect(docs.some((d) => d.docType === 'journal' && d.title.includes('Session 3'))).toBe(true)
    })
    it('includes dm-only text handouts but never image content', () => {
      expect(docs.some((d) => d.text.includes('Zhentarim'))).toBe(true)
      expect(docs.some((d) => d.text.includes('base64'))).toBe(false)
    })
    it('includes handout page text with its label', () => {
      expect(docs.some((d) => d.title.includes('North Wing') && d.text.includes('Secret door'))).toBe(true)
    })
    it('includes public shared-journal but excludes private ones', () => {
      expect(docs.some((d) => d.text.includes('survived the dragon'))).toBe(true)
      expect(docs.some((d) => d.text.includes('do not trust'))).toBe(false)
    })
  })

  describe('searchCampaignDocs', () => {
    it('retrieves a proper-noun lore/handout match (headingless content survives chunking)', () => {
      clearCampaignDocCache()
      const results = searchCampaignDocs('c1', campaign, 'Volo Zhentarim debt')
      expect(results.length).toBeGreaterThan(0)
      expect(results.some((r) => r.content.includes('Zhentarim'))).toBe(true)
    })

    it('rebuilds the engine when lastSaveTimestamp changes', () => {
      clearCampaignDocCache()
      const before = searchCampaignDocs('c2', campaign, 'Sundering')
      expect(before.some((r) => r.content.includes('Sundering'))).toBe(true)
      const changed = {
        ...campaign,
        lore: [
          { id: 'l2', title: 'New Lore', content: 'A brand new prophecy about the Chosen One.', category: 'world' }
        ],
        savedGameState: { ...campaign.savedGameState, lastSaveTimestamp: 2000 }
      }
      const after = searchCampaignDocs('c2', changed, 'Chosen prophecy')
      expect(after.some((r) => r.content.includes('prophecy'))).toBe(true)
    })
  })
})
