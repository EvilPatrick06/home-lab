import { describe, expect, it } from 'vitest'

describe('BastionPage', () => {
  it('can be imported', async () => {
    const mod = await import('./BastionPage')
    expect(mod).toBeDefined()
  })
})
