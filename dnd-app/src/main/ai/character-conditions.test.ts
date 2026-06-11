import { describe, expect, it } from 'vitest'
import type { Character5eV3 } from '../../shared/types/character-5e'
import {
  addConditionInstance,
  conditionSlug,
  getConditionValue,
  hasCondition,
  listConditions,
  removeConditionInstance,
  setConditionValue,
  titleCaseSlug
} from './character-conditions'

/** Minimal v4-shaped character (NO inline `conditions`). */
function v4(over: Record<string, unknown> = {}): Character5eV3 {
  return { id: 'c1', name: 'Test', conditionRefs: [], ...over } as unknown as Character5eV3
}

describe('character-conditions', () => {
  it('conditionSlug / titleCaseSlug round-trip', () => {
    expect(conditionSlug('Frightened By Dragon')).toBe('frightened-by-dragon')
    // titleCaseSlug capitalizes each word but keeps the separator (mirrors the
    // existing character-context titleCase fallback) — used only when overrides.name is absent.
    expect(titleCaseSlug('frightened-by-dragon')).toBe('Frightened-By-Dragon')
    expect(titleCaseSlug('poisoned')).toBe('Poisoned')
  })

  it('add / has / remove on a v4 character (writes refs, never inline)', () => {
    const c = v4()
    addConditionInstance(c, { name: 'Poisoned' })
    expect(hasCondition(c, 'poisoned')).toBe(true)
    expect(listConditions(c)[0].name).toBe('Poisoned')
    expect((c as { conditions?: unknown }).conditions).toBeUndefined()
    expect(removeConditionInstance(c, 'Poisoned')).toBe(true)
    expect(hasCondition(c, 'Poisoned')).toBe(false)
  })

  it('carries duration in overrides', () => {
    const c = v4()
    addConditionInstance(c, { name: 'Stunned', duration: 3 })
    expect(listConditions(c).find((x) => x.name === 'Stunned')?.duration).toBe(3)
  })

  it('folds + self-heals a legacy inline conditions array', () => {
    const c = v4({ conditionRefs: undefined, conditions: [{ name: 'Prone', type: 'condition', isCustom: false }] })
    // listConditions surfaces it read-only…
    expect(listConditions(c).some((x) => x.name === 'Prone')).toBe(true)
    // …and the first mutating call migrates it into refs and drops the inline field.
    addConditionInstance(c, { name: 'Blinded' })
    expect((c as { conditions?: unknown }).conditions).toBeUndefined()
    expect(hasCondition(c, 'prone')).toBe(true)
    expect(hasCondition(c, 'blinded')).toBe(true)
  })

  it('exhaustion value get/set, remove-at-0, value-less treated as level 1', () => {
    const c = v4()
    setConditionValue(c, 'exhaustion', 3)
    expect(getConditionValue(c, 'exhaustion')).toBe(3)
    setConditionValue(c, 'exhaustion', 1)
    expect(getConditionValue(c, 'exhaustion')).toBe(1)
    setConditionValue(c, 'exhaustion', 0) // removes
    expect(hasCondition(c, 'exhaustion')).toBe(false)
    // a present ref with no explicit value counts as level 1
    addConditionInstance(c, { name: 'Exhaustion' })
    expect(getConditionValue(c, 'exhaustion')).toBe(1)
  })

  it('stores a human display name even when called with a bare slug', () => {
    const c = v4()
    setConditionValue(c, 'exhaustion', 2)
    expect(listConditions(c).find((x) => x.name === 'Exhaustion')).toBeDefined()
  })
})
