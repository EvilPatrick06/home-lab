import { describe, expect, it } from 'vitest'

describe('AttackModalSteps', () => {
  it('can be imported', async () => {
    const mod = await import('./AttackModalSteps')
    expect(mod).toBeDefined()
  })
})
