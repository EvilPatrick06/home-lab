import { describe, expect, it } from 'vitest'

describe('DeathSaves5e', () => {
  it('can be imported', async () => {
    const mod = await import('./DeathSaves5e')
    expect(mod).toBeDefined()
  })
})
