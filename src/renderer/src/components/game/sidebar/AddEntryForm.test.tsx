import { describe, expect, it } from 'vitest'

describe('AddEntryForm', () => {
  it('can be imported', async () => {
    const mod = await import('./AddEntryForm')
    expect(mod).toBeDefined()
  })
})
