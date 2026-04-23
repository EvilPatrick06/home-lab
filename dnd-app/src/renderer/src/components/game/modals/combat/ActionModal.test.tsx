import { describe, expect, it } from 'vitest'

describe('ActionModal', () => {
  it('can be imported', async () => {
    const mod = await import('./ActionModal')
    expect(mod).toBeDefined()
  })
})
