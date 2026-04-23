import { describe, expect, it } from 'vitest'

describe('AttackCalculator5e', () => {
  it('can be imported', async () => {
    const mod = await import('./AttackCalculator5e')
    expect(mod).toBeDefined()
  })
})
