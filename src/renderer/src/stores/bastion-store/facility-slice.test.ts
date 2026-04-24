import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('bastion facility-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./facility-slice')
    expect(mod).toBeDefined()
  })

  it('exports createFacilitySlice', async () => {
    const mod = await import('./facility-slice')
    expect(mod.createFacilitySlice).toBeDefined()
    expect(typeof mod.createFacilitySlice).toBe('function')
  })
})
