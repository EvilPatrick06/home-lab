import { describe, expect, it } from 'vitest'

describe('EquipmentTab', () => {
  it('can be imported', async () => {
    const mod = await import('./EquipmentTab')
    expect(mod).toBeDefined()
  })
})
