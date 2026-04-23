import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}))

// Mock window.api
vi.stubGlobal('window', {
  api: {
    showOpenDialog: vi.fn(() => Promise.resolve('/fake/path/character.json')),
    readFile: vi.fn(() => Promise.resolve('{}'))
  }
})

// Provide crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'ddb-import-uuid' })

/**
 * Minimal DDB character export structure for testing.
 */
function makeDdbExport(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Tordek',
    stats: [
      { id: 1, value: 16 }, // STR
      { id: 2, value: 12 }, // DEX
      { id: 3, value: 14 }, // CON
      { id: 4, value: 8 }, // INT
      { id: 5, value: 13 }, // WIS
      { id: 6, value: 10 } // CHA
    ],
    classes: [
      {
        definition: { name: 'Fighter' },
        subclassDefinition: { name: 'Champion' },
        level: 5,
        isStartingClass: true,
        classFeatures: [{ definition: { name: 'Second Wind', requiredLevel: 1, description: 'Heal yourself' } }]
      }
    ],
    race: {
      fullName: 'Mountain Dwarf',
      baseName: 'Dwarf',
      racialTraits: [{ definition: { name: 'Darkvision', description: 'Can see in darkness' } }],
      weightSpeeds: { normal: { walk: 25 } }
    },
    baseHitPoints: 44,
    bonusHitPoints: 0,
    removedHitPoints: 5,
    temporaryHitPoints: 0,
    alignmentId: 1,
    background: { definition: { name: 'Soldier' } },
    modifiers: {
      race: [
        { type: 'bonus', subType: 'strength-score', value: 2 },
        { type: 'proficiency', subType: 'athletics', friendlySubtypeName: 'Athletics' },
        { type: 'proficiency', subType: 'light-armor', friendlySubtypeName: 'Light Armor' },
        { type: 'proficiency', subType: 'longsword', friendlySubtypeName: 'Longsword' },
        { type: 'proficiency', subType: 'strength-saving-throws', friendlySubtypeName: 'Strength Saving Throws' },
        { type: 'proficiency', subType: 'common-language', friendlySubtypeName: 'Common' },
        { type: 'sense', subType: 'darkvision', friendlySubtypeName: 'Darkvision', value: 60 },
        { type: 'resistance', subType: 'poison', friendlySubtypeName: 'Poison' }
      ],
      class: [{ type: 'expertise', subType: 'athletics', friendlySubtypeName: 'Athletics' }]
    },
    inventory: [
      {
        definition: {
          name: 'Longsword',
          filterType: 'Weapon',
          type: 'Weapon',
          damage: { diceString: '1d8' },
          fixedDamage: null,
          damageType: 'Slashing',
          properties: [{ name: 'Versatile' }],
          range: null,
          weight: 3,
          cost: '15 gp',
          description: 'A standard longsword'
        },
        quantity: 1,
        equipped: true
      },
      {
        definition: {
          name: 'Chain Mail',
          filterType: 'Armor',
          armorClass: 16,
          type: 'Heavy Armor',
          armorTypeId: 3,
          stealthCheck: 1,
          strengthRequirement: 13,
          weight: 55,
          description: 'Heavy armor'
        },
        quantity: 1,
        equipped: true
      },
      {
        definition: {
          name: 'Rope',
          filterType: 'Adventuring Gear',
          weight: 10,
          description: 'Hempen rope, 50 feet'
        },
        quantity: 1,
        equipped: false
      }
    ],
    classSpells: [],
    feats: [
      {
        definition: { id: 101, name: 'Great Weapon Master', description: 'Extra damage on heavy weapons' }
      }
    ],
    currencies: { cp: 50, sp: 20, gp: 100, pp: 5, ep: 0 },
    currentXp: 6500,
    traits: {
      personalityTraits: 'Stoic',
      ideals: 'Honor',
      bonds: 'My comrades',
      flaws: 'Stubborn'
    },
    notes: { backstory: 'A veteran fighter.' },
    deathSaves: { failCount: 1, successCount: 2 },
    inspiration: true,
    gender: 'Male',
    age: 50,
    height: '4\'6"',
    weight: 160,
    eyes: 'Brown',
    hair: 'Black',
    skin: 'Tan',
    ...overrides
  }
}

