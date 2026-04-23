import { describe, expect, it } from 'vitest'

describe('FacilityTabs', () => {
  it('can be imported', async () => {
    const mod = await import('./FacilityTabs')
    expect(mod).toBeDefined()
  })
})
