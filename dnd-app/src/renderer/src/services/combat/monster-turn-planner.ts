/**
 * PHASE-30 30A — monster-turn planner (pure heuristic engine, no I/O, no store imports).
 *
 * Converts a combat snapshot into a deterministic `MonsterTurnPlan` (target selection, movement
 * path, attacks/multiattack, recharge AoE, retreat) following the INT-tier policy the model is
 * already told (combat-tactics.ts) + the mookAI/BattleCast heuristics. No dice are rolled here —
 * the executor (30B) rolls at execution time; this only decides WHAT to do and records rationale.
 *
 * Callers MUST pre-hydrate `ac`/`maxHP`/`currentHP` onto the context tokens (getTokenStats is
 * store-bound) — the planner reads those fields directly.
 */

import type { InitiativeEntry, TurnState } from '../../types/game-state'
import type { GridSettings, MapToken, TerrainCell, WallSegment } from '../../types/map'
import type { MonsterAction, MonsterStatBlock } from '../../types/monster'
import { findPath, getReachableCellsWithWalls } from '../map/pathfinder'
import { countTargetsInAoE } from './aoe-targeting'
import type { DiagonalRule } from './combat-rules'
import { calculateCover } from './cover-calculator'

type GridType = GridSettings['type']

export interface MonsterTurnContext {
  actor: MapToken
  statBlock: MonsterStatBlock
  tokens: MapToken[] // all tokens on the active map (ac/maxHP/currentHP pre-hydrated)
  walls: WallSegment[]
  terrain: TerrainCell[]
  gridWidth: number
  gridHeight: number
  cellSize: number // feet per cell (usually 5)
  turnStates: Record<string, TurnState>
  initiativeEntry?: InitiativeEntry // recharge/legendary state when present
  round: number
  diagonalRule: DiagonalRule
  gridType?: GridType
  flankingEnabled?: boolean
}

export type IntTier = 'mindless' | 'low' | 'average' | 'clever' | 'genius'

export type MonsterTurnStep =
  | { kind: 'move'; path: Array<{ x: number; y: number }>; costFt: number }
  | { kind: 'stance'; stance: 'dash' | 'disengage' | 'dodge'; viaBonusAction?: boolean }
  | {
      kind: 'attack'
      actionName: string
      targetTokenId: string
      toHit: number
      damageDice: string
      damageType?: string
      additionalDamage?: string
    }
  | {
      kind: 'save-action'
      actionName: string
      targetTokenIds: string[]
      saveDC: number
      saveAbility: string
      damageDice?: string
      damageType?: string
      halfOnSave: boolean
      areaOfEffect?: {
        type: 'cone' | 'cube' | 'cylinder' | 'emanation' | 'line' | 'sphere'
        size: number
        originX: number
        originY: number
        direction?: number
      }
      rechargeName?: string
      conditionRiders?: string[]
    }
  | { kind: 'note'; text: string }

export interface MonsterTurnPlan {
  actorTokenId: string
  actorLabel: string
  intTier: IntTier
  targetTokenId: string | null
  retreating: boolean
  steps: MonsterTurnStep[]
  rationale: string[]
}

// ── Pure scoring helpers (exported for tests) ──────────────────────

export function intTier(int: number): IntTier {
  if (int <= 3) return 'mindless'
  if (int <= 7) return 'low'
  if (int <= 11) return 'average'
  if (int <= 15) return 'clever'
  return 'genius'
}

/** Mean of an `NdS(+/-M)` formula (sum of all dice + flat terms). Never rolls. */
export function averageRoll(formula: string | undefined): number {
  if (!formula) return 0
  let total = 0
  const dice = formula.matchAll(/([+-]?)(\d+)d(\d+)/gi)
  for (const m of dice) {
    const sign = m[1] === '-' ? -1 : 1
    const n = Number.parseInt(m[2], 10)
    const s = Number.parseInt(m[3], 10)
    total += sign * n * ((s + 1) / 2)
  }
  // Flat modifiers not attached to a die (e.g. the "+3" in "2d6+3", or a bare "5").
  const flats = formula.replace(/([+-]?)(\d+)d(\d+)/gi, ' ').matchAll(/([+-]?)\s*(\d+)/g)
  for (const m of flats) {
    const sign = m[1] === '-' ? -1 : 1
    total += sign * Number.parseInt(m[2], 10)
  }
  return total
}

export function hitProbability(toHit: number, ac: number): number {
  return Math.max(0.05, Math.min(0.95, (21 + toHit - ac) / 20))
}

