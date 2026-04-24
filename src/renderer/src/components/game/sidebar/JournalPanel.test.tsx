import { describe, expect, it } from 'vitest'

describe('JournalPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./JournalPanel')
    expect(mod).toBeDefined()
  })
})
