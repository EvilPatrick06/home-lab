/**
 * Spell-effect & AoE-preview DM actions (P6.10 — G9 + G11).
 *
 * - query_aoe: compute which tokens a shape/origin would cover and post a DM-only
 *   preview to chat, so the AI can "see" a template before committing (the human DM
 *   gets AoETemplateModal; this is the AI's equivalent, read on its next turn).
 * - cast_spell: register an ongoing ActiveSpellEffect (Spirit Guardians, Entangle,
 *   Conjure Animals, Magic Circle, …) with caster/duration/area/save tracking;
 *   optionally applies an immediate area effect, sets concentration on the caster,
 *   and links summons.
 * - end_spell: remove an ActiveSpellEffect and clear the caster's concentration.
 *
 * The renderer-side `DmAction` is the loose `{ action: string; [k]: unknown }` shape
 * (the typed discriminated union lives in main/ai/dm-actions.ts), so fields are read
 * with explicit `as` casts — matching every other executor in this directory.
 */

import type { ActiveSpellEffect } from '../../types/dm-toolbox'
import { getCreatureSaveMod } from '../game/token-stats'
import { broadcastConditionSync, broadcastTokenSync, postDmMessage } from './broadcast-utils'
import { findTokensInArea, rollDiceFormula } from './dice-action-utils'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

type AoeShape = 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation'

// ── G9: AoE preview ──

export function executeQueryAoe(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const shape = action.shape as AoeShape
  const originX = action.originX as number
  const originY = action.originY as number
  const size = action.radiusOrLength as number
  const excludeLabel = action.excludeLabel as string | undefined

  const radiusCells = Math.ceil(size / 5)
  const widthCells = action.widthOrHeight != null ? Math.ceil((action.widthOrHeight as number) / 5) : undefined
  const affected = findTokensInArea(
    activeMap.tokens,
    originX,
    originY,
    radiusCells,
    shape,
    widthCells,
    action.direction as number | undefined
  ).filter((t) => t.label.toLowerCase() !== excludeLabel?.toLowerCase()) // 08I — case-insensitive

  const where = `${shape} (${size}ft) at (${originX}, ${originY})`
  const list = affected.length > 0 ? affected.map((t) => t.label).join(', ') : 'no tokens'
  // DM-only (broadcast=false): a preview is the AI's private targeting aid, not
  // something players should see announced before the spell actually goes off.
  postDmMessage(stores, 'aoe-preview', `🎯 [AoE Preview] ${where} would affect: ${list}`, false)
  return true
}

// ── G11: spell-effect tracking ──

