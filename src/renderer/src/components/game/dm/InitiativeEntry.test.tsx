import { describe, expect, it } from 'vitest'

describe('InitiativeEntry', () => {
  it('can be imported', async () => {
    const mod = await import('./InitiativeEntry')
    expect(mod).toBeDefined()
  })
})
