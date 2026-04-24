import { describe, expect, it } from 'vitest'
import {
  calculateEncumbrance,
  calculateLifestyleCost,
  getToolSkillAdvantage,
  getWildShapeMax,
  LIFESTYLE_COSTS,
  sumEquipmentWeight,
  TOOL_SKILL_INTERACTIONS
} from './equipment-utilities'

describe('calculateEncumbrance', () => {
  describe('standard rules (PHB 2024)', () => {
    it('returns unencumbered when weight is below carrying capacity', () => {
      // STR 10 → carry capacity = 150 lbs
      const result = calculateEncumbrance(10, 100)
      expect(result.status).toBe('unencumbered')
      expect(result.carryCapacity).toBe(150) // 10 * 15
      expect(result.pushDragLift).toBe(300) // 10 * 30
      expect(result.speedPenalty).toBe('')
    })

    it('returns over-limit when weight exceeds carrying capacity', () => {
      const result = calculateEncumbrance(10, 160)
      expect(result.status).toBe('over-limit')
      expect(result.speedPenalty).toContain('Speed 0')
    })

    it('exactly at carry capacity is unencumbered (standard)', () => {
      const result = calculateEncumbrance(10, 150)
      expect(result.status).toBe('unencumbered')
    })

    it('just over carry capacity is over-limit (standard)', () => {
      const result = calculateEncumbrance(10, 150.1)
      expect(result.status).toBe('over-limit')
    })

    it('applies size multiplier to carry capacity', () => {
      // Large creature (x2): STR 10 * 2 = effective 20, carry = 300
      const result = calculateEncumbrance(10, 200, false, 2)
      expect(result.status).toBe('unencumbered')
      expect(result.carryCapacity).toBe(300) // 20 * 15
    })

    it('applies Tiny creature multiplier (x0.5)', () => {
      const result = calculateEncumbrance(10, 50, false, 0.5)
      expect(result.carryCapacity).toBe(75) // 5 * 15
    })

    it('reports correct totalWeight in result', () => {
      const result = calculateEncumbrance(10, 42.5)
      expect(result.totalWeight).toBe(42.5)
    })
  })

  describe('variant encumbrance (DMG 2024)', () => {
    // STR 10 variant thresholds: light=50, medium=100, heavy(carry)=150
    it('unencumbered when weight <= STR * 5', () => {
      const result = calculateEncumbrance(10, 50, true)
      expect(result.status).toBe('unencumbered')
      expect(result.speedPenalty).toBe('')
    })

    it('encumbered when weight > STR * 5 and <= STR * 10', () => {
      const result = calculateEncumbrance(10, 51, true)
      expect(result.status).toBe('encumbered')
      expect(result.speedPenalty).toContain('-10 ft')
    })

    it('heavily encumbered when weight > STR * 10 and <= STR * 15', () => {
      const result = calculateEncumbrance(10, 101, true)
      expect(result.status).toBe('heavily-encumbered')
      expect(result.speedPenalty).toContain('-20 ft')
      expect(result.speedPenalty).toContain('disadvantage')
    })

    it('over-limit when weight > STR * 15', () => {
      const result = calculateEncumbrance(10, 151, true)
      expect(result.status).toBe('over-limit')
      expect(result.speedPenalty).toContain('Speed 0')
    })

    it('at exact boundaries: STR*5 = unencumbered', () => {
      expect(calculateEncumbrance(10, 50, true).status).toBe('unencumbered')
    })

    it('at exact boundaries: STR*10 = encumbered', () => {
      expect(calculateEncumbrance(10, 100, true).status).toBe('encumbered')
    })

    it('at exact boundaries: STR*15 = heavily-encumbered', () => {
      expect(calculateEncumbrance(10, 150, true).status).toBe('heavily-encumbered')
    })

    it('variant with size multiplier (Large, x2)', () => {
      // Large (x2): effective STR 20, thresholds: 100, 200, 300
      const result = calculateEncumbrance(10, 150, true, 2)
      expect(result.status).toBe('encumbered')
    })
  })

  describe('high STR characters', () => {
    it('STR 20 character has 300 lb carry capacity', () => {
      const result = calculateEncumbrance(20, 0)
      expect(result.carryCapacity).toBe(300)
      expect(result.pushDragLift).toBe(600)
    })

    it('Huge creature with STR 30 has massive capacity', () => {
      // STR 30 * 4 (Huge) * 15 = 1800
      const result = calculateEncumbrance(30, 0, false, 4)
      expect(result.carryCapacity).toBe(1800)
    })
  })
})

