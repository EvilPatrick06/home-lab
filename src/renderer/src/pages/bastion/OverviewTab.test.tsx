import { describe, expect, it } from 'vitest'

describe('OverviewTab', () => {
  it('can be imported', async () => {
    const mod = await import('./OverviewTab')
    expect(mod).toBeDefined()
  })
})
