import { describe, expect, it } from 'vitest'

describe('SpellList5e', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellList5e')
    expect(mod).toBeDefined()
  })
})
