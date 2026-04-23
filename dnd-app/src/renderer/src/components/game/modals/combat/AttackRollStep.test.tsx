import { describe, expect, it } from 'vitest'

describe('AttackRollStep', () => {
  it('can be imported', async () => {
    const mod = await import('./AttackRollStep')
    expect(mod).toBeDefined()
  })
})
