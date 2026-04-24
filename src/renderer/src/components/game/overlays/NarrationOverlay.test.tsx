import { describe, expect, it } from 'vitest'

describe('NarrationOverlay', () => {
  it('can be imported', async () => {
    const mod = await import('./NarrationOverlay')
    expect(mod).toBeDefined()
  })
})