export function expectedDamage(action: MonsterAction, targetAc: number): number {
  const dmg = averageRoll(action.damageDice) + averageRoll(action.additionalDamage)
  return hitProbability(action.toHit ?? 0, targetAc) * dmg
}

export function chebyshevFt(
  a: { gridX: number; gridY: number },
  b: { gridX: number; gridY: number },
  cellSize = 5
): number {
  return Math.max(Math.abs(a.gridX - b.gridX), Math.abs(a.gridY - b.gridY)) * cellSize
}

// ── Internal helpers ──────────────────────────────────────────────

function hpPct(t: MapToken): number {
  const max = t.maxHP ?? t.currentHP ?? 1
  return max > 0 ? (t.currentHP ?? max) / max : 1
}

const RETREAT_THRESHOLD: Record<IntTier, number> = { mindless: 0, low: 0.25, average: 0.25, clever: 0.33, genius: 0.5 }

/** Hostiles to a monster actor: player tokens + their companions; alive; not behind total cover. */
function enumerateHostiles(ctx: MonsterTurnContext): MapToken[] {
  const playerIds = new Set(ctx.tokens.filter((t) => t.entityType === 'player').map((t) => t.entityId))
  return ctx.tokens.filter((t) => {
    if (t.id === ctx.actor.id) return false
    const isHostile = t.entityType === 'player' || (t.ownerEntityId != null && playerIds.has(t.ownerEntityId))
    if (!isHostile) return false
    if ((t.currentHP ?? 0) <= 0) return false
    if (calculateCover(ctx.actor, t, ctx.walls, ctx.cellSize, ctx.tokens) === 'total') return false
    return true
  })
}

/** Cheapest reachable path (cost ≤ budget) to a cell adjacent to the target; null if none. */
function pathToAdjacent(
  ctx: MonsterTurnContext,
  target: MapToken,
  budgetFt: number
): { path: Array<{ x: number; y: number }>; costFt: number } | null {
  let best: { path: Array<{ x: number; y: number }>; costFt: number } | null = null
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      const cx = target.gridX + dx
      const cy = target.gridY + dy
      if (cx < 0 || cy < 0 || cx >= ctx.gridWidth || cy >= ctx.gridHeight) continue
      if (cx === ctx.actor.gridX && cy === ctx.actor.gridY) return { path: [], costFt: 0 } // already adjacent
      const r = findPath(
        ctx.actor.gridX,
        ctx.actor.gridY,
        cx,
        cy,
        ctx.gridWidth,
        ctx.gridHeight,
        ctx.walls,
        ctx.terrain,
        budgetFt,
        undefined,
        ctx.diagonalRule,
        ctx.gridType
      )
      if (r.reachedGoal && r.totalCost <= budgetFt && (best === null || r.totalCost < best.costFt)) {
        best = { path: r.path, costFt: r.totalCost }
      }
    }
  }
  return best
}

function movementBudgetFt(ctx: MonsterTurnContext): number {
  const ts = ctx.turnStates[ctx.actor.entityId]
  return ts?.movementRemaining ?? ctx.statBlock.speed?.walk ?? 30
}

/** Final cell that maximizes the minimum distance from all hostiles, within budget. */
function bestRetreatCell(
  ctx: MonsterTurnContext,
  hostiles: MapToken[],
  budgetFt: number
): { x: number; y: number } | null {
  const cells = getReachableCellsWithWalls(
    ctx.actor.gridX,
    ctx.actor.gridY,
    budgetFt,
    ctx.terrain,
    ctx.gridWidth,
    ctx.gridHeight,
    ctx.walls,
    undefined,
    ctx.diagonalRule,
    ctx.gridType
  )
  let best: { x: number; y: number } | null = null
  let bestMin = -1
  for (const c of cells) {
    const minDist = Math.min(...hostiles.map((h) => Math.max(Math.abs(c.x - h.gridX), Math.abs(c.y - h.gridY))))
    if (minDist > bestMin) {
      bestMin = minDist
      best = { x: c.x, y: c.y }
    }
  }
  return best
}

function findAction(statBlock: MonsterStatBlock, name: string): MonsterAction | undefined {
  return statBlock.actions.find((a) => a.name.toLowerCase() === name.toLowerCase())
}

/** An action's recharge/at-will readiness (see 30A step 6). */
function isReady(ctx: MonsterTurnContext, action: MonsterAction): boolean {
  if (!action.recharge) return true // at-will (incl. plain save actions)
  const entry = ctx.initiativeEntry?.rechargeAbilities?.find((r) => r.name.toLowerCase() === action.name.toLowerCase())
  if (entry) return entry.available
  // No enrichment data: conservative fallback — assume ready only on round 1.
  return ctx.round <= 1
}

