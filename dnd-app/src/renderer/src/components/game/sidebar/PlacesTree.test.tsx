import { describe, expect, it } from 'vitest'

describe('PlacesTree', () => {
  it('can be imported', async () => {
    const mod = await import('./PlacesTree')
    expect(mod).toBeDefined()
  })
})
