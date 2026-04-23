import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('network client-handlers', () => {
  it('can be imported', async () => {
    const mod = await import('./client-handlers')
    expect(mod).toBeDefined()
  })

  it('exports handleClientMessage function', async () => {
    const mod = await import('./client-handlers')
    expect(mod.handleClientMessage).toBeDefined()
    expect(typeof mod.handleClientMessage).toBe('function')
  })
})
