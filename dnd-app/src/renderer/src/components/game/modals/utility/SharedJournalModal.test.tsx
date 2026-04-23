import { describe, expect, it } from 'vitest'

describe('SharedJournalModal', () => {
  it('can be imported', async () => {
    const mod = await import('./SharedJournalModal')
    expect(mod).toBeDefined()
  })
})
