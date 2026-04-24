import { describe, expect, it } from 'vitest'

describe('RollerQuickDice', () => {
  it('can be imported', async () => {
    const mod = await import('./RollerQuickDice')
    expect(mod).toBeDefined()
  })
})
