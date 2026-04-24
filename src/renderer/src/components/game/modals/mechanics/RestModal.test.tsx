import { describe, expect, it } from 'vitest'

describe('RestModal', () => {
  it('can be imported', async () => {
    const mod = await import('./RestModal')
    expect(mod).toBeDefined()
  })
})
