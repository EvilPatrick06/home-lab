import { describe, expect, it } from 'vitest'

describe('MapManager', () => {
  it('can be imported', async () => {
    const mod = await import('./MapManager')
    expect(mod).toBeDefined()
  })
})
