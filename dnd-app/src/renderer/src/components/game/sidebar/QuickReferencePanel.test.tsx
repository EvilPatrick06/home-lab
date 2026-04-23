import { describe, expect, it } from 'vitest'

describe('QuickReferencePanel', () => {
  it('can be imported', async () => {
    const mod = await import('./QuickReferencePanel')
    expect(mod).toBeDefined()
  })
})
