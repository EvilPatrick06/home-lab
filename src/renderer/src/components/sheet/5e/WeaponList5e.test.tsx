import { describe, expect, it } from 'vitest'

describe('WeaponList5e', () => {
  it('can be imported', async () => {
    const mod = await import('./WeaponList5e')
    expect(mod).toBeDefined()
  })
})
