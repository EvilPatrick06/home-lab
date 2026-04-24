import { describe, expect, it } from 'vitest'

describe('ItemModal', () => {
  it('can be imported', async () => {
    const mod = await import('./ItemModal')
    expect(mod).toBeDefined()
  })
})
