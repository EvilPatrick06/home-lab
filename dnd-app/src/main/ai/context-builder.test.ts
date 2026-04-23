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

import { loadCharacterById } from './character-context'
import { buildContext, getLastTokenBreakdown, setSearchEngine } from './context-builder'

describe('buildContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSearchEngine(null)
  })

  it('returns empty string with no data', async () => {
    const result = await buildContext('test query', [])
    expect(result).toBe('')
  })

  it('includes full character data when no acting character specified', async () => {
    vi.mocked(loadCharacterById).mockResolvedValueOnce({ name: 'Gandalf' } as Record<string, unknown>)
    const result = await buildContext('test', ['char-1'])
    expect(result).toContain('FULL:Gandalf')
    expect(result).not.toContain('BRIEF:')
  })

  it('uses abbreviated format for non-acting characters', async () => {
    vi.mocked(loadCharacterById)
      .mockResolvedValueOnce({ name: 'Gandalf' } as Record<string, unknown>)
      .mockResolvedValueOnce({ name: 'Frodo' } as Record<string, unknown>)

    const result = await buildContext('test', ['char-1', 'char-2'], undefined, undefined, undefined, 'char-1')
    expect(result).toContain('FULL:Gandalf')
    expect(result).toContain('BRIEF:Frodo')
  })

  it('uses full format for acting character only', async () => {
    vi.mocked(loadCharacterById)
      .mockResolvedValueOnce({ name: 'Legolas' } as Record<string, unknown>)
      .mockResolvedValueOnce({ name: 'Gimli' } as Record<string, unknown>)
      .mockResolvedValueOnce({ name: 'Aragorn' } as Record<string, unknown>)

    const result = await buildContext('test', ['char-1', 'char-2', 'char-3'], undefined, undefined, undefined, 'char-2')
    expect(result).toContain('BRIEF:Legolas')
    expect(result).toContain('FULL:Gimli')
    expect(result).toContain('BRIEF:Aragorn')
  })

  it('includes active creatures in context', async () => {
    const creatures = [
      { label: 'Goblin', currentHP: 5, maxHP: 7, ac: 13, conditions: [] as string[], monsterStatBlockId: 'goblin' },
      { label: 'Orc', currentHP: 10, maxHP: 15, ac: 13, conditions: ['frightened'] }
    ]
    const result = await buildContext('test', [], undefined, creatures)
    expect(result).toContain('Goblin: HP 5/7, AC 13')
    expect(result).toContain('Orc: HP 10/15, AC 13, Conditions: frightened')
  })

  it('includes game state in context', async () => {
    const gameState = '[GAME STATE] Round 3, Token: Fighter at (5,5)'
    const result = await buildContext('test', [], undefined, undefined, gameState)
    expect(result).toContain('Round 3')
  })

  it('tracks token breakdown', async () => {
    vi.mocked(loadCharacterById).mockResolvedValueOnce({ name: 'Test' } as Record<string, unknown>)
    await buildContext('test', ['char-1'], undefined, undefined, 'game state here')
    const breakdown = getLastTokenBreakdown()
    expect(breakdown).not.toBeNull()
    expect(breakdown?.total).toBeGreaterThan(0)
    expect(breakdown?.characterData).toBeGreaterThan(0)
    expect(breakdown?.gameState).toBeGreaterThan(0)
  })
})