// ── Target selection ──────────────────────────────────────────────

function selectTarget(ctx: MonsterTurnContext, hostiles: MapToken[], tier: IntTier, budgetFt: number): MapToken | null {
  if (hostiles.length === 0) return null
  const nearest = (): MapToken =>
    [...hostiles].sort((a, b) => chebyshevFt(ctx.actor, a, ctx.cellSize) - chebyshevFt(ctx.actor, b, ctx.cellSize))[0]
  const reachableThisTurn = hostiles.filter((h) => pathToAdjacent(ctx, h, budgetFt) !== null)
  const concentrating = hostiles.filter((h) => ctx.turnStates[h.entityId]?.concentratingSpell)

  switch (tier) {
    case 'mindless':
      return nearest()
    case 'low': {
      const pool = reachableThisTurn.length > 0 ? reachableThisTurn : hostiles
      return [...pool].sort((a, b) => hpPct(a) - hpPct(b))[0]
    }
    case 'average': {
      if (concentrating.length > 0) return [...concentrating].sort((a, b) => hpPct(a) - hpPct(b))[0]
      return [...hostiles].sort(
        (a, b) =>
          hpPct(a) - hpPct(b) || chebyshevFt(ctx.actor, a, ctx.cellSize) - chebyshevFt(ctx.actor, b, ctx.cellSize)
      )[0]
    }
    default: {
      // clever / genius: concentrating > lowest HP% > lowest AC
      if (concentrating.length > 0) return [...concentrating].sort((a, b) => hpPct(a) - hpPct(b))[0]
      return [...hostiles].sort((a, b) => hpPct(a) - hpPct(b) || (a.ac ?? 10) - (b.ac ?? 10))[0]
    }
  }
}

// ── AoE save-action choice ─────────────────────────────────────────

function bestAoE(
  ctx: MonsterTurnContext,
  hostiles: MapToken[],
  tier: IntTier
): { action: MonsterAction; step: Extract<MonsterTurnStep, { kind: 'save-action' }> } | null {
  const minTargets = tier === 'genius' ? 2 : 3
  const aoeActions = ctx.statBlock.actions.filter((a) => a.areaOfEffect && a.saveDC != null && isReady(ctx, a))
  let best: { action: MonsterAction; step: Extract<MonsterTurnStep, { kind: 'save-action' }> } | null = null
  let bestCount = minTargets - 1
  const allies = ctx.tokens.filter((t) => t.entityType === 'enemy' && t.id !== ctx.actor.id && (t.currentHP ?? 0) > 0)

  for (const action of aoeActions) {
    const aoe = action.areaOfEffect
    if (!aoe) continue
    const size = aoe.size
    // Sphere: center on the hostile-pair midpoint maximizing coverage. Cone/line: origin at actor,
    // aimed at the hostile centroid.
    const shape = aoe.type
    const candidates: Array<{ originX: number; originY: number; direction?: number }> = []
    if (shape === 'sphere' || shape === 'cube' || shape === 'cylinder' || shape === 'emanation') {
      for (let i = 0; i < hostiles.length; i++) {
        for (let j = i; j < hostiles.length; j++) {
          candidates.push({
            originX: Math.round((hostiles[i].gridX + hostiles[j].gridX) / 2),
            originY: Math.round((hostiles[i].gridY + hostiles[j].gridY) / 2)
          })
        }
      }
    } else {
      const cx = hostiles.reduce((s, h) => s + h.gridX, 0) / hostiles.length
      const cy = hostiles.reduce((s, h) => s + h.gridY, 0) / hostiles.length
      const direction = (Math.atan2(cy - ctx.actor.gridY, cx - ctx.actor.gridX) * 180) / Math.PI
      candidates.push({ originX: ctx.actor.gridX, originY: ctx.actor.gridY, direction })
    }

    for (const cand of candidates) {
      const def = {
        shape: shape as 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder',
        originX: cand.originX, // grid coords
        originY: cand.originY,
        size, // feet (aoe-targeting converts internally at 5 ft/cell)
        direction: cand.direction,
        width: undefined
      }
      const hostileHits = countTargetsInAoE(def, hostiles)
      const allyHits = tier === 'mindless' ? 0 : countTargetsInAoE(def, allies)
      if (hostileHits >= minTargets && hostileHits > bestCount && allyHits === 0) {
        bestCount = hostileHits
        const targetsIn = hostiles.filter((h) => countTargetsInAoE(def, [h]) > 0)
        best = {
          action,
          step: {
            kind: 'save-action',
            actionName: action.name,
            targetTokenIds: targetsIn.map((t) => t.id),
            saveDC: action.saveDC ?? 10,
            saveAbility: action.saveAbility ?? 'dexterity',
            damageDice: action.damageDice,
            damageType: action.damageType,
            halfOnSave: true,
            areaOfEffect: {
              type: shape,
              size: aoe.size,
              originX: cand.originX,
              originY: cand.originY,
              direction: cand.direction
            },
            rechargeName: action.recharge ? action.name : undefined
          }
        }
      }
    }
  }
  return best
}

