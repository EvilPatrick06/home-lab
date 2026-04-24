import { describe, expect, it } from 'vitest'

describe('OverviewCard', () => {
  it('can be imported', async () => {
    const mod = await import('./OverviewCard')
    expect(mod).toBeDefined()
  })
})
