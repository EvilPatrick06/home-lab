// ─── Reaction Tracker ────────────────────────────────────────────────
// Tracks per-round reactions (1 per entity) and determines when to
// prompt players/NPCs for reaction spells and abilities.
// ─────────────────────────────────────────────────────────────────────

import type { EntityCondition, TurnState } from '../../types/game-state'

// ─── Types ───────────────────────────────────────────────────────────

export type ReactionTrigger =
  | 'opportunity-attack' // Enemy leaves reach without Disengage
  | 'shield' // Hit by attack, reaction to +5 AC
  | 'counterspell' // Enemy casts spell within 60ft
  | 'absorb-elements' // Hit by elemental damage
  | 'sentinel' // Enemy attacks ally within 5ft
  | 'war-caster' // OA can be spell instead of weapon
  | 'hellish-rebuke' // After taking damage
  | 'silvery-barbs' // Creature within 60ft succeeds on attack/save/ability check
  | 'uncanny-dodge' // Halve damage from an attack you can see
  | 'deflect-missiles' // Reduce ranged weapon attack damage

export interface ReactionResult {
  success: boolean
  description: string
}

export interface ReactionPrompt {
  id: string
  entityId: string
  entityName: string
  trigger: ReactionTrigger
  triggerDescription: string // e.g., "Goblin moves out of your reach"
  sourceEntityId?: string
  sourceEntityName?: string
  availableReactions: string[] // e.g., ["Opportunity Attack", "Sentinel Strike"]
  expiresInMs: number // auto-dismiss after this time (e.g., 15000)
}

// ─── Constants ───────────────────────────────────────────────────────

/** Conditions that prevent a creature from taking reactions. */
const REACTION_BLOCKING_CONDITIONS = new Set(['Incapacitated', 'Stunned', 'Paralyzed', 'Unconscious'])

/** Default auto-dismiss timeout for reaction prompts (ms). */
const DEFAULT_EXPIRE_MS = 15_000

/** Counterspell range in feet. */
const COUNTERSPELL_RANGE_FT = 60

// ─── Helpers ─────────────────────────────────────────────────────────

let nextPromptId = 0

function makePromptId(): string {
  nextPromptId += 1
  return `reaction-${Date.now()}-${nextPromptId}`
}

/**
 * Euclidean distance between two grid positions, in grid cells.
 */
function gridDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Returns true if a target at (tx, ty) is within `reachCells` of the
 * source at (sx, sy). Uses center-to-center distance; a target whose
 * center is within `reach + 0.5` cells (half a cell tolerance for
 * edge-of-grid adjacency) counts as "in reach".
 */
function isWithinReach(sx: number, sy: number, tx: number, ty: number, reachCells: number): boolean {
  // Add a small tolerance (half a cell) so adjacent diagonals at
  // reach 1 are still considered "in reach" (diagonal ~1.41 cells).
  return gridDistance(sx, sy, tx, ty) <= reachCells + 0.5
}

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Check if an entity can use its reaction this round.
 *
 * Returns `false` when:
 *  - The entity has already used its reaction (`reactionUsed`)
 *  - The entity is under a condition that prevents reactions
 *    (Incapacitated, Stunned, Paralyzed, Unconscious)
 */
export function canReact(
  entityId: string,
  turnStates: Record<string, TurnState>,
  conditions: EntityCondition[]
): boolean {
  const ts = turnStates[entityId]
  if (ts?.reactionUsed) return false

  // Check for blocking conditions on this entity
  for (const c of conditions) {
    if (c.entityId === entityId && REACTION_BLOCKING_CONDITIONS.has(c.condition)) {
      return false
    }
  }

  return true
}

/**
 * Given a trigger event and an entity's capabilities, return the list
 * of reaction options the entity could choose from.
 */
