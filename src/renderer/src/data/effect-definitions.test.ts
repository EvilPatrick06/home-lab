import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(
    readSync(resolvePath(__dirname, '../../public/data/5e/game/mechanics/effect-definitions.json'), 'utf-8')
  )
})

vi.mock('../services/data-provider', () => ({
  load5eEffectDefinitions: vi.fn(() => Promise.resolve(dataJson))
}))

import {
  getAllEffectDefinitions,
  getConsumableEffects,
  getFeatEffects,
  getFightingStyleEffects,
  getMagicItemEffects
} from './effect-definitions'

describe('Effect Definitions JSON — structure', () => {
  it('has four top-level categories', () => {
    expect(dataJson).toHaveProperty('magicItems')
    expect(dataJson).toHaveProperty('feats')
    expect(dataJson).toHaveProperty('fightingStyles')
    expect(dataJson).toHaveProperty('consumables')
  })

  it('all effect sources have sourceId, sourceName, sourceType, and effects array', () => {
    const allCategories = [
      ...Object.values(dataJson.magicItems),
      ...Object.values(dataJson.feats),
      ...Object.values(dataJson.fightingStyles),
      ...Object.values(dataJson.consumables)
    ] as Array<{ sourceId: string; sourceName: string; sourceType: string; effects: unknown[] }>

    for (const entry of allCategories) {
      expect(typeof entry.sourceId).toBe('string')
      expect(typeof entry.sourceName).toBe('string')
      expect(typeof entry.sourceType).toBe('string')
      expect(Array.isArray(entry.effects)).toBe(true)
      expect(entry.effects.length).toBeGreaterThan(0)
    }
  })
})

describe('Magic Items — D&D 5e accuracy', () => {
  it('+1/+2/+3 Weapons grant matching attack and damage bonuses', () => {
    for (const tier of [1, 2, 3]) {
      const item = dataJson.magicItems[`+${tier} Weapon`]
      expect(item, `+${tier} Weapon should exist`).toBeDefined()
      expect(item.sourceType).toBe('magic-item')
      const attackBonus = item.effects.find((e: { type: string }) => e.type === 'attack_bonus')
      const damageBonus = item.effects.find((e: { type: string }) => e.type === 'damage_bonus')
      expect(attackBonus.value).toBe(tier)
      expect(damageBonus.value).toBe(tier)
    }
  })

  it('+1/+2/+3 Armor grants matching AC bonus', () => {
    for (const tier of [1, 2, 3]) {
      const item = dataJson.magicItems[`+${tier} Armor`]
      expect(item).toBeDefined()
      const acBonus = item.effects.find((e: { type: string }) => e.type === 'ac_bonus')
      expect(acBonus.value).toBe(tier)
    }
  })

  it('Cloak of Protection grants +1 AC and +1 saves (requires attunement)', () => {
    const cloak = dataJson.magicItems['Cloak of Protection']
    expect(cloak).toBeDefined()
    const ac = cloak.effects.find((e: { type: string }) => e.type === 'ac_bonus')
    const save = cloak.effects.find((e: { type: string }) => e.type === 'save_bonus')
    expect(ac.value).toBe(1)
    expect(ac.condition).toBe('attuned')
    expect(save.value).toBe(1)
    expect(save.scope).toBe('all')
  })

  it('Amulet of Health sets Constitution to 19', () => {
    const amulet = dataJson.magicItems['Amulet of Health']
    const effect = amulet.effects[0]
    expect(effect.type).toBe('ability_set')
    expect(effect.value).toBe(19)
    expect(effect.stringValue).toBe('constitution')
  })

  it('Belt of Giant Strength items set STR to correct values', () => {
    const belts: Record<string, number> = {
      'Belt of Giant Strength (Hill)': 21,
      'Belt of Giant Strength (Frost)': 23,
      'Belt of Giant Strength (Fire)': 25,
      'Belt of Giant Strength (Cloud)': 27,
      'Belt of Giant Strength (Storm)': 29
    }
    for (const [name, expectedStr] of Object.entries(belts)) {
      const belt = dataJson.magicItems[name]
      expect(belt, `${name} should exist`).toBeDefined()
      const effect = belt.effects[0]
      expect(effect.value).toBe(expectedStr)
      expect(effect.stringValue).toBe('strength')
    }
  })

  it('Adamantine Armor prevents crits', () => {
    const armor = dataJson.magicItems['Adamantine Armor']
    expect(armor.effects[0].type).toBe('crit_prevention')
  })
})

