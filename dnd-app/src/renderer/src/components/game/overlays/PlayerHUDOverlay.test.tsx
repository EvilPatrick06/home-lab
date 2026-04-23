import { describe, expect, it } from 'vitest'

describe('PlayerHUDOverlay', () => {
  it('can be imported', async () => {
    const mod = await import('./PlayerHUDOverlay')
    expect(mod).toBeDefined()
  })
})
