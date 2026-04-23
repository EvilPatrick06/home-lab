import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('journal-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./journal-slice')
    expect(mod).toBeDefined()
  })

  it('exports createJournalSlice as a function', async () => {
    const mod = await import('./journal-slice')
    expect(typeof mod.createJournalSlice).toBe('function')
  })
})
