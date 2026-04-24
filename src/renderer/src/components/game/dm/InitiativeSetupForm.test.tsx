import { describe, expect, it } from 'vitest'

describe('InitiativeSetupForm', () => {
  it('can be imported', async () => {
    const mod = await import('./InitiativeSetupForm')
    expect(mod).toBeDefined()
  })
})
