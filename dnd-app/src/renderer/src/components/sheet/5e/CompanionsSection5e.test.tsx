import { describe, expect, it } from 'vitest'

describe('CompanionsSection5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CompanionsSection5e')
    expect(mod).toBeDefined()
  })
})
