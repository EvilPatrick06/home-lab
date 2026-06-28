import { describe, expect, it } from 'vitest'

describe('MapSelector', () => {
  it('can be imported', async () => {
    const mod = await import('./DmMapSelector')
    expect(mod).toBeDefined()
  })
})
