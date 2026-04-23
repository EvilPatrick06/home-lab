/**
 * JSON Data Schema Validation Tests
 * Verifies all 5e JSON data files conform to their TypeScript interfaces.
 * Catches field name mismatches, missing required fields, and type violations.
 */

/// <reference types="node" />
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

const DATA_DIR = resolve(__dirname, '../../public/data/5e')

// Files were reorganized into subdirectories — map flat names to actual paths
const FILE_PATH_MAP: Record<string, string> = {
  'subclasses.json': 'character/subclasses.json',
  'class-features.json': 'character/class-features.json',
  'spells.json': 'spells/spells.json',
  'equipment.json': 'equipment/equipment.json',
  'magic-items.json': 'equipment/magic-items.json',
  'monsters.json': 'dm/npcs/monsters.json',
  'creatures.json': 'dm/npcs/creatures.json',
  'npcs.json': 'dm/npcs/npcs.json',
  'invocations.json': 'game/mechanics/invocations.json',
  'metamagic.json': 'game/mechanics/metamagic.json',
  'crafting.json': 'world/crafting.json',
  'treasure-tables.json': 'world/treasure-tables.json',
  'encounter-budgets.json': 'encounters/encounter-budgets.json',
  'encounter-presets.json': 'encounters/encounter-presets.json',
  'random-tables.json': 'encounters/random-tables.json',
  'chase-tables.json': 'encounters/chase-tables.json',
  'adventures.json': 'adventures/adventures.json',
  'sound-events.json': '../audio/sound-events.json',
  'bastion-events.json': 'bastions/bastion-events.json',
  'bastion-facilities.json': 'bastions/bastion-facilities.json',
  'ability-score-config.json': 'character/ability-score-config.json',
  'currency-config.json': 'equipment/currency-config.json',
  'sentient-items.json': 'equipment/sentient-items.json',
  'class-resources.json': 'game/mechanics/class-resources.json',
  'effect-definitions.json': 'game/mechanics/effect-definitions.json',
  'species-resources.json': 'game/mechanics/species-resources.json',
  'spell-slots.json': 'game/mechanics/spell-slots.json',
  'xp-thresholds.json': 'game/mechanics/xp-thresholds.json',
  'npc-mannerisms.json': 'dm/npcs/generation-tables/npc-mannerisms.json',
  'built-in-maps.json': 'world/built-in-maps.json',
  'session-zero-config.json': 'world/session-zero-config.json',
  'settlements.json': 'world/settlements.json',
  'diseases.json': 'hazards/diseases.json',
  'traps.json': 'hazards/traps.json',
  'hazards.json': 'hazards/hazards.json',
  'poisons.json': 'hazards/poisons.json'
}

function loadJsonFile<T>(filename: string): T {
  const resolved = FILE_PATH_MAP[filename] ?? filename
  const raw = readFileSync(resolve(DATA_DIR, resolved), 'utf-8')
  return JSON.parse(raw) as T
}

function loadFromIndex<T>(
  indexPath: string,
  filter?: (entry: Record<string, unknown>) => boolean
): (T & { id: string })[] {
  const indexRaw = readFileSync(resolve(DATA_DIR, indexPath), 'utf-8')
  let index = JSON.parse(indexRaw) as Array<{ id: string; path: string; [key: string]: unknown }>
  if (filter) index = index.filter(filter)
  return index.map((entry) => {
    const raw = readFileSync(resolve(DATA_DIR, entry.path), 'utf-8')
    const data = JSON.parse(raw) as T
    return { ...data, id: entry.id }
  })
}

// === species (via index) ===
describe('species (index)', () => {
  let data: Array<Record<string, unknown>>
  beforeAll(() => {
    data = loadFromIndex('origins/species/index.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    for (const species of data) {
      expect(species).toHaveProperty('id')
      expect(species).toHaveProperty('name')
      expect(species).toHaveProperty('speed')
      expect(species).toHaveProperty('size')
      expect(species).toHaveProperty('traits')
      expect(typeof species.id).toBe('string')
      expect(typeof species.name).toBe('string')
      expect(typeof species.speed).toBe('number')
      const size = species.size as Record<string, unknown>
      expect(size).toHaveProperty('type')
      expect(['fixed', 'choice']).toContain(size.type)
      expect(Array.isArray(species.traits)).toBe(true)
    }
  })

  it('trait entries are objects with name and description', () => {
    for (const species of data as Array<{ traits: unknown[] }>) {
      for (const trait of species.traits) {
        expect(typeof trait).toBe('object')
        const t = trait as Record<string, unknown>
        expect(t).toHaveProperty('name')
        expect(t).toHaveProperty('description')
        expect(typeof t.name).toBe('string')
        expect(typeof t.description).toBe('string')
      }
    }
  })

  it('IDs are kebab-case and unique', () => {
    const ids = (data as Array<{ id: string }>).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })
})

