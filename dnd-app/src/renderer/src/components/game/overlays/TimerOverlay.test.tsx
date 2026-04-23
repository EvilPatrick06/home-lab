import { describe, expect, it } from 'vitest'

describe('TimerOverlay', () => {
  it('can be imported', async () => {
    const mod = await import('./TimerOverlay')
    expect(mod).toBeDefined()
  })
})
