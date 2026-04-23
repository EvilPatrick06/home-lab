import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('game store types', () => {
  it('can be imported', async () => {
    const mod = await import('./types')
    expect(mod).toBeDefined()
  })

  it('exports initialState object', async () => {
    const mod = await import('./types')
    expect(mod.initialState).toBeDefined()
    expect(typeof mod.initialState).toBe('object')
  })

  it('initialState has expected shape', async () => {
    const mod = await import('./types')
    expect(mod.initialState).toHaveProperty('campaignId')
    expect(mod.initialState).toHaveProperty('system')
    expect(mod.initialState).toHaveProperty('maps')
    expect(mod.initialState).toHaveProperty('turnMode')
    expect(mod.initialState).toHaveProperty('conditions')
    expect(mod.initialState).toHaveProperty('round')
  })

  it('exports createTurnState helper function', async () => {
    const mod = await import('./types')
    expect(typeof mod.createTurnState).toBe('function')
  })

  it('createTurnState returns correct shape', async () => {
    const mod = await import('./types')
    const ts = mod.createTurnState('entity-1', 30)
    expect(ts.entityId).toBe('entity-1')
    expect(ts.movementRemaining).toBe(30)
    expect(ts.movementMax).toBe(30)
    expect(ts.actionUsed).toBe(false)
    expect(ts.bonusActionUsed).toBe(false)
    expect(ts.reactionUsed).toBe(false)
  })
})