// === classes (via index) ===
describe('classes (index)', () => {
  let data: Array<Record<string, unknown>>
  beforeAll(() => {
    data = loadFromIndex('classes/index.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    for (const cls of data) {
      expect(cls).toHaveProperty('id')
      expect(cls).toHaveProperty('name')
      expect(cls).toHaveProperty('coreTraits')
      const core = cls.coreTraits as Record<string, unknown>
      expect(core).toHaveProperty('primaryAbility')
      expect(core).toHaveProperty('hitPointDie')
      expect(core).toHaveProperty('savingThrowProficiencies')
      expect(Array.isArray(core.primaryAbility)).toBe(true)
      expect(typeof core.hitPointDie).toBe('string')
      expect(Array.isArray(core.savingThrowProficiencies)).toBe(true)
    }
  })

  it('IDs are unique', () => {
    const ids = (data as Array<{ id: string }>).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// === backgrounds (via index) ===
describe('backgrounds (index)', () => {
  let data: Array<Record<string, unknown>>
  beforeAll(() => {
    data = loadFromIndex('origins/backgrounds/index.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    for (const bg of data) {
      expect(bg).toHaveProperty('id')
      expect(bg).toHaveProperty('name')
      expect(bg).toHaveProperty('skillProficiencies')
      expect(bg).toHaveProperty('toolProficiency')
      expect(bg).toHaveProperty('feat')
      expect(bg).toHaveProperty('equipment')
    }
  })

  it('IDs are unique', () => {
    const ids = (data as Array<{ id: string }>).map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// === subclasses.json ===
describe('subclasses.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('subclasses.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    for (const sc of data as Record<string, unknown>[]) {
      expect(sc).toHaveProperty('id')
      expect(sc).toHaveProperty('name')
      expect(sc).toHaveProperty('class')
      expect(sc).toHaveProperty('features')
      expect(Array.isArray(sc.features)).toBe(true)
    }
  })

  it('IDs are unique', () => {
    const ids = (data as Array<{ id: string }>).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// === feats (via index) ===
describe('feats (index)', () => {
  let data: Array<Record<string, unknown>>
  beforeAll(() => {
    data = loadFromIndex('feats/index.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    for (const feat of data) {
      expect(feat).toHaveProperty('id')
      expect(feat).toHaveProperty('name')
      expect(feat).toHaveProperty('category')
      expect(['Origin', 'General', 'Fighting Style', 'Epic Boon']).toContain(feat.category)
      if (feat.benefits !== undefined) {
        expect(Array.isArray(feat.benefits)).toBe(true)
        for (const benefit of feat.benefits as Array<Record<string, unknown>>) {
          expect(benefit).toHaveProperty('name')
          expect(benefit).toHaveProperty('description')
          expect(typeof benefit.name).toBe('string')
          expect(typeof benefit.description).toBe('string')
        }
      }
    }
  })

  it('IDs are unique', () => {
    const ids = (data as Array<{ id: string }>).map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// === spells.json ===
describe('spells.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('spells.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    const validSchools = [
      'Abjuration',
      'Conjuration',
      'Divination',
      'Enchantment',
      'Evocation',
      'Illusion',
      'Necromancy',
      'Transmutation'
    ]
    for (const spell of data as Record<string, unknown>[]) {
      expect(spell).toHaveProperty('id')
      expect(spell).toHaveProperty('name')
      expect(spell).toHaveProperty('level')
      expect(spell).toHaveProperty('school')
      expect(spell).toHaveProperty('castingTime')
      expect(spell).toHaveProperty('range')
      expect(spell).toHaveProperty('duration')
      expect(spell).toHaveProperty('description')
      expect(typeof spell.level).toBe('number')
      expect(typeof spell.concentration).toBe('boolean')
      expect(typeof spell.ritual).toBe('boolean')
      expect(validSchools).toContain(spell.school)
    }
  })

  it('IDs are unique', () => {
    const ids = (data as Array<{ id: string }>).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// === equipment.json ===
describe('equipment.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('equipment.json')
  })

  it('has weapons array', () => {
    expect(data).toHaveProperty('weapons')
    expect(Array.isArray(data.weapons)).toBe(true)
  })

  it('each weapon has required fields', () => {
    for (const w of data.weapons as Record<string, unknown>[]) {
      expect(w).toHaveProperty('name')
      expect(w).toHaveProperty('category')
      expect(w).toHaveProperty('damage')
      expect(w).toHaveProperty('damageType')
      expect(w).toHaveProperty('properties')
      expect(Array.isArray(w.properties)).toBe(true)
    }
  })
})

// === class-features.json ===
describe('class-features.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('class-features.json')
  })

  it('is an object keyed by class ID', () => {
    expect(typeof data).toBe('object')
    expect(Object.keys(data).length).toBeGreaterThan(0)
  })

  it('each class entry has features array', () => {
    for (const [_classId, classData] of Object.entries(data)) {
      const cd = classData as Record<string, unknown>
      expect(cd).toHaveProperty('features')
      expect(Array.isArray(cd.features)).toBe(true)
      for (const feat of cd.features as Record<string, unknown>[]) {
        expect(feat).toHaveProperty('level')
        expect(feat).toHaveProperty('name')
        expect(feat).toHaveProperty('description')
        expect(typeof feat.level).toBe('number')
      }
    }
  })
})

// === monsters.json ===
describe('monsters.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('monsters.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each monster has required fields', () => {
    for (const m of data as Record<string, unknown>[]) {
      expect(m).toHaveProperty('id')
      expect(m).toHaveProperty('name')
      expect(m).toHaveProperty('type')
      expect(m).toHaveProperty('cr')
      expect(m).toHaveProperty('ac')
      expect(m).toHaveProperty('hp')
      expect(m).toHaveProperty('abilityScores')
    }
  })

  it('IDs are unique', () => {
    const ids = (data as Array<{ id: string }>).map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// === magic-items.json ===
describe('magic-items.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('magic-items.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each item has required fields', () => {
    const validRarities = ['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact']
    for (const item of data as Record<string, unknown>[]) {
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('name')
      expect(item).toHaveProperty('rarity')
      expect(item).toHaveProperty('type')
      expect(item).toHaveProperty('description')
      expect(validRarities).toContain(item.rarity)
    }
  })

  it('IDs are unique', () => {
    const ids = (data as Array<{ id: string }>).map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// === invocations.json ===
describe('invocations.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('invocations.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each invocation has required fields', () => {
    for (const inv of data as Record<string, unknown>[]) {
      expect(inv).toHaveProperty('id')
      expect(inv).toHaveProperty('name')
      expect(inv).toHaveProperty('description')
      expect(inv).toHaveProperty('levelRequirement')
      expect(typeof inv.levelRequirement).toBe('number')
    }
  })
})

// === metamagic.json ===
describe('metamagic.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('metamagic.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each metamagic has required fields', () => {
    for (const mm of data as Record<string, unknown>[]) {
      expect(mm).toHaveProperty('id')
      expect(mm).toHaveProperty('name')
      expect(mm).toHaveProperty('description')
      expect(mm).toHaveProperty('sorceryPointCost')
    }
  })
})

// === crafting.json ===
describe('crafting.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('crafting.json')
  })

  it('is a non-empty array of tool entries', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each tool group has tool name and items', () => {
    for (const entry of data as Record<string, unknown>[]) {
      expect(entry).toHaveProperty('tool')
      expect(entry).toHaveProperty('items')
      expect(typeof entry.tool).toBe('string')
      expect(Array.isArray(entry.items)).toBe(true)
    }
  })
})

