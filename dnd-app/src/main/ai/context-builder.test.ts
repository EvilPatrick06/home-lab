import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all dependencies before importing the module
vi.mock('./search-engine', () => ({
  SearchEngine: vi.fn()
}))

vi.mock('./srd-provider', () => ({
  detectAndLoadSrdData: vi.fn(() => null)
}))

vi.mock('./character-context', () => ({
  loadCharacterById: vi.fn(() => null),
  formatCharacterForContext: vi.fn((char: Record<string, unknown>) => `FULL:${char.name}`),
  formatCharacterAbbreviated: vi.fn((char: Record<string, unknown>) => `BRIEF:${char.name}`)
}))

vi.mock('./campaign-context', () => ({
  loadCampaignById: vi.fn(() => null),
  formatCampaignForContext: vi.fn(() => '')
}))

vi.mock('./campaign-docs', () => ({
  searchCampaignDocs: vi.fn(() => [])
}))

// PHASE-25 25E — entity store drives lore mode (step 4) + the entity block (step 7).
const entityState = vi.hoisted(() => ({
  config: { enabled: false, autoExtract: false, loreMode: 'all' as 'all' | 'triggered' },
  block: '[ENTITY RECORDS]\nNPC — Volo: a barkeep\n[/ENTITY RECORDS]'
}))
vi.mock('./entity-store', () => ({
  getEntityStore: vi.fn(() => ({
    getConfig: async () => entityState.config,
    buildEntityContextBlock: async () => entityState.block
  })),
  matchesKey: (scan: string, key: string) => scan.toLowerCase().includes(key.toLowerCase())
}))

vi.mock('./memory-manager', () => ({
  getMemoryManager: vi.fn(() => ({
    saveCharacterContext: vi.fn(async () => {}),
    assembleContext: vi.fn(async () => '[MEMORY] none')
  }))
}))

import { loadCampaignById } from './campaign-context'
import { searchCampaignDocs } from './campaign-docs'
import { loadCharacterById } from './character-context'
import {
  buildContext,
  clearTokenBreakdown,
  getLastTokenBreakdown,
  recordTokenBreakdown,
  setRetrievalOptsProvider,
  setSearchEngine
} from './context-builder'

