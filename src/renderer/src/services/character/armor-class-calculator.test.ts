import { describe, expect, it } from 'vitest'
import { calculateArmorClass5e } from './armor-class-calculator'
import type { ArmorClassOptions, ArmorForAC } from './stat-calculator-5e'

/**
 * Armor Class tests based on PHB 2024 Chapter 1 AC rules.
 *
 * Base AC = 10 + DEX modifier (when unarmored)
 * Light armor: 10 + armor bonus + DEX mod (full)
 * Medium armor: 10 + armor bonus + DEX mod (max 2)
 * Heavy armor: 10 + armor bonus (no DEX)
 * Shield: +2 AC
 * Unarmored Defense (Barbarian): 10 + DEX + CON
 * Unarmored Defense (Monk): 10 + DEX + WIS
 * Draconic Resilience (Sorcerer 3+): 13 + DEX
 */

function makeOptions(overrides: Partial<ArmorClassOptions> = {}): ArmorClassOptions {
  return {
    dexMod: 2,
    armor: [],
    classNames: [],
    conMod: 0,
    wisMod: 0,
    draconicSorcererLevel: 0,
    acBonusFromEffects: 0,
    ...overrides
  }
}

describe('calculateArmorClass5e', () => {
  describe('unarmored (no armor equipped)', () => {
    it('base AC = 10 + DEX modifier for a normal character', () => {
      const result = calculateArmorClass5e(makeOptions({ dexMod: 2 }))
      expect(result).toBe(12) // 10 + 2
    })

    it('base AC = 10 for DEX mod 0', () => {
      expect(calculateArmorClass5e(makeOptions({ dexMod: 0 }))).toBe(10)
    })

    it('base AC accounts for negative DEX modifier', () => {
      expect(calculateArmorClass5e(makeOptions({ dexMod: -1 }))).toBe(9) // 10 + (-1)
    })

    it('high DEX gives high unarmored AC', () => {
      expect(calculateArmorClass5e(makeOptions({ dexMod: 5 }))).toBe(15) // 10 + 5
    })
  })

  describe('Barbarian Unarmored Defense', () => {
    // PHB 2024: 10 + DEX + CON
    it('uses 10 + DEX + CON for Barbarian', () => {
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 2,
          conMod: 3,
          classNames: ['Barbarian']
        })
      )
      expect(result).toBe(15) // 10 + 2 + 3
    })

    it('takes higher of standard and barbarian AC', () => {
      // Standard: 10 + 5 = 15, Barbarian: 10 + 5 + 0 = 15 (equal)
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 5,
          conMod: 0,
          classNames: ['Barbarian']
        })
      )
      expect(result).toBe(15)
    })

    it('Barbarian with high CON exceeds standard AC', () => {
      // Standard: 10+2=12, Barbarian: 10+2+5=17
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 2,
          conMod: 5,
          classNames: ['Barbarian']
        })
      )
      expect(result).toBe(17)
    })

    it('case insensitive class name matching', () => {
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 2,
          conMod: 3,
          classNames: ['barbarian']
        })
      )
      expect(result).toBe(15) // still works
    })
  })

  describe('Monk Unarmored Defense', () => {
    // PHB 2024: 10 + DEX + WIS
    it('uses 10 + DEX + WIS for Monk', () => {
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 3,
          wisMod: 2,
          classNames: ['Monk']
        })
      )
      expect(result).toBe(15) // 10 + 3 + 2
    })

    it('Monk with high WIS and DEX gets excellent AC', () => {
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 5,
          wisMod: 5,
          classNames: ['Monk']
        })
      )
      expect(result).toBe(20) // 10 + 5 + 5
    })
  })

  describe('Draconic Resilience (Sorcerer)', () => {
    // PHB 2024: 13 + DEX at Sorcerer level 3+
    it('uses 13 + DEX for Draconic Sorcerer level 3+', () => {
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 2,
          draconicSorcererLevel: 3
        })
      )
      expect(result).toBe(15) // 13 + 2
    })

    it('does not apply Draconic Resilience below level 3', () => {
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 2,
          draconicSorcererLevel: 2
        })
      )
      expect(result).toBe(12) // standard: 10 + 2
    })

    it('Draconic Resilience at level 20 still applies', () => {
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 3,
          draconicSorcererLevel: 20
        })
      )
      expect(result).toBe(16) // 13 + 3
    })

    it('picks highest when multiple unarmored options compete', () => {
      // Barbarian: 10+2+1=13, Monk: 10+2+4=16, Draconic: 13+2=15
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 2,
          conMod: 1,
          wisMod: 4,
          classNames: ['Barbarian', 'Monk'],
          draconicSorcererLevel: 5
        })
      )
      expect(result).toBe(16) // Monk wins
    })
  })

  describe('light armor', () => {
    it('adds full DEX modifier to light armor', () => {
      const armor: ArmorForAC[] = [{ acBonus: 1, equipped: true, type: 'armor', category: 'Light' }]
      // Light: 10 + 1 + DEX(3) = 14
      const result = calculateArmorClass5e(makeOptions({ dexMod: 3, armor }))
      expect(result).toBe(14)
    })

    // Leather armor: AC 11 (acBonus=1), Studded Leather: AC 12 (acBonus=2)
    it('Studded Leather with DEX +4', () => {
      const armor: ArmorForAC[] = [{ acBonus: 2, equipped: true, type: 'armor', category: 'Light' }]
      expect(calculateArmorClass5e(makeOptions({ dexMod: 4, armor }))).toBe(16) // 10+2+4
    })
  })

  describe('medium armor', () => {
    it('caps DEX modifier at 2 for medium armor', () => {
      const armor: ArmorForAC[] = [{ acBonus: 4, equipped: true, type: 'armor', category: 'Medium', dexCap: 2 }]
      // Medium: 10 + 4 + min(DEX, 2) = 10 + 4 + 2 = 16
      const result = calculateArmorClass5e(makeOptions({ dexMod: 5, armor }))
      expect(result).toBe(16)
    })

    it('uses full DEX when below cap', () => {
      const armor: ArmorForAC[] = [{ acBonus: 3, equipped: true, type: 'armor', category: 'Medium', dexCap: 2 }]
      const result = calculateArmorClass5e(makeOptions({ dexMod: 1, armor }))
      expect(result).toBe(14) // 10 + 3 + 1
    })

    // Half Plate: AC 15 (acBonus=5), max DEX +2
    it('Half Plate with DEX +3 gives AC 17', () => {
      const armor: ArmorForAC[] = [{ acBonus: 5, equipped: true, type: 'armor', category: 'Medium', dexCap: 2 }]
      expect(calculateArmorClass5e(makeOptions({ dexMod: 3, armor }))).toBe(17) // 10+5+2
    })
  })

  describe('heavy armor', () => {
    it('ignores DEX modifier for heavy armor', () => {
      const armor: ArmorForAC[] = [{ acBonus: 8, equipped: true, type: 'armor', category: 'Heavy' }]
      // Heavy: 10 + 8 = 18 (no DEX)
      const result = calculateArmorClass5e(makeOptions({ dexMod: 5, armor }))
      expect(result).toBe(18)
    })

    it('ignores negative DEX modifier for heavy armor', () => {
      const armor: ArmorForAC[] = [{ acBonus: 6, equipped: true, type: 'armor', category: 'Heavy' }]
      expect(calculateArmorClass5e(makeOptions({ dexMod: -2, armor }))).toBe(16)
    })

    // Chain Mail: AC 16 (acBonus=6), Plate: AC 18 (acBonus=8)
    it('Plate armor gives AC 18', () => {
      const armor: ArmorForAC[] = [{ acBonus: 8, equipped: true, type: 'armor', category: 'Heavy' }]
      expect(calculateArmorClass5e(makeOptions({ dexMod: 0, armor }))).toBe(18)
    })
  })

  describe('shields', () => {
    it('adds shield bonus to unarmored AC', () => {
      const armor: ArmorForAC[] = [{ acBonus: 2, equipped: true, type: 'shield' }]
      const result = calculateArmorClass5e(makeOptions({ dexMod: 2, armor }))
      expect(result).toBe(14) // 10 + 2 + shield(2)
    })

    it('adds shield bonus to armored AC', () => {
      const armor: ArmorForAC[] = [
        { acBonus: 8, equipped: true, type: 'armor', category: 'Heavy' },
        { acBonus: 2, equipped: true, type: 'shield' }
      ]
      // Heavy(18) + Shield(2) = 20
      expect(calculateArmorClass5e(makeOptions({ dexMod: 0, armor }))).toBe(20)
    })

    it('unequipped shield does not add bonus', () => {
      const armor: ArmorForAC[] = [{ acBonus: 2, equipped: false, type: 'shield' }]
      expect(calculateArmorClass5e(makeOptions({ dexMod: 2, armor }))).toBe(12)
    })

    // Barbarian with shield: Unarmored Defense + shield
    it('Barbarian Unarmored Defense + shield stacks', () => {
      const armor: ArmorForAC[] = [{ acBonus: 2, equipped: true, type: 'shield' }]
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 2,
          conMod: 3,
          classNames: ['Barbarian'],
          armor
        })
      )
      expect(result).toBe(17) // 10 + 2 + 3 + 2
    })
  })

  describe('unequipped armor', () => {
    it('ignores unequipped armor', () => {
      const armor: ArmorForAC[] = [{ acBonus: 8, equipped: false, type: 'armor', category: 'Heavy' }]
      const result = calculateArmorClass5e(makeOptions({ dexMod: 2, armor }))
      expect(result).toBe(12) // standard unarmored
    })

    it('wearing armor overrides unarmored defense (even if lower)', () => {
      // Monk: 10+5+5=20 unarmored, but wearing light armor: 10+1+5=16
      const armor: ArmorForAC[] = [{ acBonus: 1, equipped: true, type: 'armor', category: 'Light' }]
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 5,
          wisMod: 5,
          classNames: ['Monk'],
          armor
        })
      )
      expect(result).toBe(16) // armor overrides unarmored defense
    })
  })

  describe('effect bonuses', () => {
    it('adds acBonusFromEffects to final AC', () => {
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 2,
          acBonusFromEffects: 2
        })
      )
      expect(result).toBe(14) // 10 + 2 + 2
    })

    it('handles negative effect bonuses', () => {
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 2,
          acBonusFromEffects: -3
        })
      )
      expect(result).toBe(9) // 10 + 2 - 3
    })

    // Shield spell: +5 AC as effect
    it('Shield spell (+5 effect) stacks with armor', () => {
      const armor: ArmorForAC[] = [{ acBonus: 2, equipped: true, type: 'armor', category: 'Light' }]
      const result = calculateArmorClass5e(
        makeOptions({
          dexMod: 3,
          armor,
          acBonusFromEffects: 5
        })
      )
      expect(result).toBe(20) // 10 + 2 + 3 + 5
    })
  })

  describe('classic D&D AC builds', () => {
    it('Plate + Shield = AC 20 (classic Fighter/Paladin/Cleric)', () => {
      const armor: ArmorForAC[] = [
        { acBonus: 8, equipped: true, type: 'armor', category: 'Heavy' },
        { acBonus: 2, equipped: true, type: 'shield' }
      ]
      expect(calculateArmorClass5e(makeOptions({ dexMod: 0, armor }))).toBe(20)
    })

    it('Studded Leather + DEX 20 = AC 17 (Rogue/Ranger)', () => {
      const armor: ArmorForAC[] = [{ acBonus: 2, equipped: true, type: 'armor', category: 'Light' }]
      expect(calculateArmorClass5e(makeOptions({ dexMod: 5, armor }))).toBe(17)
    })

    it('Barbarian 20 DEX 20 CON unarmored = AC 20', () => {
      expect(
        calculateArmorClass5e(
          makeOptions({
            dexMod: 5,
            conMod: 5,
            classNames: ['Barbarian']
          })
        )
      ).toBe(20)
    })

    it('Monk 20 DEX 20 WIS unarmored = AC 20', () => {
      expect(
        calculateArmorClass5e(
          makeOptions({
            dexMod: 5,
            wisMod: 5,
            classNames: ['Monk']
          })
        )
      ).toBe(20)
    })
  })
})
