import { describe, expect, it } from 'vitest'

describe('EquipmentSection5e', () => {
  it('can be imported', async () => {
    const mod = await import('./EquipmentSection5e')
    expect(mod).toBeDefined()
  })
})
