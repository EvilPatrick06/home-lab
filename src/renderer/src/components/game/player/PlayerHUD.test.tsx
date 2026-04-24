import { describe, expect, it } from 'vitest'

describe('PlayerHUD', () => {
  it('can be imported', async () => {
    const mod = await import('./PlayerHUD')
    expect(mod).toBeDefined()
  })
})
