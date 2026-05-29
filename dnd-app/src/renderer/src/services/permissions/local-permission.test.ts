import { describe, expect, it } from 'vitest'
import { BUILTIN_ROLES } from '../../data/builtin-roles'
import type { Campaign } from '../../types/campaign'
import { buildLocalPeer, localHasPermission } from './local-permission'

function campaignWithPerms(): Campaign {
  return {
    permissions: { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {} }
  } as unknown as Campaign
}

describe('buildLocalPeer (Phase 29e)', () => {
  it('standalone (none) maps the local user to the DM role', () => {
    const peer = buildLocalPeer({ networkRole: 'none', localPeerId: null })
    expect(peer.isHost).toBe(true)
    expect(peer.roleId).toBe('role-dm')
  })

  it('host maps to DM; client maps to player', () => {
    expect(buildLocalPeer({ networkRole: 'host', localPeerId: 'p1' }).roleId).toBe('role-dm')
    const client = buildLocalPeer({ networkRole: 'client', localPeerId: 'p2' })
    expect(client.isHost).toBe(false)
    expect(client.roleId).toBeUndefined()
  })

  it('picks up the local CoDM flag from the peer list', () => {
    const peer = buildLocalPeer({
      networkRole: 'client',
      localPeerId: 'p3',
      peers: [{ peerId: 'p3', isCoDM: true }]
    })
    expect(peer.isCoDM).toBe(true)
  })
})

describe('localHasPermission (Phase 29e)', () => {
  it('host/standalone gets DM permissions when the campaign has a permissions block', () => {
    const c = campaignWithPerms()
    expect(localHasPermission('use_dm_tools', c, { networkRole: 'host', localPeerId: 'p1' })).toBe(true)
    expect(localHasPermission('kick_player', c, { networkRole: 'none', localPeerId: null })).toBe(true)
  })

  it('a plain client lacks DM tools but can roll dice', () => {
    const c = campaignWithPerms()
    const id = { networkRole: 'client' as const, localPeerId: 'p2', peers: [{ peerId: 'p2' }] }
    expect(localHasPermission('use_dm_tools', c, id)).toBe(false)
    expect(localHasPermission('roll_dice', c, id)).toBe(true)
  })

  it('falls back to the legacy host/CoDM check when the campaign predates permissions', () => {
    const legacy = {} as unknown as Campaign // no permissions block
    expect(localHasPermission('use_dm_tools', legacy, { networkRole: 'host', localPeerId: 'p1' })).toBe(true)
    expect(localHasPermission('use_dm_tools', legacy, { networkRole: 'client', localPeerId: 'p2' })).toBe(false)
    expect(
      localHasPermission('use_dm_tools', legacy, {
        networkRole: 'client',
        localPeerId: 'p3',
        peers: [{ peerId: 'p3', isCoDM: true }]
      })
    ).toBe(true)
  })
})
