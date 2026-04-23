import { describe, expect, it } from 'vitest'

describe('EntryCard', () => {
  it('can be imported', async () => {
    const mod = await import('./EntryCard')
    expect(mod).toBeDefined()
  })
})
