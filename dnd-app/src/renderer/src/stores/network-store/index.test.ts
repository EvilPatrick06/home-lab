import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('network store index', () => {
  it('can be imported', async () => {
    const mod = await import('./index')
    expect(mod).toBeDefined()
  })

  it('exports useNetworkStore', async () => {
    const mod = await import('./index')
    expect(mod.useNetworkStore).toBeDefined()
    expect(typeof mod.useNetworkStore).toBe('function')
  })

  it('exports NetworkState type (via store shape)', async () => {
    const { useNetworkStore } = await import('./index')
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

  it('store has initial state values', async () => {
    const { useNetworkStore } = await import('./index')
    const state = useNetworkStore.getState()
    expect(state.role).toBe('none')
    expect(state.connectionState).toBe('disconnected')
    expect(state.inviteCode).toBeNull()
    expect(state.campaignId).toBeNull()
    expect(state.localPeerId).toBeNull()
    expect(state.displayName).toBe('')
    expect(Array.isArray(state.peers)).toBe(true)
    expect(state.peers).toHaveLength(0)
    expect(state.error).toBeNull()
    expect(state.disconnectReason).toBeNull()
    expect(state.latencyMs).toBeNull()
  })

  it('store has action methods', async () => {
    const { useNetworkStore } = await import('./index')
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
