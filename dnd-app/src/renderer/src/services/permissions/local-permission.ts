import type { PeerInfo } from '../../network/state-types'
import type { Campaign } from '../../types/campaign'
import type { Permission } from '../../types/permissions'
import { hasPermission } from './has-permission'

/**
 * Phase 29e — local-peer permission helpers.
 *
 * The gameplay UI runs from the perspective of the *local* user, who may be the
 * connection host, a connected client, a CoDM, or playing standalone (no
 * network). This builds a synthetic {@link PeerInfo} for the local user so every
 * gate can route through {@link hasPermission} instead of `role === 'host'` /
 * `isCoDM` literals.
 *
 * Standalone (`networkRole === 'none'`): the local user is the DM of their own
 * table, so they map to `role-dm`.
 */
export interface LocalIdentityInput {
  networkRole: 'none' | 'host' | 'client'
  localPeerId: string | null
  localClientId?: string | null
  /** Lobby players, used to detect the local CoDM flag + resolve clientId. */
  peers?: Array<{ peerId: string; clientId?: string; isCoDM?: boolean; roleId?: string; role?: string }>
}

export function buildLocalPeer(input: LocalIdentityInput): PeerInfo {
  const { networkRole, localPeerId, localClientId, peers = [] } = input
  const me = peers.find((p) => p.peerId === localPeerId)
  const isHost = networkRole === 'host' || networkRole === 'none'
  return {
    peerId: localPeerId ?? 'local',
    clientId: localClientId ?? me?.clientId ?? localPeerId ?? 'local',
    role: (me?.role as PeerInfo['role']) ?? (isHost ? 'host' : 'player'),
    displayName: 'You',
    characterId: null,
    characterName: null,
    isReady: true,
    isHost,
    isCoDM: me?.isCoDM === true,
    // Standalone host with no explicit role → DM.
    roleId: me?.roleId ?? (isHost ? 'role-dm' : undefined)
  }
}

/**
 * Check a permission for the local user against a campaign. Falls back to the
 * legacy host/CoDM literal when the campaign predates the permissions block
 * (so un-migrated saves don't strip the DM's tools via deny-by-default).
 */
export function localHasPermission(
  key: Permission,
  campaign: Campaign | null | undefined,
  identity: LocalIdentityInput
): boolean {
  const peer = buildLocalPeer(identity)
  if (!campaign?.permissions) {
    // Legacy fallback: host / standalone / CoDM behave as DM (all perms).
    return peer.isHost || peer.isCoDM === true
  }
  return hasPermission(peer, key, campaign)
}
