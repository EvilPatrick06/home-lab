/**
 * PHASE-30 30B — monster-turn executor. Runs a `MonsterTurnPlan` (30A) against the live game store
 * with REAL dice — the runtime twin of `executeOpportunityAttack` generalized to a full turn. Posts
 * one auditable mechanical summary; no LLM is involved in the mechanics.
 */

import { useAiDmStore } from '../../stores/use-ai-dm-store'
import { useCampaignStore } from '../../stores/use-campaign-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import type { InitiativeEntry } from '../../types/game-state'
import type { MapToken } from '../../types/map'
import { getActiveCampaignId } from '../active-campaign-ref'
import { buildPlayerRoster } from '../ai-dm-routing'
import { getCreatureSaveMod, getTokenStats, lookupTokenStatBlock } from '../game/token-stats'
import { broadcastInitiativeSync, broadcastTokenSync, postDmMessage } from '../game-actions/broadcast-utils'
import { executeApplyAreaEffect } from '../game-actions/creature-conditions'
import { executeNextTurn } from '../game-actions/creature-initiative'
import { rollDiceFormula } from '../game-actions/dice-helpers'
import { resolveTokenByLabel } from '../game-actions/name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from '../game-actions/types'
import { pluginEventBus } from '../plugin-system/event-bus'
import { logCombatEntry } from './combat-log'
import { checkConcentrationOnDamage } from './concentration-manager'
import { type MonsterTurnContext, type MonsterTurnPlan, planMonsterTurn } from './monster-turn-planner'

export interface MonsterTurnRunResult {
  summaryLines: string[]
  attacksResolved: number
  damageDealt: number
  turnAdvanced: boolean
}

const TIER_LABEL: Record<MonsterTurnPlan['intTier'], string> = {
  mindless: 'mindless',
  low: 'simple',
  average: 'average',
  clever: 'clever',
  genius: 'genius'
}

function activeMapOf(gs: GameStoreSnapshot): ActiveMap | undefined {
  return gs.maps.find((m) => m.id === gs.activeMapId) ?? gs.maps[0]
}

/** Build a planner context from the live stores. Returns `{ error }` when the actor has no stat block. */
export function buildMonsterTurnContext(
  entityLabelOrId: string,
  stores: StoreAccessors
): MonsterTurnContext | { error: string } {
  const gs = stores.getGameStore().getState()
  const map = activeMapOf(gs)
  if (!map) return { error: 'No active map' }
  const actor = resolveTokenByLabel(map.tokens, entityLabelOrId) ?? map.tokens.find((t) => t.id === entityLabelOrId)
  if (!actor) return { error: `No token matching "${entityLabelOrId}"` }
  const statBlock = lookupTokenStatBlock(actor.monsterStatBlockId)
  if (!statBlock) return { error: `No stat block linked to ${actor.label}` }

  // Pre-hydrate ac/maxHP/currentHP on every token (planner reads them directly — getTokenStats is
  // store-bound, so it can only run here, not inside the pure planner).
  const tokens = map.tokens.map((t) => {
    const s = getTokenStats(t)
    return { ...t, ac: t.ac ?? s.ac, maxHP: t.maxHP ?? s.maxHP, currentHP: t.currentHP ?? s.maxHP } as MapToken
  })
  const hydratedActor = tokens.find((t) => t.id === actor.id) ?? actor
  const initiativeEntry = gs.initiative?.entries.find((e) => e.entityId === actor.entityId)

  return {
    actor: hydratedActor,
    statBlock,
    tokens,
    walls: map.wallSegments ?? [],
    terrain: map.terrain ?? [],
    gridWidth: map.width ?? 30,
    gridHeight: map.height ?? 30,
    cellSize: 5,
    turnStates: gs.turnStates ?? {},
    initiativeEntry,
    round: gs.initiative?.round ?? 1,
    diagonalRule: gs.diagonalRule ?? 'standard',
    gridType: map.grid?.type,
    flankingEnabled: gs.flankingEnabled
  }
}

/** Leading dice formula out of an `additionalDamage` string like `"1d4 Slashing"`. */
function leadingDiceFormula(s: string | undefined): string | null {
  if (!s) return null
  const m = s.match(/^\s*([+-]?\d*d\d+(?:\s*[+-]\s*\d+)?)/i)
  return m ? m[1].replace(/\s+/g, '') : null
}

