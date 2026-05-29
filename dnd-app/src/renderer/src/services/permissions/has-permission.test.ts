import { describe, expect, it } from 'vitest'
import { BUILTIN_ROLES } from '../../data/builtin-roles'
import type { PeerInfo } from '../../network/state-types'
import type { Campaign, CampaignPermissions } from '../../types/campaign'
import { hasPermission } from './has-permission'

function peer(overrides: Partial<PeerInfo> = {}): PeerInfo {
  return {
    peerId: 'p1',
    clientId: 'cid-1',
    role: 'player',
    displayName: 'Alice',
    characterId: null,
    characterName: null,
    isReady: true,
    isHost: false,
    ...overrides
  }
}

function campaign(permissions?: Partial<CampaignPermissions>): Campaign {
  return {
    permissions: permissions
      ? { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {}, ...permissions }
      : { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {} }
  } as unknown as Campaign
}

describe('hasPermission (Phase 29a)', () => {
  it('denies when there is no campaign or no permissions block', () => {
    expect(hasPermission(peer(), 'roll_dice', null)).toBe(false)
    expect(hasPermission(peer(), 'roll_dice', { permissions: undefined } as unknown as Campaign)).toBe(false)
  })

  it('grants by role (DM has everything, player has roll_dice but not kick)', () => {
    const c = campaign()
    expect(hasPermission(peer({ isHost: true }), 'kick_player', c)).toBe(true)
    expect(hasPermission(peer(), 'roll_dice', c)).toBe(true)
    expect(hasPermission(peer(), 'kick_player', c)).toBe(false)
  })

  it('per-player grant overrides a role that lacks the key', () => {
    const c = campaign({ playerOverrides: { 'cid-1': { grant: ['view_hidden_tokens'], deny: [] } } })
    expect(hasPermission(peer(), 'view_hidden_tokens', c)).toBe(true)
  })

  it('per-player deny wins over both grant and role', () => {
    const c = campaign({ playerOverrides: { 'cid-1': { grant: ['chat_whisper'], deny: ['chat_whisper'] } } })
    expect(hasPermission(peer(), 'chat_whisper', c)).toBe(false)
  })

  it('denies when the peer role is missing from the campaign roles', () => {
    const c = campaign({ roles: [] })
    expect(hasPermission(peer({ isHost: true }), 'roll_dice', c)).toBe(false)
  })

  it('resolves CoDM to role-codm (has manage_initiative, lacks transfer_host)', () => {
    const c = campaign()
    expect(hasPermission(peer({ isCoDM: true }), 'manage_initiative', c)).toBe(true)
    expect(hasPermission(peer({ isCoDM: true }), 'transfer_host', c)).toBe(false)
  })

  // Phase 29f — view-as mask
  it('viewAs masks a DM down to the target role (loses DM-only perms)', () => {
    const c = campaign()
    const dm = peer({ isHost: true })
    expect(hasPermission(dm, 'kick_player', c)).toBe(true)
    // Previewing as the player role: DM flags ignored, role-player used.
    expect(hasPermission(dm, 'kick_player', c, { viewAs: { roleId: 'role-player' } })).toBe(false)
    expect(hasPermission(dm, 'roll_dice', c, { viewAs: { roleId: 'role-player' } })).toBe(true)
  })

  it('viewAs applies the target player overrides via masked clientId', () => {
    const c = campaign({ playerOverrides: { 'cid-target': { grant: ['view_hidden_tokens'], deny: [] } } })
    const dm = peer({ isHost: true })
    expect(
      hasPermission(dm, 'view_hidden_tokens', c, { viewAs: { roleId: 'role-player', playerId: 'cid-target' } })
    ).toBe(true)
  })
})
