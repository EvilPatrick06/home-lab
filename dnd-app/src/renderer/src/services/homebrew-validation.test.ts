import { describe, expect, it } from 'vitest'
import { validateHomebrew } from './homebrew-validation'

describe('validateHomebrew (Phase 25d)', () => {
  it('passes a structurally-complete entry', () => {
    const r = validateHomebrew({ id: 'hb1', name: 'Custom Thing', type: 'unknowntype', data: {} })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('hard-errors on missing id / name / type', () => {
    const r = validateHomebrew({ data: {} })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('id is required')
    expect(r.errors).toContain('name is required')
    expect(r.errors).toContain('type is required')
  })

  it('warns (not errors) on an unknown type', () => {
    const r = validateHomebrew({ id: 'x', name: 'X', type: 'totally-made-up' })
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => w.includes('Unknown homebrew type'))).toBe(true)
  })

  it('rejects a non-object', () => {
    expect(validateHomebrew('nope').valid).toBe(false)
    expect(validateHomebrew(null).valid).toBe(false)
  })
})