// ── Attack assembly ────────────────────────────────────────────────

function attackStepsFor(statBlock: MonsterStatBlock, target: MapToken): MonsterTurnStep[] {
  const targetAc = target.ac ?? 12
  const multiattack = statBlock.actions.find((a) => a.multiattackActions && a.multiattackActions.length > 0)
  const toStep = (action: MonsterAction): MonsterTurnStep | null => {
    if (action.toHit == null || !action.damageDice) return null
    return {
      kind: 'attack',
      actionName: action.name,
      targetTokenId: target.id,
      toHit: action.toHit,
      damageDice: action.damageDice,
      damageType: action.damageType,
      additionalDamage: action.additionalDamage
    }
  }
  if (multiattack?.multiattackActions) {
    const steps: MonsterTurnStep[] = []
    for (const name of multiattack.multiattackActions) {
      const sub = findAction(statBlock, name)
      const step = sub ? toStep(sub) : null
      if (step) steps.push(step)
    }
    if (steps.length > 0) return steps
  }
  // Single best attack by expected damage.
  const attacks = statBlock.actions.filter((a) => a.toHit != null && a.damageDice)
  if (attacks.length === 0) return []
  const best = [...attacks].sort((a, b) => expectedDamage(b, targetAc) - expectedDamage(a, targetAc))[0]
  const step = toStep(best)
  return step ? [step] : []
}

function rangeOfAttack(statBlock: MonsterStatBlock): { hasMelee: boolean; maxRangeFt: number } {
  let hasMelee = false
  let maxRangeFt = 0
  for (const a of statBlock.actions) {
    if (a.toHit == null) continue
    if (a.attackType === 'ranged' || a.attackType === 'melee-or-ranged')
      maxRangeFt = Math.max(maxRangeFt, a.rangeNormal ?? 0)
    if (a.attackType !== 'ranged') {
      hasMelee = true
      maxRangeFt = Math.max(maxRangeFt, a.reach ?? 5)
    }
  }
  return { hasMelee, maxRangeFt }
}

// ── Orchestration ──────────────────────────────────────────────────

