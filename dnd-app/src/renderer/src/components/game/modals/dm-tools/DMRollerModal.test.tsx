import { describe, expect, it } from 'vitest'

describe('DMRollerModal', () => {
  it('can be imported', async () => {
    const mod = await import('./DMRollerModal')
    expect(mod).toBeDefined()
  })
})