export function executeMonsterTurnPlan(
  plan: MonsterTurnPlan,
  stores: StoreAccessors,
  opts: { autoAdvance?: boolean } = {}
): MonsterTurnRunResult {
  const gs = stores.getGameStore().getState()
  const map = activeMapOf(gs)
  const lines: string[] = [`⚔️ [Monster Turn] ${plan.actorLabel} — ${TIER_LABEL[plan.intTier]} tactics`]
  let attacksResolved = 0
  let damageDealt = 0
  if (!map) return { summaryLines: lines, attacksResolved, damageDealt, turnAdvanced: false }

  const actor = map.tokens.find((t) => t.id === plan.actorTokenId)
  const actorEntityId = actor?.entityId
  // Track HP across multiattack hits (the snapshot's token HP won't refresh mid-loop).
  const hp = new Map<string, number>()
  const liveHp = (id: string): number => hp.get(id) ?? map.tokens.find((t) => t.id === id)?.currentHP ?? 0

  for (const step of plan.steps) {
    switch (step.kind) {
      case 'move': {
        const last = step.path[step.path.length - 1]
        if (last && actor) {
          gs.moveToken(map.id, actor.id, last.x, last.y)
          if (actorEntityId) gs.useMovement(actorEntityId, step.costFt)
          if (pluginEventBus.hasSubscribers('map:token-moved')) {
            pluginEventBus.emit('map:token-moved', {
              tokenId: actor.id,
              label: actor.label,
              gridX: last.x,
              gridY: last.y
            })
          }
          lines.push(`Moves ${step.costFt} ft.`)
        }
        break
      }
      case 'stance': {
        if (!actorEntityId) break
        if (step.stance === 'dash') gs.setDashing(actorEntityId)
        else if (step.stance === 'dodge') gs.setDodging(actorEntityId)
        else if (step.viaBonusAction) gs.useBonusAction(actorEntityId)
        else gs.setDisengaging(actorEntityId)
        lines.push(`${step.stance.charAt(0).toUpperCase()}${step.stance.slice(1)}.`)
        break
      }
      case 'attack': {
        const target = map.tokens.find((t) => t.id === step.targetTokenId)
        if (!target || liveHp(target.id) <= 0) break
        const d20 = rollDiceFormula('1d20').total
        const isCrit = d20 === 20
        const isFumble = d20 === 1
        const ac = getTokenStats(target).ac ?? 10
        const total = d20 + step.toHit
        const hit = !isFumble && (isCrit || total >= ac)
        let line = `${step.actionName}: d20(${d20})+${step.toHit}=${total} vs AC ${ac} → ${isFumble ? 'MISS (nat 1)' : hit ? (isCrit ? 'CRIT' : 'HIT') : 'MISS'}`
        if (hit) {
          const base = rollDiceFormula(step.damageDice)
          let dmg = base.total
          if (isCrit) dmg += base.rolls.reduce((s, r) => s + r, 0)
          const addF = leadingDiceFormula(step.additionalDamage)
          if (addF) dmg += rollDiceFormula(addF).total
          dmg = Math.max(0, dmg)
          const newHP = Math.max(0, liveHp(target.id) - dmg)
          hp.set(target.id, newHP)
          gs.updateToken(map.id, target.id, { currentHP: newHP })
          damageDealt += dmg
          attacksResolved++
          const dt = step.damageType ? ` ${step.damageType}` : ''
          line += ` — ${dmg}${dt} (HP ${newHP})`
          if (newHP <= 0) line += ' — drops to 0 HP'
          const ts = gs.turnStates?.[target.entityId]
          if (ts?.concentratingSpell) {
            const res = checkConcentrationOnDamage(
              target.entityId,
              target.label,
              dmg,
              gs.turnStates,
              getCreatureSaveMod(target, 'con')
            )
            if (res.needsCheck && res.result) {
              if (!res.result.maintained) gs.setConcentrating(target.entityId, undefined)
              line += ` | ${res.result.summary}`
            }
          }
          logCombatEntry({
            type: 'attack',
            sourceEntityId: actorEntityId,
            sourceEntityName: plan.actorLabel,
            targetEntityId: target.entityId,
            targetEntityName: target.label,
            value: dmg,
            damageType: step.damageType,
            description: line
          })
        } else {
          attacksResolved++
        }
        lines.push(line)
        break
      }
      case 'save-action': {
        if (step.areaOfEffect) {
          // Single source of truth for AoE saves — delegate to the existing executor.
          const aoeAction = {
            action: 'apply_area_effect',
            shape: step.areaOfEffect.type,
            originX: step.areaOfEffect.originX,
            originY: step.areaOfEffect.originY,
            radiusOrLength: step.areaOfEffect.size,
            direction: step.areaOfEffect.direction,
            saveType: step.saveAbility,
            saveDC: step.saveDC,
            damageFormula: step.damageDice,
            damageType: step.damageType,
            halfOnSave: step.halfOnSave
          } as unknown as DmAction
          executeApplyAreaEffect(aoeAction, gs, map, stores)
          lines.push(`${step.actionName}: area save (DC ${step.saveDC} ${step.saveAbility}) — see [Area Effect] above.`)
        } else {
          // Single-target save.
          for (const tid of step.targetTokenIds) {
            const target = map.tokens.find((t) => t.id === tid)
            if (!target || liveHp(target.id) <= 0) continue
            const save = rollDiceFormula('1d20').total + getCreatureSaveMod(target, step.saveAbility)
            const saved = save >= step.saveDC
            let dmg = step.damageDice ? rollDiceFormula(step.damageDice).total : 0
            if (saved && step.halfOnSave) dmg = Math.floor(dmg / 2)
            else if (saved) dmg = 0
            if (dmg > 0) {
              const newHP = Math.max(0, liveHp(target.id) - dmg)
              hp.set(target.id, newHP)
              gs.updateToken(map.id, target.id, { currentHP: newHP })
              damageDealt += dmg
            }
            if (!saved && step.conditionRiders) {
              for (const cond of step.conditionRiders) {
                gs.addCondition({
                  id: `mt-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
                  entityId: target.entityId,
                  entityName: target.label,
                  condition: cond,
                  duration: 'permanent',
                  source: step.actionName,
                  appliedRound: gs.initiative?.round ?? 1
                })
              }
            }
            lines.push(
              `${step.actionName} vs ${target.label}: save ${save} vs DC ${step.saveDC} → ${saved ? 'SAVE' : 'FAIL'}${dmg ? ` (${dmg} dmg)` : ''}`
            )
          }
        }
        break
      }
      case 'note':
        lines.push(step.text)
        break
    }
  }

  // Recharge bookkeeping: any step that used a recharge ability flips it unavailable until it re-rolls.
  const usedRecharge = new Set(
    plan.steps.flatMap((s) => (s.kind === 'save-action' && s.rechargeName ? [s.rechargeName] : []))
  )
  if (usedRecharge.size > 0 && actorEntityId) {
    const entry = gs.initiative?.entries.find((e) => e.entityId === actorEntityId)
    if (entry) {
      const existing = entry.rechargeAbilities ?? []
      const merged: InitiativeEntry['rechargeAbilities'] = [...existing]
      for (const name of usedRecharge) {
        const idx = merged.findIndex((r) => r.name.toLowerCase() === name.toLowerCase())
        if (idx >= 0) merged[idx] = { ...merged[idx], available: false }
        else merged.push({ name, rechargeOn: 5, available: false })
      }
      gs.updateInitiativeEntry(entry.id, { rechargeAbilities: merged })
    }
  }

  if (actorEntityId) gs.useAction(actorEntityId)
  broadcastTokenSync(map.id, stores)
  broadcastInitiativeSync(stores)
  postDmMessage(stores, 'mt', lines.join('\n'), true)

  // 30E flavor narration BEFORE advancing the turn so it references the correct actor.
  maybeDispatchFlavorNarration(lines, gs)

  let turnAdvanced = false
  if (opts.autoAdvance) {
    executeNextTurn({ action: 'next_turn' } as DmAction, gs, map, stores)
    turnAdvanced = true
  }
  return { summaryLines: lines, attacksResolved, damageDealt, turnAdvanced }
}

/**
 * PHASE-30 30E — opt-in LLM flavor narration. When `flavorNarration` is on AND an AI-DM campaign is
 * active, send the resolved summary to the AI DM as a narrate-ONLY request (mechanics are final).
 * Fire-and-forget + fully guarded — a flavor failure must never affect the resolved turn.
 */
function maybeDispatchFlavorNarration(lines: string[], gs: GameStoreSnapshot): void {
  try {
    if (!gs.monsterAutomation?.flavorNarration) return
    const aiStore = useAiDmStore.getState()
    if (!aiStore.enabled) return
    const campaignId = getActiveCampaignId()
    if (!campaignId) return
    const lobbyPlayers = useLobbyStore.getState().players
    const campaignPlayers = useCampaignStore.getState().getActiveCampaign()?.players ?? []
    const { charIds } = buildPlayerRoster(lobbyPlayers, campaignPlayers)
    const content = `[RESOLVED COMBAT TURN]\n${lines.join('\n')}\n[/RESOLVED COMBAT TURN]\nNarrate this resolved combat turn in 2-4 vivid sentences. Every number above is final: do not roll dice, do not emit [STAT_CHANGES] or [DM_ACTIONS] for anything already resolved.`
    void aiStore.sendMessage(campaignId, content, charIds)
  } catch {
    // best-effort — never break a resolved turn on a flavor failure
  }
}

/** Convenience entry point used by the AI action (30C), commands + UI (30D), and auto-run (30E). */
export function runMonsterTurn(
  entityLabel: string,
  stores: StoreAccessors,
  opts: { autoAdvance?: boolean } = {}
): MonsterTurnRunResult | { error: string } {
  const ctx = buildMonsterTurnContext(entityLabel, stores)
  if ('error' in ctx) return ctx
  const plan = planMonsterTurn(ctx)
  return executeMonsterTurnPlan(plan, stores, opts)
}
