import { describe, expect, it } from 'vitest'

describe('TraitEditor5e', () => {
  it('can be imported', async () => {
    const mod = await import('./TraitEditor5e')
    expect(mod).toBeDefined()
  })
})
