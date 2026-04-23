import { describe, expect, it } from 'vitest'

describe('WildShapeBrowserModal', () => {
  it('can be imported', async () => {
    const mod = await import('./WildShapeBrowserModal')
    expect(mod).toBeDefined()
  })
})
