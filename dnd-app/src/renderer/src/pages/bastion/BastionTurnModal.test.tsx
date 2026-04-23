import { describe, expect, it } from 'vitest'

describe('BastionTurnModal', () => {
  it('can be imported', async () => {
    const mod = await import('./BastionTurnModal')
    expect(mod).toBeDefined()
  })
})
