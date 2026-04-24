import { describe, expect, it } from 'vitest'

describe('SteedSelectorModal', () => {
  it('can be imported', async () => {
    const mod = await import('./SteedSelectorModal')
    expect(mod).toBeDefined()
  })
})
