import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('apply-level-up', () => {
  it('can be imported', async () => {
    const mod = await import('./apply-level-up')
    expect(mod).toBeDefined()
  })

  it('exports apply5eLevelUp function', async () => {
    const mod = await import('./apply-level-up')
    expect(mod.apply5eLevelUp).toBeDefined()
    expect(typeof mod.apply5eLevelUp).toBe('function')
  })
})
