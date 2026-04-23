import { describe, expect, it } from 'vitest'

describe('BastionTabs', () => {
  it('can be imported', async () => {
    const mod = await import('./BastionTabs')
    expect(mod).toBeDefined()
  })
})
