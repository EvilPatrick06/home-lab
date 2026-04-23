import { describe, expect, it } from 'vitest'
import { formatAttackResult } from './attack-formatter'
import type { AttackResult } from './attack-types'

function makeResult(overrides: Partial<AttackResult> = {}): AttackResult {
  return {
    attackerName: 'Gandalf',
    targetName: 'Goblin',
    weaponName: 'Staff',
    attackRoll: 15,
    attackTotal: 20,
    targetAC: 14,
    coverType: 'none',
    coverACBonus: 0,
    isHit: true,
    isCrit: false,
    isFumble: false,
    rollMode: 'normal',
    advantageSources: [],
    disadvantageSources: [],
    damageRolls: [6],
    damageTotal: 9,
    damageType: 'bludgeoning',
    damageResolution: null,
    masteryEffect: null,
    extraDamage: [],
    rangeCategory: 'melee',
    exhaustionPenalty: 0,
    ...overrides
  }
}

describe('formatAttackResult', () => {
  it('returns a string', () => {
    const result = formatAttackResult(makeResult())
    expect(typeof result).toBe('string')
  })

  // ── Header line ───────────────────────────────────────────────

  it('includes attacker, target, and weapon names in header', () => {
    const output = formatAttackResult(makeResult())
    expect(output).toContain('**Gandalf**')
    expect(output).toContain('**Goblin**')
    expect(output).toContain('**Staff**')
  })

  it('includes "attacks" verb in header', () => {
    const output = formatAttackResult(makeResult())
    expect(output).toContain('attacks')
  })

  // ── Roll line ─────────────────────────────────────────────────

  it('shows HIT for successful attacks', () => {
    const output = formatAttackResult(makeResult({ isHit: true }))
    expect(output).toContain('**HIT**')
  })

  it('shows MISS for failed attacks', () => {
    const output = formatAttackResult(makeResult({ isHit: false, damageRolls: [], damageTotal: 0 }))
    expect(output).toContain('**MISS**')
  })

  it('shows CRITICAL HIT tag for crits', () => {
    const output = formatAttackResult(makeResult({ isCrit: true }))
    expect(output).toContain('**CRITICAL HIT!**')
  })

  it('shows Natural 1 tag for fumbles', () => {
    const output = formatAttackResult(makeResult({ isFumble: true, isHit: false, damageRolls: [], damageTotal: 0 }))
    expect(output).toContain('Natural 1')
    expect(output).toContain('Miss!')
  })

  it('shows attack roll details with total and AC', () => {
    const output = formatAttackResult(makeResult({ attackRoll: 15, attackTotal: 20, targetAC: 14 }))
    expect(output).toContain('[15]')
    expect(output).toContain('**20**')
    expect(output).toContain('AC 14')
  })

  // ── Roll mode tags ────────────────────────────────────────────

  it('shows (Adv) tag for advantage', () => {
    const output = formatAttackResult(makeResult({ rollMode: 'advantage' }))
    expect(output).toContain('(Adv)')
  })

  it('shows (Dis) tag for disadvantage', () => {
    const output = formatAttackResult(makeResult({ rollMode: 'disadvantage' }))
    expect(output).toContain('(Dis)')
  })

  it('shows no roll mode tag for normal', () => {
    const output = formatAttackResult(makeResult({ rollMode: 'normal' }))
    expect(output).not.toContain('(Adv)')
    expect(output).not.toContain('(Dis)')
  })

  // ── Cover info ────────────────────────────────────────────────

  it('shows cover info when not "none"', () => {
    const output = formatAttackResult(makeResult({ coverType: 'half', coverACBonus: 2 }))
    expect(output).toContain('Cover: half')
    expect(output).toContain('+2 AC')
  })

  it('shows three-quarters cover', () => {
    const output = formatAttackResult(makeResult({ coverType: 'three-quarters', coverACBonus: 5 }))
    expect(output).toContain('Cover: three-quarters')
    expect(output).toContain('+5 AC')
  })

  it('does not show cover line when cover is none', () => {
    const output = formatAttackResult(makeResult({ coverType: 'none' }))
    expect(output).not.toContain('Cover:')
  })

  // ── Damage line ───────────────────────────────────────────────

  it('shows damage total and type on hit', () => {
    const output = formatAttackResult(makeResult({ isHit: true, damageTotal: 9, damageType: 'bludgeoning' }))
    expect(output).toContain('Damage:')
    expect(output).toContain('**9**')
    expect(output).toContain('bludgeoning')
  })

  it('shows damage rolls in brackets', () => {
    const output = formatAttackResult(makeResult({ damageRolls: [4, 3] }))
    expect(output).toContain('[4, 3]')
  })

  it('does not show damage line on miss with no graze', () => {
    const output = formatAttackResult(
      makeResult({ isHit: false, damageTotal: 0, damageRolls: [], masteryEffect: null })
    )
    expect(output).not.toContain('Damage:')
  })

  it('shows damage when graze mastery deals damage on miss', () => {
    const output = formatAttackResult(
      makeResult({
        isHit: false,
        damageTotal: 3,
        damageRolls: [],
        masteryEffect: { mastery: 'Graze', description: 'Graze damage', grazeDamage: 3 }
      })
    )
    expect(output).toContain('Damage:')
    expect(output).toContain('**3**')
  })

  // ── Extra damage ──────────────────────────────────────────────

  it('shows extra damage entries on hit', () => {
    const output = formatAttackResult(
      makeResult({
        extraDamage: [
          { dice: '1d6', rolls: [4], total: 4, damageType: 'fire' },
          { dice: '2d6', rolls: [3, 5], total: 8, damageType: 'radiant' }
        ]
      })
    )
    expect(output).toContain('+ 4 fire')
    expect(output).toContain('+ 8 radiant')
  })

  // ── Damage resolution notes (resistance/immunity/vulnerability) ──

  it('shows damage resolution reason notes', () => {
    const output = formatAttackResult(
      makeResult({
        damageResolution: {
          totalRawDamage: 10,
          totalFinalDamage: 5,
          heavyArmorMasterReduction: 0,
          results: [
            {
              finalDamage: 5,
              rawDamage: 10,
              damageType: 'fire',
              modification: 'resistant',
              reason: 'Resistant to fire'
            }
          ]
        }
      })
    )
    expect(output).toContain('Resistant to fire')
    expect(output).toContain('**5**')
  })

  // ── Weapon mastery line ───────────────────────────────────────

  it('shows mastery effect when present', () => {
    const output = formatAttackResult(
      makeResult({
        masteryEffect: { mastery: 'Topple', description: 'Target must save or be knocked Prone' }
      })
    )
    expect(output).toContain('Mastery (Topple)')
    expect(output).toContain('Target must save or be knocked Prone')
  })

  it('does not show mastery line when null', () => {
    const output = formatAttackResult(makeResult({ masteryEffect: null }))
    expect(output).not.toContain('Mastery')
  })

  // ── Advantage/disadvantage source lines ───────────────────────

  it('shows advantage sources', () => {
    const output = formatAttackResult(
      makeResult({ advantageSources: ['Invisible (attacker unseen)', 'Target is Stunned'] })
    )
    expect(output).toContain('Advantage: Invisible (attacker unseen), Target is Stunned')
  })

  it('shows disadvantage sources', () => {
    const output = formatAttackResult(makeResult({ disadvantageSources: ['Poisoned (disadvantage on attacks)'] }))
    expect(output).toContain('Disadvantage: Poisoned (disadvantage on attacks)')
  })

  it('does not show advantage/disadvantage lines when arrays are empty', () => {
    const output = formatAttackResult(makeResult())
    expect(output).not.toContain('Advantage:')
    expect(output).not.toContain('Disadvantage:')
  })

  // ── Multiline format ──────────────────────────────────────────

  it('uses newline-separated format', () => {
    const output = formatAttackResult(makeResult())
    const lines = output.split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })

  // ── Edge cases ────────────────────────────────────────────────

  it('handles empty damage rolls array', () => {
    const output = formatAttackResult(makeResult({ damageRolls: [] }))
    // Should not crash and should not show empty brackets
    expect(output).not.toContain('[]')
  })

  it('handles attack with 0 damage total on hit', () => {
    const output = formatAttackResult(makeResult({ isHit: true, damageTotal: 0, damageRolls: [] }))
    expect(output).toContain('Damage:')
    expect(output).toContain('**0**')
  })
})
