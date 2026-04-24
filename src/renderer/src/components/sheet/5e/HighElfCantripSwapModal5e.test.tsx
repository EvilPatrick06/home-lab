import { describe, expect, it } from 'vitest'

describe('HighElfCantripSwapModal5e', () => {
  it('can be imported', async () => {
    const mod = await import('./HighElfCantripSwapModal5e')
    expect(mod).toBeDefined()
  })
})
