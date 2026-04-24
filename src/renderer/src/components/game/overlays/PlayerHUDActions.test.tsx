import { describe, expect, it } from 'vitest'

describe('PlayerHUDActions', () => {
  it('can be imported', async () => {
    const mod = await import('./PlayerHUDActions')
    expect(mod).toBeDefined()
  })
})
