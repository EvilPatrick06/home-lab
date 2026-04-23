import { describe, expect, it } from 'vitest'

describe('TreasuryTimeModals', () => {
  it('can be imported', async () => {
    const mod = await import('./TreasuryTimeModals')
    expect(mod).toBeDefined()
  })
})
