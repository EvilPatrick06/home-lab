import { describe, expect, it } from 'vitest'

describe('CharacterMiniSheet', () => {
  it('can be imported', async () => {
    const mod = await import('./CharacterMiniSheet')
    expect(mod).toBeDefined()
  })
})