describe('sumEquipmentWeight', () => {
  it('sums weapon weights accounting for quantity', () => {
    const weapons = [
      { weight: 3, quantity: 2 },
      { weight: 1, quantity: 1 }
    ]
    expect(sumEquipmentWeight(weapons, [], [])).toBe(7) // 3*2 + 1*1
  })

  it('sums armor weights (no quantity for armor)', () => {
    const armor = [
      { weight: 65 }, // Plate armor
      { weight: 6 } // Shield
    ]
    expect(sumEquipmentWeight([], armor, [])).toBe(71)
  })

  it('sums gear weights with quantity', () => {
    const gear = [
      { weight: 0.5, quantity: 10 }, // 10 rations
      { weight: 5, quantity: 1 } // backpack
    ]
    expect(sumEquipmentWeight([], [], gear)).toBe(10) // 5 + 5
  })

  it('converts coins to weight: 50 coins = 1 lb', () => {
    const currency = { gp: 100 }
    expect(sumEquipmentWeight([], [], [], currency)).toBe(2) // 100/50 = 2 lbs
  })

  it('sums all coin types for weight calculation', () => {
    const currency = { cp: 50, sp: 50, gp: 50, pp: 50 }
    // 200 total coins / 50 = 4 lbs
    expect(sumEquipmentWeight([], [], [], currency)).toBe(4)
  })

  it('handles missing weight/quantity with defaults', () => {
    const weapons = [{ weight: undefined, quantity: undefined }]
    const armor = [{ weight: undefined }]
    const gear = [{ weight: undefined, quantity: undefined }]
    expect(sumEquipmentWeight(weapons, armor, gear)).toBe(0)
  })

  it('handles empty arrays', () => {
    expect(sumEquipmentWeight([], [], [])).toBe(0)
  })

  it('handles undefined currency', () => {
    expect(sumEquipmentWeight([], [], [], undefined)).toBe(0)
  })

  it('handles partial currency', () => {
    const currency = { gp: 50 } // only gold
    expect(sumEquipmentWeight([], [], [], currency)).toBe(1) // 50/50 = 1 lb
  })

  it('combines all sources correctly', () => {
    const weapons = [{ weight: 6, quantity: 1 }] // Greatsword
    const armor = [{ weight: 65 }] // Plate armor
    const gear = [{ weight: 1, quantity: 5 }] // 5 torches
    const currency = { gp: 150 }
    // 6 + 65 + 5 + 3 = 79
    expect(sumEquipmentWeight(weapons, armor, gear, currency)).toBe(79)
  })
})

describe('calculateLifestyleCost', () => {
  it('wretched lifestyle costs 0 gp/day', () => {
    expect(calculateLifestyleCost('wretched', 30)).toBe(0)
  })

  it('squalid lifestyle costs 0.1 gp/day (1 sp)', () => {
    expect(calculateLifestyleCost('squalid', 10)).toBe(1)
  })

  it('poor lifestyle costs 0.2 gp/day (2 sp)', () => {
    expect(calculateLifestyleCost('poor', 10)).toBe(2)
  })

  it('modest lifestyle costs 1 gp/day', () => {
    expect(calculateLifestyleCost('modest', 30)).toBe(30)
  })

  it('comfortable lifestyle costs 2 gp/day', () => {
    expect(calculateLifestyleCost('comfortable', 30)).toBe(60)
  })

  it('wealthy lifestyle costs 4 gp/day', () => {
    expect(calculateLifestyleCost('wealthy', 30)).toBe(120)
  })

  it('aristocratic lifestyle costs 10 gp/day minimum', () => {
    expect(calculateLifestyleCost('aristocratic', 30)).toBe(300)
  })

  it('0 days costs 0 regardless of lifestyle', () => {
    expect(calculateLifestyleCost('aristocratic', 0)).toBe(0)
  })

  it('1 day of modest living costs 1 gp', () => {
    expect(calculateLifestyleCost('modest', 1)).toBe(1)
  })
})

