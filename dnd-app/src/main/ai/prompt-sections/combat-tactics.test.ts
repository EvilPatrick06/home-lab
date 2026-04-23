import { describe, expect, it } from 'vitest'
import { COMBAT_TACTICS_PROMPT } from './combat-tactics'

describe('combat-tactics', () => {
  describe('COMBAT_TACTICS_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof COMBAT_TACTICS_PROMPT).toBe('string')
      expect(COMBAT_TACTICS_PROMPT.length).toBeGreaterThan(100)
    })

    it('is titled Combat Tactics', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Combat Tactics')
    })

    // ── Target Prioritization ──

    it('contains target prioritization by INT score', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Target Prioritization')
      expect(COMBAT_TACTICS_PROMPT).toContain('INT 1-3')
      expect(COMBAT_TACTICS_PROMPT).toContain('INT 4-7')
      expect(COMBAT_TACTICS_PROMPT).toContain('INT 8-11')
      expect(COMBAT_TACTICS_PROMPT).toContain('INT 12-15')
      expect(COMBAT_TACTICS_PROMPT).toContain('INT 16+')
    })

    it('assigns appropriate behaviors to low INT creatures', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Attack nearest target')
      expect(COMBAT_TACTICS_PROMPT).toContain('No tactics')
    })

    it('assigns sophisticated tactics to high INT creatures', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Optimize action economy')
      expect(COMBAT_TACTICS_PROMPT).toContain('Bait reactions')
    })

    it('includes retreat thresholds by INT range', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Retreat at 25% HP')
      expect(COMBAT_TACTICS_PROMPT).toContain('Retreat at 33% HP')
      expect(COMBAT_TACTICS_PROMPT).toContain('Retreat at 50%')
    })

    it('specifies target priority order for clever creatures', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('healer > caster > ranged > tank')
    })

    // ── AoE vs Single-Target ──

    it('contains AoE decision rules', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('AoE vs Single-Target')
      expect(COMBAT_TACTICS_PROMPT).toContain('3+ targets')
      expect(COMBAT_TACTICS_PROMPT).toContain('friendly fire')
    })

    // ── Retreat & Morale ──

    it('contains retreat and morale rules', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Retreat & Morale')
      expect(COMBAT_TACTICS_PROMPT).toContain('flee')
      expect(COMBAT_TACTICS_PROMPT).toContain('surrender')
      expect(COMBAT_TACTICS_PROMPT).toContain('parley')
    })

    it('specifies mindless creatures fight to death', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Mindless creatures')
      expect(COMBAT_TACTICS_PROMPT).toContain('fight to death')
    })

    // ── Ability Usage ──

    it('contains ability usage guidelines', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Ability Usage')
      expect(COMBAT_TACTICS_PROMPT).toContain('recharge abilities')
    })

    it('specifies legendary action rules', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('legendary actions')
      expect(COMBAT_TACTICS_PROMPT).toContain('reset')
    })

    it('specifies legendary resistance strategy', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('legendary resistances')
      expect(COMBAT_TACTICS_PROMPT).toContain('save-or-suck')
      expect(COMBAT_TACTICS_PROMPT).toContain('Stunned')
      expect(COMBAT_TACTICS_PROMPT).toContain('Paralyzed')
      expect(COMBAT_TACTICS_PROMPT).toContain('Banished')
    })

    it('notes legendary resistances do not recharge', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('do NOT recharge')
    })

    // ── Positioning ──

    it('contains positioning guidelines', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Positioning')
      expect(COMBAT_TACTICS_PROMPT).toContain('[GAME STATE]')
    })

    it('specifies ranged attacker distance', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('30+ ft')
    })

    it('specifies melee bruiser targeting', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('lowest-AC targets')
    })

    it('specifies spellcaster positioning', () => {
      expect(COMBAT_TACTICS_PROMPT).toContain('Spellcaster monsters')
      expect(COMBAT_TACTICS_PROMPT).toContain('behind front line')
    })
  })
})
