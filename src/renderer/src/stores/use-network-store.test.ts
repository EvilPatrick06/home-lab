import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { useNetworkStore } from './use-network-store'

describe('useNetworkStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-network-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useNetworkStore).toBe('function')
  })

  it('store has network state properties', () => {
    // NetworkState is a type-only export (erased at runtime)
    // so we verify the store state shape instead
    const state = useNetworkStore.getState()
    expect(typeof state.role).toBe('string')
    expect(typeof state.connectionState).toBe('string')
  })

  it('has expected initial state shape', () => {
    const state = useNetworkStore.getState()
    expect(state).toHaveProperty('role')
    expect(state).toHaveProperty('connectionState')
    expect(state).toHaveProperty('inviteCode')
    expect(state).toHaveProperty('campaignId')
    expect(state).toHaveProperty('localPeerId')
    expect(state).toHaveProperty('displayName')
    expect(state).toHaveProperty('peers')
    expect(state).toHaveProperty('error')
    expect(state).toHaveProperty('disconnectReason')
    expect(state).toHaveProperty('latencyMs')
  })

  it('has expected initial state values', () => {
    const state = useNetworkStore.getState()
    expect(state.role).toBe('none')
    expect(state.connectionState).toBe('disconnected')
    expect(state.inviteCode).toBeNull()
    expect(state.campaignId).toBeNull()
    expect(state.localPeerId).toBeNull()
    expect(state.displayName).toBe('')
    expect(state.peers).toEqual([])
    expect(state.error).toBeNull()
    expect(state.disconnectReason).toBeNull()
    expect(state.latencyMs).toBeNull()
  })

  it('has expected actions', () => {
    const state = useNetworkStore.getState()
    expect(typeof state.hostGame).toBe('function')
    expect(typeof state.stopHosting).toBe('function')
    expect(typeof state.kickPlayer).toBe('function')
    expect(typeof state.joinGame).toBe('function')
    expect(typeof state.disconnect).toBe('function')
    expect(typeof state.sendMessage).toBe('function')
    expect(typeof state.setDisplayName).toBe('function')
    expect(typeof state.updatePeer).toBe('function')
    expect(typeof state.removePeer).toBe('function')
    expect(typeof state.addPeer).toBe('function')
    expect(typeof state.setConnectionState).toBe('function')
    expect(typeof state.setError).toBe('function')
    expect(typeof state.clearDisconnectReason).toBe('function')
  })
})
