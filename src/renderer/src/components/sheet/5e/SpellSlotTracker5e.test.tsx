import { describe, expect, it } from 'vitest'

describe('SpellSlotTracker5e', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellSlotTracker5e')
    expect(mod).toBeDefined()
  })
})
