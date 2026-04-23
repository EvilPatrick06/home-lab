import { describe, expect, it } from 'vitest'

describe('WeaponSelectionStep', () => {
  it('can be imported', async () => {
    const mod = await import('./WeaponSelectionStep')
    expect(mod).toBeDefined()
  })
})
