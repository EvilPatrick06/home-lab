import { describe, expect, it } from 'vitest'

describe('LightSourceModal', () => {
  it('can be imported', async () => {
    const mod = await import('./LightSourceModal')
    expect(mod).toBeDefined()
  })
})
