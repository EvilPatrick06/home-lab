import { describe, expect, it } from 'vitest'

describe('DefenseSection5e', () => {
  it('can be imported', async () => {
    const mod = await import('./DefenseSection5e')
    expect(mod).toBeDefined()
  })
})
