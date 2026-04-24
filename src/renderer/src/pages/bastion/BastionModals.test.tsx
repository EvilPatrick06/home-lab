import { describe, expect, it } from 'vitest'

describe('BastionModals', () => {
  it('can be imported', async () => {
    const mod = await import('./BastionModals')
    expect(mod).toBeDefined()
  })
})
