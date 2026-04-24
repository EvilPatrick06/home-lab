import { useEffect, useState } from 'react'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'

interface HitPointsBar5eProps {
  character: Character5e
  effectiveCharacter: Character5e
  readonly?: boolean
}

export default function HitPointsBar5e({ character, effectiveCharacter, readonly }: HitPointsBar5eProps): JSX.Element {
  const saveCharacter = useCharacterStore((s) => s.saveCharacter)
  const [editingHP, setEditingHP] = useState(false)
  const [hpCurrent, setHpCurrent] = useState(effectiveCharacter.hitPoints.current)
  const [hpMax, setHpMax] = useState(effectiveCharacter.hitPoints.maximum)
  const [hpTemp, setHpTemp] = useState(effectiveCharacter.hitPoints.temporary)

  useEffect(() => {
    setHpCurrent(effectiveCharacter.hitPoints.current)
    setHpMax(effectiveCharacter.hitPoints.maximum)
    setHpTemp(effectiveCharacter.hitPoints.temporary)
  }, [
    effectiveCharacter.hitPoints.current,
    effectiveCharacter.hitPoints.maximum,
    effectiveCharacter.hitPoints.temporary
  ])

  const saveHP = (): void => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    const updated = {
      ...latest,
      hitPoints: { current: hpCurrent, maximum: Math.max(1, hpMax), temporary: Math.max(0, hpTemp) },
      updatedAt: new Date().toISOString()
    }
    saveCharacter(updated)
    setEditingHP(false)

    const { role, sendMessage } = useNetworkStore.getState()
    if (role === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: updated.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(updated.id, updated as Character)
    }
  }

  return (
    <div
      className={`bg-gray-900/50 border rounded-lg p-3 text-center transition-colors ${
        readonly
          ? 'border-gray-700'
          : editingHP
            ? 'border-amber-500 cursor-pointer'
            : 'border-gray-700 hover:border-gray-500 cursor-pointer'
      }`}
      onClick={readonly ? undefined : () => !editingHP && setEditingHP(true)}
      title={readonly ? undefined : editingHP ? undefined : 'Click to edit HP'}
    >
      <div className="text-xs text-gray-400 uppercase">HP</div>
      {editingHP ? (
        <div className="space-y-1 mt-1">
          <div className="flex items-center justify-center gap-1">
            <input
              type="number"
              value={hpCurrent}
              onChange={(e) => setHpCurrent(parseInt(e.target.value, 10) || 0)}
              className="w-12 bg-gray-800 border border-gray-600 rounded text-center text-sm text-green-400 focus:outline-none focus:border-amber-500"
            />
            <span className="text-gray-500">/</span>
            <input
              type="number"
              value={hpMax}
              onChange={(e) => setHpMax(parseInt(e.target.value, 10) || 0)}
              className="w-12 bg-gray-800 border border-gray-600 rounded text-center text-sm text-green-400 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex items-center justify-center gap-1">
            <span className="text-xs text-gray-500">Temp:</span>
            <input
              type="number"
              value={hpTemp}
              onChange={(e) => setHpTemp(parseInt(e.target.value, 10) || 0)}
              className="w-10 bg-gray-800 border border-gray-600 rounded text-center text-xs text-blue-400 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex gap-1 justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation()
                saveHP()
              }}
              className="px-2 py-0.5 text-xs bg-green-700 hover:bg-green-600 rounded text-white"
            >
              Save
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingHP(false)
              }}
              className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-xl font-bold text-green-400">
            {effectiveCharacter.hitPoints.current + effectiveCharacter.hitPoints.temporary}/
            {effectiveCharacter.hitPoints.maximum}
          </div>
          {effectiveCharacter.hitPoints.temporary > 0 && (
            <div className="text-xs text-blue-400">+{effectiveCharacter.hitPoints.temporary} temp</div>
          )}
          {/* Bloodied indicator */}
          {effectiveCharacter.hitPoints.current > 0 &&
            effectiveCharacter.hitPoints.current <= Math.floor(effectiveCharacter.hitPoints.maximum / 2) && (
              <div className="text-[10px] text-red-500 font-bold uppercase tracking-wider mt-0.5">Bloodied</div>
            )}
          {/* Hit Point Dice */}
          {(() => {
            const remaining = effectiveCharacter.hitDice.reduce((s, h) => s + h.current, 0)
            const total = effectiveCharacter.hitDice.reduce((s, h) => s + h.maximum, 0)
            const isMulticlass = effectiveCharacter.hitDice.length > 1
            const spent = total - remaining
            if (isMulticlass) {
              const diceDisplay = effectiveCharacter.hitDice
                .map((h) => `${h.current}/${h.maximum}d${h.dieType}`)
                .join(' + ')
              return (
                <div className="text-xs text-gray-500 mt-0.5">
                  {remaining}/{total} ({diceDisplay})
                  {spent > 0 && <span className="text-red-400 ml-1">({spent} spent)</span>}
                </div>
              )
            }
            const hitDie = effectiveCharacter.hitDice[0]?.dieType ?? 8
            return (
              <div className="text-xs text-gray-500 mt-0.5">
                {remaining}/{total} d{hitDie}
                {spent > 0 && <span className="text-red-400 ml-1">({spent} spent)</span>}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
