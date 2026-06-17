// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }))
vi.mock('../services/combat/monster-turn-executor', () => ({ runMonsterTurn: runMock }))
vi.mock('../services/game/token-stats', () => ({ lookupTokenStatBlock: vi.fn(() => ({ abilityScores: { int: 8 } })) }))
vi.mock('../stores/store-accessors', () => ({
  getGameStore: vi.fn(),
  getLobbyStore: vi.fn(),
  getNetworkStore: vi.fn()
}))

// Mutable mocked store state — tests tweak it before emitting the event.
const gameState: {
  monsterAutomation: { autoRun: boolean; autoRunMaxInt: number; autoAdvance: boolean; flavorNarration: boolean } | null
  isPaused: boolean
  activeMapId: string
  maps: Array<{ id: string; tokens: Array<{ entityId: string; monsterStatBlockId?: string }> }>
  initiative: { entries: Array<{ entityId: string; entityType: string; entityName: string }> }
} = {
  monsterAutomation: null,
  isPaused: false,
  activeMapId: 'm1',
  maps: [{ id: 'm1', tokens: [{ entityId: 'g1', monsterStatBlockId: 'sb' }] }],
  initiative: { entries: [{ entityId: 'g1', entityType: 'enemy', entityName: 'Goblin 1' }] }
}
const netState = { role: 'host' as string }
vi.mock('../stores/use-game-store', () => ({ useGameStore: { getState: () => gameState } }))
vi.mock('../stores/network-store', () => ({ useNetworkStore: { getState: () => netState } }))

import { pluginEventBus } from '../services/plugin-system/event-bus'
import { useMonsterAutoTurn } from './use-monster-auto-turn'

const ON = { autoRun: true, autoRunMaxInt: 10, autoAdvance: false, flavorNarration: false }
function fireTurnStart(round = 1): void {
  pluginEventBus.emit('game:turn-start', { entityId: 'g1', entityName: 'Goblin 1', round })
}

beforeEach(() => {
  vi.useFakeTimers()
  runMock.mockReset()
  gameState.monsterAutomation = null
  gameState.isPaused = false
  netState.role = 'host'
})
afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('useMonsterAutoTurn (PHASE-30 30E)', () => {
  it('does nothing when automation is off (default)', () => {
    renderHook(() => useMonsterAutoTurn())
    fireTurnStart()
    vi.advanceTimersByTime(1000)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('runs once for an enemy at/under the INT cap', () => {
    gameState.monsterAutomation = { ...ON }
    renderHook(() => useMonsterAutoTurn())
    fireTurnStart()
    vi.advanceTimersByTime(800)
    expect(runMock).toHaveBeenCalledTimes(1)
    // A duplicate event in the same round is ignored.
    fireTurnStart()
    vi.advanceTimersByTime(800)
    expect(runMock).toHaveBeenCalledTimes(1)
  })

  it('skips a creature above the INT cap', () => {
    gameState.monsterAutomation = { ...ON, autoRunMaxInt: 7 } // INT 8 > 7
    renderHook(() => useMonsterAutoTurn())
    fireTurnStart()
    vi.advanceTimersByTime(800)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('never runs on a player/client (authority guard)', () => {
    gameState.monsterAutomation = { ...ON }
    netState.role = 'client'
    renderHook(() => useMonsterAutoTurn())
    fireTurnStart()
    vi.advanceTimersByTime(800)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('skips while the game is paused', () => {
    gameState.monsterAutomation = { ...ON }
    gameState.isPaused = true
    renderHook(() => useMonsterAutoTurn())
    fireTurnStart()
    vi.advanceTimersByTime(800)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('passes autoAdvance through to the engine', () => {
    gameState.monsterAutomation = { ...ON, autoAdvance: true }
    renderHook(() => useMonsterAutoTurn())
    fireTurnStart()
    vi.advanceTimersByTime(800)
    expect(runMock).toHaveBeenCalledWith('Goblin 1', expect.anything(), { autoAdvance: true })
  })
})
