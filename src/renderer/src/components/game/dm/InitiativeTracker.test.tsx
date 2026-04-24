import { describe, expect, it } from 'vitest'

describe('InitiativeTracker', () => {
  it('can be imported', async () => {
    const mod = await import('./InitiativeTracker')
    expect(mod).toBeDefined()
  })
})
