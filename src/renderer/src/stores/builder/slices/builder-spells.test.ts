import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('builder-spells', () => {
  it('can be imported', async () => {
    const mod = await import('./builder-spells')
    expect(mod).toBeDefined()
  })

  it('exports resolveBuilderSpells as a function', async () => {
    const mod = await import('./builder-spells')
    expect(typeof mod.resolveBuilderSpells).toBe('function')
  })
})
