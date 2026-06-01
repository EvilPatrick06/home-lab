// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PeerInfo } from '../../../network'
import CloudStatusPanel from './CloudStatusPanel'

function peer(peerId: string, displayName: string, role: PeerInfo['role'] = 'player'): PeerInfo {
  return {
    peerId,
    clientId: `c-${peerId}`,
    role,
    displayName,
    characterId: null,
    characterName: null,
    isReady: false,
    isHost: role === 'host'
  }
}

describe('CloudStatusPanel', () => {
  it('renders the relay status + peer list for a cloud DM', () => {
    render(<CloudStatusPanel connectionMode="cloud" isDM connected peers={[peer('p1', 'Alice'), peer('p2', 'Bob')]} />)
    expect(screen.getByText('Cloud Relay')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('shows a "no players" hint when the room is empty', () => {
    render(<CloudStatusPanel connectionMode="cloud" isDM connected={false} peers={[]} />)
    expect(screen.getByText('Connecting…')).toBeTruthy()
    expect(screen.getByText('No players connected yet.')).toBeTruthy()
  })

  it('renders nothing for a P2P game', () => {
    const { container } = render(<CloudStatusPanel connectionMode="p2p" isDM connected peers={[peer('p1', 'Alice')]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for a non-DM viewer', () => {
    const { container } = render(
      <CloudStatusPanel connectionMode="cloud" isDM={false} connected peers={[peer('p1', 'Alice')]} />
    )
    expect(container.firstChild).toBeNull()
  })
})