describe('buildContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSearchEngine(null)
  })

  it('returns empty text with no data', async () => {
    const result = await buildContext('test query', [])
    expect(result.text).toBe('')
    expect(result.chunkIds).toEqual([])
  })

  it('emits sections static-first → volatile-last (PHASE-01 01D prefix-cache order)', async () => {
    vi.mocked(loadCharacterById).mockResolvedValueOnce({ name: 'Aragorn' } as Record<string, unknown>)
    vi.mocked(loadCampaignById).mockResolvedValueOnce({ id: 'c1' } as never)
    const { formatCampaignForContext } = await import('./campaign-context')
    vi.mocked(formatCampaignForContext).mockReturnValueOnce('[CAMPAIGN] The Sunless Citadel')

    const result = await buildContext(
      'goblin ambush',
      ['char-1'],
      'c1',
      [{ label: 'Goblin', currentHP: 7, maxHP: 7, ac: 15, conditions: [] }] as never,
      '[GAME STATE]\nRound 1\nTotal seconds: 42'
    )

    const iCampaign = result.text.indexOf('[CAMPAIGN]')
    const iCharacter = result.text.indexOf('FULL:Aragorn')
    const iCreatures = result.text.indexOf('[ACTIVE CREATURES ON MAP]')
    const iGameState = result.text.indexOf('[GAME STATE]')
    expect(iCampaign).toBeGreaterThanOrEqual(0)
    expect(iCharacter).toBeGreaterThan(iCampaign)
    expect(iCreatures).toBeGreaterThan(iCharacter)
    expect(iGameState).toBeGreaterThan(iCreatures) // volatile snapshot is LAST
  })

  it('includes full character data when no acting character specified', async () => {
    vi.mocked(loadCharacterById).mockResolvedValueOnce({ name: 'Gandalf' } as Record<string, unknown>)
    const result = await buildContext('test', ['char-1'])
    expect(result.text).toContain('FULL:Gandalf')
    expect(result.text).not.toContain('BRIEF:')
  })

  it('uses abbreviated format for non-acting characters', async () => {
    vi.mocked(loadCharacterById)
      .mockResolvedValueOnce({ name: 'Gandalf' } as Record<string, unknown>)
      .mockResolvedValueOnce({ name: 'Frodo' } as Record<string, unknown>)

    const result = await buildContext('test', ['char-1', 'char-2'], undefined, undefined, undefined, 'char-1')
    expect(result.text).toContain('FULL:Gandalf')
    expect(result.text).toContain('BRIEF:Frodo')
  })

  it('uses full format for acting character only', async () => {
    vi.mocked(loadCharacterById)
      .mockResolvedValueOnce({ name: 'Legolas' } as Record<string, unknown>)
      .mockResolvedValueOnce({ name: 'Gimli' } as Record<string, unknown>)
      .mockResolvedValueOnce({ name: 'Aragorn' } as Record<string, unknown>)

    const result = await buildContext('test', ['char-1', 'char-2', 'char-3'], undefined, undefined, undefined, 'char-2')
    expect(result.text).toContain('BRIEF:Legolas')
    expect(result.text).toContain('FULL:Gimli')
    expect(result.text).toContain('BRIEF:Aragorn')
  })

  it('includes active creatures in context', async () => {
    const creatures = [
      { label: 'Goblin', currentHP: 5, maxHP: 7, ac: 13, conditions: [] as string[], monsterStatBlockId: 'goblin' },
      { label: 'Orc', currentHP: 10, maxHP: 15, ac: 13, conditions: ['frightened'] }
    ]
    const result = await buildContext('test', [], undefined, creatures)
    expect(result.text).toContain('Goblin: HP 5/7, AC 13')
    expect(result.text).toContain('Orc: HP 10/15, AC 13, Conditions: frightened')
  })

  it('includes game state in context', async () => {
    const gameState = '[GAME STATE] Round 3, Token: Fighter at (5,5)'
    const result = await buildContext('test', [], undefined, undefined, gameState)
    expect(result.text).toContain('Round 3')
  })

  it('returns a per-call token breakdown reflecting content', async () => {
    vi.mocked(loadCharacterById).mockResolvedValueOnce({ name: 'Test' } as Record<string, unknown>)
    const result = await buildContext('test', ['char-1'], undefined, undefined, 'game state here')
    expect(result.breakdown.total).toBeGreaterThan(0)
    expect(result.breakdown.characterData).toBeGreaterThan(0)
    expect(result.breakdown.gameState).toBeGreaterThan(0)
  })

  it('emits retrieved chunk ids as provenance (07A)', async () => {
    setSearchEngine({
      search: () => [
        { id: 'phb-1', content: 'Grapple rules', score: 0.9, source: 'PHB', headingPath: ['Combat', 'Grapple'] },
        { id: 'dmg-2', content: 'Cover rules', score: 0.8, source: 'DMG', headingPath: ['Combat', 'Cover'] }
      ]
    } as never)
    const result = await buildContext('grapple', [])
    expect(result.chunkIds).toEqual(['phb-1', 'dmg-2'])
    setSearchEngine(null)
  })

  it('buildContext itself records NO module global (preview isolation, 07A)', async () => {
    clearTokenBreakdown('iso-campaign')
    await buildContext('preview', [], 'iso-campaign')
    expect(getLastTokenBreakdown('iso-campaign')).toBeNull()
  })
})

