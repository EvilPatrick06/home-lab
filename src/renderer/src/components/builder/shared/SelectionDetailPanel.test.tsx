import { describe, expect, it } from 'vitest'

describe('SelectionDetailPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./SelectionDetailPanel')
    expect(mod).toBeDefined()
  })
})
