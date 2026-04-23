import { describe, expect, it } from 'vitest'

describe('FacilityModals', () => {
  it('can be imported', async () => {
    const mod = await import('./FacilityModals')
    expect(mod).toBeDefined()
  })
})
