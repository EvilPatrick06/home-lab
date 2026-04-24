import { describe, expect, it } from 'vitest'

describe('LibraryFilters', () => {
  it('can be imported', async () => {
    const mod = await import('./LibraryFilters')
    expect(mod).toBeDefined()
  })
})
