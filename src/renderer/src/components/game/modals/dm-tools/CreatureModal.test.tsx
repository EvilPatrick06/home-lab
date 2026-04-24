import { describe, expect, it } from 'vitest'

describe('CreatureModal', () => {
  it('can be imported', async () => {
    const mod = await import('./CreatureModal')
    expect(mod).toBeDefined()
  })
})
