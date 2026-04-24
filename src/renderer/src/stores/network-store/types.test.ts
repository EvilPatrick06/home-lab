import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('network types', () => {
  it('can be imported', async () => {
    const mod = await import('./types')
    expect(mod).toBeDefined()
  })

  it('exports module without errors (type-only module)', async () => {
    // This module only exports TypeScript interfaces/types
    // which are erased at runtime. The import itself should succeed.
    const mod = await import('./types')
    expect(mod).toBeDefined()
  })
})