// === encounter-budgets.json ===
describe('encounter-budgets.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('encounter-budgets.json')
  })

  it('has perCharacterBudget array', () => {
    expect(data).toHaveProperty('perCharacterBudget')
    expect(Array.isArray(data.perCharacterBudget)).toBe(true)
  })

  it('each budget entry has level and difficulty tiers', () => {
    for (const entry of data.perCharacterBudget as Record<string, unknown>[]) {
      expect(entry).toHaveProperty('level')
      expect(entry).toHaveProperty('low')
      expect(entry).toHaveProperty('moderate')
      expect(entry).toHaveProperty('high')
      expect(typeof entry.level).toBe('number')
    }
  })
})

// === treasure-tables.json ===
describe('treasure-tables.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('treasure-tables.json')
  })

  it('has individual and hoard arrays with all 4 CR tiers', () => {
    expect(data).toHaveProperty('individual')
    expect(data).toHaveProperty('hoard')
    expect(data).toHaveProperty('magicItemRarities')
    expect(Array.isArray(data.individual)).toBe(true)
    expect(Array.isArray(data.hoard)).toBe(true)
    const individual = data.individual as { crRange: string }[]
    const hoard = data.hoard as { crRange: string }[]
    expect(individual).toHaveLength(4)
    expect(hoard).toHaveLength(4)
    for (const entry of individual) {
      expect(entry).toHaveProperty('crRange')
      expect(entry).toHaveProperty('amount')
      expect(entry).toHaveProperty('unit')
    }
    for (const entry of hoard) {
      expect(entry).toHaveProperty('crRange')
      expect(entry).toHaveProperty('coins')
      expect(entry).toHaveProperty('magicItems')
    }
  })
})

