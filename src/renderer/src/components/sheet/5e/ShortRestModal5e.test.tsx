import { describe, expect, it } from 'vitest'

describe('ShortRestModal5e', () => {
  it('can be imported', async () => {
    const mod = await import('./ShortRestModal5e')
    expect(mod).toBeDefined()
  })
})
