import { describe, expect, it } from 'vitest'
import { actionAppliesConditions, extractConditionsFromDescription } from './condition-extractor'

describe('extractConditionsFromDescription', () => {
  it('extracts a single condition with save DC', () => {
    const desc =
      'The target must succeed on a DC 15 Constitution saving throw or have the Poisoned condition for 1 minute.'
    const result = extractConditionsFromDescription(desc)
    expect(result).toHaveLength(1)
    expect(result[0].condition).toBe('Poisoned')
    expect(result[0].saveDC).toBe(15)
    expect(result[0].saveType).toBe('Constitution')
  })

  it('extracts multiple conditions', () => {
    const desc = 'On a hit, the target has the Blinded and Restrained conditions until the end of its next turn.'
    const result = extractConditionsFromDescription(desc)
    expect(result).toHaveLength(2)
    const names = result.map((r) => r.condition)
    expect(names).toContain('Blinded')
    expect(names).toContain('Restrained')
  })

  it('extracts condition with duration', () => {
    const desc = "The target has the Frightened condition until the start of the target's next turn."
    const result = extractConditionsFromDescription(desc)
    expect(result).toHaveLength(1)
    expect(result[0].condition).toBe('Frightened')
    expect(result[0].duration).toMatch(/until the start/)
  })

  it('extracts Prone from knock prone text', () => {
    const desc = 'The target is knocked Prone.'
    const result = extractConditionsFromDescription(desc)
    expect(result).toHaveLength(1)
    expect(result[0].condition).toBe('Prone')
  })

  it('extracts Charmed with condition keyword', () => {
    const desc = "The target has the Charmed condition until the start of the pirate's next turn."
    const result = extractConditionsFromDescription(desc)
    expect(result).toHaveLength(1)
    expect(result[0].condition).toBe('Charmed')
  })

  it('returns empty for no conditions', () => {
    const desc = 'The creature deals 2d6 + 4 slashing damage.'
    const result = extractConditionsFromDescription(desc)
    expect(result).toHaveLength(0)
  })

  it('does not duplicate conditions mentioned multiple times', () => {
    const desc = 'The target has the Paralyzed condition. While Paralyzed, the target takes 1d6 damage.'
    const result = extractConditionsFromDescription(desc)
    expect(result).toHaveLength(1)
    expect(result[0].condition).toBe('Paralyzed')
  })

  it('extracts Grappled condition', () => {
    const desc =
      'The target has the Grappled condition (escape DC 14). Until the grapple ends, the target has the Restrained condition.'
    const result = extractConditionsFromDescription(desc)
    expect(result).toHaveLength(2)
    const names = result.map((r) => r.condition)
    expect(names).toContain('Grappled')
    expect(names).toContain('Restrained')
  })
})

describe('actionAppliesConditions', () => {
  it('returns true when description contains a condition', () => {
    expect(actionAppliesConditions('The target is Stunned until the end of its next turn.')).toBe(true)
  })

  it('returns false when description has no condition', () => {
    expect(actionAppliesConditions('Deals 2d8 + 3 fire damage.')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(actionAppliesConditions('')).toBe(false)
  })
})
