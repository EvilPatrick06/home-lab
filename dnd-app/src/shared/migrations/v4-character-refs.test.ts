import { describe, expect, it } from 'vitest'
import { migrateCharacter5eToRefs } from './v4-character-refs'

describe('migrateCharacter5eToRefs (shared v3→v4 core)', () => {
  it('derives v4 refs from v3 inline arrays and strips the v3 keys', () => {
    const v3 = {
      id: 'c1',
      name: 'Aria',
      gameSystem: 'dnd5e',
      species: 'elf',
      background: 'sage',
      classes: [{ name: 'Wizard', level: 3, subclass: 'evocation' }],
      knownSpells: [{ id: 'fireball' }],
      feats: [{ id: 'alert' }],
      weapons: [{ id: 'dagger', equipped: true }],
      armor: [{ id: 'leather', equipped: false }],
      magicItems: [{ id: 'wand-1', attuned: true, charges: { current: 4 } }],
      conditions: [{ name: 'Prone' }],
      preparedSpellIds: ['fireball']
    }

    const v4 = migrateCharacter5eToRefs({ ...v3 }) as Record<string, unknown>

    // refs derived
    expect(v4.speciesRef).toEqual({ entryType: 'species', entryId: 'elf' })
    expect(v4.backgroundRef).toEqual({ entryType: 'backgrounds', entryId: 'sage' })
    expect((v4.classRefs as Array<{ ref: { entryId: string } }>)[0].ref.entryId).toBe('wizard')
    expect((v4.knownSpellRefs as unknown[]).length).toBe(1)
    expect((v4.magicItemRefs as Array<{ instanceId: string }>)[0].instanceId).toBe('wand-1')

    // state derived
    const state = v4.state as Record<string, Record<string, unknown>>
    expect(Object.values(state.weaponEquipped)).toContain(true)
    expect(Object.values(state.magicItemAttuned)).toContain(true)
    expect(Object.values(state.magicItemCharges)).toContain(4)
    expect(Object.values(state.preparedSpellIds)).toContain(true)

    // v3 inline arrays stripped
    for (const k of [
      'classes',
      'knownSpells',
      'preparedSpellIds',
      'weapons',
      'armor',
      'magicItems',
      'feats',
      'conditions'
    ]) {
      expect(v4[k]).toBeUndefined()
    }
  })

  it('BUG-2 — carries inline weapon/armor objects as ref overrides so hydrate can reconstruct builder weapons', () => {
    // Builder/import weapons have a random-UUID id (no library entry). The ref MUST
    // carry the object as overrides or hydrate drops it ("No weapons equipped").
    const v3 = {
      id: 'c1',
      gameSystem: 'dnd5e',
      weapons: [{ id: 'a1b2-uuid', name: 'Greataxe', damage: '1d12', damageType: 'slashing', properties: ['heavy'] }],
      armor: [{ id: 'c3d4-uuid', name: 'Leather Armor', acBonus: 1, type: 'armor' }]
    }
    const v4 = migrateCharacter5eToRefs({ ...v3 }) as Record<string, unknown>

    const wRef = (
      v4.weaponRefs as Array<{ ref: { entryType: string; entryId: string; overrides?: Record<string, unknown> } }>
    )[0]
    expect(wRef.ref.entryType).toBe('weapons')
    expect(wRef.ref.entryId).toBe('a1b2-uuid')
    expect(wRef.ref.overrides).toMatchObject({ name: 'Greataxe', damage: '1d12', damageType: 'slashing' })

    const aRef = (v4.armorRefs as Array<{ ref: { overrides?: Record<string, unknown> } }>)[0]
    expect(aRef.ref.overrides).toMatchObject({ name: 'Leather Armor', acBonus: 1 })
  })

  it('is idempotent — re-running on already-v4 data leaves refs untouched and has no v3 keys', () => {
    const v3: Record<string, unknown> = {
      id: 'c1',
      gameSystem: 'dnd5e',
      species: 'human',
      classes: [{ name: 'Fighter', level: 1 }]
    }
    const once = migrateCharacter5eToRefs({ ...v3 })
    const twice = migrateCharacter5eToRefs({ ...once })
    expect(twice.speciesRef).toEqual(once.speciesRef)
    expect(twice.classRefs).toEqual(once.classRefs)
    expect(twice.classes).toBeUndefined()
  })

  it('does not mutate the input object', () => {
    const v3 = { id: 'c1', gameSystem: 'dnd5e', species: 'elf', classes: [{ name: 'Rogue', level: 2 }] }
    const copy = JSON.parse(JSON.stringify(v3))
    migrateCharacter5eToRefs(v3)
    expect(v3).toEqual(copy)
  })
})
