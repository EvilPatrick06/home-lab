import { describe, expect, it } from 'vitest'

describe('InitiativeModal', () => {
  it('can be imported', async () => {
    const mod = await import('./InitiativeModal')
    expect(mod).toBeDefined()
  })
})
