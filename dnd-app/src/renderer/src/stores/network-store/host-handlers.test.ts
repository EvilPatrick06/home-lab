import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('network host-handlers', () => {
  it('can be imported', async () => {
    const mod = await import('./host-handlers')
    expect(mod).toBeDefined()
  })

  it('exports handleHostMessage function', async () => {
    const mod = await import('./host-handlers')
    expect(mod.handleHostMessage).toBeDefined()
    expect(typeof mod.handleHostMessage).toBe('function')
  })
})
