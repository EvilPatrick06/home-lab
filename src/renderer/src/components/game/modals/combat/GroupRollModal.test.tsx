import { describe, expect, it } from 'vitest'

describe('GroupRollModal', () => {
  it('can be imported', async () => {
    const mod = await import('./GroupRollModal')
    expect(mod).toBeDefined()
  })
})
