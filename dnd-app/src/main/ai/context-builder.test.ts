import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('./memory-manager', () => ({
  getMemoryManager: vi.fn(() => ({
    saveCharacterContext: vi.fn(async () => {}),
    assembleContext: vi.fn(async () => '[MEMORY] none')
  }))
}))

import { loadCampaignById } from './campaign-context'
import { loadCharacterById } from './character-context'
import {
  buildContext,
  clearTokenBreakdown,
  getLastTokenBreakdown,
  recordTokenBreakdown,
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