describe('import-dnd-beyond', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('importDndBeyondCharacter', () => {
    it('returns null if user cancels the open dialog', async () => {
      vi.mocked(window.api.showOpenDialog).mockResolvedValueOnce(null)
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()
      expect(result).toBeNull()
    })

    it('returns null for invalid data (missing name)', async () => {
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify({ notACharacter: true }))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()
      expect(result).toBeNull()
    })

    it('returns null on JSON parse error', async () => {
      vi.mocked(window.api.readFile).mockResolvedValueOnce('not json')
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()
      expect(result).toBeNull()
    })

    it('successfully imports a valid DDB character', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Tordek')
      expect(result!.gameSystem).toBe('dnd5e')
    })

    it('extracts ability scores with racial bonuses', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      // Base STR 16 + racial bonus 2 = 18
      expect(result!.abilityScores.strength).toBe(18)
      expect(result!.abilityScores.dexterity).toBe(12)
      expect(result!.abilityScores.constitution).toBe(14)
    })

    it('extracts classes correctly', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.classes).toHaveLength(1)
      expect(result!.classes[0].name).toBe('Fighter')
      expect(result!.classes[0].level).toBe(5)
      expect(result!.classes[0].subclass).toBe('Champion')
      expect(result!.classes[0].hitDie).toBe(10)
      expect(result!.level).toBe(5)
    })

    it('extracts species from race data', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.species).toBe('Mountain Dwarf')
    })

    it('computes HP correctly', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      // maxHP = 44 + 0 = 44, currentHP = 44 - 5 = 39
      expect(result!.hitPoints.maximum).toBe(44)
      expect(result!.hitPoints.current).toBe(39)
      expect(result!.hitPoints.temporary).toBe(0)
    })

    it('maps alignment correctly', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.alignment).toBe('Lawful Good')
    })

    it('extracts background', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.background).toBe('Soldier')
    })

    it('extracts proficiencies (weapons, armor, saving throws)', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.proficiencies.armor).toContain('Light Armor')
      expect(result!.proficiencies.weapons).toContain('Longsword')
      expect(result!.proficiencies.savingThrows).toContain('strength')
    })

    it('extracts skills with proficiency and expertise', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      const athletics = result!.skills.find((s) => s.name === 'Athletics')
      expect(athletics).toBeDefined()
      expect(athletics!.proficient).toBe(true)
      expect(athletics!.expertise).toBe(true)
    })

    it('extracts inventory (equipment, weapons, armor)', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.weapons.length).toBeGreaterThanOrEqual(1)
      expect(result!.weapons[0].name).toBe('Longsword')
      expect(result!.armor.length).toBeGreaterThanOrEqual(1)
      expect(result!.armor[0].name).toBe('Chain Mail')
      expect(result!.equipment.length).toBeGreaterThanOrEqual(1)
      expect(result!.equipment[0].name).toBe('Rope')
    })

    it('extracts feats', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.feats).toHaveLength(1)
      expect(result!.feats![0].name).toBe('Great Weapon Master')
    })

    it('extracts treasure/currencies', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.treasure.gp).toBe(100)
      expect(result!.treasure.sp).toBe(20)
      expect(result!.treasure.cp).toBe(50)
      expect(result!.treasure.pp).toBe(5)
    })

    it('extracts details (personality, ideals, bonds, flaws)', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.details.personality).toBe('Stoic')
      expect(result!.details.ideals).toBe('Honor')
      expect(result!.details.bonds).toBe('My comrades')
      expect(result!.details.flaws).toBe('Stubborn')
      expect(result!.details.gender).toBe('Male')
      expect(result!.details.age).toBe('50')
    })

    it('extracts death saves', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      // DDB swaps success/fail in its export
      expect(result!.deathSaves).toBeDefined()
    })

    it('extracts heroic inspiration', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.heroicInspiration).toBe(true)
    })

    it('extracts speed from race data', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.speed).toBe(25) // Dwarf walk speed
    })

    it('extracts resistances from modifiers', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.resistances).toContain('Poison')
    })

    it('extracts racial features', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.features.some((f) => f.name === 'Darkvision')).toBe(true)
    })

    it('extracts class features', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.classFeatures!.some((f) => f.name === 'Second Wind')).toBe(true)
    })

    it('sets build choices from extracted data', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.buildChoices.classId).toBe('fighter')
      expect(result!.buildChoices.backgroundId).toBe('soldier')
      expect(result!.buildChoices.abilityScoreMethod).toBe('custom')
    })

    it('handles DDB exports wrapped in a data property', async () => {
      const ddbData = { data: makeDdbExport() }
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Tordek')
    })

    it('handles missing optional fields gracefully', async () => {
      const minimal = {
        name: 'Minimal',
        stats: [],
        classes: [],
        race: {},
        baseHitPoints: 10,
        modifiers: {},
        inventory: [],
        currencies: {}
      }
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(minimal))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Minimal')
      expect(result!.species).toBe('Human') // Default
      expect(result!.level).toBe(1) // Default when no classes
    })

    it('extracts senses from modifiers', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.senses.some((s) => s.includes('Darkvision'))).toBe(true)
    })

    it('extracts languages from proficiency modifiers', async () => {
      const ddbData = makeDdbExport()
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(ddbData))
      const { importDndBeyondCharacter } = await import('./import-dnd-beyond')
      const result = await importDndBeyondCharacter()

      expect(result!.proficiencies.languages.length).toBeGreaterThanOrEqual(1)
    })
  })
})