// === diseases.json ===
describe('diseases.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('diseases.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each disease has required fields', () => {
    for (const d of data as Record<string, unknown>[]) {
      expect(d).toHaveProperty('id')
      expect(d).toHaveProperty('name')
      expect(d).toHaveProperty('effect')
    }
  })
})

// === encounter-presets.json ===
describe('encounter-presets.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('encounter-presets.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each preset has required fields', () => {
    for (const p of data as Record<string, unknown>[]) {
      expect(p).toHaveProperty('id')
      expect(p).toHaveProperty('name')
      expect(p).toHaveProperty('monsters')
      expect(Array.isArray(p.monsters)).toBe(true)
    }
  })
})

// === traps.json ===
describe('traps.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('traps.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each trap has required fields', () => {
    for (const t of data as Record<string, unknown>[]) {
      expect(t).toHaveProperty('id')
      expect(t).toHaveProperty('name')
      expect(t).toHaveProperty('trigger')
      expect(t).toHaveProperty('effect')
    }
  })
})

// === hazards.json ===
describe('hazards.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('hazards.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each hazard has required fields', () => {
    for (const h of data as Record<string, unknown>[]) {
      expect(h).toHaveProperty('id')
      expect(h).toHaveProperty('name')
      expect(h).toHaveProperty('effect')
    }
  })
})

// === poisons.json ===
describe('poisons.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('poisons.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each poison has required fields', () => {
    for (const p of data as Record<string, unknown>[]) {
      expect(p).toHaveProperty('id')
      expect(p).toHaveProperty('name')
      expect(p).toHaveProperty('type')
      expect(['ingested', 'inhaled', 'contact', 'injury']).toContain(p.type)
    }
  })
})

// === random-tables.json ===
describe('random-tables.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('random-tables.json')
  })

  it('has expected top-level keys', () => {
    expect(data).toHaveProperty('npcTraits')
    expect(data).toHaveProperty('weather')
    expect(data).toHaveProperty('tavernNames')
    expect(data).toHaveProperty('shopNames')
    expect(data).toHaveProperty('plotHooks')
  })
})

// === chase-tables.json ===
describe('chase-tables.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('chase-tables.json')
  })

  it('has urban and wilderness arrays', () => {
    expect(data).toHaveProperty('urban')
    expect(data).toHaveProperty('wilderness')
    expect(Array.isArray(data.urban)).toBe(true)
    expect(Array.isArray(data.wilderness)).toBe(true)
  })
})

// === adventures.json ===
describe('adventures.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('adventures.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each adventure has required fields', () => {
    for (const adventure of data as Record<string, unknown>[]) {
      expect(adventure).toHaveProperty('id')
      expect(adventure).toHaveProperty('name')
      expect(adventure).toHaveProperty('description')
      expect(adventure).toHaveProperty('chapters')
      expect(Array.isArray(adventure.chapters)).toBe(true)
    }
  })
})

// === sound-events.json ===
describe('sound-events.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('sound-events.json')
  })

  it('contains core top-level collections', () => {
    expect(data).toHaveProperty('soundEvents')
    expect(data).toHaveProperty('ambientSounds')
    expect(data).toHaveProperty('categories')
    expect(Array.isArray(data.soundEvents)).toBe(true)
    expect(Array.isArray(data.ambientSounds)).toBe(true)
  })
})

