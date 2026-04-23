import { useMemo, useState } from 'react'
import {
  type CoverType,
  canGrappleOrShove,
  checkRangedRange,
  getCoverACBonus,
  getMasteryEffect,
  isInMeleeRange,
  type MasteryEffectResult,
  unarmedStrikeDC
} from '../../../../services/combat/combat-rules'
import { getCritThreshold } from '../../../../services/combat/crit-range'
import {
  type GrappleRequest,
  resolveGrapple,
  resolveShove,
  type ShoveRequest
} from '../../../../services/combat/damage-resolver'
import { resolveEffects } from '../../../../services/combat/effect-resolver-5e'
import { useGameStore } from '../../../../stores/use-game-store'
import type { Character } from '../../../../types/character'
import type { Character5e } from '../../../../types/character-5e'
import { abilityModifier } from '../../../../types/character-common'
import type { MapToken } from '../../../../types/map'
import type { DamageApplicationResult } from '../../../../utils/damage'
import {
  AttackResultStep,
  AttackRollStep,
  DamageResultStep,
  TargetSelectionStep,
  UnarmedModeStep,
  WeaponSelectionStep
} from './AttackModalSteps'
import {
  getAttackMod as calcAttackMod,
  getDamageMod as calcDamageMod,
  computeConditionEffects
} from './attack-computations'
import {
  type AttackRollResult,
  autoCalculateCover,
  type DamageResult,
  executeAttackRoll,
  executeDamageRoll,
  executeGrappleSave
} from './attack-handlers'
import { IMPROVISED_WEAPON, type Step, UNARMED_STRIKE, type UnarmedMode } from './attack-utils'

interface AttackModalProps {
  character: Character | null
  tokens: MapToken[]
  attackerToken: MapToken | null
  onClose: () => void
  onApplyDamage?: (
    targetTokenId: string,
    damage: number,
    damageType?: string,
    damageResult?: DamageApplicationResult
  ) => void
  onBroadcastResult?: (message: string) => void
}

