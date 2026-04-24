import { describe, expect, it } from 'vitest'

describe('Hotbar', () => {
  it('can be imported', async () => {
    const mod = await import('./Hotbar')
    expect(mod).toBeDefined()
  })
})