describe('Feats — D&D 5e accuracy', () => {
  it('Tough grants +2 HP per level', () => {
    const tough = dataJson.feats.Tough
    expect(tough.sourceType).toBe('feat')
    expect(tough.effects[0].type).toBe('hp_per_level')
    expect(tough.effects[0].value).toBe(2)
  })

  it('Heavy Armor Master reduces BPS damage by 3', () => {
    const ham = dataJson.feats['Heavy Armor Master']
    const effect = ham.effects[0]
    expect(effect.type).toBe('damage_reduction')
    expect(effect.value).toBe(3)
    expect(effect.stringValue).toContain('bludgeoning')
    expect(effect.stringValue).toContain('piercing')
    expect(effect.stringValue).toContain('slashing')
  })

  it('Alert has initiative bonus effect', () => {
    const alert = dataJson.feats.Alert
    expect(alert.effects[0].type).toBe('initiative_bonus')
  })

  it('Crossbow Expert removes loading and ranged melee disadvantage', () => {
    const cbe = dataJson.feats['Crossbow Expert']
    const types = cbe.effects.map((e: { type: string }) => e.type)
    expect(types).toContain('ignore_loading')
    expect(types).toContain('no_ranged_melee_disadvantage')
  })
})

describe('Fighting Styles — D&D 5e accuracy', () => {
  it('Defense grants +1 AC while wearing armor', () => {
    const def = dataJson.fightingStyles.Defense
    expect(def.sourceType).toBe('fighting-style')
    expect(def.effects[0].type).toBe('ac_bonus')
    expect(def.effects[0].value).toBe(1)
    expect(def.effects[0].condition).toBe('wearing_armor')
  })

  it('Archery grants +2 to ranged weapon attack rolls', () => {
    const archery = dataJson.fightingStyles.Archery
    expect(archery.effects[0].type).toBe('attack_bonus')
    expect(archery.effects[0].value).toBe(2)
    expect(archery.effects[0].scope).toBe('ranged_weapon')
  })

  it('Dueling grants +2 damage to melee weapons', () => {
    const dueling = dataJson.fightingStyles.Dueling
    expect(dueling.effects[0].type).toBe('damage_bonus')
    expect(dueling.effects[0].value).toBe(2)
  })

  it('has all six fighting styles from 2024 PHB', () => {
    const styles = Object.keys(dataJson.fightingStyles)
    expect(styles).toContain('Defense')
    expect(styles).toContain('Archery')
    expect(styles).toContain('Dueling')
    expect(styles).toContain('Great Weapon Fighting')
    expect(styles).toContain('Two-Weapon Fighting')
    expect(styles).toContain('Thrown Weapon Fighting')
  })
})

describe('Consumables — D&D 5e accuracy', () => {
  it('Potion of Healing heals 2d4+2', () => {
    const potion = dataJson.consumables['Potion of Healing']
    expect(potion.sourceType).toBe('consumable')
    expect(potion.effects[0].type).toBe('heal')
    expect(potion.effects[0].dice).toBe('2d4+2')
  })

  it('healing potions have ascending dice', () => {
    const potions = [
      { name: 'Potion of Healing', dice: '2d4+2' },
      { name: 'Potion of Greater Healing', dice: '4d4+4' },
      { name: 'Potion of Superior Healing', dice: '8d4+8' },
      { name: 'Potion of Supreme Healing', dice: '10d4+20' }
    ]
    for (const p of potions) {
      const entry = dataJson.consumables[p.name]
      expect(entry, `${p.name} should exist`).toBeDefined()
      expect(entry.effects[0].dice).toBe(p.dice)
    }
  })
})

describe('Lookup Functions', () => {
  it('getMagicItemEffects returns undefined for unknown item', () => {
    const result = getMagicItemEffects('Nonexistent Sword of Doom')
    expect(result).toBeUndefined()
  })

  it('getFeatEffects returns undefined for unknown feat', () => {
    expect(getFeatEffects('Made Up Feat')).toBeUndefined()
  })

  it('getFightingStyleEffects returns undefined for unknown style', () => {
    expect(getFightingStyleEffects('Imaginary Style')).toBeUndefined()
  })

  it('getConsumableEffects returns undefined for unknown consumable', () => {
    expect(getConsumableEffects('Mystery Potion XYZ')).toBeUndefined()
  })

  it('getAllEffectDefinitions returns an object (may be empty before data loads)', () => {
    const all = getAllEffectDefinitions()
    expect(typeof all).toBe('object')
    expect(all).not.toBeNull()
  })
})
