import { describe, expect, it } from 'vitest'

describe('ClockOverlay', () => {
  it('can be imported', async () => {
    const mod = await import('./ClockOverlay')
    expect(mod).toBeDefined()
  })
})
