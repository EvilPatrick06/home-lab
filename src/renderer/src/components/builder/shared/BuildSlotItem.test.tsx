import { describe, expect, it } from 'vitest'

describe('BuildSlotItem', () => {
  it('can be imported', async () => {
    const mod = await import('./BuildSlotItem')
    expect(mod).toBeDefined()
  })
})