// === bastion-events.json ===
describe('bastion-events.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('bastion-events.json')
  })

  it('contains expected event tables', () => {
    expect(data).toHaveProperty('allIsWellFlavors')
    expect(data).toHaveProperty('eventsTable')
    expect(Array.isArray(data.allIsWellFlavors)).toBe(true)
    expect(Array.isArray(data.eventsTable)).toBe(true)
  })
})

// === bastion-facilities.json ===
describe('bastion-facilities.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('bastion-facilities.json')
  })

  it('contains basic and special facility lists', () => {
    expect(data).toHaveProperty('basicFacilities')
    expect(data).toHaveProperty('specialFacilities')
    expect(Array.isArray(data.basicFacilities)).toBe(true)
    expect(Array.isArray(data.specialFacilities)).toBe(true)
  })
})

// === ability-score-config.json ===
describe('ability-score-config.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('ability-score-config.json')
  })

  it('contains builder ability score configuration fields', () => {
    expect(data).toHaveProperty('pointBuyCosts')
    expect(data).toHaveProperty('standardArray')
    expect(data).toHaveProperty('methods')
    expect(Array.isArray(data.standardArray)).toBe(true)
    expect(Array.isArray(data.methods)).toBe(true)
  })
})

// === creatures.json ===
describe('creatures.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('creatures.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each creature has required combat fields', () => {
    for (const creature of data as Record<string, unknown>[]) {
      expect(creature).toHaveProperty('id')
      expect(creature).toHaveProperty('name')
      expect(creature).toHaveProperty('ac')
      expect(creature).toHaveProperty('hp')
    }
  })
})

// === npcs.json ===
describe('npcs.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('npcs.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each npc has required combat fields', () => {
    for (const npc of data as Record<string, unknown>[]) {
      expect(npc).toHaveProperty('id')
      expect(npc).toHaveProperty('name')
      expect(npc).toHaveProperty('ac')
      expect(npc).toHaveProperty('hp')
    }
  })
})

// === currency-config.json ===
describe('currency-config.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('currency-config.json')
  })

  it('is a non-empty array of currency entries', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each currency entry has key metadata', () => {
    for (const currency of data as Record<string, unknown>[]) {
      expect(currency).toHaveProperty('key')
      expect(currency).toHaveProperty('label')
      expect(currency).toHaveProperty('fullName')
    }
  })
})

// === sentient-items.json ===
describe('sentient-items.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('sentient-items.json')
  })

  it('contains sentient item lookup tables', () => {
    expect(data).toHaveProperty('alignmentTable')
    expect(data).toHaveProperty('communicationTable')
    expect(data).toHaveProperty('sensesTable')
  })
})

// === class-resources.json ===
describe('class-resources.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('class-resources.json')
  })

  it('contains class and feat resource maps', () => {
    expect(data).toHaveProperty('classes')
    expect(data).toHaveProperty('feats')
    expect(typeof data.classes).toBe('object')
    expect(typeof data.feats).toBe('object')
  })
})

// === effect-definitions.json ===
describe('effect-definitions.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('effect-definitions.json')
  })

  it('contains effect definition groups', () => {
    expect(data).toHaveProperty('magicItems')
    expect(data).toHaveProperty('feats')
    expect(data).toHaveProperty('fightingStyles')
  })
})

// === species-resources.json ===
describe('species-resources.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('species-resources.json')
  })

  it('contains species resource map', () => {
    expect(data).toHaveProperty('species')
    expect(typeof data.species).toBe('object')
  })
})

// === spell-slots.json ===
describe('spell-slots.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('spell-slots.json')
  })

  it('contains caster slot progressions', () => {
    expect(data).toHaveProperty('fullCaster')
    expect(data).toHaveProperty('halfCaster')
    expect(data).toHaveProperty('thirdCaster')
    expect(data).toHaveProperty('warlock')
  })
})

// === xp-thresholds.json ===
describe('xp-thresholds.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('xp-thresholds.json')
  })

  it('is a non-empty array of numbers', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    for (const value of data) {
      expect(typeof value).toBe('number')
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })
})

