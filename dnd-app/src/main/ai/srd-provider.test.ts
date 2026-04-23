import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/test'),
    getAppPath: vi.fn(() => '/app')
  }
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '[]')
}))

import { existsSync, readFileSync } from 'node:fs'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

describe('detectAndLoadSrdData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset modules to clear the internal cache in srd-provider
    vi.resetModules()
  })

  it('returns empty string when no data files exist', async () => {
    mockExistsSync.mockReturnValue(false)
    const { detectAndLoadSrdData } = await import('./srd-provider')
    const result = detectAndLoadSrdData('fireball')
    expect(result).toBe('')
  })

  it('detects spell references in text', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ name: 'Fireball', level: 3, school: 'evocation', description: 'A bright streak of fire' }])
    )

    const { detectAndLoadSrdData } = await import('./srd-provider')
    const result = detectAndLoadSrdData('I want to cast fireball at the enemies')
    expect(result).toContain('[SRD: Spell - Fireball]')
    expect(result).toContain('level: 3')
  })

  it('skips spells with short names (3 chars or less)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify([{ name: 'Aid', level: 2 }]))

    const { detectAndLoadSrdData } = await import('./srd-provider')
    const result = detectAndLoadSrdData('aid me in battle')
    expect(result).not.toContain('[SRD: Spell')
  })

  it('detects equipment references', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((filePath) => {
      const path = String(filePath)
      if (path.includes('equipment')) {
        return JSON.stringify([{ name: 'Longsword', type: 'weapon', damage: '1d8 slashing', weight: 3 }])
      }
      return '[]'
    })

    const { detectAndLoadSrdData } = await import('./srd-provider')
    const result = detectAndLoadSrdData('I draw my longsword')
    expect(result).toContain('[SRD: Equipment - Longsword]')
  })

  it('detects monster references and formats them', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((filePath) => {
      const path = String(filePath)
      if (path.includes('monsters')) {
        return JSON.stringify([
          {
            name: 'Ancient Red Dragon',
            size: 'Gargantuan',
            type: 'dragon',
            cr: '24',
            ac: 22,
            acType: 'natural armor',
            hp: 546,
            hitDice: '28d20+252',
            speed: { walk: 40, fly: 80 },
            abilityScores: { str: 30, dex: 10, con: 29, int: 18, wis: 15, cha: 23 },
            savingThrows: { dex: 7, con: 16, wis: 9, cha: 14 },
            skills: { perception: 16 },
            resistances: [],
            damageImmunities: ['fire'],
            conditionImmunities: [],
            senses: { darkvision: '120 ft.', passivePerception: 26 },
            traits: [{ name: 'Legendary Resistance', description: '3/Day. If it fails a saving throw...' }],
            actions: [{ name: 'Multiattack', description: 'The dragon makes three attacks.' }],
            bonusActions: [],
            reactions: [{ name: 'Tail Attack', description: 'The dragon makes a tail attack.' }]
          }
        ])
      }
      return '[]'
    })

    const { detectAndLoadSrdData } = await import('./srd-provider')
    const result = detectAndLoadSrdData('We encounter an ancient red dragon')
    expect(result).toContain('[SRD: Creature - Ancient Red Dragon]')
    expect(result).toContain('Gargantuan dragon, CR 24')
    expect(result).toContain('AC 22 (natural armor)')
    expect(result).toContain('HP 546')
    expect(result).toContain('STR 30')
    expect(result).toContain('Damage Immunities: fire')
    expect(result).toContain('Legendary Resistance')
    expect(result).toContain('Multiattack')
    expect(result).toContain('Tail Attack')
  })

  it('limits total spell results to 3', async () => {
    mockExistsSync.mockReturnValue(true)
    const manySpells = Array.from({ length: 10 }, (_, i) => ({
      name: `Spellname${i}abcd`,
      level: i
    }))
    mockReadFileSync.mockReturnValue(JSON.stringify(manySpells))

    const { detectAndLoadSrdData } = await import('./srd-provider')
    const text = manySpells.map((s) => s.name.toLowerCase()).join(' and ')
    const result = detectAndLoadSrdData(text)

    const spellMatches = (result.match(/\[SRD: Spell/g) || []).length
    expect(spellMatches).toBeLessThanOrEqual(3)
  })

  it('returns empty string when text has no matches', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify([{ name: 'Fireball', level: 3 }]))

    const { detectAndLoadSrdData } = await import('./srd-provider')
    const result = detectAndLoadSrdData('hello world nothing special')
    expect(result).toBe('')
  })
})
