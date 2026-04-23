import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('load-character-5e', () => {
  it('can be imported', async () => {
    const mod = await import('./load-character-5e')
    expect(mod).toBeDefined()
  })

  it('exports loadCharacterForEdit5e function', async () => {
    const mod = await import('./load-character-5e')
    expect(mod.loadCharacterForEdit5e).toBeDefined()
    expect(typeof mod.loadCharacterForEdit5e).toBe('function')
  })
})