// === npc-mannerisms.json ===
describe('npc-mannerisms.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('npc-mannerisms.json')
  })

  it('contains voice and mannerism tables', () => {
    expect(data).toHaveProperty('voiceDescriptions')
    expect(data).toHaveProperty('mannerisms')
    expect(Array.isArray(data.voiceDescriptions)).toBe(true)
    expect(Array.isArray(data.mannerisms)).toBe(true)
  })
})

// === built-in-maps.json ===
describe('built-in-maps.json', () => {
  let data: unknown[]
  beforeAll(() => {
    data = loadJsonFile('built-in-maps.json')
  })

  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('each map has required fields', () => {
    for (const map of data as Record<string, unknown>[]) {
      expect(map).toHaveProperty('id')
      expect(map).toHaveProperty('name')
      expect(map).toHaveProperty('imagePath')
    }
  })
})

// === session-zero-config.json ===
describe('session-zero-config.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('session-zero-config.json')
  })

  it('contains session zero option groups', () => {
    expect(data).toHaveProperty('toneOptions')
    expect(data).toHaveProperty('deathOptions')
    expect(data).toHaveProperty('commonLimits')
    expect(Array.isArray(data.toneOptions)).toBe(true)
    expect(Array.isArray(data.deathOptions)).toBe(true)
    expect(Array.isArray(data.commonLimits)).toBe(true)
  })
})

// === settlements.json ===
describe('settlements.json', () => {
  let data: Record<string, unknown>
  beforeAll(() => {
    data = loadJsonFile('settlements.json')
  })

  it('contains settlement generation tables', () => {
    expect(data).toHaveProperty('sizes')
    expect(data).toHaveProperty('governmentTypes')
    expect(data).toHaveProperty('definingTraits')
    expect(Array.isArray(data.sizes)).toBe(true)
    expect(Array.isArray(data.governmentTypes)).toBe(true)
    expect(typeof data.definingTraits).toBe('object')
    expect(data.definingTraits).not.toBeNull()
  })
})

// === Cross-reference: encounter-presets monster IDs vs monsters.json ===
describe('cross-references', () => {
  it('encounter preset monster IDs exist in monsters.json, creatures.json, or npcs.json', () => {
    const monsters = loadJsonFile<Array<{ id: string }>>('monsters.json')
    const creatures = loadJsonFile<Array<{ id: string }>>('creatures.json')
    const npcs = loadJsonFile<Array<{ id: string }>>('npcs.json')
    const allIds = new Set([...monsters.map((m) => m.id), ...creatures.map((c) => c.id), ...npcs.map((n) => n.id)])
    const presets = loadJsonFile<Array<{ monsters: Array<{ id: string }> }>>('encounter-presets.json')
    for (const preset of presets) {
      for (const m of preset.monsters) {
        expect(allIds.has(m.id)).toBe(true)
      }
    }
  })

  it('background origin feats exist in feats', () => {
    const backgrounds = loadFromIndex<{ feat?: string }>('origins/backgrounds/index.json')
    const feats = loadFromIndex<{ name: string }>('feats/index.json')
    const featNames = new Set(feats.map((f) => f.name))
    for (const bg of backgrounds) {
      if (bg.feat && bg.feat !== 'any') {
        // feat uses display names; strip parenthetical variant (e.g. "Magic Initiate (Cleric)" → "Magic Initiate")
        const baseName = bg.feat.replace(/\s*\(.*\)$/, '')
        expect(featNames.has(baseName)).toBe(true)
      }
    }
  })

  it('subclass class references match classes', () => {
    const classes = loadFromIndex<Record<string, unknown>>('classes/index.json')
    const classIds = new Set(classes.map((c) => c.id))
    const subclasses = loadJsonFile<Array<{ class: string }>>('subclasses.json')
    for (const sc of subclasses) {
      expect(classIds.has(sc.class)).toBe(true)
    }
  })

  it('species inline traits have name and description', () => {
    const species = loadFromIndex<{
      traits: Array<{ name: string; description: string }>
    }>('origins/species/index.json')
    for (const sp of species) {
      for (const trait of sp.traits) {
        expect(typeof trait.name, `Species "${sp.id}" has trait with invalid name`).toBe('string')
        expect(trait.name.length).toBeGreaterThan(0)
        expect(typeof trait.description, `Species "${sp.id}" trait "${trait.name}" has invalid description`).toBe(
          'string'
        )
        expect(trait.description.length).toBeGreaterThan(0)
      }
    }
  })
})
