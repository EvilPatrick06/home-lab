import { describe, expect, it } from 'vitest'

describe('NPCManager', () => {
  it('can be imported', async () => {
    const mod = await import('./InGameNpcManager')
    expect(mod).toBeDefined()
  })
})
