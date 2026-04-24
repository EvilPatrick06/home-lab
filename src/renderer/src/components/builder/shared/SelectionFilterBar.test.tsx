import { describe, expect, it } from 'vitest'

describe('SelectionFilterBar', () => {
  it('can be imported', async () => {
    const mod = await import('./SelectionFilterBar')
    expect(mod).toBeDefined()
  })
})
