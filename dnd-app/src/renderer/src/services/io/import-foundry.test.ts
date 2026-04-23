import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock logger ---
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}))

// --- Mock crypto.randomUUID ---
let uuidCounter = 0
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`
})

// --- Mock window.api ---
const mockShowOpenDialog = vi.fn()
const mockReadFile = vi.fn()

vi.stubGlobal('window', {
  api: {
    showOpenDialog: mockShowOpenDialog,
    readFile: mockReadFile
  }
})

import { importFoundryCharacter } from './import-foundry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFoundryActor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Gandalf',
    system: {
      abilities: {
        str: { value: 8 },
        dex: { value: 14 },
        con: { value: 12 },
        int: { value: 20 },
        wis: { value: 18 },
        cha: { value: 16 }
      },
      attributes: {
        hp: { value: 55, max: 55, temp: 5 },
        ac: { value: 15 },
        movement: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0 }
      },
      skills: {
        arc: { value: 2 },
        his: { value: 1 },
        prc: { value: 0 }
      },
      details: {
        race: 'Elf',
        background: 'Sage',
        alignment: 'Neutral Good',
        level: 10,
        xp: { value: 64000 }
      },
      currency: { cp: 10, sp: 20, gp: 100, pp: 5, ep: 0 },
      traits: {
        languages: { value: ['Common', 'Elvish', 'Dwarvish'] },
        dr: { value: ['fire'] },
        di: { value: [] },
        dv: { value: ['cold'] },
        weaponProf: { value: ['simple'] },
        armorProf: { value: [] },
        toolProf: { value: [] }
      }
    },
    items: [],
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('importFoundryCharacter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uuidCounter = 0
  })

  it('returns null when dialog is cancelled', async () => {
    mockShowOpenDialog.mockResolvedValue(null)
    expect(await importFoundryCharacter()).toBeNull()
  })

  it('returns null for non-Foundry JSON (missing system.abilities)', async () => {
    mockShowOpenDialog.mockResolvedValue('/tmp/bad.json')
    mockReadFile.mockResolvedValue(JSON.stringify({ name: 'Not Foundry', system: {} }))

    expect(await importFoundryCharacter()).toBeNull()
  })

  it('returns null for invalid JSON', async () => {
    mockShowOpenDialog.mockResolvedValue('/tmp/bad.json')
    mockReadFile.mockResolvedValue('not json')

    expect(await importFoundryCharacter()).toBeNull()
  })

  it('parses a valid Foundry actor with ability scores', async () => {
    const actor = makeFoundryActor()
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result).not.toBeNull()
    expect(result!.abilityScores).toEqual({
      strength: 8,
      dexterity: 14,
      constitution: 12,
      intelligence: 20,
      wisdom: 18,
      charisma: 16
    })
  })

  it('extracts HP, AC, speed, and treasure', async () => {
    const actor = makeFoundryActor()
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.hitPoints).toEqual({ current: 55, maximum: 55, temporary: 5 })
    expect(result!.armorClass).toBe(15)
    expect(result!.speed).toBe(30)
    expect(result!.treasure).toEqual({ cp: 10, sp: 20, gp: 100, pp: 5, ep: 0 })
  })

  it('extracts species, background, alignment from details', async () => {
    const actor = makeFoundryActor()
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.species).toBe('Elf')
    expect(result!.background).toBe('Sage')
    expect(result!.alignment).toBe('Neutral Good')
  })

  it('maps skills from Foundry abbreviations', async () => {
    const actor = makeFoundryActor()
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    const arcana = result!.skills.find((s) => s.name === 'Arcana')
    expect(arcana).toBeDefined()
    expect(arcana!.proficient).toBe(true)
    expect(arcana!.expertise).toBe(true)

    const history = result!.skills.find((s) => s.name === 'History')
    expect(history).toBeDefined()
    expect(history!.proficient).toBe(true)
    expect(history!.expertise).toBe(false)

    const perception = result!.skills.find((s) => s.name === 'Perception')
    expect(perception).toBeDefined()
    expect(perception!.proficient).toBe(false)
  })

  it('parses weapon items', async () => {
    const actor = makeFoundryActor({
      items: [
        {
          _id: 'w1',
          name: 'Longsword',
          type: 'weapon',
          system: {
            damage: { parts: [['1d8', 'slashing']] },
            attackBonus: 2,
            properties: ['versatile'],
            range: { value: 5 },
            proficient: true,
            weight: 3
          }
        }
      ]
    })
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.weapons).toHaveLength(1)
    expect(result!.weapons[0].name).toBe('Longsword')
    expect(result!.weapons[0].damage).toBe('1d8')
    expect(result!.weapons[0].damageType).toBe('slashing')
  })

  it('parses armor items', async () => {
    const actor = makeFoundryActor({
      items: [
        {
          _id: 'a1',
          name: 'Chain Mail',
          type: 'equipment',
          system: {
            armor: { value: 16 },
            equipped: true,
            type: { value: 'heavy' },
            stealth: true,
            strength: 13,
            weight: 55
          }
        }
      ]
    })
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.armor).toHaveLength(1)
    expect(result!.armor[0].name).toBe('Chain Mail')
    expect(result!.armor[0].acBonus).toBe(16)
    expect(result!.armor[0].equipped).toBe(true)
  })

  it('parses shield equipment as armor', async () => {
    const actor = makeFoundryActor({
      items: [
        {
          _id: 's1',
          name: 'Shield',
          type: 'equipment',
          system: {
            armor: { value: 2 },
            equipped: true,
            type: { value: 'shield' },
            weight: 6
          }
        }
      ]
    })
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.armor).toHaveLength(1)
    expect(result!.armor[0].type).toBe('shield')
  })

  it('parses spells with school, components, and ritual flags', async () => {
    const actor = makeFoundryActor({
      items: [
        {
          _id: 'sp1',
          name: 'Fireball',
          type: 'spell',
          system: {
            level: 3,
            school: 'evo',
            activation: { type: '1 action' },
            range: { value: 150 },
            duration: { value: 0, units: 'instantaneous' },
            components: { vocal: true, somatic: true, material: true, concentration: false, ritual: false },
            materials: { value: 'a tiny ball of bat guano' }
          }
        }
      ]
    })
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.knownSpells).toHaveLength(1)
    const spell = result!.knownSpells[0]
    expect(spell.name).toBe('Fireball')
    expect(spell.level).toBe(3)
    expect(spell.school).toBe('Evocation')
    expect(spell.components).toContain('V')
    expect(spell.components).toContain('S')
    expect(spell.components).toContain('M')
    expect(spell.concentration).toBe(false)
    expect(spell.ritual).toBe(false)
  })

  it('parses class items and calculates total level', async () => {
    const actor = makeFoundryActor({
      items: [
        {
          name: 'Wizard',
          type: 'class',
          system: { levels: 7, subclass: 'School of Evocation' }
        },
        {
          name: 'Fighter',
          type: 'class',
          system: { levels: 3 }
        }
      ]
    })
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.classes).toHaveLength(2)
    expect(result!.level).toBe(10)
    expect(result!.classes[0].hitDie).toBe(6) // wizard
    expect(result!.classes[1].hitDie).toBe(10) // fighter
  })

  it('creates a default class if no class items found', async () => {
    const actor = makeFoundryActor()
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.classes).toHaveLength(1)
    expect(result!.classes[0].name).toBe('Unknown')
  })

  it('parses feat items as feats or class features', async () => {
    const actor = makeFoundryActor({
      items: [
        {
          _id: 'f1',
          name: 'Alert',
          type: 'feat',
          system: { description: { value: 'Always ready' }, type: { value: 'feat' } }
        },
        {
          _id: 'f2',
          name: 'Action Surge',
          type: 'feat',
          system: { description: { value: 'Extra action' }, type: { value: 'class' }, requirements: 'Fighter 2' }
        }
      ]
    })
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.feats).toHaveLength(1)
    expect(result!.feats[0].name).toBe('Alert')

    expect(result!.classFeatures).toHaveLength(1)
    expect(result!.classFeatures[0].name).toBe('Action Surge')
    expect(result!.classFeatures[0].level).toBe(2)
  })

  it('parses loot, consumable, tool, and backpack items as equipment', async () => {
    const actor = makeFoundryActor({
      items: [
        { name: 'Potion of Healing', type: 'consumable', system: { quantity: 3 } },
        { name: 'Gold Ring', type: 'loot', system: { quantity: 1, weight: 0.1 } },
        { name: "Thieves' Tools", type: 'tool', system: { quantity: 1 } },
        { name: 'Backpack', type: 'backpack', system: { quantity: 1 } }
      ]
    })
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.equipment).toHaveLength(4)
    const potions = result!.equipment.find((e) => e.name === 'Potion of Healing')
    expect(potions!.quantity).toBe(3)
    expect(potions!.type).toBe('Consumable')
  })

  it('extracts traits: languages, resistances, immunities, vulnerabilities', async () => {
    const actor = makeFoundryActor()
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.proficiencies.languages).toEqual(['Common', 'Elvish', 'Dwarvish'])
    expect(result!.resistances).toEqual(['fire'])
    expect(result!.vulnerabilities).toEqual(['cold'])
  })

  it('always sets gameSystem to dnd5e and generates a new UUID for id', async () => {
    const actor = makeFoundryActor()
    mockShowOpenDialog.mockResolvedValue('/tmp/foundry.json')
    mockReadFile.mockResolvedValue(JSON.stringify(actor))

    const result = await importFoundryCharacter()

    expect(result!.gameSystem).toBe('dnd5e')
    expect(result!.id).toMatch(/^uuid-/)
  })
})
