import { describe, expect, it } from 'vitest'
import {
  createAttackTracker,
  formatAttackCounter,
  getBonusAttackCount,
  getExtraAttackCount,
  hasAttacksRemaining,
  hasBonusAttacksRemaining,
  useAttack,
  useBonusAttack
} from './multi-attack-tracker'

// ─── getExtraAttackCount ────────────────────────────────────────

describe('getExtraAttackCount', () => {
  describe('Fighter (escalating Extra Attack)', () => {
    it('returns 1 attack before level 5', () => {
      expect(getExtraAttackCount('Fighter', 1)).toBe(1)
      expect(getExtraAttackCount('Fighter', 4)).toBe(1)
    })

    it('returns 2 attacks at level 5 (Extra Attack)', () => {
      expect(getExtraAttackCount('Fighter', 5)).toBe(2)
    })

    it('returns 3 attacks at level 11 (Extra Attack x2)', () => {
      expect(getExtraAttackCount('Fighter', 11)).toBe(3)
    })

    it('returns 4 attacks at level 20 (Extra Attack x3)', () => {
      expect(getExtraAttackCount('Fighter', 20)).toBe(4)
    })

    it('returns 2 attacks at levels 6-10', () => {
      expect(getExtraAttackCount('Fighter', 6)).toBe(2)
      expect(getExtraAttackCount('Fighter', 10)).toBe(2)
    })

    it('returns 3 attacks at levels 12-19', () => {
      expect(getExtraAttackCount('Fighter', 12)).toBe(3)
      expect(getExtraAttackCount('Fighter', 19)).toBe(3)
    })
  })

  describe('Monk', () => {
    it('returns 1 attack before level 5', () => {
      expect(getExtraAttackCount('Monk', 4)).toBe(1)
    })

    it('returns 2 attacks at level 5', () => {
      expect(getExtraAttackCount('Monk', 5)).toBe(2)
    })

    it('stays at 2 attacks at higher levels (unlike Fighter)', () => {
      expect(getExtraAttackCount('Monk', 11)).toBe(2)
      expect(getExtraAttackCount('Monk', 20)).toBe(2)
    })
  })

  describe('Standard martial classes (Barbarian, Paladin, Ranger)', () => {
    for (const cls of ['Barbarian', 'Paladin', 'Ranger']) {
      it(`${cls} returns 1 attack before level 5`, () => {
        expect(getExtraAttackCount(cls, 4)).toBe(1)
      })

      it(`${cls} returns 2 attacks at level 5`, () => {
        expect(getExtraAttackCount(cls, 5)).toBe(2)
      })

      it(`${cls} stays at 2 attacks at higher levels`, () => {
        expect(getExtraAttackCount(cls, 20)).toBe(2)
      })
    }
  })

  describe('Bladesinger Wizard', () => {
    it('returns 1 attack before level 6', () => {
      expect(getExtraAttackCount('Wizard', 5, 'Bladesinger')).toBe(1)
    })

    it('returns 2 attacks at level 6', () => {
      expect(getExtraAttackCount('Wizard', 6, 'Bladesinger')).toBe(2)
    })

    it('non-Bladesinger Wizard always returns 1', () => {
      expect(getExtraAttackCount('Wizard', 20, 'School of Evocation')).toBe(1)
    })

    it('Wizard without subclass returns 1', () => {
      expect(getExtraAttackCount('Wizard', 20)).toBe(1)
    })
  })

  describe('Bard (College of Swords / Valor)', () => {
    it('College of Swords returns 1 before level 6', () => {
      expect(getExtraAttackCount('Bard', 5, 'College of Swords')).toBe(1)
    })

    it('College of Swords returns 2 at level 6', () => {
      expect(getExtraAttackCount('Bard', 6, 'College of Swords')).toBe(2)
    })

    it('College of Valor returns 2 at level 6', () => {
      expect(getExtraAttackCount('Bard', 6, 'College of Valor')).toBe(2)
    })

    it('College of Lore always returns 1 (no Extra Attack)', () => {
      expect(getExtraAttackCount('Bard', 20, 'College of Lore')).toBe(1)
    })

    it('Bard without subclass returns 1', () => {
      expect(getExtraAttackCount('Bard', 20)).toBe(1)
    })
  })

  describe('non-martial classes', () => {
    for (const cls of ['Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Artificer']) {
      it(`${cls} always returns 1`, () => {
        expect(getExtraAttackCount(cls, 20)).toBe(1)
      })
    }
  })

  it('is case-insensitive for class names', () => {
    expect(getExtraAttackCount('fighter', 5)).toBe(2)
    expect(getExtraAttackCount('FIGHTER', 11)).toBe(3)
  })

  it('is case-insensitive for subclass names', () => {
    expect(getExtraAttackCount('wizard', 6, 'BLADESINGER')).toBe(2)
    expect(getExtraAttackCount('bard', 6, 'college of swords')).toBe(2)
  })
})

// ─── getBonusAttackCount ────────────────────────────────────────

