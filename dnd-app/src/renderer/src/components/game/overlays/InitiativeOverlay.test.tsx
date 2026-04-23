import { describe, expect, it } from 'vitest'

describe('InitiativeOverlay', () => {
  it('can be imported', async () => {
    const mod = await import('./InitiativeOverlay')
    expect(mod).toBeDefined()
  })
})
