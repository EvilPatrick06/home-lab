import { type CoverType, getCoverACBonus, type MasteryEffectResult } from '../../../../services/combat/combat-rules'
import { formatMod } from '../../../../types/character-common'
import type { MapToken } from '../../../../types/map'
import type { AttackWeapon } from './attack-utils'
import { parseDamageDice } from './attack-utils'

/* ──────────────────────── Step 4: Attack Result ──────────────────────── */

interface AttackResultStepProps {
  attackRoll: {
    d20: number
    d20_2?: number
    modifier: number
    total: number
    isCrit: boolean
    isFumble: boolean
  }
  selectedWeapon: AttackWeapon
  selectedTarget: MapToken
  cover: CoverType
  isHit: boolean | null
  isUnarmed: boolean
  isOffhandAttack: boolean
  getDamageMod: () => number
  characterName: string
  char5e: { weaponMasteryChoices?: string[]; feats?: { id: string }[] }
  strMod: number
  profBonus: number
  abilityModifier: (score: number) => number
  character: { abilityScores: { dexterity: number }; name: string }
  onRollDamage: () => void
  onApplyGraze: (grazeDamage: number) => void
  onBroadcastMiss: (targetAC: number) => void
  onClose: () => void
  getMasteryEffect: (mastery: string, abilMod: number, profBonus: number, hit: boolean) => MasteryEffectResult | null
}

export function AttackResultStep({
  attackRoll,
  selectedWeapon,
  selectedTarget,
  cover,
  isHit,
  isUnarmed,
  isOffhandAttack: _isOffhandAttack,
  getDamageMod,
  char5e,
  strMod,
  profBonus,
  abilityModifier,
  character,
  onRollDamage,
  onApplyGraze,
  onBroadcastMiss,
  onClose: _onClose,
  getMasteryEffect
}: AttackResultStepProps): JSX.Element {
  const coverBonus = getCoverACBonus(cover)
  const targetAC = (selectedTarget.ac ?? 10) + coverBonus

  return (
    <div className="space-y-3">
      <div
        className={`text-center p-4 rounded-lg border ${
          attackRoll.isCrit
            ? 'border-green-500 bg-green-900/20'
            : attackRoll.isFumble
              ? 'border-red-500 bg-red-900/20'
              : isHit
                ? 'border-green-500 bg-green-900/20'
                : 'border-red-500 bg-red-900/20'
        }`}
      >
        <div className="text-3xl font-bold font-mono mb-1">
          <span
            className={
              attackRoll.isCrit
                ? 'text-green-400'
                : attackRoll.isFumble
                  ? 'text-red-400'
                  : isHit
                    ? 'text-green-400'
                    : 'text-red-400'
            }
          >
            {attackRoll.total}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          d20: {attackRoll.d20}
          {attackRoll.d20_2 !== undefined ? `, ${attackRoll.d20_2}` : ''} {formatMod(attackRoll.modifier)}
          {attackRoll.d20_2 !== undefined && (
            <span className="text-gray-500 ml-1">(took {attackRoll.total - attackRoll.modifier})</span>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          vs AC {targetAC}
          {coverBonus > 0 && (
            <span className="text-blue-400 ml-1">
              ({selectedTarget.ac ?? 10} + {coverBonus} cover)
            </span>
          )}
        </div>
        {attackRoll.isCrit && <div className="text-sm text-green-400 font-bold mt-1">NATURAL 20 - CRITICAL HIT!</div>}
        {attackRoll.isFumble && <div className="text-sm text-red-400 font-bold mt-1">NATURAL 1 - AUTOMATIC MISS!</div>}
        {!attackRoll.isCrit && !attackRoll.isFumble && (
          <div className={`text-sm font-bold mt-1 ${isHit ? 'text-green-400' : 'text-red-400'}`}>
            {isHit ? 'HIT' : 'MISS'}
          </div>
        )}
      </div>

      {isHit === true && (
        <button
          onClick={onRollDamage}
          className="w-full px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
        >
          {isUnarmed
            ? `Apply Damage (${Math.max(1, getDamageMod())} bludgeoning)`
            : `Roll Damage (${attackRoll.isCrit ? `${(parseDamageDice(selectedWeapon?.damage ?? '')?.count ?? 1) * 2}` : (parseDamageDice(selectedWeapon?.damage ?? '')?.count ?? 1)}d${parseDamageDice(selectedWeapon?.damage ?? '')?.sides ?? 8} ${formatMod(getDamageMod())} ${selectedWeapon?.damageType ?? ''})`}
        </button>
      )}

      {isHit === false &&
        (() => {
          // Check for Graze mastery on miss
          const weaponMastery = selectedWeapon.mastery
          const chosenMasteries = char5e.weaponMasteryChoices ?? []
          const hasGraze = weaponMastery === 'Graze' && chosenMasteries.includes('Graze')
          const grazeEffect = hasGraze
            ? getMasteryEffect(
                'Graze',
                (() => {
                  const isFinesse = selectedWeapon.properties?.includes('Finesse')
                  const isRanged = !!selectedWeapon.range
                  const dexMod = abilityModifier(character.abilityScores.dexterity)
                  if (isFinesse) return Math.max(strMod, dexMod)
                  if (isRanged) return dexMod
                  return strMod
                })(),
                profBonus,
                false
              )
            : null

          return (
            <div className="space-y-2">
              {grazeEffect && grazeEffect.grazeDamage != null && grazeEffect.grazeDamage > 0 && (
                <div className="px-3 py-2 bg-amber-900/30 border border-amber-500/50 rounded-lg">
                  <div className="text-xs text-amber-300 font-semibold">Graze Mastery</div>
                  <div className="text-[11px] text-gray-300 mt-0.5">
                    On miss: deal {grazeEffect.grazeDamage} {selectedWeapon.damageType} damage (ability modifier)
                  </div>
                  <button
                    onClick={() => onApplyGraze(grazeEffect.grazeDamage!)}
                    className="mt-1 w-full py-1 text-[10px] rounded bg-amber-600 hover:bg-amber-500 text-white cursor-pointer font-semibold"
                  >
                    Apply Graze Damage ({grazeEffect.grazeDamage})
                  </button>
                </div>
              )}
              <button
                onClick={() => onBroadcastMiss(targetAC)}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer text-sm"
              >
                Miss - Close
              </button>
            </div>
          )
        })()}
    </div>
  )
}