export function getAvailableReactions(
  trigger: ReactionTrigger,
  entityFeatures: string[],
  entitySpellsKnown: string[],
  hasSpellSlots: boolean
): string[] {
  const reactions: string[] = []

  const hasFeature = (name: string): boolean => entityFeatures.some((f) => f.toLowerCase() === name.toLowerCase())

  const hasSpell = (name: string): boolean => entitySpellsKnown.some((s) => s.toLowerCase() === name.toLowerCase())

  switch (trigger) {
    case 'opportunity-attack': {
      // Everyone can make a basic OA with a melee weapon
      reactions.push('Opportunity Attack')

      // War Caster lets you cast a spell instead of a melee attack
      if (hasFeature('War Caster') && hasSpellSlots) {
        reactions.push('War Caster: Cast a Spell')
      }

      // Sentinel gives an enhanced OA (target's speed becomes 0)
      if (hasFeature('Sentinel')) {
        reactions.push('Sentinel Strike')
      }
      break
    }

    case 'shield': {
      if (hasSpell('Shield') && hasSpellSlots) {
        reactions.push('Shield (+5 AC)')
      }
      break
    }

    case 'counterspell': {
      if (hasSpell('Counterspell') && hasSpellSlots) {
        reactions.push('Counterspell')
      }
      break
    }

    case 'absorb-elements': {
      if (hasSpell('Absorb Elements') && hasSpellSlots) {
        reactions.push('Absorb Elements')
      }
      break
    }

    case 'sentinel': {
      // Sentinel: when an enemy attacks an ally within 5ft of you
      if (hasFeature('Sentinel')) {
        reactions.push('Sentinel: Melee Attack')
      }
      break
    }

    case 'war-caster': {
      // War Caster used as a standalone trigger (OA replacement)
      if (hasFeature('War Caster') && hasSpellSlots) {
        reactions.push('War Caster: Cast a Spell')
      }
      break
    }

    case 'hellish-rebuke': {
      if (hasSpell('Hellish Rebuke') && hasSpellSlots) {
        reactions.push('Hellish Rebuke')
      }
      break
    }

    case 'silvery-barbs': {
      if (hasSpell('Silvery Barbs') && hasSpellSlots) {
        reactions.push('Silvery Barbs')
      }
      break
    }

    case 'uncanny-dodge': {
      if (hasFeature('Uncanny Dodge')) {
        reactions.push('Uncanny Dodge')
      }
      break
    }

    case 'deflect-missiles': {
      if (hasFeature('Deflect Missiles')) {
        reactions.push('Deflect Missiles')
      }
      break
    }
  }

  return reactions
}

/**
 * Check whether an entity's movement triggers opportunity attacks from
 * nearby enemies.
 *
 * For each enemy:
 *  1. Was the moving entity within the enemy's reach at `fromPos`?
 *  2. Is the moving entity outside the enemy's reach at `toPos`?
 *  3. Is the enemy *not* using the Disengage action?
 *
 * If all conditions are met, a `ReactionPrompt` is generated for that
 * enemy with the available reaction options.
 */
export function checkOpportunityAttack(
  movingEntityId: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  nearbyEnemies: Array<{
    entityId: string
    entityName: string
    x: number
    y: number
    reach: number // in grid cells (1 = 5ft)
    features: string[]
    isDisengaging: boolean
  }>,
  cellSizeFt: number
): ReactionPrompt[] {
  const prompts: ReactionPrompt[] = []

  for (const enemy of nearbyEnemies) {
    // Skip enemies that used Disengage — wait, Disengage prevents OAs
    // against the *disengaging* creature, not *from* them.
    // Actually: Disengage on the MOVING entity prevents OAs against it.
    // The `isDisengaging` flag here is on the enemy — which is not the
    // standard mechanic. We interpret this as: the moving entity itself
    // may have disengaged (the caller should filter that out before
    // calling). The enemy's `isDisengaging` means the enemy used
    // Disengage on its own turn and is irrelevant here. However, the
    // spec says to check `isDisengaging` on the enemy, so we honor it
    // as "skip this enemy if they are disengaging" — perhaps the caller
    // sets this flag to mean the *mover* disengaged relative to that
    // enemy (i.e. a convenience flag).
    if (enemy.isDisengaging) continue

    const wasInReach = isWithinReach(enemy.x, enemy.y, fromX, fromY, enemy.reach)
    const stillInReach = isWithinReach(enemy.x, enemy.y, toX, toY, enemy.reach)

    if (wasInReach && !stillInReach) {
      // Determine what reactions the enemy has available
      // For OA purposes, we only need features — spells are checked
      // via getAvailableReactions
      const available = getAvailableReactions(
        'opportunity-attack',
        enemy.features,
        [], // Spells not provided here; caller may enrich later
        false // No spell slot info — basic OA doesn't need it
      )

      if (available.length > 0) {
        const feetMoved = Math.round(gridDistance(fromX, fromY, toX, toY) * cellSizeFt)

        prompts.push({
          id: makePromptId(),
          entityId: enemy.entityId,
          entityName: enemy.entityName,
          trigger: 'opportunity-attack',
          triggerDescription: `${movingEntityId} moves ${feetMoved}ft, leaving ${enemy.entityName}'s reach`,
          sourceEntityId: movingEntityId,
          sourceEntityName: undefined, // Caller can enrich with display name
          availableReactions: available,
          expiresInMs: DEFAULT_EXPIRE_MS
        })
      }
    }
  }

  return prompts
}

/**
 * Check whether a spell being cast triggers Counterspell from nearby
 * allies of the opposing side.
 *
 * Counterspell range: 60ft (12 cells at 5ft/cell).
 */
