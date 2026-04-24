import { describe, expect, it } from 'vitest'

describe('PlayerHUDStats', () => {
  it('can be imported', async () => {
    const mod = await import('./PlayerHUDStats')
    expect(mod).toBeDefined()
  })
})
