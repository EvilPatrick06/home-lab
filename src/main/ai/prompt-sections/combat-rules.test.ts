import { describe, expect, it } from 'vitest'
import { COMBAT_RULES_PROMPT } from './combat-rules'

describe('combat-rules', () => {
  describe('COMBAT_RULES_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof COMBAT_RULES_PROMPT).toBe('string')
      expect(COMBAT_RULES_PROMPT.length).toBeGreaterThan(100)
    })

    // ── Unarmed Strike ──

    it('contains unarmed strike rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Unarmed Strike')
      expect(COMBAT_RULES_PROMPT).toContain('Damage')
      expect(COMBAT_RULES_PROMPT).toContain('Grapple')
      expect(COMBAT_RULES_PROMPT).toContain('Shove')
    })

    it('specifies three modes of unarmed strike', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Three modes available to all creatures')
    })

    it('includes grapple mechanics', () => {
      expect(COMBAT_RULES_PROMPT).toContain('free hand required')
      expect(COMBAT_RULES_PROMPT).toContain('DC 8 + STR mod + PB')
      expect(COMBAT_RULES_PROMPT).toContain('Grappled')
    })

    it('includes shove mechanics', () => {
      expect(COMBAT_RULES_PROMPT).toContain('pushed 5ft')
      expect(COMBAT_RULES_PROMPT).toContain('Prone')
    })

    // ── Falling ──

    it('contains falling hazard rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Falling')
      expect(COMBAT_RULES_PROMPT).toContain('1d6 Bludgeoning per 10ft')
      expect(COMBAT_RULES_PROMPT).toContain('max 20d6')
    })

    // ── Improvised Weapons ──

    it('contains improvised weapon rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Improvised Weapons')
      expect(COMBAT_RULES_PROMPT).toContain('1d4 damage')
      expect(COMBAT_RULES_PROMPT).toContain('20/60ft')
    })

    // ── Object AC & HP ──

    it('contains object AC and HP table', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Object AC & HP')
      expect(COMBAT_RULES_PROMPT).toContain('Cloth/Paper')
      expect(COMBAT_RULES_PROMPT).toContain('Iron/Steel')
      expect(COMBAT_RULES_PROMPT).toContain('Mithral')
      expect(COMBAT_RULES_PROMPT).toContain('Adamantine')
    })

    it('notes objects are immune to Poison and Psychic', () => {
      expect(COMBAT_RULES_PROMPT).toContain('immune to Poison and Psychic')
    })

    // ── Carrying Capacity ──

    it('contains carrying capacity rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Carrying Capacity')
      expect(COMBAT_RULES_PROMPT).toContain('STR')
      expect(COMBAT_RULES_PROMPT).toContain('15 lb')
    })

    // ── Movement Special Rules ──

    it('contains movement special rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Movement Special Rules')
      expect(COMBAT_RULES_PROMPT).toContain('Climbing')
      expect(COMBAT_RULES_PROMPT).toContain('Swimming')
      expect(COMBAT_RULES_PROMPT).toContain('Long Jump')
      expect(COMBAT_RULES_PROMPT).toContain('High Jump')
      expect(COMBAT_RULES_PROMPT).toContain('Flying Fall')
      expect(COMBAT_RULES_PROMPT).toContain('Teleportation')
    })

    it('specifies teleportation does not provoke opportunity attacks', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Does NOT provoke Opportunity Attacks')
    })

    // ── Dodge Action ──

    it('contains dodge action rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Dodge Action')
      expect(COMBAT_RULES_PROMPT).toContain('Disadvantage')
      expect(COMBAT_RULES_PROMPT).toContain('Advantage on DEX saving throws')
    })

    // ── Hazards ──

    it('contains hazard rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Hazards')
      expect(COMBAT_RULES_PROMPT).toContain('Burning')
      expect(COMBAT_RULES_PROMPT).toContain('Dehydration')
      expect(COMBAT_RULES_PROMPT).toContain('Malnutrition')
      expect(COMBAT_RULES_PROMPT).toContain('Suffocation')
    })

    // ── Exhaustion ──

    it('contains 2024 exhaustion rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Exhaustion (2024 Rules)')
      expect(COMBAT_RULES_PROMPT).toContain('-2 penalty')
      expect(COMBAT_RULES_PROMPT).toContain('6 levels')
      expect(COMBAT_RULES_PROMPT).toContain('dies')
      expect(COMBAT_RULES_PROMPT).toContain('Long Rest removes 1 Exhaustion')
    })

    it('clarifies short rest does NOT remove exhaustion', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Short Rest does NOT remove Exhaustion')
    })

    // ── Bloodied ──

    it('contains bloodied rule from MM 2025', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Bloodied (MM 2025)')
      expect(COMBAT_RULES_PROMPT).toContain('half its Hit Point maximum')
    })

    // ── Death Saving Throws ──

    it('contains death saving throw rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Death Saving Throws')
      expect(COMBAT_RULES_PROMPT).toContain('DC 10')
      expect(COMBAT_RULES_PROMPT).toContain('Natural 1')
      expect(COMBAT_RULES_PROMPT).toContain('Natural 20')
      expect(COMBAT_RULES_PROMPT).toContain('3 successes')
      expect(COMBAT_RULES_PROMPT).toContain('3 failures')
    })

    // ── Concentration ──

    it('contains concentration rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Concentration')
      expect(COMBAT_RULES_PROMPT).toContain('CON save DC')
      expect(COMBAT_RULES_PROMPT).toContain('capped at DC 30')
    })

    // ── Help Action ──

    it('contains help action rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Help Action')
      expect(COMBAT_RULES_PROMPT).toContain('Stabilize')
      expect(COMBAT_RULES_PROMPT).toContain('Assist Ability Check')
      expect(COMBAT_RULES_PROMPT).toContain('Assist Attack Roll')
    })

    // ── Influence Action ──

    it('contains influence action rules', () => {
      expect(COMBAT_RULES_PROMPT).toContain('Influence Action')
      expect(COMBAT_RULES_PROMPT).toContain('Deception')
      expect(COMBAT_RULES_PROMPT).toContain('Intimidation')
      expect(COMBAT_RULES_PROMPT).toContain('Persuasion')
      expect(COMBAT_RULES_PROMPT).toContain('Animal Handling')
    })
  })
})
