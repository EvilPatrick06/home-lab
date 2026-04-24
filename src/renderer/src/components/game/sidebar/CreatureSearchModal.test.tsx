import { describe, expect, it } from 'vitest'

describe('CreatureSearchModal', () => {
  it('can be imported', async () => {
    const mod = await import('./CreatureSearchModal')
    expect(mod).toBeDefined()
  })
})
