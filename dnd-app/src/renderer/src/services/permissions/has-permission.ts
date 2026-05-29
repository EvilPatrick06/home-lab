import type { PeerInfo } from '../../network/state-types'
import type { Campaign } from '../../types/campaign'
import type { Permission } from '../../types/permissions'

/**
 * Phase 29a — the single permission gate.
 *
 * Precedence: explicit per-player DENY > explicit per-player GRANT > role
 * permission. Returns false (deny-by-default) when there's no campaign,
 * no permissions block, or no resolvable role.
 */

/** Map a peer to a campaign role id. Prefers an explicit `roleId`, else derives a built-in. */
export function resolvePeerRoleId(peer: PeerInfo): string {
  if (peer.roleId) return peer.roleId
  if (peer.isHost) return 'role-dm'
  if (peer.isCoDM) return 'role-codm'
  if (peer.role === 'spectator') return 'role-spectator'
  return 'role-player'
}

export function hasPermission(
  peer: PeerInfo | null | undefined,
  key: Permission,
  campaign: Campaign | null | undefined
): boolean {
  if (!peer || !campaign?.permissions) return false

  // Per-player overrides (deny wins over grant).
  const override = campaign.permissions.playerOverrides[peer.clientId]
  if (override) {
    if (override.deny.includes(key)) return false
    if (override.grant.includes(key)) return true
  }

  const roleId = resolvePeerRoleId(peer)
  const role = campaign.permissions.roles.find((r) => r.id === roleId)
  if (!role) return false
  return role.permissions.includes(key)
}
