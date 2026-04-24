import { describe, expect, it } from 'vitest'

describe('DMBottomBar', () => {
  it('can be imported', async () => {
    const mod = await import('./DMBottomBar')
    expect(mod).toBeDefined()
  })
})
