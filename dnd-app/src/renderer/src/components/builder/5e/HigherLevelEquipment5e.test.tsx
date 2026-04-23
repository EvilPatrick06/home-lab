import { describe, expect, it } from 'vitest'

describe('HigherLevelEquipment5e', () => {
  it('can be imported', async () => {
    const mod = await import('./HigherLevelEquipment5e')
    expect(mod).toBeDefined()
  })
})
