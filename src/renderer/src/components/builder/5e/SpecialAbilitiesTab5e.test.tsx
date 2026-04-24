import { describe, expect, it } from 'vitest'

describe('SpecialAbilitiesTab5e', () => {
  it('can be imported', async () => {
    const mod = await import('./SpecialAbilitiesTab5e')
    expect(mod).toBeDefined()
  })
})