export function executeCastSpell(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')

  const spellName = action.spellName as string
  const caster = action.caster as string
  const shape = action.shape as AoeShape | undefined
  const targetX = action.targetX as number | undefined
  const targetY = action.targetY as number | undefined
  const size = action.radiusOrLength as number | undefined
  const saveType = action.saveType as ActiveSpellEffect['saveType']
  const saveDC = action.saveDC as number | undefined
  const conditionIfFail = action.conditionIfFail as string | undefined
  const damageFormula = action.damageFormula as string | undefined
  const damageType = action.damageType as string | undefined
  const halfOnSave = action.halfOnSave as boolean | undefined
  const rawDuration = action.duration as number | 'concentration' | 'permanent' | undefined
  const summonLabels = action.summonLabels as string[] | undefined

  const casterToken = resolveTokenByLabel(activeMap.tokens, caster)
  const isConcentration = action.concentration === true || rawDuration === 'concentration'
  const duration: ActiveSpellEffect['duration'] = isConcentration ? 'concentration' : rawDuration

  const effect: ActiveSpellEffect = {
    id: crypto.randomUUID(),
    name: spellName,
    caster,
    casterEntityId: casterToken?.entityId,
    duration,
    startedRound: gameStore.round,
    originX: targetX,
    originY: targetY,
    shape,
    radiusFt: shape ? size : undefined,
    saveDC,
    saveType,
    conditionIfFail,
    summonedLabels: summonLabels
  }
  gameStore.addSpellEffect(effect)

  // Concentration: a concentration spell occupies the caster's concentration slot
  // (PHB) — set it so the existing break-on-damage / break-on-incapacitation logic fires.
  if (isConcentration && casterToken) {
    gameStore.setConcentrating(casterToken.entityId, spellName)
  }

  // Immediate area effect (damage / save / condition) when the spell lands on an area
  // and carries mechanics this turn (e.g. Fireball). Mirrors executeApplyAreaEffect.
  const outcomes: string[] = []
  if (shape && targetX != null && targetY != null && (damageFormula || conditionIfFail)) {
    const radiusCells = Math.ceil((size ?? 5) / 5)
    const affected = findTokensInArea(
      activeMap.tokens,
      targetX,
      targetY,
      radiusCells,
      shape,
      undefined,
      action.direction as number | undefined
    )
      // 08I — exclude the caster case-insensitively (resolved token wins; the AI may write a
      // different-case caster label, which previously let a caster nuke themselves).
      .filter((t) => t.label.toLowerCase() !== (casterToken?.label ?? caster).toLowerCase())

    for (const token of affected) {
      let saved = false
      if (saveType && saveDC) {
        const saveRoll = rollDiceFormula('1d20')
        saved = saveRoll.total + getCreatureSaveMod(token, saveType) >= saveDC
      }
      const parts: string[] = []
      if (damageFormula) {
        const dmg = rollDiceFormula(damageFormula)
        let finalDamage = dmg.total
        if (saved && halfOnSave) finalDamage = Math.floor(finalDamage / 2)
        else if (saved && !halfOnSave) finalDamage = 0
        if (finalDamage > 0 && token.currentHP != null) {
          gameStore.updateToken(activeMap.id, token.id, { currentHP: Math.max(0, token.currentHP - finalDamage) })
        }
        parts.push(`${finalDamage} ${damageType ?? ''} dmg`.trim())
      }
      if (conditionIfFail && (!saved || !saveType)) {
        gameStore.addCondition({
          id: crypto.randomUUID(),
          entityId: token.entityId,
          entityName: token.label,
          condition: conditionIfFail,
          duration: typeof rawDuration === 'number' ? rawDuration : 'permanent',
          source: spellName,
          appliedRound: gameStore.round
        })
        parts.push(conditionIfFail)
      }
      outcomes.push(`${token.label} (${saveType ? (saved ? 'saved' : 'failed') : 'hit'}: ${parts.join(', ')})`)
    }
    broadcastTokenSync(activeMap.id, stores)
    broadcastConditionSync(stores)
  }

  // Summon ownership link — stamp existing tokens as summoned by this caster, with an
  // expiry round when the spell has a numeric duration (so the AI can dismiss on time).
  if (summonLabels && summonLabels.length > 0) {
    const expiresRound = typeof rawDuration === 'number' ? gameStore.round + rawDuration : undefined
    for (const label of summonLabels) {
      const summon = resolveTokenByLabel(activeMap.tokens, label)
      if (!summon) continue
      gameStore.updateToken(activeMap.id, summon.id, {
        companionType: 'summoned',
        sourceSpell: spellName,
        ownerEntityId: casterToken?.entityId,
        summonExpiresRound: expiresRound
      })
    }
    broadcastTokenSync(activeMap.id, stores)
  }

  const durText =
    duration === 'concentration' ? ', concentration' : typeof duration === 'number' ? `, ${duration} rounds` : ''
  const outcomeText = outcomes.length > 0 ? ` — ${outcomes.join('; ')}` : ''
  postDmMessage(stores, 'cast-spell', `✨ ${caster} casts ${spellName}${durText}${outcomeText}`)
  return true
}

export function executeEndSpell(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const spellEffectId = action.spellEffectId as string | undefined
  const spellName = action.spellName as string | undefined
  const caster = action.caster as string | undefined

  const effects = gameStore.activeSpellEffects
  const target = spellEffectId
    ? effects.find((e) => e.id === spellEffectId)
    : effects.find(
        (e) =>
          (!spellName || e.name.toLowerCase() === spellName.toLowerCase()) &&
          (!caster || e.caster.toLowerCase() === caster.toLowerCase())
      )
  if (!target) throw new Error(`Spell effect not found: ${spellName ?? spellEffectId ?? '(unspecified)'}`)

  gameStore.removeSpellEffect(target.id)
  // Clearing a concentration spell frees the caster's concentration slot.
  if (target.duration === 'concentration' && target.casterEntityId) {
    if (gameStore.turnStates?.[target.casterEntityId]?.concentratingSpell === target.name) {
      gameStore.setConcentrating(target.casterEntityId, undefined)
    }
  }
  postDmMessage(stores, 'end-spell', `🛑 Spell ends: ${target.name} (cast by ${target.caster}).`)
  return true
}