export default function AttackModal({
  character,
  tokens,
  attackerToken,
  onClose,
  onApplyDamage,
  onBroadcastResult
}: AttackModalProps): JSX.Element {
  const [step, setStep] = useState<Step>('weapon')
  const [selectedWeaponIndex, setSelectedWeaponIndex] = useState<number | null>(null)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [cover, setCover] = useState<CoverType>('none')
  const [attackRoll, setAttackRoll] = useState<AttackRollResult | null>(null)
  const [damageResult, setDamageResult] = useState<DamageResult | null>(null)
  const [conditionOverrides, setConditionOverrides] = useState<Record<string, boolean>>({})
  const [damageAppResult, setDamageAppResult] = useState<DamageApplicationResult | null>(null)
  const [knockOutPrompt, setKnockOutPrompt] = useState(false)
  const [isHit, setIsHit] = useState<boolean | null>(null)
  const [masteryEffect, setMasteryEffect] = useState<MasteryEffectResult | null>(null)
  const [unarmedMode, setUnarmedMode] = useState<UnarmedMode>('damage')
  const [shoveChoice, setShoveChoice] = useState<'push' | 'prone'>('push')
  const [grappleResult, setGrappleResult] = useState<{ success: boolean; message: string } | null>(null)
  const [grappleResolvedByOrphan, setGrappleResolvedByOrphan] = useState(false)
  const [isOffhandAttack, setIsOffhandAttack] = useState(false)
  const [primaryWeaponIndex, setPrimaryWeaponIndex] = useState<number | null>(null)

  const gameConditions = useGameStore((s) => s.conditions)
  const turnStates = useGameStore((s) => s.turnStates)

  if (!character) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-400">No character selected</p>
          <button onClick={onClose} className="mt-3 px-4 py-1 text-sm bg-gray-700 rounded cursor-pointer">
            Close
          </button>
        </div>
      </div>
    )
  }

  const char5e = character as Character5e
  const profBonus = Math.ceil(character.level / 4) + 1
  const realWeapons = char5e.weapons ?? []
  const strMod = abilityModifier(character.abilityScores.strength)
  const dexMod = abilityModifier(character.abilityScores.dexterity)

  const resolved = useMemo(() => resolveEffects(char5e), [char5e])

  const weapons = [...realWeapons, UNARMED_STRIKE, IMPROVISED_WEAPON]
  const selectedWeapon = selectedWeaponIndex !== null ? weapons[selectedWeaponIndex] : null
  const isUnarmed = selectedWeapon?.id === '__unarmed__'
  const isImprovised = selectedWeapon?.id === '__improvised__'
  const selectedTarget = selectedTargetId ? tokens.find((t) => t.id === selectedTargetId) : null

  // Feat detection for combat bonuses
  const charFeats = char5e.feats ?? []
  const hasArcheryFS = charFeats.some((f) => f.id === 'fighting-style-archery')
  const hasDuelingFS = charFeats.some((f) => f.id === 'fighting-style-dueling')
  const hasThrownWeaponFS = charFeats.some((f) => f.id === 'fighting-style-thrown-weapon-fighting')
  const hasGWM = charFeats.some((f) => f.id === 'great-weapon-master')

  const modOpts = { selectedWeapon, isUnarmed, isImprovised, strMod, dexMod, profBonus }
  const getAttackMod = (): number => calcAttackMod({ ...modOpts, hasArcheryFS, resolved })
  const getDamageMod = (): number =>
    calcDamageMod({ ...modOpts, isOffhandAttack, hasDuelingFS, hasThrownWeaponFS, hasGWM, resolved })

  const computedEffects = computeConditionEffects({
    selectedWeapon,
    selectedTarget: selectedTarget ?? null,
    attackerToken,
    gameConditions,
    turnStates,
    tokens
  })

  // ── Handlers ──

  const handleRollAttack = (): void => {
    if (!selectedWeapon || !selectedTarget) return
    const mod = getAttackMod() + (computedEffects?.exhaustionPenalty ?? 0)
    const { roll, isHit: hit } = executeAttackRoll({
      selectedWeapon,
      selectedTarget,
      character: { name: character.name, feats: charFeats },
      attackMod: mod,
      cover,
      computedEffects,
      conditionOverrides,
      critThreshold: getCritThreshold(char5e)
    })
    setIsHit(hit)
    setAttackRoll(roll)
    setStep('damage')
  }

  const handleRollDamage = (): void => {
    if (!selectedWeapon || !selectedTarget) return
    const result = executeDamageRoll({
      selectedWeapon,
      selectedTarget,
      character,
      char5e,
      isCrit: attackRoll?.isCrit ?? false,
      isUnarmed,
      damageMod: getDamageMod(),
      resolved,
      strMod,
      profBonus
    })
    setDamageAppResult(result.damageAppResult)
    setDamageResult(result.damageResult)
    setMasteryEffect(result.masteryEffect)
    if (result.knockOutPrompt) setKnockOutPrompt(true)
    setStep('result')
  }

  const handleApply = (knockOut = false, startOffhand = false): void => {
    if (!selectedTarget || !damageResult || !selectedWeapon || !attackRoll) return

    if (onApplyDamage) {
      onApplyDamage(selectedTarget.id, damageResult.total, selectedWeapon.damageType, damageAppResult ?? undefined)
    }

    if (selectedTarget.currentHP != null && selectedTarget.currentHP <= 0 && damageResult.total > 0) {
      const failures = attackRoll.isCrit ? 2 : 1
      onBroadcastResult?.(
        `${selectedTarget.label} takes damage at 0 HP: +${failures} death save failure${failures > 1 ? 's' : ''}!`
      )
    }

    if (onBroadcastResult) {
      const coverBonus = getCoverACBonus(cover)
      const targetAC = (selectedTarget.ac ?? 10) + coverBonus
      const hitStr = attackRoll.isCrit ? 'CRITICAL HIT' : `Attack: ${attackRoll.total} vs AC ${targetAC} - HIT`
      const offhandTag = isOffhandAttack ? ' (Off-hand)' : ''
      const finalDmg = `${damageResult.total} ${selectedWeapon.damageType} damage`
      const modNote = damageAppResult?.modifierDescription ? ` [${damageAppResult.modifierDescription}]` : ''
      const critNote = damageResult.isCrit ? ' (Critical!)' : ''
      const koNote = knockOut ? ' [Knocked Out - Unconscious at 1 HP]' : ''
      const massiveNote = damageAppResult?.instantDeath ? ' [INSTANT DEATH - Massive Damage!]' : ''
      const masteryNote = masteryEffect ? ` [${masteryEffect.mastery}: ${masteryEffect.description}]` : ''
      onBroadcastResult(
        `${character.name} attacks ${selectedTarget.label} with ${selectedWeapon.name}${offhandTag} - ${hitStr}! ${finalDmg}${modNote}${critNote}${koNote}${massiveNote}${masteryNote}`
      )
    }

    if (startOffhand) {
      setPrimaryWeaponIndex(selectedWeaponIndex)
      setIsOffhandAttack(true)
      setSelectedWeaponIndex(null)
      setSelectedTargetId(null)
      setAttackRoll(null)
      setDamageResult(null)
      setDamageAppResult(null)
      setIsHit(null)
      setMasteryEffect(null)
      setKnockOutPrompt(false)
      setCover('none')
      setConditionOverrides({})
      setStep('weapon')
      return
    }

    onClose()
  }

  // ── Target helpers ──

  const targetableTokens = tokens.filter((t) => {
    if (!attackerToken) return t.entityType === 'enemy'
    return t.id !== attackerToken.id
  })

  const rangeChecker = (token: MapToken): { status: string; color: string } => {
    let rangeStatus = ''
    let rangeColor = 'text-gray-400'
    if (attackerToken && selectedWeapon?.range) {
      const [normalStr, longStr] = selectedWeapon.range.split('/')
      const normalRange = parseInt(normalStr, 10) || 30
      const longRange = parseInt(longStr, 10) || normalRange * 4
      const range = checkRangedRange(attackerToken, token, normalRange, longRange)
      if (range === 'out-of-range') {
        rangeStatus = 'Out of range'
        rangeColor = 'text-red-400'
      } else if (range === 'long') {
        if (useGameStore.getState().underwaterCombat) {
          rangeStatus = 'Out of range (underwater)'
          rangeColor = 'text-red-400'
        } else {
          rangeStatus = 'Long range (Disadvantage)'
          rangeColor = 'text-yellow-400'
        }
      } else {
        rangeStatus = 'In range'
        rangeColor = 'text-green-400'
      }
    } else if (attackerToken && !selectedWeapon?.range) {
      const melee = isInMeleeRange(attackerToken, token)
      rangeStatus = melee ? 'In melee range' : 'Out of melee range'
      rangeColor = melee ? 'text-green-400' : 'text-red-400'
    }
    return { status: rangeStatus, color: rangeColor }
  }

  const grappleShoveChecker = (token: MapToken): boolean => {
    return !!(
      isUnarmed &&
      (unarmedMode === 'grapple' || unarmedMode === 'shove') &&
      attackerToken &&
      !canGrappleOrShove(attackerToken, token)
    )
  }

  const charmedChecker = (token: MapToken): boolean => {
    return !!(
      attackerToken &&
      gameConditions.some(
        (c) => c.entityId === attackerToken.entityId && c.condition === 'Charmed' && c.sourceEntityId === token.entityId
      )
    )
  }

  const handleSelectTarget = (token: MapToken): void => {
    setSelectedTargetId(token.id)
    setConditionOverrides({})
    setGrappleResult(null)
    setGrappleResolvedByOrphan(false)
    if (attackerToken) {
      setCover(autoCalculateCover(attackerToken, token, tokens))
    }
    setStep('roll')
  }

  // ── Grapple/Shove handlers ──
  // Uses resolveGrapple/resolveShove from grapple-shove-resolver for full
  // one-shot resolution (roll + condition + combat log + broadcast).
  // The step-by-step UI path still uses executeGrappleSave for the roll,
  // while resolveGrapple/resolveShove handle condition application and logging.

  /** Build a GrappleRequest from the current modal state */
  const buildGrappleRequest = (target: MapToken): GrappleRequest => ({
    attackerToken: attackerToken!,
    targetToken: target,
    attackerName: character.name,
    targetName: target.label,
    attackerAthleticsBonus: strMod + profBonus,
    targetEscapeBonus: target.saveMod ?? 0,
    attackerStrScore: character.abilityScores.strength,
    proficiencyBonus: profBonus
  })

  const handleRollGrappleSave = (): void => {
    if (!selectedTarget || !attackerToken) return

    if (unarmedMode === 'grapple') {
      // Use resolveGrapple from grapple-shove-resolver for full resolution.
      // Note: resolveGrapple.success means "grapple attempt succeeded" (target failed to resist),
      // but the modal's grappleResult.success means "target's save succeeded" (grapple failed).
      // So we invert the success flag for the modal UI.
      const request = buildGrappleRequest(selectedTarget)
      const result = resolveGrapple(request)
      setGrappleResult({ success: !result.success, message: result.summary })
      setGrappleResolvedByOrphan(true)
      // resolveGrapple already applies the Grappled condition and broadcasts
    } else if (unarmedMode === 'shove') {
      // Use resolveShove from grapple-shove-resolver for full resolution.
      // Same inversion: resolveShove.success = attempt succeeded = target save failed.
      const request: ShoveRequest = {
        ...buildGrappleRequest(selectedTarget),
        shoveType: shoveChoice
      }
      const result = resolveShove(request)
      setGrappleResult({ success: !result.success, message: result.summary })
      setGrappleResolvedByOrphan(true)
      // resolveShove already applies Prone condition and broadcasts
    } else {
      // Fallback to step-by-step save for damage mode
      const result = executeGrappleSave({ selectedTarget, character, profBonus, unarmedMode })
      setGrappleResult(result)
    }
  }

  const handleManualFail = (): void => {
    if (!selectedTarget) return
    setGrappleResult({ success: false, message: `${selectedTarget.label} fails the ${unarmedMode} save (manual).` })
    if (unarmedMode === 'grapple' && attackerToken) {
      // Use resolveGrapple to apply condition and log; note: this also rolls
      // but the manual-fail path overrides the result display above
      const gameStore = useGameStore.getState()
      gameStore.addCondition({
        id: crypto.randomUUID(),
        entityId: selectedTarget.entityId,
        entityName: selectedTarget.label,
        condition: 'Grappled',
        duration: 'permanent',
        source: `Grappled by ${character.name}`,
        sourceEntityId: attackerToken.entityId,
        appliedRound: gameStore.round
      })
    }
  }

  const handleManualPass = (): void => {
    if (!selectedTarget) return
    setGrappleResult({ success: true, message: `${selectedTarget.label} resists the ${unarmedMode} (manual).` })
  }

  const handleGrappleDone = (): void => {
    if (!selectedTarget || !grappleResult) return
    // When resolveGrapple/resolveShove from grapple-shove-resolver was used,
    // conditions and combat log entries are already applied. Only broadcast
    // the summary message via the modal's callback.
    onBroadcastResult?.(
      `${character.name} attempts to ${unarmedMode} ${selectedTarget.label}: ${grappleResult.message}`
    )
    // Only apply conditions manually for the manual-fail path (where the
    // orphan resolver was NOT used)
    if (
      !grappleResolvedByOrphan &&
      !grappleResult.success &&
      unarmedMode === 'shove' &&
      shoveChoice === 'prone' &&
      attackerToken
    ) {
      const gameStore = useGameStore.getState()
      gameStore.addCondition({
        id: crypto.randomUUID(),
        entityId: selectedTarget.entityId,
        entityName: selectedTarget.label,
        condition: 'Prone',
        duration: 'permanent',
        source: `Shoved by ${character.name}`,
        sourceEntityId: attackerToken.entityId,
        appliedRound: gameStore.round
      })
    }
    onClose()
  }

  const handleApplyGraze = (grazeDamage: number): void => {
    if (!selectedTarget || !selectedWeapon) return
    if (onApplyDamage) onApplyDamage(selectedTarget.id, grazeDamage, selectedWeapon.damageType)
    onBroadcastResult?.(
      `${character.name} attacks ${selectedTarget.label} with ${selectedWeapon.name} - MISS! (Graze: ${grazeDamage} ${selectedWeapon.damageType})`
    )
    onClose()
  }

  const handleBroadcastMiss = (targetAC: number): void => {
    if (!selectedTarget || !selectedWeapon || !attackRoll) return
    if (onBroadcastResult) {
      const missMsg = attackRoll.isFumble
        ? `${character.name} attacks ${selectedTarget.label} with ${selectedWeapon.name} - Natural 1, MISS!`
        : `${character.name} attacks ${selectedTarget.label} with ${selectedWeapon.name} - Attack: ${attackRoll.total} vs AC ${targetAC}, MISS!`
      onBroadcastResult(missMsg)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[420px] max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">
            {step === 'weapon' && (isOffhandAttack ? 'Off-hand Attack' : 'Choose Weapon')}
            {step === 'unarmed-mode' && 'Unarmed Strike Mode'}
            {step === 'target' && 'Select Target'}
            {step === 'roll' &&
              (isUnarmed && unarmedMode !== 'damage'
                ? `Unarmed Strike — ${unarmedMode === 'grapple' ? 'Grapple' : 'Shove'}`
                : isOffhandAttack
                  ? 'Off-hand Attack Roll'
                  : 'Attack Roll')}
            {step === 'damage' && (isOffhandAttack ? 'Off-hand Result' : 'Attack Result')}
            {step === 'result' && (isOffhandAttack ? 'Off-hand Damage' : 'Damage Applied')}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {step === 'weapon' && (
          <WeaponSelectionStep
            weapons={weapons}
            realWeapons={realWeapons}
            character={character}
            strMod={strMod}
            getAttackMod={getAttackMod}
            isOffhandAttack={isOffhandAttack}
            primaryWeaponIndex={primaryWeaponIndex}
            masteryChoices={char5e.weaponMasteryChoices ?? []}
            onSelectWeapon={(i) => {
              setSelectedWeaponIndex(i)
              setStep('target')
            }}
            onSelectUnarmed={(i) => {
              setSelectedWeaponIndex(i)
              setStep('unarmed-mode')
            }}
          />
        )}

        {step === 'unarmed-mode' && (
          <UnarmedModeStep
            strMod={strMod}
            unarmedStrikeDC={unarmedStrikeDC(character.abilityScores.strength, profBonus)}
            onSelectMode={(mode) => {
              setUnarmedMode(mode)
              setStep('target')
            }}
            onBack={() => setStep('weapon')}
          />
        )}

        {step === 'target' && selectedWeapon && (
          <TargetSelectionStep
            selectedWeapon={selectedWeapon}
            isUnarmed={isUnarmed}
            unarmedMode={unarmedMode}
            targetableTokens={targetableTokens}
            attackerToken={attackerToken}
            cover={cover}
            setCover={setCover}
            onSelectTarget={handleSelectTarget}
            onBack={() => setStep('weapon')}
            rangeChecker={rangeChecker}
            grappleShoveChecker={grappleShoveChecker}
            charmedChecker={charmedChecker}
          />
        )}

        {step === 'roll' && selectedWeapon && selectedTarget && (
          <AttackRollStep
            selectedWeapon={selectedWeapon}
            selectedTarget={selectedTarget}
            isUnarmed={isUnarmed}
            unarmedMode={unarmedMode}
            isOffhandAttack={isOffhandAttack}
            cover={cover}
            computedEffects={computedEffects}
            conditionOverrides={conditionOverrides}
            setConditionOverrides={setConditionOverrides}
            attackMod={getAttackMod() + (computedEffects?.exhaustionPenalty ?? 0)}
            shoveChoice={shoveChoice}
            setShoveChoice={setShoveChoice}
            grappleResult={grappleResult}
            characterName={character.name}
            unarmedStrikeDC={unarmedStrikeDC(character.abilityScores.strength, profBonus)}
            onRollAttack={handleRollAttack}
            onRollGrappleSave={handleRollGrappleSave}
            onManualFail={handleManualFail}
            onManualPass={handleManualPass}
            onGrappleDone={handleGrappleDone}
            onBack={() => {
              setGrappleResult(null)
              setGrappleResolvedByOrphan(false)
              setIsHit(null)
              setStep('target')
            }}
          />
        )}

        {step === 'damage' && attackRoll && selectedWeapon && selectedTarget && (
          <AttackResultStep
            attackRoll={attackRoll}
            selectedWeapon={selectedWeapon}
            selectedTarget={selectedTarget}
            cover={cover}
            isHit={isHit}
            isUnarmed={isUnarmed}
            isOffhandAttack={isOffhandAttack}
            getDamageMod={getDamageMod}
            characterName={character.name}
            char5e={char5e}
            strMod={strMod}
            profBonus={profBonus}
            abilityModifier={abilityModifier}
            character={character}
            onRollDamage={handleRollDamage}
            onApplyGraze={handleApplyGraze}
            onBroadcastMiss={handleBroadcastMiss}
            onClose={onClose}
            getMasteryEffect={getMasteryEffect}
          />
        )}

        {step === 'result' && damageResult && selectedWeapon && selectedTarget && (
          <DamageResultStep
            damageResult={damageResult}
            selectedWeapon={selectedWeapon}
            selectedTarget={selectedTarget}
            damageAppResult={damageAppResult}
            knockOutPrompt={knockOutPrompt}
            isOffhandAttack={isOffhandAttack}
            masteryEffect={masteryEffect}
            realWeapons={realWeapons}
            selectedWeaponIndex={selectedWeaponIndex}
            onApplyDamage={handleApply}
            setKnockOutPrompt={setKnockOutPrompt}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}
