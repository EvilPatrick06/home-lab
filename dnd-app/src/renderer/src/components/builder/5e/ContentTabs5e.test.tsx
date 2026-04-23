import { describe, expect, it } from 'vitest'

describe('ContentTabs5e', () => {
  it('can be imported', async () => {
    const mod = await import('./ContentTabs5e')
    expect(mod).toBeDefined()
  })
})
