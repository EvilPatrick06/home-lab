import type { MasteryEffectResult } from '../../../../services/combat/combat-rules'
import { formatMod } from '../../../../types/character-common'
import type { MapToken } from '../../../../types/map'
import type { DamageApplicationResult } from '../../../../utils/damage'
import type { AttackWeapon } from './attack-utils'

/* ──────────────────────── Step 5: Damage Result ──────────────────────── */

interface DamageResultStepProps {
  damageResult: {
    rolls: number[]
    modifier: number
    total: number
    isCrit: boolean
  }
  selectedWeapon: AttackWeapon
  selectedTarget: MapToken
  damageAppResult: DamageApplicationResult | null
  knockOutPrompt: boolean
  isOffhandAttack: boolean
  masteryEffect: MasteryEffectResult | null
  realWeapons: AttackWeapon[]
  selectedWeaponIndex: number | null
  onApplyDamage: (knockOut?: boolean, startOffhand?: boolean) => void
  setKnockOutPrompt: (v: boolean) => void
  onClose: () => void
}

export function DamageResultStep({
  damageResult,
  selectedWeapon,
  selectedTarget,
  damageAppResult,
  knockOutPrompt,
  isOffhandAttack,
  masteryEffect,
  realWeapons,
  selectedWeaponIndex,
  onApplyDamage,
  setKnockOutPrompt,
  onClose
}: DamageResultStepProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div
        className={`text-center p-4 rounded-lg border ${
          damageResult.isCrit ? 'border-green-500 bg-green-900/20' : 'border-gray-700 bg-gray-800'
        }`}
      >
        <div className="text-xs text-gray-400 mb-1">
          {selectedWeapon.damageType} damage{isOffhandAttack && ' (Off-hand)'}
        </div>
        <div className="text-4xl font-bold font-mono text-red-400 mb-1">{damageResult.total}</div>
        <div className="flex gap-1 justify-center flex-wrap">
          {damageResult.rolls.map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono bg-gray-700 text-gray-300 border border-gray-600"
            >
              {r}
            </span>
          ))}
          {damageResult.modifier !== 0 && (
            <span className="text-xs text-gray-400 self-center ml-1">{formatMod(damageResult.modifier)}</span>
          )}
        </div>
        {damageResult.isCrit && (
          <div className="text-xs text-green-400 font-bold mt-2">Dice doubled for critical hit!</div>
        )}
        {damageAppResult?.modifierDescription && (
          <div className="text-xs text-blue-400 mt-2">{damageAppResult.modifierDescription}</div>
        )}
      </div>

      {/* Massive damage instant death warning */}
      {damageAppResult?.instantDeath && (
        <div className="px-3 py-2 bg-red-900/50 border border-red-500 rounded-lg text-center">
          <span className="text-sm text-red-300 font-bold">INSTANT DEATH</span>
          <p className="text-xs text-red-400 mt-1">
            Remaining damage equals or exceeds HP maximum — creature dies instantly.
          </p>
        </div>
      )}

      {/* Knock-out option (melee attack reducing to 0 HP) */}
      {knockOutPrompt && !damageAppResult?.instantDeath && (
        <div className="px-3 py-2 bg-amber-900/30 border border-amber-500/50 rounded-lg">
          <p className="text-xs text-amber-300 mb-2">
            This melee attack would reduce the target to 0 HP. Knock out instead?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onApplyDamage(true)}
              className="flex-1 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg cursor-pointer"
            >
              Knock Out (1 HP + Unconscious)
            </button>
            <button
              onClick={() => setKnockOutPrompt(false)}
              className="flex-1 px-3 py-1.5 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer"
            >
              Deal Full Damage
            </button>
          </div>
        </div>
      )}

      {/* Weapon Mastery Effect */}
      {masteryEffect && (
        <div className="px-3 py-2 bg-indigo-900/30 border border-indigo-500/50 rounded-lg">
          <div className="text-xs text-indigo-300 font-semibold">{masteryEffect.mastery} Mastery</div>
          <div className="text-[11px] text-gray-300 mt-0.5">{masteryEffect.description}</div>
          {masteryEffect.requiresSave && (
            <div className="text-[10px] text-yellow-400 mt-0.5">
              Target must make a {masteryEffect.requiresSave.ability.toUpperCase()} save (DC{' '}
              {masteryEffect.requiresSave.dc})
            </div>
          )}
        </div>
      )}

      {!knockOutPrompt && (
        <>
          {selectedWeapon.properties?.includes('Light') &&
            !isOffhandAttack &&
            realWeapons.some((w, i) => i !== selectedWeaponIndex && w.properties?.includes('Light')) && (
              <button
                onClick={() => onApplyDamage(false, true)}
                className="w-full px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
              >
                Apply & Off-hand Attack (Light)
              </button>
            )}
          <button
            onClick={() => onApplyDamage()}
            className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
          >
            Apply {damageResult.total} damage to {selectedTarget.label}
            {masteryEffect ? ` + ${masteryEffect.mastery}` : ''}
          </button>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer text-sm"
          >
            Close without applying
          </button>
        </>
      )}
    </div>
  )
}
