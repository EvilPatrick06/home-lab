import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('bastion types', () => {
  it('can be imported', async () => {
    const mod = await import('./types')
    expect(mod).toBeDefined()
  })

  it('exports getBastion helper', async () => {
    const mod = await import('./types')
    expect(mod.getBastion).toBeDefined()
    expect(typeof mod.getBastion).toBe('function')
  })

  it('exports updateBastion helper', async () => {
    const mod = await import('./types')
    expect(mod.updateBastion).toBeDefined()
    expect(typeof mod.updateBastion).toBe('function')
  })

  it('getBastion returns undefined for empty array', async () => {
    const { getBastion } = await import('./types')
    expect(getBastion([], 'nonexistent')).toBeUndefined()
  })

  it('getBastion finds bastion by id', async () => {
    const { getBastion } = await import('./types')
    const bastions = [
      { id: 'b1', name: 'Castle' },
      { id: 'b2', name: 'Tower' }
    ] as unknown as import('../../types/bastion').Bastion[]
    const result = getBastion(bastions, 'b1')
    expect(result).toBeDefined()
    expect(result?.id).toBe('b1')
  })

  it('updateBastion updates the matching bastion', async () => {
    const { updateBastion } = await import('./types')
    const bastions = [
      { id: 'b1', name: 'Castle', treasury: 100 },
      { id: 'b2', name: 'Tower', treasury: 50 }
    ] as unknown as import('../../types/bastion').Bastion[]
    const result = updateBastion(bastions, 'b1', { treasury: 200 } as Partial<import('../../types/bastion').Bastion>)
    expect(result).toHaveLength(2)
    const updated = result.find((b) => b.id === 'b1')
    expect(updated?.treasury).toBe(200)
    expect(updated?.updatedAt).toBeDefined()
  })
})
