import { describe, expect, it } from 'vitest'

describe('SpellsTab5e', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellsTab5e')
    expect(mod).toBeDefined()
  })
})
