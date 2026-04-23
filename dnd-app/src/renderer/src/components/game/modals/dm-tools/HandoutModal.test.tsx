import { describe, expect, it } from 'vitest'

describe('HandoutModal', () => {
  it('can be imported', async () => {
    const mod = await import('./HandoutModal')
    expect(mod).toBeDefined()
  })
})
