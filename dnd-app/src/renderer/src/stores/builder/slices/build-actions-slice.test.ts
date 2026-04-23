import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('build-actions-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./build-actions-slice')
    expect(mod).toBeDefined()
  })

  it('exports createBuildActionsSlice as a function', async () => {
    const mod = await import('./build-actions-slice')
    expect(typeof mod.createBuildActionsSlice).toBe('function')
  })
})
