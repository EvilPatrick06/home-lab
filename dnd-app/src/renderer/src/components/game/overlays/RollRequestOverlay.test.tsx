import { describe, expect, it } from 'vitest'

describe('RollRequestOverlay', () => {
  it('can be imported', async () => {
    const mod = await import('./RollRequestOverlay')
    expect(mod).toBeDefined()
  })
})
