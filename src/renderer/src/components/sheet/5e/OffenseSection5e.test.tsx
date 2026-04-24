import { describe, expect, it } from 'vitest'

describe('OffenseSection5e', () => {
  it('can be imported', async () => {
    const mod = await import('./OffenseSection5e')
    expect(mod).toBeDefined()
  })
})