describe('campaign-document retrieval (PHASE-24 24D)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSearchEngine(null)
    setRetrievalOptsProvider(null)
  })
  afterEach(() => setRetrievalOptsProvider(null))

  const docChunk = {
    id: 'CAMPAIGN-abc123',
    content: 'Volo owes a debt to the Zhentarim.',
    score: 2.5,
    source: 'CAMPAIGN' as const,
    headingPath: ['handout', 'Letter']
  }

  it('omits the campaign-docs block and keeps campaignDocs: 0 when the flag is off (regression guard)', async () => {
    vi.mocked(loadCampaignById).mockResolvedValueOnce({ id: 'c1' } as never)
    vi.mocked(searchCampaignDocs).mockReturnValueOnce([docChunk] as never)
    // No retrieval-opts provider set → campaignDocsEnabled defaults to false.
    const result = await buildContext('Volo Zhentarim', [], 'c1')
    expect(result.text).not.toContain('[CONTEXT: Campaign Documents]')
    expect(result.breakdown.campaignDocs).toBe(0)
    expect(result.chunkIds).not.toContain('CAMPAIGN-abc123')
    expect(searchCampaignDocs).not.toHaveBeenCalled()
  })

  it('includes the campaign-docs block, sets the breakdown field, and appends chunk ids when on', async () => {
    vi.mocked(loadCampaignById).mockResolvedValueOnce({ id: 'c1' } as never)
    vi.mocked(searchCampaignDocs).mockReturnValueOnce([docChunk] as never)
    setRetrievalOptsProvider(() => ({
      embeddingsEnabled: false,
      model: '',
      baseUrl: '',
      campaignDocsEnabled: true
    }))
    const result = await buildContext('Volo Zhentarim', [], 'c1')
    expect(result.text).toContain('[CONTEXT: Campaign Documents]')
    expect(result.text).toContain('Zhentarim')
    expect(result.breakdown.campaignDocs).toBeGreaterThan(0)
    expect(result.chunkIds).toContain('CAMPAIGN-abc123')
  })
})

describe('entity records injection (PHASE-25 25E)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSearchEngine(null)
    setRetrievalOptsProvider(null)
    entityState.config = { enabled: false, autoExtract: false, loreMode: 'all' }
    entityState.block = '[ENTITY RECORDS]\nNPC — Volo: a barkeep\n[/ENTITY RECORDS]'
  })
  afterEach(() => setRetrievalOptsProvider(null))

  it('disabled store → no [ENTITY ACTIONS] / [ENTITY RECORDS] blocks (regression guard)', async () => {
    const result = await buildContext('q', [], 'c1')
    expect(result.text).not.toContain('[ENTITY ACTIONS]')
    expect(result.text).not.toContain('[ENTITY RECORDS]')
  })

  it('enabled store → verb docs + records block present, memory tokens counted', async () => {
    entityState.config = { enabled: true, autoExtract: false, loreMode: 'all' }
    const result = await buildContext('q', [], 'c1')
    expect(result.text).toContain('[ENTITY ACTIONS]')
    expect(result.text).toContain('[ENTITY RECORDS]')
    expect(result.breakdown.memory).toBeGreaterThan(0)
  })
})

describe('token-breakdown recording (07A)', () => {
  beforeEach(() => {
    clearTokenBreakdown('camp-A')
    clearTokenBreakdown('camp-B')
  })

  it('recordTokenBreakdown / getLastTokenBreakdown round-trip per campaign', () => {
    const bd = {
      rulebookChunks: 1,
      srdData: 2,
      characterData: 3,
      campaignDocs: 0,
      campaignData: 4,
      creatures: 5,
      gameState: 6,
      memory: 7,
      total: 28
    }
    recordTokenBreakdown('camp-A', bd)
    expect(getLastTokenBreakdown('camp-A')).toEqual(bd)
  })

  it('a build for campaign B does not disturb campaign A', () => {
    const bdA = {
      rulebookChunks: 1,
      srdData: 0,
      characterData: 0,
      campaignDocs: 0,
      campaignData: 0,
      creatures: 0,
      gameState: 0,
      memory: 0,
      total: 1
    }
    const bdB = {
      rulebookChunks: 9,
      srdData: 0,
      characterData: 0,
      campaignDocs: 0,
      campaignData: 0,
      creatures: 0,
      gameState: 0,
      memory: 0,
      total: 9
    }
    recordTokenBreakdown('camp-A', bdA)
    recordTokenBreakdown('camp-B', bdB)
    expect(getLastTokenBreakdown('camp-A')).toEqual(bdA)
    expect(getLastTokenBreakdown('camp-B')).toEqual(bdB)
  })
})
