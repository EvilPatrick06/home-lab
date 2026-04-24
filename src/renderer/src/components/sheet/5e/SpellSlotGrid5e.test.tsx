import { describe, expect, it } from 'vitest'

describe('SpellSlotGrid5e', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellSlotGrid5e')
    expect(mod).toBeDefined()
  })
})
