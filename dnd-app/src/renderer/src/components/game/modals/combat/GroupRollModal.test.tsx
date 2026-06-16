// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Avoid pulling three.js / WebGL into the test — the DM-side fallback calls trigger3dDice.
vi.mock('../../../../components/game/dice3d', () => ({ trigger3dDice: vi.fn() }))

import { useNetworkStore } from '../../../../stores/network-store'
import { useCharacterStore } from '../../../../stores/use-character-store'
import { useGameStore } from '../../../../stores/use-game-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'
import GroupRollModal from './GroupRollModal'

const sendMessage = vi.fn()

const players = [
  { peerId: 'p1', displayName: 'Alice', characterId: 'c1', status: 'connected' },
  { peerId: 'p2', displayName: 'Bob', characterId: 'c2', status: 'connected' }
]

let uuidN = 0

beforeEach(() => {
  uuidN = 0
  sendMessage.mockClear()
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: () => `uuid-${uuidN++}` as `${string}-${string}-${string}-${string}-${string}`
  })
  useGameStore.getState().clearGroupRollResults()
  useNetworkStore.setState({ sendMessage, localPeerId: 'dm-peer' } as never)
  useLobbyStore.setState({ players: players as never })
  useCharacterStore.setState({ characters: [] as never })
})

afterEach(() => {
  useGameStore.getState().clearGroupRollResults()
  vi.clearAllMocks()
})

describe('GroupRollModal (PHASE-13 13G P2P round-trip)', () => {
  it('broadcasts dm:roll-request with the modal dc + type and sets the pending roll', () => {
    const { container } = render(<GroupRollModal onClose={vi.fn()} onBroadcastResult={vi.fn()} />)

    const dcInput = container.querySelector('input[type="number"]') as HTMLInputElement
    fireEvent.change(dcInput, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /request roll/i }))

    const call = sendMessage.mock.calls.find((c) => c[0] === 'dm:roll-request')
    expect(call).toBeTruthy()
    expect(call?.[1]).toMatchObject({ dc: 12, type: 'ability', requesterId: 'dm-peer' })
    expect(useGameStore.getState().pendingGroupRoll).toMatchObject({ dc: 12, type: 'ability' })
  })

  it('renders an incoming player result as a row', () => {
    render(<GroupRollModal onClose={vi.fn()} onBroadcastResult={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /request roll/i }))

    act(() => {
      useGameStore
        .getState()
        .addGroupRollResult({ entityId: 'c1', entityName: 'Alice', roll: 14, modifier: 3, total: 17, success: true })
    })

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('17')).toBeTruthy()
  })

  it('"Roll for remaining" fills only the players who have not responded', () => {
    render(<GroupRollModal onClose={vi.fn()} onBroadcastResult={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /request roll/i }))

    // Only Alice responds.
    act(() => {
      useGameStore
        .getState()
        .addGroupRollResult({ entityId: 'c1', entityName: 'Alice', roll: 10, modifier: 2, total: 12, success: true })
    })

    fireEvent.click(screen.getByRole('button', { name: /roll for remaining/i }))

    const results = useGameStore.getState().groupRollResults
    expect(results).toHaveLength(2)
    const names = results.map((r) => r.entityName).sort()
    expect(names).toEqual(['Alice', 'Bob'])
    // Alice was not re-rolled (still exactly one Alice row).
    expect(results.filter((r) => r.entityName === 'Alice')).toHaveLength(1)
  })
})
