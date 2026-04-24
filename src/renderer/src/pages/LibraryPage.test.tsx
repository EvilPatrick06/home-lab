import { describe, expect, it } from 'vitest'

describe('LibraryPage', () => {
  it('can be imported', async () => {
    const mod = await import('./LibraryPage')
    expect(mod).toBeDefined()
  })
})
