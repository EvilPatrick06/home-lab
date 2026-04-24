import { describe, expect, it } from 'vitest'

describe('AudioManager', () => {
  it('can be imported', async () => {
    const mod = await import('./AudioManager')
    expect(mod).toBeDefined()
  })
})
