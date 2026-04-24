import { describe, expect, it } from 'vitest'

describe('InitiativeControls', () => {
  it('can be imported', async () => {
    const mod = await import('./InitiativeControls')
    expect(mod).toBeDefined()
  })
})
