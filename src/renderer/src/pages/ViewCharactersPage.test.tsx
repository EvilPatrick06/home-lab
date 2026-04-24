import { describe, expect, it } from 'vitest'

describe('ViewCharactersPage', () => {
  it('can be imported', async () => {
    const mod = await import('./ViewCharactersPage')
    expect(mod).toBeDefined()
  })
})
