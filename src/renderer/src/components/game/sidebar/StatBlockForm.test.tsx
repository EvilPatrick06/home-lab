import { describe, expect, it } from 'vitest'

describe('StatBlockForm', () => {
  it('can be imported', async () => {
    const mod = await import('./StatBlockForm')
    expect(mod).toBeDefined()
  })
})
