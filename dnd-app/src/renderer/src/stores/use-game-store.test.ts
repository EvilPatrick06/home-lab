import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import type { SessionLogEntry } from './use-game-store'
import { useGameStore } from './use-game-store'

describe('useGameStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-game-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useGameStore).toBe('function')
  })

  it('store has session and game state properties', () => {
    // SessionLogEntry is a type-only export (erased at runtime)
    // so we verify the store state shape instead
    const state = useGameStore.getState()
    expect(typeof state.system).toBe('string')
    expect(typeof state.turnMode).toBe('string')
  })

  it('has expected initial state shape', () => {
    const state = useGameStore.getState()
    expect(state).toHaveProperty('campaignId')
    expect(state).toHaveProperty('system')
    expect(state).toHaveProperty('activeMapId')
    expect(state).toHaveProperty('maps')
    expect(state).toHaveProperty('turnMode')
    expect(state).toHaveProperty('initiative')
    expect(state).toHaveProperty('round')
    expect(state).toHaveProperty('conditions')
    expect(state).toHaveProperty('isPaused')
    expect(state).toHaveProperty('turnStates')
    expect(state).toHaveProperty('underwaterCombat')
    expect(state).toHaveProperty('flankingEnabled')
    expect(state).toHaveProperty('groupInitiativeEnabled')
    expect(state).toHaveProperty('diagonalRule')
    expect(state).toHaveProperty('ambientLight')
    expect(state).toHaveProperty('travelPace')
    expect(state).toHaveProperty('marchingOrder')
  })

  it('has expected initial state values', () => {
    const state = useGameStore.getState()
    expect(state.campaignId).toBe('')
    expect(state.system).toBe('dnd5e')
    expect(state.activeMapId).toBeNull()
    expect(state.maps).toEqual([])
    expect(state.turnMode).toBe('free')
    expect(state.initiative).toBeNull()
    expect(state.round).toBe(0)
    expect(state.conditions).toEqual([])
    expect(state.isPaused).toBe(false)
    expect(state.underwaterCombat).toBe(false)
    expect(state.flankingEnabled).toBe(false)
    expect(state.groupInitiativeEnabled).toBe(false)
    expect(state.diagonalRule).toBe('standard')
    expect(state.ambientLight).toBe('bright')
    expect(state.travelPace).toBeNull()
    expect(state.marchingOrder).toEqual([])
  })

  it('has slice actions', () => {
    const state = useGameStore.getState()
    // Game flow actions
    expect(typeof state.setPaused).toBe('function')
    expect(typeof state.setTurnMode).toBe('function')
    expect(typeof state.reset).toBe('function')
    expect(typeof state.loadGameState).toBe('function')
    // Combat environment
    expect(typeof state.setUnderwaterCombat).toBe('function')
    expect(typeof state.setFlankingEnabled).toBe('function')
    expect(typeof state.setGroupInitiativeEnabled).toBe('function')
    expect(typeof state.setDiagonalRule).toBe('function')
    expect(typeof state.setAmbientLight).toBe('function')
    // Exploration
    expect(typeof state.setTravelPace).toBe('function')
    expect(typeof state.setMarchingOrder).toBe('function')
    // Initiative slice
    expect(typeof state.startInitiative).toBe('function')
    expect(typeof state.nextTurn).toBe('function')
    expect(typeof state.endInitiative).toBe('function')
    // Map/token slice
    expect(typeof state.setActiveMap).toBe('function')
    expect(typeof state.addMap).toBe('function')
    expect(typeof state.addToken).toBe('function')
    // Reaction prompt
    expect(state.pendingReactionPrompt).toBeNull()
    expect(typeof state.setPendingReactionPrompt).toBe('function')
  })

  it('SessionLogEntry objects satisfy the required shape', () => {
    const entry: SessionLogEntry = {
      id: 'log-001',
      sessionId: 'session-abc',
      sessionLabel: 'Session 1: The Tavern',
      realTimestamp: 1700000000000,
      content: 'The party arrived at the Prancing Pony.'
    }
    expect(entry.id).toBe('log-001')
    expect(entry.sessionLabel).toBe('Session 1: The Tavern')
    expect(entry.content).toContain('party')
    expect(entry.editedAt).toBeUndefined()
    expect(entry.inGameTimestamp).toBeUndefined()
  })

  it('SessionLogEntry optional fields (inGameTimestamp, editedAt) are truly optional', () => {
    const withOptionals: SessionLogEntry = {
      id: 'log-002',
      sessionId: 'session-abc',
      sessionLabel: 'Session 2: The Dungeon',
      realTimestamp: 1700003600000,
      inGameTimestamp: '15 Hammer, 1492 DR',
      content: 'The party descended into the depths.',
      editedAt: 1700003700000
    }
    expect(withOptionals.inGameTimestamp).toBe('15 Hammer, 1492 DR')
    expect(withOptionals.editedAt).toBe(1700003700000)
  })
})
