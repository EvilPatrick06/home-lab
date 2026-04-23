import { describe, expect, it } from 'vitest'

describe('CharacterTraitsPanel5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CharacterTraitsPanel5e')
    expect(mod).toBeDefined()
  })
})