describe('getBonusAttackCount', () => {
  describe('Two-Weapon Fighting', () => {
    it('returns 1 when dual wielding two light weapons', () => {
      const result = getBonusAttackCount([], { mainHand: 'shortsword', offHand: 'dagger' })
      expect(result).toBe(1)
    })

    it('returns 0 when main hand is not light', () => {
      const result = getBonusAttackCount([], { mainHand: 'longsword', offHand: 'dagger' })
      expect(result).toBe(0)
    })

    it('returns 0 when off hand is not light', () => {
      const result = getBonusAttackCount([], { mainHand: 'shortsword', offHand: 'longsword' })
      expect(result).toBe(0)
    })

    it('returns 0 when only wielding main hand', () => {
      const result = getBonusAttackCount([], { mainHand: 'shortsword' })
      expect(result).toBe(0)
    })

    it('returns 0 when wielding nothing', () => {
      const result = getBonusAttackCount([], {})
      expect(result).toBe(0)
    })
  })

  describe('Dual Wielder feat', () => {
    it('allows TWF with non-light weapons', () => {
      const result = getBonusAttackCount(['Dual Wielder'], { mainHand: 'longsword', offHand: 'rapier' })
      expect(result).toBe(1)
    })

    it('Dual Wielder still requires two weapons', () => {
      const result = getBonusAttackCount(['Dual Wielder'], { mainHand: 'longsword' })
      expect(result).toBe(0)
    })
  })

  describe('Polearm Master', () => {
    it('grants bonus attack with a qualifying polearm', () => {
      const result = getBonusAttackCount(['Polearm Master'], { mainHand: 'glaive' })
      expect(result).toBe(1)
    })

    it('works with all polearm weapons', () => {
      for (const weapon of ['glaive', 'halberd', 'quarterstaff', 'spear', 'pike']) {
        const result = getBonusAttackCount(['Polearm Master'], { mainHand: weapon })
        expect(result).toBe(1)
      }
    })

    it('does not grant bonus for non-polearm weapons', () => {
      const result = getBonusAttackCount(['Polearm Master'], { mainHand: 'longsword' })
      expect(result).toBe(0)
    })

    it('PAM does not stack with TWF (TWF takes priority)', () => {
      // Dual wielding light weapons + PAM — only 1 bonus attack (TWF wins)
      const result = getBonusAttackCount(['Polearm Master'], { mainHand: 'shortsword', offHand: 'dagger' })
      // TWF grants 1, PAM can't stack since TWF already granted one
      expect(result).toBe(1)
    })

    it('PAM bonus attack when no TWF', () => {
      const result = getBonusAttackCount(['Polearm Master'], { mainHand: 'quarterstaff' })
      expect(result).toBe(1)
    })
  })

  it('is case-insensitive for feature names', () => {
    const result = getBonusAttackCount(['polearm master'], { mainHand: 'glaive' })
    expect(result).toBe(1)
  })

  it('is case-insensitive for weapon names', () => {
    const result = getBonusAttackCount([], { mainHand: 'Shortsword', offHand: 'Dagger' })
    expect(result).toBe(1)
  })
})

// ─── createAttackTracker ────────────────────────────────────────

describe('createAttackTracker', () => {
  it('creates a tracker with correct initial values', () => {
    const tracker = createAttackTracker('fighter-1', 3, 1)
    expect(tracker.entityId).toBe('fighter-1')
    expect(tracker.maxAttacks).toBe(3)
    expect(tracker.attacksUsed).toBe(0)
    expect(tracker.bonusAttacks).toBe(1)
    expect(tracker.bonusAttacksUsed).toBe(0)
  })

  it('sets isMultiattack to true when maxAttacks > 1', () => {
    const tracker = createAttackTracker('fighter-1', 2)
    expect(tracker.isMultiattack).toBe(true)
  })

  it('sets isMultiattack to false when maxAttacks is 1', () => {
    const tracker = createAttackTracker('wizard-1', 1)
    expect(tracker.isMultiattack).toBe(false)
  })

  it('enforces minimum maxAttacks of 1', () => {
    const tracker = createAttackTracker('entity-1', 0)
    expect(tracker.maxAttacks).toBe(1)

    const tracker2 = createAttackTracker('entity-1', -1)
    expect(tracker2.maxAttacks).toBe(1)
  })

  it('enforces minimum bonusAttacks of 0', () => {
    const tracker = createAttackTracker('entity-1', 1, -1)
    expect(tracker.bonusAttacks).toBe(0)
  })

  it('defaults bonusAttacks to 0', () => {
    const tracker = createAttackTracker('entity-1', 2)
    expect(tracker.bonusAttacks).toBe(0)
  })
})

// ─── useAttack ──────────────────────────────────────────────────

