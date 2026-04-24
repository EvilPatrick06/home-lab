import { describe, expect, it } from 'vitest'

describe('SpellPrepOptimizer', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellPrepOptimizer')
    expect(mod).toBeDefined()
  })
})
