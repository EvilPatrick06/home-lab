import { describe, expect, it } from 'vitest'

describe('JumpModal', () => {
  it('can be imported', async () => {
    const mod = await import('./JumpModal')
    expect(mod).toBeDefined()
  })
})
