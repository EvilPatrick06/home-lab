import { describe, expect, it } from 'vitest'

describe('SpellSummary5e', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellSummary5e')
    expect(mod).toBeDefined()
  })
})
