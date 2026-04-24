import { describe, expect, it } from 'vitest'

describe('NPCManager', () => {
  it('can be imported', async () => {
    const mod = await import('./NPCManager')
    expect(mod).toBeDefined()
  })
})