describe('useAttack', () => {
  it('increments attacksUsed by 1', () => {
    const tracker = createAttackTracker('fighter-1', 3)
    const updated = useAttack(tracker)
    expect(updated.attacksUsed).toBe(1)
    expect(updated.maxAttacks).toBe(3)
  })

  it('does not mutate the original tracker', () => {
    const tracker = createAttackTracker('fighter-1', 3)
    useAttack(tracker)
    expect(tracker.attacksUsed).toBe(0)
  })

  it('returns unchanged tracker when all attacks used', () => {
    let tracker = createAttackTracker('fighter-1', 2)
    tracker = useAttack(tracker)
    tracker = useAttack(tracker)
    const noChange = useAttack(tracker)
    expect(noChange.attacksUsed).toBe(2)
    expect(noChange).toEqual(tracker)
  })
})

// ─── useBonusAttack ─────────────────────────────────────────────

describe('useBonusAttack', () => {
  it('increments bonusAttacksUsed by 1', () => {
    const tracker = createAttackTracker('fighter-1', 2, 1)
    const updated = useBonusAttack(tracker)
    expect(updated.bonusAttacksUsed).toBe(1)
  })

  it('does not mutate the original tracker', () => {
    const tracker = createAttackTracker('fighter-1', 2, 1)
    useBonusAttack(tracker)
    expect(tracker.bonusAttacksUsed).toBe(0)
  })

  it('returns unchanged tracker when all bonus attacks used', () => {
    let tracker = createAttackTracker('fighter-1', 2, 1)
    tracker = useBonusAttack(tracker)
    const noChange = useBonusAttack(tracker)
    expect(noChange.bonusAttacksUsed).toBe(1)
    expect(noChange).toEqual(tracker)
  })

  it('returns unchanged tracker when no bonus attacks available', () => {
    const tracker = createAttackTracker('fighter-1', 2, 0)
    const noChange = useBonusAttack(tracker)
    expect(noChange.bonusAttacksUsed).toBe(0)
    expect(noChange).toEqual(tracker)
  })
})

// ─── hasAttacksRemaining ────────────────────────────────────────

describe('hasAttacksRemaining', () => {
  it('returns true when attacks remain', () => {
    const tracker = createAttackTracker('fighter-1', 3)
    expect(hasAttacksRemaining(tracker)).toBe(true)
  })

  it('returns true after some attacks used', () => {
    let tracker = createAttackTracker('fighter-1', 3)
    tracker = useAttack(tracker)
    expect(hasAttacksRemaining(tracker)).toBe(true)
  })

  it('returns false when all attacks used', () => {
    let tracker = createAttackTracker('fighter-1', 2)
    tracker = useAttack(tracker)
    tracker = useAttack(tracker)
    expect(hasAttacksRemaining(tracker)).toBe(false)
  })
})

// ─── hasBonusAttacksRemaining ───────────────────────────────────

describe('hasBonusAttacksRemaining', () => {
  it('returns true when bonus attacks remain', () => {
    const tracker = createAttackTracker('fighter-1', 2, 1)
    expect(hasBonusAttacksRemaining(tracker)).toBe(true)
  })

  it('returns false when all bonus attacks used', () => {
    let tracker = createAttackTracker('fighter-1', 2, 1)
    tracker = useBonusAttack(tracker)
    expect(hasBonusAttacksRemaining(tracker)).toBe(false)
  })

  it('returns false when no bonus attacks available', () => {
    const tracker = createAttackTracker('fighter-1', 2, 0)
    expect(hasBonusAttacksRemaining(tracker)).toBe(false)
  })
})

// ─── formatAttackCounter ────────────────────────────────────────

describe('formatAttackCounter', () => {
  it('shows remaining/max attacks', () => {
    const tracker = createAttackTracker('fighter-1', 3)
    expect(formatAttackCounter(tracker)).toBe('Attacks: 3/3')
  })

  it('shows decremented count after attacks', () => {
    let tracker = createAttackTracker('fighter-1', 3)
    tracker = useAttack(tracker)
    expect(formatAttackCounter(tracker)).toBe('Attacks: 2/3')
  })

  it('shows 0 remaining when all attacks used', () => {
    let tracker = createAttackTracker('fighter-1', 2)
    tracker = useAttack(tracker)
    tracker = useAttack(tracker)
    expect(formatAttackCounter(tracker)).toBe('Attacks: 0/2')
  })

  it('includes bonus attack count when bonusAttacks > 0', () => {
    const tracker = createAttackTracker('fighter-1', 2, 1)
    expect(formatAttackCounter(tracker)).toBe('Attacks: 2/2 | Bonus: 1/1')
  })

  it('shows decremented bonus count', () => {
    let tracker = createAttackTracker('fighter-1', 2, 1)
    tracker = useBonusAttack(tracker)
    expect(formatAttackCounter(tracker)).toBe('Attacks: 2/2 | Bonus: 0/1')
  })

  it('does not include bonus section when bonusAttacks is 0', () => {
    const tracker = createAttackTracker('fighter-1', 2, 0)
    expect(formatAttackCounter(tracker)).not.toContain('Bonus')
  })
})
