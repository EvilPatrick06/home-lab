import { getMasteryDescription, type MasteryProperty } from '../../../../data/weapon-mastery'

type _MasteryProperty = MasteryProperty

import { formatMod } from '../../../../types/character-common'
import type { AttackWeapon, UnarmedMode } from './attack-utils'

/* ──────────────────────── Step 1: Weapon Selection ──────────────────────── */

interface WeaponSelectionStepProps {
  weapons: AttackWeapon[]
  realWeapons: AttackWeapon[]
  character: { abilityScores: { strength: number } }
  strMod: number
  getAttackMod: () => number
  isOffhandAttack: boolean
  primaryWeaponIndex: number | null
  masteryChoices?: string[]
  onSelectWeapon: (index: number) => void
  onSelectUnarmed: (index: number) => void
}

export function WeaponSelectionStep({
  weapons,
  realWeapons: _realWeapons,
  character: _character,
  strMod,
  getAttackMod,
  isOffhandAttack,
  primaryWeaponIndex,
  masteryChoices,
  onSelectWeapon,
  onSelectUnarmed
}: WeaponSelectionStepProps): JSX.Element {
  return (
    <div className="space-y-2">
      {isOffhandAttack && (
        <div className="text-xs text-cyan-400 bg-cyan-900/20 border border-cyan-700/40 rounded-lg px-3 py-1.5">
          Off-hand Attack — choose a different Light weapon (ability modifier not added to damage)
        </div>
      )}
      {weapons.map((w, i) => {
        if (isOffhandAttack && (i === primaryWeaponIndex || !w.properties?.includes('Light'))) return null
        const isUnarmedEntry = w.id === '__unarmed__'
        const isImprovisedEntry = w.id === '__improvised__'
        return (
          <button
            key={w.id || i}
            onClick={() => {
              if (isUnarmedEntry) {
                onSelectUnarmed(i)
              } else {
                onSelectWeapon(i)
              }
            }}
            className={`w-full text-left px-3 py-2 border rounded-lg cursor-pointer ${
              isUnarmedEntry || isImprovisedEntry
                ? 'bg-gray-800/50 hover:bg-gray-700 border-gray-600 border-dashed'
                : 'bg-gray-800 hover:bg-gray-700 border-gray-700'
            }`}
          >
            <div className="flex justify-between">
              <span className="text-sm font-semibold text-gray-200">{w.name}</span>
              {isUnarmedEntry ? (
                <span className="text-xs text-amber-400 font-mono">3 modes</span>
              ) : (
                <span className="text-xs text-amber-400 font-mono">
                  {isImprovisedEntry ? `${formatMod(strMod)} to hit` : `${formatMod(getAttackMod())} to hit`}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {isUnarmedEntry ? (
                `1 + STR mod (${Math.max(1, 1 + strMod)}) bludgeoning / Grapple / Shove`
              ) : isImprovisedEntry ? (
                '1d4 bludgeoning (no proficiency)'
              ) : (
                <>
                  {w.damage} {w.damageType}
                  {w.range && <span className="ml-2 text-gray-500">Range: {w.range}</span>}
                  {w.properties?.length > 0 && <span className="ml-2 text-gray-500">{w.properties.join(', ')}</span>}
                </>
              )}
            </div>
            {w.mastery && masteryChoices?.includes(w.mastery) && (
              <div className="text-[10px] text-purple-300 mt-0.5">
                Mastery: {w.mastery} — {getMasteryDescription(w.mastery)}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ──────────────────────── Step 1b: Unarmed Mode ──────────────────────── */

interface UnarmedModeStepProps {
  strMod: number
  unarmedStrikeDC: number
  onSelectMode: (mode: UnarmedMode) => void
  onBack: () => void
}

export function UnarmedModeStep({ strMod, unarmedStrikeDC, onSelectMode, onBack }: UnarmedModeStepProps): JSX.Element {
  return (
    <div className="space-y-2">
      <button
        onClick={() => onSelectMode('damage')}
        className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg cursor-pointer"
      >
        <div className="text-sm font-semibold text-gray-200">Damage</div>
        <div className="text-xs text-gray-400">
          Attack roll (STR + PB). Hit: {Math.max(1, 1 + strMod)} bludgeoning damage.
        </div>
      </button>
      <button
        onClick={() => onSelectMode('grapple')}
        className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-blue-700/50 rounded-lg cursor-pointer"
      >
        <div className="text-sm font-semibold text-blue-300">Grapple</div>
        <div className="text-xs text-gray-400">
          Target within 5ft, max 1 size larger. Target STR/DEX save vs DC {unarmedStrikeDC}.
          <span className="text-yellow-400 ml-1">Requires free hand.</span>
        </div>
      </button>
      <button
        onClick={() => onSelectMode('shove')}
        className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-orange-700/50 rounded-lg cursor-pointer"
      >
        <div className="text-sm font-semibold text-orange-300">Shove</div>
        <div className="text-xs text-gray-400">
          Target within 5ft, max 1 size larger. Target STR/DEX save vs DC {unarmedStrikeDC}. On fail: push 5ft OR knock
          Prone.
        </div>
      </button>
      <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
        Back
      </button>
    </div>
  )
}
