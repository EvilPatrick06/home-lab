import { describe, expect, it } from 'vitest'

describe('CreateMapModal', () => {
  it('can be imported', async () => {
    const mod = await import('./CreateMapModal')
    expect(mod).toBeDefined()
  })
})
