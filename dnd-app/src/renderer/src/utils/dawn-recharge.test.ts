import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the character store before importing the module under test
const mockSaveCharacter = vi.fn()
const mockGetState = vi.fn()

vi.mock('../stores/use-character-store', () => ({
  useCharacterStore: {
    getState: () => mockGetState()
  }
}))

import { processDawnRecharge } from './dawn-recharge'

beforeEach(() => {
  vi.restoreAllMocks()
  mockSaveCharacter.mockClear()
  mockGetState.mockClear()
})

function makeCharacterWithItems(
  campaignId: string,
  items: Array<{
    name: string
    magicItemId?: string
    maxCharges?: number
    currentCharges?: number
    rechargeType?: 'dawn' | 'dusk' | 'short-rest' | 'long-rest'
    rechargeFormula?: string
  }>
) {
  return {
    id: `char-${Math.random()}`,
    gameSystem: 'dnd5e',
    campaignId,
    name: 'Test Character',
    equipment: items.map((item) => ({
      name: item.name,
      quantity: 1,
      magicItemId: item.magicItemId,
      maxCharges: item.maxCharges,
      currentCharges: item.currentCharges,
      rechargeType: item.rechargeType,
      rechargeFormula: item.rechargeFormula
    }))
  }
}

describe('processDawnRecharge', () => {
  it('recharges items with rechargeType "dawn"', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Wand of Magic Missiles',
        magicItemId: 'wand-mm',
        maxCharges: 7,
        currentCharges: 2,
        rechargeType: 'dawn',
        rechargeFormula: '2' // Fixed recharge of 2
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')

    expect(mockSaveCharacter).toHaveBeenCalledTimes(1)
    const savedChar = mockSaveCharacter.mock.calls[0][0]
    // With formula "2", recharge is fixed 2, so current = min(2 + 2, 7) = 4
    expect(savedChar.equipment[0].currentCharges).toBe(4)
  })

  it('does not recharge items without rechargeType "dawn"', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Ring of Spell Storing',
        magicItemId: 'ring-ss',
        maxCharges: 5,
        currentCharges: 1,
        rechargeType: 'short-rest'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    expect(mockSaveCharacter).not.toHaveBeenCalled()
  })

  it('does not recharge items without magicItemId', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Regular Sword',
        maxCharges: 5,
        currentCharges: 1,
        rechargeType: 'dawn'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    expect(mockSaveCharacter).not.toHaveBeenCalled()
  })

  it('does not recharge items without maxCharges', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Magic Wand',
        magicItemId: 'wand',
        currentCharges: 1,
        rechargeType: 'dawn'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    expect(mockSaveCharacter).not.toHaveBeenCalled()
  })

  it('caps recharge at maxCharges', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Staff of Power',
        magicItemId: 'staff-power',
        maxCharges: 3,
        currentCharges: 2,
        rechargeType: 'dawn',
        rechargeFormula: '10' // Would overshoot
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    const savedChar = mockSaveCharacter.mock.calls[0][0]
    expect(savedChar.equipment[0].currentCharges).toBe(3) // Capped at max
  })

  it('defaults currentCharges to 0 when undefined', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Wand',
        magicItemId: 'wand',
        maxCharges: 7,
        currentCharges: undefined,
        rechargeType: 'dawn',
        rechargeFormula: '3'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    const savedChar = mockSaveCharacter.mock.calls[0][0]
    // 0 + 3 = 3
    expect(savedChar.equipment[0].currentCharges).toBe(3)
  })

  it('uses default formula "1d{maxCharges}" when rechargeFormula is undefined', () => {
    // When rechargeFormula is undefined, it defaults to `1d${maxCharges}`
    // For maxCharges=6, formula is "1d6" which rolls 1-6
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Pearl of Power',
        magicItemId: 'pearl',
        maxCharges: 6,
        currentCharges: 0,
        rechargeType: 'dawn'
        // No rechargeFormula — defaults to 1d6
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    const savedChar = mockSaveCharacter.mock.calls[0][0]
    // Result should be between 1 and 6
    expect(savedChar.equipment[0].currentCharges).toBeGreaterThanOrEqual(1)
    expect(savedChar.equipment[0].currentCharges).toBeLessThanOrEqual(6)
  })

  it('parses dice formula with modifier (e.g., "1d6+2")', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Staff',
        magicItemId: 'staff',
        maxCharges: 20,
        currentCharges: 0,
        rechargeType: 'dawn',
        rechargeFormula: '1d6+2'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    const savedChar = mockSaveCharacter.mock.calls[0][0]
    // 1d6+2 → range is 3 to 8
    expect(savedChar.equipment[0].currentCharges).toBeGreaterThanOrEqual(3)
    expect(savedChar.equipment[0].currentCharges).toBeLessThanOrEqual(8)
  })

  it('parses dice formula with negative modifier (e.g., "2d4-1")', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Amulet',
        magicItemId: 'amulet',
        maxCharges: 20,
        currentCharges: 5,
        rechargeType: 'dawn',
        rechargeFormula: '2d4-1'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    const savedChar = mockSaveCharacter.mock.calls[0][0]
    // 2d4-1 → range is 2-8 - 1 = 1 to 7, plus existing 5
    expect(savedChar.equipment[0].currentCharges).toBeGreaterThanOrEqual(6)
    expect(savedChar.equipment[0].currentCharges).toBeLessThanOrEqual(12)
  })

  it('handles non-dice formula as fixed integer', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Ring',
        magicItemId: 'ring',
        maxCharges: 10,
        currentCharges: 3,
        rechargeType: 'dawn',
        rechargeFormula: '5'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    const savedChar = mockSaveCharacter.mock.calls[0][0]
    expect(savedChar.equipment[0].currentCharges).toBe(8) // 3 + 5
  })

  it('defaults to 1 when formula is an unparseable string', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Orb',
        magicItemId: 'orb',
        maxCharges: 10,
        currentCharges: 4,
        rechargeType: 'dawn',
        rechargeFormula: 'all'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    const savedChar = mockSaveCharacter.mock.calls[0][0]
    // parseInt('all', 10) is NaN, so || 1 gives 1
    expect(savedChar.equipment[0].currentCharges).toBe(5) // 4 + 1
  })

  it('only processes characters matching the given campaignId', () => {
    const char1 = makeCharacterWithItems('campaign-1', [
      {
        name: 'Wand',
        magicItemId: 'wand',
        maxCharges: 7,
        currentCharges: 0,
        rechargeType: 'dawn',
        rechargeFormula: '1'
      }
    ])
    const char2 = makeCharacterWithItems('campaign-2', [
      {
        name: 'Staff',
        magicItemId: 'staff',
        maxCharges: 10,
        currentCharges: 0,
        rechargeType: 'dawn',
        rechargeFormula: '1'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [char1, char2],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    expect(mockSaveCharacter).toHaveBeenCalledTimes(1)
    expect(mockSaveCharacter.mock.calls[0][0].campaignId).toBe('campaign-1')
  })

  it('does not save when no items changed', () => {
    const character = makeCharacterWithItems('campaign-1', [{ name: 'Mundane Sword' }])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    expect(mockSaveCharacter).not.toHaveBeenCalled()
  })

  it('handles multiple magic items on one character', () => {
    const character = makeCharacterWithItems('campaign-1', [
      {
        name: 'Wand A',
        magicItemId: 'wand-a',
        maxCharges: 7,
        currentCharges: 1,
        rechargeType: 'dawn',
        rechargeFormula: '2'
      },
      {
        name: 'Wand B',
        magicItemId: 'wand-b',
        maxCharges: 3,
        currentCharges: 0,
        rechargeType: 'dawn',
        rechargeFormula: '1'
      },
      {
        name: 'Ring (not dawn)',
        magicItemId: 'ring',
        maxCharges: 5,
        currentCharges: 0,
        rechargeType: 'long-rest'
      }
    ])

    mockGetState.mockReturnValue({
      characters: [character],
      saveCharacter: mockSaveCharacter
    })

    processDawnRecharge('campaign-1')
    expect(mockSaveCharacter).toHaveBeenCalledTimes(1)
    const savedChar = mockSaveCharacter.mock.calls[0][0]
    expect(savedChar.equipment[0].currentCharges).toBe(3) // 1 + 2
    expect(savedChar.equipment[1].currentCharges).toBe(1) // 0 + 1
    expect(savedChar.equipment[2].currentCharges).toBe(0) // Not recharged
  })

  it('handles empty character list gracefully', () => {
    mockGetState.mockReturnValue({
      characters: [],
      saveCharacter: mockSaveCharacter
    })

    // Should not throw
    expect(() => processDawnRecharge('campaign-1')).not.toThrow()
    expect(mockSaveCharacter).not.toHaveBeenCalled()
  })
})
