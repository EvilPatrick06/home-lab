// ─── Mounted Combat Rules ─────────────────────────────────────────────
// 5.5e mounted combat mechanics: speed, action restrictions, forced
// dismount, and movement calculations.
// ─────────────────────────────────────────────────────────────────────

import type { TurnState } from '../../types/game-state'
import type { MapToken } from '../../types/map'

// ─── Constants ───────────────────────────────────────────────

const CONTROLLED_MOUNT_ACTIONS = new Set(['Dash', 'Disengage', 'Dodge'])

const FORCED_DISMOUNT_DC = 10

// ─── Speed & Movement ────────────────────────────────────────

/**
 * Get the mount's speed value from its token data.
 * Falls back to 40ft (typical riding horse) if no speed is set.
 */
export function getMountSpeed(mountToken: MapToken): number {
  return mountToken.walkSpeed ?? 40
}

/**
 * Check if an action is valid for a controlled mount.
 * Controlled mounts can only Dash, Disengage, or Dodge.
 */
export function isControlledMountAction(action: string): boolean {
  return CONTROLLED_MOUNT_ACTIONS.has(action)
}

/**
 * Calculate available movement for a mounted rider.
 * - Controlled mount: rider uses mount's speed
 * - Independent mount: rider keeps own speed (mount moves separately)
 */
export function calculateMountedMovement(
  riderTurnState: TurnState,
  mountToken: MapToken,
  mountType: 'controlled' | 'independent'
): number {
  if (mountType === 'controlled') {
    return getMountSpeed(mountToken)
  }
  // Independent mount: rider retains own movement
  return riderTurnState.movementMax
}

// ─── Action Restrictions ─────────────────────────────────────

export interface MountRestrictionResult {
  allowed: boolean
  reason?: string
}

/**
 * Enforce mounted combat action restrictions.
 * - Controlled mount: only Dash, Disengage, Dodge allowed for mount actions
 * - Independent mount: no restrictions on rider
 */
export function enforceMountedCombatRestrictions(
  mountType: 'controlled' | 'independent',
  action: string
): MountRestrictionResult {
  if (mountType === 'independent') {
    return { allowed: true }
  }

  if (isControlledMountAction(action)) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `Controlled mounts can only Dash, Disengage, or Dodge. "${action}" is not allowed.`
  }
}

// ─── Forced Dismount ─────────────────────────────────────────

export interface ForcedDismountResult {
  dismounted: boolean
  reason: string
  needsDexSave: boolean
  dexSaveDC: number
  landedProne: boolean
}

/**
 * Handle forced dismount when mount dies or rider is knocked prone.
 * - If mount dies during combat: DC 10 Dex save or land prone
 * - If rider is knocked prone: automatic dismount
 */
export function forceDismount(
  riderId: string,
  reason: 'mount-died' | 'knocked-prone' | 'other',
  dexSaveResult?: number
): ForcedDismountResult {
  if (reason === 'knocked-prone') {
    return {
      dismounted: true,
      reason: 'Rider was knocked prone and forced to dismount',
      needsDexSave: false,
      dexSaveDC: 0,
      landedProne: true
    }
  }

  if (reason === 'mount-died') {
    const needsSave = true
    const passed = dexSaveResult !== undefined && dexSaveResult >= FORCED_DISMOUNT_DC

    return {
      dismounted: true,
      reason: `Mount was killed${passed ? ' — rider lands on feet' : ' — rider falls prone'}`,
      needsDexSave: needsSave,
      dexSaveDC: FORCED_DISMOUNT_DC,
      landedProne: !passed
    }
  }

  return {
    dismounted: true,
    reason: 'Forced dismount',
    needsDexSave: false,
    dexSaveDC: 0,
    landedProne: false
  }
}
