import { describe, expect, it } from 'vitest'

describe('DMToolsTabContent', () => {
  it('can be imported', async () => {
    const mod = await import('./DMToolsTabContent')
    expect(mod).toBeDefined()
  })
})
