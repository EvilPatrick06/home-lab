import { describe, expect, it } from 'vitest'

describe('SpellSlotTracker', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellSlotTracker')
    expect(mod).toBeDefined()
  })
})
