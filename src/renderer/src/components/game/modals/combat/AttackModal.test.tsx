import { describe, expect, it } from 'vitest'

describe('AttackModal', () => {
  it('can be imported', async () => {
    const mod = await import('./AttackModal')
    expect(mod).toBeDefined()
  })
})
