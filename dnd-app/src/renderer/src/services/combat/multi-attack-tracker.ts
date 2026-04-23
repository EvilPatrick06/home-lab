/**
 * Multi-attack tracking service for combat.
 *
 * Extra Attack rules per 2024 5e PHB:
 * - Most martial classes: 2 attacks at level 5
 * - Fighter: 2 at 5, 3 at 11, 4 at 20
 * - Monk: follows Fighter progression for Flurry of Blows
 * - Monsters: multiattack count from stat block
 *
 * All functions are pure — no side effects or mutations.
 */

// ─── Types ───────────────────────────────────────────────────

export interface AttackTracker {
  entityId: string
  maxAttacks: number
  attacksUsed: number
  isMultiattack: boolean // true if from Extra Attack/Multiattack
  bonusAttacks: number // from features like PAM bonus attack, TWF
  bonusAttacksUsed: number
}

// ─── Light Weapons (eligible for Two-Weapon Fighting) ────────

const LIGHT_WEAPONS = new Set([
  'club',
  'dagger',
  'handaxe',
  'light hammer',
  'sickle',
  'scimitar',
  'shortsword',
  'hand crossbow'
])

// ─── Polearm Weapons (eligible for Polearm Master bonus) ─────

const POLEARM_WEAPONS = new Set(['glaive', 'halberd', 'quarterstaff', 'spear', 'pike'])

// ─── Extra Attack Count ──────────────────────────────────────

/**
 * Determine max attacks for a character based on class/level.
 * Returns total number of attacks (including the base one).
 *
 * Fighter: 2 at 5, 3 at 11, 4 at 20
 * Barbarian, Paladin, Ranger, Monk: 2 at 5
 * Bladesinger Wizard: 2 at 6
 * College of Swords Bard, College of Valor Bard: 2 at 6
 * All others: 1 (no extra attack)
 */
export function getExtraAttackCount(className: string, level: number, subclassName?: string): number {
  const cls = className.toLowerCase()
  const sub = subclassName?.toLowerCase() ?? ''

  // Fighter: escalating Extra Attack
  if (cls === 'fighter') {
    if (level >= 20) return 4
    if (level >= 11) return 3
    if (level >= 5) return 2
    return 1
  }

  // Monk: follows Fighter progression for Flurry of Blows attack count,
  // but base Extra Attack is 2 at 5 like other martials.
  // The Flurry bonus attacks are handled separately as bonus attacks.
  if (cls === 'monk') {
    if (level >= 5) return 2
    return 1
  }

  // Standard martial classes: 2 attacks at level 5
  if (cls === 'barbarian' || cls === 'paladin' || cls === 'ranger') {
    if (level >= 5) return 2
    return 1
  }

  // Subclass-gated Extra Attack at level 6
  if (cls === 'wizard' && sub === 'bladesinger') {
    if (level >= 6) return 2
    return 1
  }

  if (cls === 'bard') {
    if (sub === 'college of swords' || sub === 'college of valor') {
      if (level >= 6) return 2
    }
    return 1
  }

  // All other classes: no Extra Attack
  return 1
}

// ─── Bonus Attack Count ──────────────────────────────────────

/**
 * Check if an entity gets bonus action attacks based on features and weapons.
 *
 * Two-Weapon Fighting: 1 bonus attack if dual wielding light weapons
 * Polearm Master: 1 bonus attack with the polearm's butt end
 * Returns 0 if no bonus attacks available.
 */
export function getBonusAttackCount(features: string[], wielding: { mainHand?: string; offHand?: string }): number {
  const normalizedFeatures = features.map((f) => f.toLowerCase())
  const mainHand = wielding.mainHand?.toLowerCase() ?? ''
  const offHand = wielding.offHand?.toLowerCase() ?? ''

  let bonusAttacks = 0

  // Two-Weapon Fighting: both hands must hold light weapons
  const mainIsLight = LIGHT_WEAPONS.has(mainHand)
  const offIsLight = LIGHT_WEAPONS.has(offHand)

  // Dual Wielder feat lets you TWF with non-light weapons
  const hasDualWielder = normalizedFeatures.includes('dual wielder')
  const hasTwoWeapons = mainHand !== '' && offHand !== ''

  if (hasTwoWeapons && ((mainIsLight && offIsLight) || hasDualWielder)) {
    bonusAttacks += 1
  }

  // Polearm Master: bonus attack with butt end of a polearm
  const hasPAM = normalizedFeatures.includes('polearm master')
  if (hasPAM && POLEARM_WEAPONS.has(mainHand)) {
    // PAM bonus attack stacks with TWF only if somehow applicable,
    // but in practice you can't dual wield a polearm. If TWF already
    // granted a bonus attack, PAM would compete for the same bonus action.
    // Only grant PAM if TWF didn't already grant one.
    if (bonusAttacks === 0) {
      bonusAttacks += 1
    }
  }

  return bonusAttacks
}

// ─── Tracker Creation ────────────────────────────────────────

/**
 * Create a fresh tracker for an entity's turn.
 */
export function createAttackTracker(entityId: string, maxAttacks: number, bonusAttacks: number = 0): AttackTracker {
  return {
    entityId,
    maxAttacks: Math.max(1, maxAttacks),
    attacksUsed: 0,
    isMultiattack: maxAttacks > 1,
    bonusAttacks: Math.max(0, bonusAttacks),
    bonusAttacksUsed: 0
  }
}

// ─── Attack Usage ────────────────────────────────────────────

/**
 * Use one attack from the Attack action pool.
 * Returns an updated tracker (does not mutate the original).
 * If no attacks remain, returns the tracker unchanged.
 */
export function useAttack(tracker: AttackTracker): AttackTracker {
  if (tracker.attacksUsed >= tracker.maxAttacks) {
    return tracker
  }
  return {
    ...tracker,
    attacksUsed: tracker.attacksUsed + 1
  }
}

/**
 * Use one bonus attack (TWF, PAM, etc.).
 * Returns an updated tracker (does not mutate the original).
 * If no bonus attacks remain, returns the tracker unchanged.
 */
export function useBonusAttack(tracker: AttackTracker): AttackTracker {
  if (tracker.bonusAttacksUsed >= tracker.bonusAttacks) {
    return tracker
  }
  return {
    ...tracker,
    bonusAttacksUsed: tracker.bonusAttacksUsed + 1
  }
}

// ─── Query Helpers ───────────────────────────────────────────

/**
 * Check if there are Attack action attacks remaining.
 */
export function hasAttacksRemaining(tracker: AttackTracker): boolean {
  return tracker.attacksUsed < tracker.maxAttacks
}

/**
 * Check if there are bonus action attacks remaining.
 */
export function hasBonusAttacksRemaining(tracker: AttackTracker): boolean {
  return tracker.bonusAttacksUsed < tracker.bonusAttacks
}

// ─── Display Formatting ──────────────────────────────────────

/**
 * Format a human-readable attack counter string.
 *
 * Examples:
 *   "Attacks: 1/3"
 *   "Attacks: 2/2 | Bonus: 0/1"
 */
export function formatAttackCounter(tracker: AttackTracker): string {
  const remaining = tracker.maxAttacks - tracker.attacksUsed
  let str = `Attacks: ${remaining}/${tracker.maxAttacks}`
  if (tracker.bonusAttacks > 0) {
    const bonusRemaining = tracker.bonusAttacks - tracker.bonusAttacksUsed
    str += ` | Bonus: ${bonusRemaining}/${tracker.bonusAttacks}`
  }
  return str
}