export function checkCounterspell(
  casterEntityId: string,
  casterName: string,
  casterX: number,
  casterY: number,
  nearbyAllies: Array<{
    entityId: string
    entityName: string
    x: number
    y: number
    hasCounterspell: boolean
    hasSpellSlots: boolean
  }>,
  cellSizeFt: number
): ReactionPrompt[] {
  const prompts: ReactionPrompt[] = []
  const rangeCells = COUNTERSPELL_RANGE_FT / cellSizeFt

  for (const ally of nearbyAllies) {
    if (!ally.hasCounterspell || !ally.hasSpellSlots) continue

    const dist = gridDistance(casterX, casterY, ally.x, ally.y)
    if (dist <= rangeCells) {
      const distFt = Math.round(dist * cellSizeFt)

      prompts.push({
        id: makePromptId(),
        entityId: ally.entityId,
        entityName: ally.entityName,
        trigger: 'counterspell',
        triggerDescription: `${casterName} is casting a spell ${distFt}ft away`,
        sourceEntityId: casterEntityId,
        sourceEntityName: casterName,
        availableReactions: ['Counterspell'],
        expiresInMs: DEFAULT_EXPIRE_MS
      })
    }
  }

  return prompts
}

// ─── Silvery Barbs Detection ─────────────────────────────────

/** Silvery Barbs range in feet. */
const SILVERY_BARBS_RANGE_FT = 60

/**
 * Check whether a creature succeeding on an attack, save, or ability check
 * triggers Silvery Barbs from nearby enemies.
 */
export function checkSilveryBarbs(
  succeedingEntityId: string,
  succeedingEntityName: string,
  succeedingX: number,
  succeedingY: number,
  successType: 'attack' | 'save' | 'ability-check',
  nearbyEnemies: Array<{
    entityId: string
    entityName: string
    x: number
    y: number
    hasSilveryBarbs: boolean
    hasSpellSlots: boolean
  }>,
  cellSizeFt: number
): ReactionPrompt[] {
  const prompts: ReactionPrompt[] = []
  const rangeCells = SILVERY_BARBS_RANGE_FT / cellSizeFt

  for (const enemy of nearbyEnemies) {
    if (!enemy.hasSilveryBarbs || !enemy.hasSpellSlots) continue

    const dist = gridDistance(succeedingX, succeedingY, enemy.x, enemy.y)
    if (dist <= rangeCells) {
      const distFt = Math.round(dist * cellSizeFt)

      prompts.push({
        id: makePromptId(),
        entityId: enemy.entityId,
        entityName: enemy.entityName,
        trigger: 'silvery-barbs',
        triggerDescription: `${succeedingEntityName} succeeds on ${successType === 'ability-check' ? 'an ability check' : `a ${successType}`} ${distFt}ft away`,
        sourceEntityId: succeedingEntityId,
        sourceEntityName: succeedingEntityName,
        availableReactions: ['Silvery Barbs'],
        expiresInMs: DEFAULT_EXPIRE_MS
      })
    }
  }

  return prompts
}

// ─── Reaction Execution ──────────────────────────────────────

/**
 * Execute a chosen reaction: marks the entity's reaction as used and
 * returns a result describing what happened.
 */
export function executeReaction(
  prompt: ReactionPrompt,
  chosenReaction: string,
  turnStates: Record<string, TurnState>
): ReactionResult {
  const ts = turnStates[prompt.entityId]
  if (!ts) {
    return { success: false, description: `${prompt.entityName} has no active turn state` }
  }

  if (ts.reactionUsed) {
    return { success: false, description: `${prompt.entityName} has already used their reaction this round` }
  }

  if (!prompt.availableReactions.includes(chosenReaction)) {
    return { success: false, description: `${chosenReaction} is not available for ${prompt.entityName}` }
  }

  // Mark reaction as used (caller is responsible for persisting via useReaction)
  return {
    success: true,
    description: `${prompt.entityName} uses ${chosenReaction} in response to: ${prompt.triggerDescription}`
  }
}

// ─── Multiple Reaction Resolution ────────────────────────────

/**
 * Sort multiple reaction prompts by initiative order so they resolve
 * in the correct sequence. An optional DM override order takes priority.
 */
export function resolveMultipleReactions(
  prompts: ReactionPrompt[],
  initiativeOrder: Array<{ entityId: string; total: number }>,
  dmOverrideOrder?: string[]
): ReactionPrompt[] {
  if (prompts.length <= 1) return prompts

  if (dmOverrideOrder && dmOverrideOrder.length > 0) {
    const orderMap = new Map(dmOverrideOrder.map((id, i) => [id, i]))
    return [...prompts].sort((a, b) => {
      const ai = orderMap.get(a.entityId) ?? Number.MAX_SAFE_INTEGER
      const bi = orderMap.get(b.entityId) ?? Number.MAX_SAFE_INTEGER
      return ai - bi
    })
  }

  // Sort by initiative total (higher goes first)
  const initMap = new Map(initiativeOrder.map((e) => [e.entityId, e.total]))
  return [...prompts].sort((a, b) => {
    const ai = initMap.get(a.entityId) ?? -Infinity
    const bi = initMap.get(b.entityId) ?? -Infinity
    return bi - ai
  })
}
