import { describe, expect, it } from 'vitest'

describe('CharacterBuilder5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CharacterBuilder5e')
    expect(mod).toBeDefined()
  })
})
