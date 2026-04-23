import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('bastion event-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./event-slice')
    expect(mod).toBeDefined()
  })

  it('exports createEventSlice', async () => {
    const mod = await import('./event-slice')
    expect(mod.createEventSlice).toBeDefined()
    expect(typeof mod.createEventSlice).toBe('function')
  })
})