describe('LIFESTYLE_COSTS', () => {
  it('contains all 7 lifestyle levels', () => {
    expect(Object.keys(LIFESTYLE_COSTS)).toHaveLength(7)
  })

  it('costs increase from wretched to aristocratic', () => {
    const levels = ['wretched', 'squalid', 'poor', 'modest', 'comfortable', 'wealthy', 'aristocratic'] as const
    for (let i = 1; i < levels.length; i++) {
      expect(LIFESTYLE_COSTS[levels[i]]).toBeGreaterThan(LIFESTYLE_COSTS[levels[i - 1]])
    }
  })
})

describe('TOOL_SKILL_INTERACTIONS', () => {
  it('contains 21 tool entries', () => {
    expect(TOOL_SKILL_INTERACTIONS).toHaveLength(21)
  })

  it('each entry has a tool name, skills array, and benefit', () => {
    for (const entry of TOOL_SKILL_INTERACTIONS) {
      expect(entry.tool).toBeTruthy()
      expect(entry.skills.length).toBeGreaterThan(0)
      expect(entry.benefit).toBeTruthy()
    }
  })

  it('Thieves Tools interact with Investigation and Perception', () => {
    const thieves = TOOL_SKILL_INTERACTIONS.find((t) => t.tool === "Thieves' Tools")
    expect(thieves).toBeDefined()
    expect(thieves!.skills).toContain('Investigation')
    expect(thieves!.skills).toContain('Perception')
  })
})

describe('getToolSkillAdvantage', () => {
  it('returns interaction when tool and skill match', () => {
    const result = getToolSkillAdvantage(["Thieves' Tools"], 'Investigation')
    expect(result).not.toBeNull()
    expect(result!.tool).toBe("Thieves' Tools")
  })

  it('returns null when tool does not match the skill', () => {
    const result = getToolSkillAdvantage(["Thieves' Tools"], 'Athletics')
    expect(result).toBeNull()
  })

  it('returns null for empty tool proficiencies', () => {
    expect(getToolSkillAdvantage([], 'Investigation')).toBeNull()
  })

  it('is case insensitive for tool names', () => {
    const result = getToolSkillAdvantage(["thieves' tools"], 'Investigation')
    expect(result).not.toBeNull()
  })

  it('is case insensitive for skill names', () => {
    const result = getToolSkillAdvantage(["Thieves' Tools"], 'investigation')
    expect(result).not.toBeNull()
  })

  it('checks multiple tool proficiencies', () => {
    const result = getToolSkillAdvantage(["Carpenter's Tools", "Thieves' Tools"], 'Investigation')
    // Both match Investigation — should return first found
    expect(result).not.toBeNull()
  })

  it('Herbalism Kit grants advantage on Medicine checks', () => {
    const result = getToolSkillAdvantage(['Herbalism Kit'], 'Medicine')
    expect(result).not.toBeNull()
    expect(result!.tool).toBe('Herbalism Kit')
  })
})

describe('getWildShapeMax', () => {
  // D&D 5e Wild Shape uses per day by druid level:
  // Level 1: 0 (no Wild Shape)
  // Levels 2-5: 2 uses
  // Levels 6-16: 3 uses
  // Levels 17-20: 4 uses

  it('returns 0 for level 1 (druid gets Wild Shape at 2)', () => {
    expect(getWildShapeMax(1)).toBe(0)
  })

  it('returns 0 for level 0', () => {
    expect(getWildShapeMax(0)).toBe(0)
  })

  it('returns 2 uses at level 2', () => {
    expect(getWildShapeMax(2)).toBe(2)
  })

  it('returns 2 uses at level 5', () => {
    expect(getWildShapeMax(5)).toBe(2)
  })

  it('returns 3 uses at level 6', () => {
    expect(getWildShapeMax(6)).toBe(3)
  })

  it('returns 3 uses at level 16', () => {
    expect(getWildShapeMax(16)).toBe(3)
  })

  it('returns 4 uses at level 17', () => {
    expect(getWildShapeMax(17)).toBe(4)
  })

  it('returns 4 uses at level 20', () => {
    expect(getWildShapeMax(20)).toBe(4)
  })
})