export function planMonsterTurn(ctx: MonsterTurnContext): MonsterTurnPlan {
  const tier = intTier(ctx.statBlock.abilityScores.int)
  const rationale: string[] = []
  const steps: MonsterTurnStep[] = []
  const budgetFt = movementBudgetFt(ctx)
  const hostiles = enumerateHostiles(ctx)

  const plan = (extra?: Partial<MonsterTurnPlan>): MonsterTurnPlan => ({
    actorTokenId: ctx.actor.id,
    actorLabel: ctx.actor.label,
    intTier: tier,
    targetTokenId: null,
    retreating: false,
    steps,
    rationale,
    ...extra
  })

  if (hostiles.length === 0) {
    rationale.push('No reachable hostiles — holding.')
    steps.push({ kind: 'note', text: 'No hostiles in sight.' })
    return plan()
  }

  // Retreat short-circuits the turn (disengage + flee) for hurt, non-mindless, non-Undead/Construct.
  const threshold = RETREAT_THRESHOLD[tier]
  const undeadOrConstruct = ctx.statBlock.type === 'Undead' || ctx.statBlock.type === 'Construct'
  if (threshold > 0 && !undeadOrConstruct && hpPct(ctx.actor) <= threshold) {
    rationale.push(`Retreating (HP ${Math.round(hpPct(ctx.actor) * 100)}% ≤ ${Math.round(threshold * 100)}%).`)
    const bonusDisengage = (ctx.statBlock.bonusActions ?? []).some((b) =>
      /disengage/i.test(b.description ?? b.name ?? '')
    )
    steps.push({ kind: 'stance', stance: 'disengage', viaBonusAction: bonusDisengage })
    const cell = bestRetreatCell(ctx, hostiles, budgetFt)
    if (cell && (cell.x !== ctx.actor.gridX || cell.y !== ctx.actor.gridY)) {
      const r = findPath(
        ctx.actor.gridX,
        ctx.actor.gridY,
        cell.x,
        cell.y,
        ctx.gridWidth,
        ctx.gridHeight,
        ctx.walls,
        ctx.terrain,
        budgetFt,
        undefined,
        ctx.diagonalRule,
        ctx.gridType
      )
      if (r.path.length > 0) steps.push({ kind: 'move', path: r.path, costFt: r.totalCost })
    }
    steps.push({ kind: 'note', text: `Retreating (HP ≤ ${Math.round(threshold * 100)}%).` })
    return plan({ retreating: true })
  }

  // Recharge / AoE save-action when it beats single-target value (≥2/3 hostiles, no friendly fire).
  const aoe = bestAoE(ctx, hostiles, tier)
  if (aoe) {
    rationale.push(
      `${aoe.action.name} ready: ${aoe.step.targetTokenIds.length} targets in ${aoe.action.areaOfEffect?.size}-ft ${aoe.action.areaOfEffect?.type}, 0 allies.`
    )
    steps.push(aoe.step)
    return plan({ targetTokenId: aoe.step.targetTokenIds[0] ?? null })
  }

  // Single-target: choose + move into range + attack.
  const target = selectTarget(ctx, hostiles, tier, budgetFt)
  if (!target) return plan()
  const concNote = ctx.turnStates[target.entityId]?.concentratingSpell ? ' (concentrating)' : ''
  rationale.push(`Target: ${target.label}${concNote}.`)

  const { hasMelee, maxRangeFt } = rangeOfAttack(ctx.statBlock)
  const distFt = chebyshevFt(ctx.actor, target, ctx.cellSize)
  const isRangedPrimary = !hasMelee && maxRangeFt > 0
  const adjacentHostile = hostiles.some((h) => chebyshevFt(ctx.actor, h, ctx.cellSize) <= ctx.cellSize)

  if (isRangedPrimary) {
    // Ranged: hold when in range and not threatened; step away from an adjacent hostile.
    if (adjacentHostile) {
      const cell = bestRetreatCell(ctx, hostiles, budgetFt)
      if (cell && (cell.x !== ctx.actor.gridX || cell.y !== ctx.actor.gridY)) {
        const r = findPath(
          ctx.actor.gridX,
          ctx.actor.gridY,
          cell.x,
          cell.y,
          ctx.gridWidth,
          ctx.gridHeight,
          ctx.walls,
          ctx.terrain,
          budgetFt,
          undefined,
          ctx.diagonalRule,
          ctx.gridType
        )
        if (r.path.length > 0) {
          steps.push({ kind: 'move', path: r.path, costFt: r.totalCost })
          rationale.push('Stepping away from an adjacent foe to shoot.')
        }
      }
    } else if (distFt > maxRangeFt) {
      // Move closer until within range (path toward adjacency, but it brings us nearer).
      const path = pathToAdjacent(ctx, target, budgetFt)
      if (path && path.path.length > 0) {
        steps.push({ kind: 'move', path: path.path, costFt: path.costFt })
        rationale.push(`Closing to range: ${path.costFt} ft.`)
      }
    }
    steps.push(...attackStepsFor(ctx.statBlock, target))
    return plan({ targetTokenId: target.id })
  }

  // Melee: path to adjacency; dash when needed; attack if adjacent at the end.
  const path = pathToAdjacent(ctx, target, budgetFt)
  if (path) {
    if (path.path.length > 0) {
      steps.push({ kind: 'move', path: path.path, costFt: path.costFt })
      rationale.push(`Path ${path.costFt} ft to engage ${target.label}.`)
    }
    steps.push(...attackStepsFor(ctx.statBlock, target))
  } else {
    // Unreachable within budget — try dashing (budget ×2).
    const dashPath = pathToAdjacent(ctx, target, budgetFt * 2)
    if (dashPath) {
      steps.push({ kind: 'stance', stance: 'dash' })
      if (dashPath.path.length > 0) steps.push({ kind: 'move', path: dashPath.path, costFt: dashPath.costFt })
      rationale.push(`Dashing to reach ${target.label} (${dashPath.costFt} ft).`)
    } else {
      // Still unreachable — close as far as possible, no attack.
      const r = findPath(
        ctx.actor.gridX,
        ctx.actor.gridY,
        target.gridX,
        target.gridY,
        ctx.gridWidth,
        ctx.gridHeight,
        ctx.walls,
        ctx.terrain,
        budgetFt,
        undefined,
        ctx.diagonalRule,
        ctx.gridType
      )
      if (r.path.length > 0) {
        steps.push({ kind: 'move', path: r.path, costFt: r.totalCost })
        rationale.push(`Advancing toward ${target.label} (out of reach this turn).`)
      } else {
        steps.push({ kind: 'note', text: `Cannot reach ${target.label}.` })
      }
    }
  }
  return plan({ targetTokenId: target.id })
}
