import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('game store index', () => {
  it('can be imported', async () => {
    const mod = await import('./index')
    expect(mod).toBeDefined()
  })

  it('exports useGameStore', async () => {
    const mod = await import('./index')
    expect(mod.useGameStore).toBeDefined()
    expect(typeof mod.useGameStore).toBe('function')
  })

  it('re-exports GameStoreState type', async () => {
    // Type re-exports are verified at compile time; here we just confirm the module loads
    const mod = await import('./index')
    expect(Object.keys(mod).length).toBeGreaterThan(0)
  })
})
