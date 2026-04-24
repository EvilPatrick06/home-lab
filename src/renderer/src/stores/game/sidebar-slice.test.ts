import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('sidebar-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./sidebar-slice')
    expect(mod).toBeDefined()
  })

  it('exports createSidebarSlice as a function', async () => {
    const mod = await import('./sidebar-slice')
    expect(typeof mod.createSidebarSlice).toBe('function')
  })
})
