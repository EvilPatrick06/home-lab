import { describe, expect, it } from 'vitest'
import {
  type AttackConditionContext,
  type ConditionEffectResult,
  getAttackConditionEffects
} from './attack-condition-effects'

function baseContext(overrides: Partial<AttackConditionContext> = {}): AttackConditionContext {
  return {
    isRanged: false,
    isWithin5ft: true,
    anyEnemyWithin5ftOfAttacker: false,
    ...overrides
  }
}

describe('getAttackConditionEffects', () => {
  // ── Return shape ──────────────────────────────────────────────

  it('returns all expected fields', () => {
    const result = getAttackConditionEffects([], [], baseContext())
    expect(result).toHaveProperty('advantageSources')
    expect(result).toHaveProperty('disadvantageSources')
    expect(result).toHaveProperty('rollMode')
    expect(result).toHaveProperty('autoCrit')
    expect(result).toHaveProperty('attackerCannotAct')
    expect(result).toHaveProperty('exhaustionPenalty')
  })

  it('returns normal roll mode with no conditions', () => {
    const result = getAttackConditionEffects([], [], baseContext())
    expect(result.rollMode).toBe('normal')
    expect(result.advantageSources).toHaveLength(0)
    expect(result.disadvantageSources).toHaveLength(0)
    expect(result.autoCrit).toBe(false)
    expect(result.attackerCannotAct).toBe(false)
    expect(result.exhaustionPenalty).toBe(0)
  })

  // ── Attacker cannot act (PHB 2024 Ch.1 incapacitating conditions) ──

  describe('attackerCannotAct', () => {
    const incapacitating = ['Incapacitated', 'Paralyzed', 'Stunned', 'Petrified', 'Unconscious']

    for (const cond of incapacitating) {
      it(`sets attackerCannotAct when attacker is ${cond}`, () => {
        const result = getAttackConditionEffects([{ name: cond }], [], baseContext())
        expect(result.attackerCannotAct).toBe(true)
      })
    }

    it('does not set attackerCannotAct for non-incapacitating conditions', () => {
      const result = getAttackConditionEffects([{ name: 'Blinded' }], [], baseContext())
      expect(result.attackerCannotAct).toBe(false)
    })
  })

  // ── Exhaustion penalty (PHB 2024: -2 per level) ───────────────

  describe('exhaustion penalty', () => {
    it('applies -2 per exhaustion level', () => {
      const result = getAttackConditionEffects([{ name: 'Exhaustion', value: 3 }], [], baseContext())
      expect(result.exhaustionPenalty).toBe(-6)
    })

    it('returns 0 penalty for exhaustion level 0', () => {
      const result = getAttackConditionEffects([{ name: 'Exhaustion', value: 0 }], [], baseContext())
      expect(result.exhaustionPenalty).toBe(0)
    })

    it('returns 0 penalty when no exhaustion condition present', () => {
      const result = getAttackConditionEffects([], [], baseContext())
      expect(result.exhaustionPenalty).toBe(0)
    })

    it('applies -2 for exhaustion level 1', () => {
      const result = getAttackConditionEffects([{ name: 'Exhaustion', value: 1 }], [], baseContext())
      expect(result.exhaustionPenalty).toBe(-2)
    })
  })

  // ── Attacker disadvantage sources ─────────────────────────────

  describe('attacker disadvantage conditions', () => {
    it('Blinded attacker has disadvantage', () => {
      const result = getAttackConditionEffects([{ name: 'Blinded' }], [], baseContext())
      expect(result.disadvantageSources).toContain("Blinded (attacker can't see)")
      expect(result.rollMode).toBe('disadvantage')
    })

    it('Frightened attacker has disadvantage', () => {
      const result = getAttackConditionEffects([{ name: 'Frightened' }], [], baseContext())
      expect(result.disadvantageSources).toContain('Frightened (source of fear in sight)')
    })

    it('Poisoned attacker has disadvantage', () => {
      const result = getAttackConditionEffects([{ name: 'Poisoned' }], [], baseContext())
      expect(result.disadvantageSources).toContain('Poisoned (disadvantage on attacks)')
    })

    it('Prone attacker has disadvantage', () => {
      const result = getAttackConditionEffects([{ name: 'Prone' }], [], baseContext())
      expect(result.disadvantageSources).toContain('Prone (attacker is prone)')
    })

    it('Restrained attacker has disadvantage', () => {
      const result = getAttackConditionEffects([{ name: 'Restrained' }], [], baseContext())
      expect(result.disadvantageSources).toContain('Restrained (disadvantage on attacks)')
    })
  })

  // ── Attacker advantage sources ────────────────────────────────

  describe('attacker advantage conditions', () => {
    it('Invisible attacker has advantage', () => {
      const result = getAttackConditionEffects([{ name: 'Invisible' }], [], baseContext())
      expect(result.advantageSources).toContain('Invisible (attacker unseen)')
      expect(result.rollMode).toBe('advantage')
    })
  })

  // ── Target grants advantage ───────────────────────────────────

  describe('target grants advantage', () => {
    it('Blinded target grants advantage', () => {
      const result = getAttackConditionEffects([], [{ name: 'Blinded' }], baseContext())
      expect(result.advantageSources).toContain('Target is Blinded')
    })

    it('Paralyzed target grants advantage', () => {
      const result = getAttackConditionEffects([], [{ name: 'Paralyzed' }], baseContext())
      expect(result.advantageSources).toContain('Target is Paralyzed')
    })

    it('Petrified target grants advantage', () => {
      const result = getAttackConditionEffects([], [{ name: 'Petrified' }], baseContext())
      expect(result.advantageSources).toContain('Target is Petrified')
    })

    it('Restrained target grants advantage', () => {
      const result = getAttackConditionEffects([], [{ name: 'Restrained' }], baseContext())
      expect(result.advantageSources).toContain('Target is Restrained')
    })

    it('Stunned target grants advantage', () => {
      const result = getAttackConditionEffects([], [{ name: 'Stunned' }], baseContext())
      expect(result.advantageSources).toContain('Target is Stunned')
    })

    it('Unconscious target grants advantage', () => {
      const result = getAttackConditionEffects([], [{ name: 'Unconscious' }], baseContext())
      expect(result.advantageSources).toContain('Target is Unconscious')
    })
  })

  // ── Auto-crit (Paralyzed/Unconscious within 5ft) ──────────────

  describe('auto-crit rules', () => {
    it('auto-crits on Paralyzed target within 5ft (PHB 2024)', () => {
      const result = getAttackConditionEffects([], [{ name: 'Paralyzed' }], baseContext({ isWithin5ft: true }))
      expect(result.autoCrit).toBe(true)
    })

    it('does not auto-crit on Paralyzed target beyond 5ft', () => {
      const result = getAttackConditionEffects([], [{ name: 'Paralyzed' }], baseContext({ isWithin5ft: false }))
      expect(result.autoCrit).toBe(false)
    })

    it('auto-crits on Unconscious target within 5ft (PHB 2024)', () => {
      const result = getAttackConditionEffects([], [{ name: 'Unconscious' }], baseContext({ isWithin5ft: true }))
      expect(result.autoCrit).toBe(true)
    })

    it('does not auto-crit on Unconscious target beyond 5ft', () => {
      const result = getAttackConditionEffects([], [{ name: 'Unconscious' }], baseContext({ isWithin5ft: false }))
      expect(result.autoCrit).toBe(false)
    })

    it('does not auto-crit on Stunned target (advantage only, no auto-crit per PHB)', () => {
      const result = getAttackConditionEffects([], [{ name: 'Stunned' }], baseContext({ isWithin5ft: true }))
      expect(result.autoCrit).toBe(false)
    })
  })

  // ── Prone target: melee advantage vs ranged disadvantage ──────

  describe('Prone target rules', () => {
    it('melee attack within 5ft against Prone target grants advantage', () => {
      const result = getAttackConditionEffects(
        [],
        [{ name: 'Prone' }],
        baseContext({ isRanged: false, isWithin5ft: true })
      )
      expect(result.advantageSources).toContain('Target is Prone (melee, within 5ft)')
      expect(result.disadvantageSources).not.toContain('Target is Prone (ranged or >5ft)')
    })

    it('ranged attack against Prone target has disadvantage', () => {
      const result = getAttackConditionEffects(
        [],
        [{ name: 'Prone' }],
        baseContext({ isRanged: true, isWithin5ft: false })
      )
      expect(result.disadvantageSources).toContain('Target is Prone (ranged or >5ft)')
      expect(result.advantageSources).not.toContain('Target is Prone (melee, within 5ft)')
    })

    it('melee attack beyond 5ft against Prone target has disadvantage', () => {
      const result = getAttackConditionEffects(
        [],
        [{ name: 'Prone' }],
        baseContext({ isRanged: false, isWithin5ft: false })
      )
      expect(result.disadvantageSources).toContain('Target is Prone (ranged or >5ft)')
    })
  })

  // ── Dodging target ────────────────────────────────────────────

  describe('Dodging target', () => {
    it('target that is Dodging imposes disadvantage', () => {
      const result = getAttackConditionEffects([], [], baseContext({ targetIsDodging: true }))
      expect(result.disadvantageSources).toContain('Target is Dodging')
    })

    it('target that is not Dodging does not impose disadvantage', () => {
      const result = getAttackConditionEffects([], [], baseContext({ targetIsDodging: false }))
      expect(result.disadvantageSources).not.toContain('Target is Dodging')
    })
  })

  // ── Ranged in close combat (PHB 2024 A4) ──────────────────────

  describe('ranged attack in close combat', () => {
    it('ranged attack with enemy within 5ft has disadvantage', () => {
      const result = getAttackConditionEffects(
        [],
        [],
        baseContext({ isRanged: true, anyEnemyWithin5ftOfAttacker: true })
      )
      expect(result.disadvantageSources).toContain('Ranged attack with enemy within 5ft')
    })

    it('melee attack with enemy within 5ft does not impose disadvantage', () => {
      const result = getAttackConditionEffects(
        [],
        [],
        baseContext({ isRanged: false, anyEnemyWithin5ftOfAttacker: true })
      )
      expect(result.disadvantageSources).not.toContain('Ranged attack with enemy within 5ft')
    })

    it('ranged attack with no enemy nearby has no close-combat disadvantage', () => {
      const result = getAttackConditionEffects(
        [],
        [],
        baseContext({ isRanged: true, anyEnemyWithin5ftOfAttacker: false })
      )
      expect(result.disadvantageSources).not.toContain('Ranged attack with enemy within 5ft')
    })
  })

  // ── Underwater combat (PHB 2024) ──────────────────────────────

  describe('underwater combat', () => {
    it('ranged attack underwater has disadvantage', () => {
      const result = getAttackConditionEffects([], [], baseContext({ isRanged: true, isUnderwater: true }))
      expect(result.disadvantageSources).toContain('Underwater (ranged attack)')
    })

    it('non-piercing melee without swim speed has disadvantage underwater', () => {
      const result = getAttackConditionEffects(
        [],
        [],
        baseContext({
          isRanged: false,
          isUnderwater: true,
          weaponDamageType: 'slashing',
          attackerHasSwimSpeed: false
        })
      )
      expect(result.disadvantageSources).toContain('Underwater (non-piercing melee without swim speed)')
    })

    it('piercing melee underwater has no disadvantage', () => {
      const result = getAttackConditionEffects(
        [],
        [],
        baseContext({
          isRanged: false,
          isUnderwater: true,
          weaponDamageType: 'piercing',
          attackerHasSwimSpeed: false
        })
      )
      expect(result.disadvantageSources).not.toContain('Underwater (non-piercing melee without swim speed)')
    })

    it('melee with swim speed underwater has no disadvantage', () => {
      const result = getAttackConditionEffects(
        [],
        [],
        baseContext({
          isRanged: false,
          isUnderwater: true,
          weaponDamageType: 'slashing',
          attackerHasSwimSpeed: true
        })
      )
      expect(result.disadvantageSources).not.toContain('Underwater (non-piercing melee without swim speed)')
    })
  })

  // ── Flanking (DMG optional rule) ──────────────────────────────

  describe('flanking', () => {
    it('flanking grants advantage for melee attacks', () => {
      const result = getAttackConditionEffects([], [], baseContext({ flankingAlly: 'Aragorn', isRanged: false }))
      expect(result.advantageSources).toContain('Flanking (with Aragorn)')
    })

    it('flanking does not apply to ranged attacks', () => {
      const result = getAttackConditionEffects([], [], baseContext({ flankingAlly: 'Aragorn', isRanged: true }))
      expect(result.advantageSources).not.toContain('Flanking (with Aragorn)')
    })

    it('no flanking ally means no flanking advantage', () => {
      const result = getAttackConditionEffects([], [], baseContext({ flankingAlly: null, isRanged: false }))
      expect(result.advantageSources.some((s) => s.startsWith('Flanking'))).toBe(false)
    })
  })

  // ── Weather disadvantage on ranged ────────────────────────────

  describe('weather effects', () => {
    it('heavy weather imposes disadvantage on ranged attacks', () => {
      const result = getAttackConditionEffects([], [], baseContext({ weatherDisadvantageRanged: true, isRanged: true }))
      expect(result.disadvantageSources).toContain('Heavy weather (ranged)')
    })

    it('heavy weather does not affect melee attacks', () => {
      const result = getAttackConditionEffects(
        [],
        [],
        baseContext({ weatherDisadvantageRanged: true, isRanged: false })
      )
      expect(result.disadvantageSources).not.toContain('Heavy weather (ranged)')
    })
  })

  // ── Advantage/Disadvantage cancellation (PHB core rule) ───────

  describe('advantage/disadvantage cancellation', () => {
    it('advantage only → rollMode is advantage', () => {
      const result = getAttackConditionEffects([{ name: 'Invisible' }], [], baseContext())
      expect(result.rollMode).toBe('advantage')
    })

    it('disadvantage only → rollMode is disadvantage', () => {
      const result = getAttackConditionEffects([{ name: 'Poisoned' }], [], baseContext())
      expect(result.rollMode).toBe('disadvantage')
    })

    it('both advantage and disadvantage → cancel to normal (PHB 2024 rule)', () => {
      // Invisible attacker (advantage) + Poisoned attacker (disadvantage)
      const result = getAttackConditionEffects([{ name: 'Invisible' }, { name: 'Poisoned' }], [], baseContext())
      expect(result.rollMode).toBe('normal')
      expect(result.advantageSources.length).toBeGreaterThan(0)
      expect(result.disadvantageSources.length).toBeGreaterThan(0)
    })

    it('multiple advantage + single disadvantage still cancel to normal', () => {
      // Invisible + target Blinded (2 adv) + attacker Poisoned (1 dis)
      const result = getAttackConditionEffects(
        [{ name: 'Invisible' }, { name: 'Poisoned' }],
        [{ name: 'Blinded' }],
        baseContext()
      )
      expect(result.rollMode).toBe('normal')
    })
  })

  // ── Case insensitivity ────────────────────────────────────────

  describe('condition name matching', () => {
    it('handles lowercase condition names', () => {
      const result = getAttackConditionEffects([{ name: 'blinded' }], [], baseContext())
      expect(result.disadvantageSources).toContain("Blinded (attacker can't see)")
    })

    it('handles mixed-case condition names', () => {
      const result = getAttackConditionEffects([], [{ name: 'PARALYZED' }], baseContext({ isWithin5ft: true }))
      expect(result.autoCrit).toBe(true)
    })
  })

  // ── PHB 2024: Grappled no longer imposes attack penalty ───────

  describe('PHB 2024 Grappled rule', () => {
    it('Grappled attacker does NOT have disadvantage on attacks (PHB 2024)', () => {
      const result = getAttackConditionEffects([{ name: 'Grappled' }], [], baseContext())
      // Grappled only sets speed to 0 in PHB 2024, no attack penalty
      expect(result.disadvantageSources).toHaveLength(0)
      expect(result.rollMode).toBe('normal')
    })
  })

  // ── ConditionEffectResult type ────────────────────────────

  describe('ConditionEffectResult type', () => {
    it('getAttackConditionEffects return value satisfies ConditionEffectResult shape', () => {
      const result: ConditionEffectResult = getAttackConditionEffects([], [], baseContext())
      expect(Array.isArray(result.advantageSources)).toBe(true)
      expect(Array.isArray(result.disadvantageSources)).toBe(true)
      expect(['advantage', 'disadvantage', 'normal']).toContain(result.rollMode)
      expect(typeof result.autoCrit).toBe('boolean')
      expect(typeof result.attackerCannotAct).toBe('boolean')
      expect(typeof result.exhaustionPenalty).toBe('number')
    })

    it('ConditionEffectResult rollMode is a discriminated union of three values', () => {
      const advantage: ConditionEffectResult = getAttackConditionEffects([{ name: 'Invisible' }], [], baseContext())
      const disadvantage: ConditionEffectResult = getAttackConditionEffects([{ name: 'Blinded' }], [], baseContext())
      const normal: ConditionEffectResult = getAttackConditionEffects([], [], baseContext())
      expect(advantage.rollMode).toBe('advantage')
      expect(disadvantage.rollMode).toBe('disadvantage')
      expect(normal.rollMode).toBe('normal')
    })

    it('ConditionEffectResult exhaustionPenalty is a negative multiple of 2', () => {
      const result: ConditionEffectResult = getAttackConditionEffects(
        [{ name: 'Exhaustion', value: 4 }],
        [],
        baseContext()
      )
      expect(result.exhaustionPenalty).toBe(-8)
      expect(result.exhaustionPenalty % 2 === 0).toBe(true)
    })
  })
})
