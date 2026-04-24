import { useCallback, useEffect, useState } from 'react'
import { CONDITIONS_5E } from '../../../data/conditions'
import type { ResolvedEffects } from '../../../services/combat/effect-resolver-5e'
import { rollSingle } from '../../../services/dice/dice-service'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useGameStore } from '../../../stores/use-game-store'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { CustomEffect, EffectSource } from '../../../types/effects'
import type { EntityCondition, TurnState } from '../../../types/game-state'

/* ------------------------------------------------------------------ */
/*  Collapsed badges (conditions, effects, bloodied, environment)     */
/* ------------------------------------------------------------------ */

interface PlayerHUDEffectsProps {
  characterId: string
  char5e: Character5e | null
  conditions: EntityCondition[]
  resolved: ResolvedEffects | null
  bloodied: boolean
  underwaterCombat: boolean
  ambientLight: string
  travelPace: string | null
}

export default function PlayerHUDEffects({
  characterId,
  char5e,
  conditions,
  resolved,
  bloodied,
  underwaterCombat,
  ambientLight,
  travelPace
}: PlayerHUDEffectsProps): JSX.Element {
  const [showConditionPicker, setShowConditionPicker] = useState(false)
  const [conditionNames, setConditionNames] = useState<string[]>(() => CONDITIONS_5E.map((c) => c.name))

  useEffect(() => {
    if (CONDITIONS_5E.length > 0 && conditionNames.length === 0) {
      setConditionNames(CONDITIONS_5E.map((c) => c.name))
    }
    const timer = setTimeout(() => {
      if (CONDITIONS_5E.length > 0) {
        setConditionNames(CONDITIONS_5E.map((c) => c.name))
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [conditionNames.length])

  const addConditionFromPicker = useCallback(
    (condName: string) => {
      useGameStore.getState().addCondition({
        id: `cond-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
        entityId: characterId,
        entityName: char5e?.name ?? '',
        condition: condName,
        duration: 'permanent',
        source: 'Self',
        appliedRound: useGameStore.getState().round
      })
      setShowConditionPicker(false)
    },
    [characterId, char5e?.name]
  )

  const removeCondition = useCallback((condId: string) => {
    useGameStore.getState().removeCondition(condId)
  }, [])

  return (
    <>
      {/* Conditions */}
      {conditions.length > 0 && (
        <div className="flex gap-0.5 flex-wrap">
          {conditions.map((cond) => (
            <span
              key={cond.id}
              className="text-[9px] bg-purple-600/30 text-purple-300 border border-purple-500/50 rounded px-1 py-0.5 flex items-center gap-0.5"
            >
              {cond.condition}
              {cond.value ? ` ${cond.value}` : ''}
              <button
                onClick={() => removeCondition(cond.id)}
                className="text-purple-400 hover:text-red-400 cursor-pointer"
                title="Remove condition"
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add condition button */}
      <div className="relative">
        <button
          onClick={() => setShowConditionPicker(!showConditionPicker)}
          className="text-[9px] text-gray-500 hover:text-purple-400 cursor-pointer border border-gray-700 rounded px-1 py-0.5"
          title="Add condition"
        >
          +Cond
        </button>
        {showConditionPicker && (
          <div className="absolute top-full mt-1 left-0 z-20 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto w-36">
            {conditionNames.map((name) => (
              <button
                key={name}
                onClick={() => addConditionFromPicker(name)}
                className="w-full text-left px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-800 cursor-pointer"
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active Effects (magic items, custom effects) */}
      {resolved && resolved.sources.length > 0 && (
        <div className="flex gap-0.5 flex-wrap">
          {resolved.sources
            .filter((s: EffectSource) => s.sourceType === 'custom' || s.sourceType === 'magic-item')
            .map((s: EffectSource) => {
              const bonuses: string[] = []
              for (const e of s.effects) {
                if (e.type === 'ac_bonus' && e.value) bonuses.push(`AC ${e.value > 0 ? '+' : ''}${e.value}`)
                else if (e.type === 'attack_bonus' && e.value) bonuses.push(`Atk ${e.value > 0 ? '+' : ''}${e.value}`)
                else if (e.type === 'damage_bonus' && e.value) bonuses.push(`Dmg ${e.value > 0 ? '+' : ''}${e.value}`)
                else if (e.type === 'save_bonus' && e.value) bonuses.push(`Save ${e.value > 0 ? '+' : ''}${e.value}`)
                else if (e.type === 'resistance' && e.stringValue) bonuses.push(`Res: ${e.stringValue}`)
                else if (e.type === 'temp_hp' && e.value) bonuses.push(`THP ${e.value}`)
              }
              const color =
                s.sourceType === 'custom'
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                  : 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
              return (
                <span
                  key={s.sourceId}
                  className={`text-[9px] ${color} border rounded px-1 py-0.5`}
                  title={bonuses.length > 0 ? bonuses.join(', ') : s.sourceName}
                >
                  {s.sourceName}
                </span>
              )
            })}
        </div>
      )}

      {/* Bloodied */}
      {bloodied && (
        <span className="text-[9px] bg-red-600/30 text-red-300 border border-red-500/50 rounded px-1 py-0.5">
          Bloodied
        </span>
      )}

      {/* Environment indicators */}
      {underwaterCombat && (
        <span className="text-[9px] bg-blue-600/30 text-blue-300 border border-blue-500/50 rounded px-1 py-0.5">
          Underwater
        </span>
      )}
      {ambientLight !== 'bright' && (
        <span
          className={`text-[9px] rounded px-1 py-0.5 ${
            ambientLight === 'dim'
              ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
              : 'bg-gray-600/30 text-gray-300 border border-gray-500/50'
          }`}
        >
          {ambientLight === 'dim' ? 'Dim Light' : 'Darkness'}
        </span>
      )}
      {travelPace && (
        <span
          className={`text-[9px] rounded px-1 py-0.5 ${
            travelPace === 'fast'
              ? 'bg-red-600/20 text-red-300 border border-red-500/30'
              : travelPace === 'slow'
                ? 'bg-green-600/20 text-green-300 border border-green-500/30'
                : 'bg-gray-600/20 text-gray-300 border border-gray-500/30'
          }`}
        >
          {travelPace.charAt(0).toUpperCase() + travelPace.slice(1)} Pace
        </span>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Expanded effects panel (death saves, resistances, custom effects)  */
/* ------------------------------------------------------------------ */

interface PlayerHUDEffectsExpandedProps {
  char5e: Character5e
  hpCurrent: number
  resolved: ResolvedEffects | null
  myCustomEffects: CustomEffect[]
  turnState: TurnState | undefined
  saveAndBroadcast: (updated: Character5e) => void
}

export function PlayerHUDEffectsExpanded({
  char5e,
  hpCurrent,
  resolved,
  myCustomEffects,
  turnState,
  saveAndBroadcast
}: PlayerHUDEffectsExpandedProps): JSX.Element {
  const [deathSaveResult, setDeathSaveResult] = useState<{ roll: number; message: string } | null>(null)

  const toggleDeathSave = useCallback(
    (type: 'successes' | 'failures') => {
      const latest = useCharacterStore.getState().characters.find((c) => c.id === char5e.id) as Character5e | undefined
      if (!latest || !is5eCharacter(latest)) return

      const current = latest.deathSaves[type]
      const newVal = current >= 3 ? 0 : current + 1
      const updated: Character5e = {
        ...latest,
        deathSaves: { ...latest.deathSaves, [type]: newVal },
        updatedAt: new Date().toISOString()
      }

      if (type === 'successes' && newVal >= 3) {
        useGameStore.getState().addCondition({
          id: `cond-${Date.now()}`,
          entityId: latest.id,
          entityName: latest.name,
          condition: 'Stable',
          duration: 'permanent',
          source: 'Death Saves',
          appliedRound: useGameStore.getState().round
        })
      }

      saveAndBroadcast(updated)
    },
    [char5e, saveAndBroadcast]
  )

  const rollDeathSave = useCallback(() => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === char5e.id) as Character5e | undefined
    if (!latest || !is5eCharacter(latest)) return

    const roll = rollSingle(20)

    if (roll === 20) {
      const updated: Character5e = {
        ...latest,
        hitPoints: { ...latest.hitPoints, current: 1 },
        deathSaves: { successes: 0, failures: 0 },
        updatedAt: new Date().toISOString()
      }
      saveAndBroadcast(updated)
      setDeathSaveResult({ roll, message: 'Natural 20! Regain 1 HP!' })
      return
    }

    let newSuccesses = latest.deathSaves.successes
    let newFailures = latest.deathSaves.failures
    let message: string

    if (roll === 1) {
      newFailures = Math.min(3, newFailures + 2)
      message = `Natural 1! Two failures (${newFailures}/3)`
    } else if (roll >= 10) {
      newSuccesses = Math.min(3, newSuccesses + 1)
      message = `Rolled ${roll} — Success (${newSuccesses}/3)`
    } else {
      newFailures = Math.min(3, newFailures + 1)
      message = `Rolled ${roll} — Failure (${newFailures}/3)`
    }

    const updated: Character5e = {
      ...latest,
      deathSaves: { successes: newSuccesses, failures: newFailures },
      updatedAt: new Date().toISOString()
    }

    if (newSuccesses >= 3) {
      useGameStore.getState().addCondition({
        id: `cond-${Date.now()}`,
        entityId: latest.id,
        entityName: latest.name,
        condition: 'Stable',
        duration: 'permanent',
        source: 'Death Saves',
        appliedRound: useGameStore.getState().round
      })
      message += ' — Stabilized!'
    }

    if (newFailures >= 3) {
      message = `${latest.name} has died! (3 death save failures)`
    }

    saveAndBroadcast(updated)
    setDeathSaveResult({ roll, message })
  }, [char5e, saveAndBroadcast])

  const dropConcentration = useCallback(() => {
    useGameStore.getState().setConcentrating(char5e.id, undefined)
  }, [char5e.id])

  return (
    <>
      {/* Death Saves */}
      <div className="flex items-center gap-3">
        <span className="text-[9px] text-gray-500 uppercase tracking-wider">Death Saves:</span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-green-400">S</span>
          {[0, 1, 2].map((i) => (
            <button
              key={`s-${i}`}
              onClick={() => toggleDeathSave('successes')}
              className={`w-3 h-3 rounded-full border cursor-pointer ${
                i < char5e.deathSaves.successes ? 'bg-green-500 border-green-400' : 'bg-gray-700 border-gray-600'
              }`}
            />
          ))}
          <span className="text-gray-600 mx-1">|</span>
          <span className="text-[9px] text-red-400">F</span>
          {[0, 1, 2].map((i) => (
            <button
              key={`f-${i}`}
              onClick={() => toggleDeathSave('failures')}
              className={`w-3 h-3 rounded-full border cursor-pointer ${
                i < char5e.deathSaves.failures ? 'bg-red-500 border-red-400' : 'bg-gray-700 border-gray-600'
              }`}
            />
          ))}
        </div>
        {hpCurrent <= 0 && char5e.deathSaves.failures < 3 && (
          <button
            onClick={rollDeathSave}
            className="text-[9px] px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 rounded cursor-pointer"
          >
            Roll Death Save
          </button>
        )}
      </div>
      {deathSaveResult && (
        <div
          className={`text-[10px] px-2 py-1 rounded flex items-center justify-between ${
            deathSaveResult.roll === 20
              ? 'text-green-300 bg-green-900/30 border border-green-700/50'
              : deathSaveResult.roll === 1
                ? 'text-red-300 bg-red-900/30 border border-red-700/50'
                : deathSaveResult.roll >= 10
                  ? 'text-green-300 bg-green-900/20'
                  : 'text-red-300 bg-red-900/20'
          }`}
        >
          <span>
            d20: {deathSaveResult.roll} — {deathSaveResult.message}
          </span>
          <button
            onClick={() => setDeathSaveResult(null)}
            className="text-gray-500 hover:text-gray-300 ml-2 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Active Effects Summary */}
      {resolved &&
        (resolved.resistances.length > 0 || resolved.immunities.length > 0 || resolved.vulnerabilities.length > 0) && (
          <div className="space-y-0.5">
            {resolved.resistances.length > 0 && (
              <div className="text-[10px]">
                <span className="text-gray-500">Resist:</span>{' '}
                <span className="text-green-400">{resolved.resistances.join(', ')}</span>
              </div>
            )}
            {resolved.immunities.length > 0 && (
              <div className="text-[10px]">
                <span className="text-gray-500">Immune:</span>{' '}
                <span className="text-cyan-400">{resolved.immunities.join(', ')}</span>
              </div>
            )}
            {resolved.vulnerabilities.length > 0 && (
              <div className="text-[10px]">
                <span className="text-gray-500">Vulnerable:</span>{' '}
                <span className="text-red-400">{resolved.vulnerabilities.join(', ')}</span>
              </div>
            )}
          </div>
        )}

      {/* Custom Effects with Durations */}
      {myCustomEffects.length > 0 && (
        <div>
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Active Effects</span>
          <div className="space-y-0.5 mt-0.5">
            {myCustomEffects.map((ce) => (
              <div key={ce.id} className="flex items-center gap-1.5 text-[10px]">
                <span className="text-indigo-300 font-medium">{ce.name}</span>
                {ce.duration && (
                  <span className="text-gray-600">
                    ({ce.duration.value} {ce.duration.type})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concentration */}
      {turnState?.concentratingSpell && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-purple-400">Concentrating:</span>
          <span className="text-[10px] text-purple-300 font-semibold">{turnState.concentratingSpell}</span>
          <button
            onClick={dropConcentration}
            className="text-[9px] text-red-400 hover:text-red-300 cursor-pointer"
            title="Drop concentration"
          >
            (drop)
          </button>
        </div>
      )}
    </>
  )
}
