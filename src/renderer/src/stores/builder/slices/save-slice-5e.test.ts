import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('save-slice-5e', () => {
  it('can be imported', async () => {
    const mod = await import('./save-slice-5e')
    expect(mod).toBeDefined()
  })

  it('exports buildCharacter5e as a function', async () => {
    const mod = await import('./save-slice-5e')
    expect(typeof mod.buildCharacter5e).toBe('function')
  })

  it('exports loadCharacterForEdit5e as a function', async () => {
    const mod = await import('./save-slice-5e')
    expect(typeof mod.loadCharacterForEdit5e).toBe('function')
  })

  it('exports buildArmorFromEquipment5e as a function', async () => {
    const mod = await import('./save-slice-5e')
    expect(typeof mod.buildArmorFromEquipment5e).toBe('function')
  })

  it('exports buildWeaponsFromEquipment5e as a function', async () => {
    const mod = await import('./save-slice-5e')
    expect(typeof mod.buildWeaponsFromEquipment5e).toBe('function')
  })
})
