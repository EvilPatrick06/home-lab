import { describe, expect, it } from 'vitest'

describe('AttackResultStep', () => {
  it('can be imported', async () => {
    const mod = await import('./AttackResultStep')
    expect(mod).toBeDefined()
  })
})
