import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('build-character-5e', () => {
  it('can be imported', async () => {
    const mod = await import('./build-character-5e')
    expect(mod).toBeDefined()
  })

  it('exports buildCharacter5e function', async () => {
    const mod = await import('./build-character-5e')
    expect(mod.buildCharacter5e).toBeDefined()
    expect(typeof mod.buildCharacter5e).toBe('function')
  })
})
