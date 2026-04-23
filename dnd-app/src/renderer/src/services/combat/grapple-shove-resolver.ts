import { useGameStore } from '../../stores/use-game-store'
import type { MapToken } from '../../types/map'
import { type DiceRollResult, rollD20 } from '../dice/dice-service'
import { broadcastCombatResult, logCombatEntry } from './combat-log'
import { canGrappleOrShove, unarmedStrikeDC } from './combat-rules'

// ─── Types ────────────────────────────────────────────────────

export interface GrappleRequest {
  attackerToken: MapToken
  targetToken: MapToken
  attackerName: string
  targetName: string
  attackerAthleticsBonus: number
  targetEscapeBonus: number
  attackerStrScore: number
  proficiencyBonus: number
}

export interface GrappleResult {
  success: boolean
  attackerRoll: DiceRollResult
  targetRoll: DiceRollResult
  dc: number
  summary: string
}

export interface ShoveRequest {
  attackerToken: MapToken
  targetToken: MapToken
  attackerName: string
  targetName: string
  attackerAthleticsBonus: number
  targetEscapeBonus: number
  attackerStrScore: number
  proficiencyBonus: number
  shoveType: 'prone' | 'push'
}

export type ShoveResult = GrappleResult

// ─── Resolvers ────────────────────────────────────────────────

export function resolveGrapple(request: GrappleRequest): GrappleResult {
  const {
    attackerToken,
    targetToken,
    attackerName,
    targetName,
    attackerStrScore,
    proficiencyBonus,
    targetEscapeBonus
  } = request

  if (!canGrappleOrShove(attackerToken, targetToken)) {
    return {
      success: false,
      attackerRoll: { formula: '—', rolls: [0], total: 0, natural20: false, natural1: false },
      targetRoll: { formula: '—', rolls: [0], total: 0, natural20: false, natural1: false },
      dc: 0,
      summary: `${attackerName} cannot grapple ${targetName} — target is too large!`
    }
  }

  const dc = unarmedStrikeDC(attackerStrScore, proficiencyBonus)
  const attackerRoll = rollD20(0, { label: 'Grapple DC', silent: true })
  const targetRoll = rollD20(targetEscapeBonus, { label: 'Escape Grapple', silent: true })
  const success = targetRoll.total < dc

  const summary = success
    ? `${attackerName} grapples ${targetName}! (DC ${dc}, target rolled ${targetRoll.total}) — ${targetName} is Grappled.`
    : `${attackerName}'s grapple attempt fails! (DC ${dc}, target rolled ${targetRoll.total})`

  if (success) {
    const gameStore = useGameStore.getState()
    gameStore.addCondition({
      id: crypto.randomUUID(),
      entityId: targetToken.entityId,
      entityName: targetName,
      condition: 'Grappled',
      duration: 'permanent',
      source: `Grappled by ${attackerName}`,
      sourceEntityId: attackerToken.entityId,
      appliedRound: gameStore.round
    })
  }

  logCombatEntry({
    type: 'attack',
    sourceEntityId: attackerToken.entityId,
    sourceEntityName: attackerName,
    targetEntityId: targetToken.entityId,
    targetEntityName: targetName,
    description: summary
  })

  broadcastCombatResult(summary, false)

  return { success, attackerRoll, targetRoll, dc, summary }
}

export function resolveShove(request: ShoveRequest): ShoveResult {
  const {
    attackerToken,
    targetToken,
    attackerName,
    targetName,
    attackerStrScore,
    proficiencyBonus,
    targetEscapeBonus,
    shoveType
  } = request

  if (!canGrappleOrShove(attackerToken, targetToken)) {
    return {
      success: false,
      attackerRoll: { formula: '—', rolls: [0], total: 0, natural20: false, natural1: false },
      targetRoll: { formula: '—', rolls: [0], total: 0, natural20: false, natural1: false },
      dc: 0,
      summary: `${attackerName} cannot shove ${targetName} — target is too large!`
    }
  }

  const dc = unarmedStrikeDC(attackerStrScore, proficiencyBonus)
  const attackerRoll = rollD20(0, { label: 'Shove DC', silent: true })
  const targetRoll = rollD20(targetEscapeBonus, { label: 'Resist Shove', silent: true })
  const success = targetRoll.total < dc

  let summary: string
  if (success && shoveType === 'prone') {
    summary = `${attackerName} shoves ${targetName} Prone! (DC ${dc}, target rolled ${targetRoll.total})`
    const gameStore = useGameStore.getState()
    gameStore.addCondition({
      id: crypto.randomUUID(),
      entityId: targetToken.entityId,
      entityName: targetName,
      condition: 'Prone',
      duration: 'permanent',
      source: `Shoved by ${attackerName}`,
      sourceEntityId: attackerToken.entityId,
      appliedRound: gameStore.round
    })
  } else if (success && shoveType === 'push') {
    summary = `${attackerName} pushes ${targetName} 5 ft away! (DC ${dc}, target rolled ${targetRoll.total})`
  } else {
    summary = `${attackerName}'s shove attempt fails! (DC ${dc}, target rolled ${targetRoll.total})`
  }

  logCombatEntry({
    type: 'attack',
    sourceEntityId: attackerToken.entityId,
    sourceEntityName: attackerName,
    targetEntityId: targetToken.entityId,
    targetEntityName: targetName,
    description: summary
  })

  broadcastCombatResult(summary, false)

  return { success, attackerRoll, targetRoll, dc, summary }
}
