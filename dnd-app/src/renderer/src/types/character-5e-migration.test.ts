import { describe, expect, it } from 'vitest'
import type { Character5eV3 } from './character-5e'
import { migrateCharacter5eFromV3ToV4 } from './character-5e-migration'

function v3Character(over: Partial<Character5eV3> = {}): Character5eV3 {
  return {
    id: 'char-1',
    gameSystem: 'dnd5e',
    campaignId: null,
    playerId: 'p1',
    name: 'Tav',
    species: 'human',
    classes: [{ name: 'Fighter', level: 3, hitDie: 10 }],
    level: 3,
    background: 'soldier',
    alignment: 'Lawful Good',
    xp: 900,
    levelingMode: 'xp',
    abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
    hitPoints: { current: 28, maximum: 28, temporary: 0 },
    hitDice: [{ current: 3, maximum: 3, dieType: 10 }],
    armorClass: 16,
    initiative: 1,
    speed: 30,
    speeds: { swim: 0, fly: 0, climb: 0, burrow: 0 },
    senses: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    details: {},
    proficiencies: { weapons: [], armor: [], tools: [], languages: ['Common'], savingThrows: ['strength'] },
    skills: [],
    equipment: [],
    treasure: { cp: 0, sp: 0, gp: 0, pp: 0 },
    features: [],
    knownSpells: [],
    preparedSpellIds: [],
    spellSlotLevels: {},
    classFeatures: [],
    weapons: [],
    armor: [],
    feats: [],
    buildChoices: {
      speciesId: 'human',
      classId: 'fighter',
      backgroundId: 'soldier',
      selectedSkills: [],
      abilityScoreMethod: 'standard',
      abilityScoreAssignments: {}
    },
    status: 'active',
    campaignHistory: [],
    backstory: '',
    notes: '',
    pets: [],
    deathSaves: { successes: 0, failures: 0 },
    attunement: [],
    languageDescriptions: {},
    conditions: [],
    createdAt: '2026-05-19T00:00:00Z',
    updatedAt: '2026-05-19T00:00:00Z',
    ...over
  }
}

describe('migrateCharacter5eFromV3ToV4', () => {
  it('produces speciesRef from species string', () => {
    const out = migrateCharacter5eFromV3ToV4(v3Character({ species: 'elf' }))
    expect(out.speciesRef).toEqual({ entryType: 'species', entryId: 'elf' })
  })

  it('produces backgroundRef from background string', () => {
    const out = migrateCharacter5eFromV3ToV4(v3Character({ background: 'sage' }))
    expect(out.backgroundRef).toEqual({ entryType: 'backgrounds', entryId: 'sage' })
  })

  it('carries condition name/value/duration into ref overrides (PHASE-02 02A)', () => {
    const out = migrateCharacter5eFromV3ToV4(
      v3Character({
        conditions: [
          { name: 'Exhaustion', type: 'condition', isCustom: false, value: 2 },
          { name: 'Cursed by the Witch', type: 'condition', isCustom: true, duration: 3 }
        ]
      } as never)
    )
    expect(out.conditionRefs).toHaveLength(2)
    const exhaustion = out.conditionRefs?.find((r) => r.ref.entryId === 'exhaustion')
    expect(exhaustion?.ref.overrides).toMatchObject({ name: 'Exhaustion', value: 2, isCustom: false })
    const custom = out.conditionRefs?.find((r) => r.ref.entryId === 'cursed-by-the-witch')
    // A custom condition with no library entry round-trips purely via overrides.
    expect(custom?.ref.overrides).toMatchObject({ name: 'Cursed by the Witch', isCustom: true, duration: 3 })
  })

  it('produces classRefs with instanceId, level, levelTaken, and subclassRef', () => {
    const out = migrateCharacter5eFromV3ToV4(
      v3Character({ classes: [{ name: 'Fighter', level: 3, subclass: 'champion', hitDie: 10 }] })
    )
    expect(out.classRefs).toHaveLength(1)
    const c = out.classRefs?.[0]
    expect(c?.ref).toEqual({ entryType: 'classes', entryId: 'fighter' })
    expect(c?.level).toBe(3)
    expect(c?.levelTaken).toBe(1)
    expect(c?.subclassRef).toEqual({ entryType: 'subclasses', entryId: 'champion' })
    expect(typeof c?.instanceId).toBe('string')
  })

  it('produces knownSpellRefs with stable instanceIds', () => {
    const out = migrateCharacter5eFromV3ToV4(
      v3Character({
        knownSpells: [
          {
            id: 'fireball',
            name: 'Fireball',
            level: 3,
            description: '',
            castingTime: '1 action',
            range: '150 feet',
            duration: 'Instantaneous',
            components: 'V, S, M'
          }
        ]
      })
    )
    expect(out.knownSpellRefs).toHaveLength(1)
    expect(out.knownSpellRefs?.[0].ref).toEqual({ entryType: 'spells', entryId: 'fireball' })
    expect(typeof out.knownSpellRefs?.[0].instanceId).toBe('string')
  })

  it('produces preparedSpellIds state map keyed by instance', () => {
    const out = migrateCharacter5eFromV3ToV4(
      v3Character({
        knownSpells: [
          {
            id: 'fireball',
            name: 'Fireball',
            level: 3,
            description: '',
            castingTime: '1 action',
            range: '150 feet',
            duration: 'Instantaneous',
            components: 'V, S, M'
          }
        ],
        preparedSpellIds: ['fireball']
      })
    )
    const instanceId = out.knownSpellRefs?.[0].instanceId
    expect(instanceId).toBeDefined()
    expect(out.state?.preparedSpellIds?.[instanceId!]).toBe(true)
  })

  it('produces magicItemAttuned + magicItemCharges from legacy magicItems', () => {
    const out = migrateCharacter5eFromV3ToV4(
      v3Character({
        magicItems: [
          {
            id: 'wand-123',
            name: 'Wand of Magic Missiles',
            rarity: 'uncommon',
            type: 'wand',
            attunement: true,
            attuned: true,
            description: '',
            charges: { current: 5, max: 7, rechargeType: 'dawn' }
          }
        ]
      })
    )
    expect(out.magicItemRefs).toHaveLength(1)
    expect(out.magicItemRefs?.[0].instanceId).toBe('wand-123')
    expect(out.state?.magicItemAttuned?.['wand-123']).toBe(true)
    expect(out.state?.magicItemCharges?.['wand-123']).toBe(5)
  })

  it('is idempotent — v4 fields already present are preserved unchanged', () => {
    const v4 = migrateCharacter5eFromV3ToV4(v3Character({ species: 'elf' }))
    const v4Again = migrateCharacter5eFromV3ToV4(v4)
    expect(v4Again.speciesRef).toEqual(v4.speciesRef)
    expect(v4Again.state).toEqual(v4.state)
  })

  it('leaves a v3 character with no inline data fully untouched on the v4 side', () => {
    const out = migrateCharacter5eFromV3ToV4(v3Character({ knownSpells: [], magicItems: undefined }))
    expect(out.knownSpellRefs).toBeUndefined()
    expect(out.magicItemRefs).toBeUndefined()
  })

  it('legacy v3 fields stay intact after migration (additive only)', () => {
    const v3 = v3Character({ species: 'dwarf', background: 'sage' })
    const out = migrateCharacter5eFromV3ToV4(v3)
    expect(out.species).toBe('dwarf')
    expect(out.background).toBe('sage')
    expect(out.speciesRef).toEqual({ entryType: 'species', entryId: 'dwarf' })
    expect(out.backgroundRef).toEqual({ entryType: 'backgrounds', entryId: 'sage' })
  })
})
