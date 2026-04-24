import { useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import { rollMultiple } from '../../../../services/dice/dice-service'
import { useGameStore } from '../../../../stores/use-game-store'
import type { MapToken } from '../../../../types/map'
import NarrowModalShell from '../shared/NarrowModalShell'

interface FallingDamageModalProps {
  tokens: MapToken[]
  onClose: () => void
  onApplyDamage: (targetTokenId: string, damage: number) => void
  onBroadcastResult: (message: string) => void
}

export default function FallingDamageModal({
  tokens,
  onClose,
  onApplyDamage,
  onBroadcastResult
}: FallingDamageModalProps): JSX.Element {
  const [height, setHeight] = useState(20)
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [result, setResult] = useState<{ rolls: number[]; total: number } | null>(null)

  const addCondition = useGameStore((s) => s.addCondition)
  const round = useGameStore((s) => s.round)
  const maps = useGameStore((s) => s.maps)
  const activeMapId = useGameStore((s) => s.activeMapId)
  const updateToken = useGameStore((s) => s.updateToken)
  const selectedToken = selectedTokenId ? tokens.find((t) => t.id === selectedTokenId) : null

  // 1d6 per 10ft, max 20d6
  const diceCount = Math.min(20, Math.floor(height / 10))

  const handleRoll = (): void => {
    if (!selectedToken || diceCount <= 0) return
    const rolls = rollMultiple(diceCount, 6)
    const total = rolls.reduce((s, r) => s + r, 0)
    trigger3dDice({ formula: `${diceCount}d6`, rolls, total, rollerName: 'DM' })
    setResult({ rolls, total })
  }

  const handleApply = (): void => {
    if (!selectedToken || !result) return

    onApplyDamage(selectedToken.id, result.total)

    // Apply Prone condition
    addCondition({
      id: `cond-${Date.now()}`,
      entityId: selectedToken.entityId,
      entityName: selectedToken.label,
      condition: 'Prone',
      duration: 'permanent',
      source: `Falling ${height} ft`,
      appliedRound: round
    })

    // Reset elevation to 0 after falling
    const activeMap = maps.find((m) => m.id === activeMapId)
    if (activeMap && selectedToken.elevation) {
      updateToken(activeMap.id, selectedToken.id, { elevation: 0 })
    }

    onBroadcastResult(
      `${selectedToken.label} falls ${height} ft! Takes ${result.total} bludgeoning damage and is knocked Prone.`
    )
    onClose()
  }

  return (
    <NarrowModalShell title="Falling Damage" onClose={onClose}>
      {/* Height slider */}
      <div className="mb-4">
        <label className="text-xs text-gray-400">
          Fall Height: <span className="text-white font-bold">{height} ft</span>
        </label>
        <input
          type="range"
          min={10}
          max={200}
          step={10}
          value={height}
          onChange={(e) => {
            setHeight(parseInt(e.target.value, 10))
            setResult(null)
          }}
          className="w-full mt-1 accent-amber-600"
        />
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>10 ft</span>
          <span>200 ft</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">Damage: {diceCount}d6 bludgeoning + Prone</div>
      </div>

      {/* Target selection */}
      <div className="mb-4">
        <span className="text-xs text-gray-400">Target:</span>
        <div className="space-y-1 mt-1 max-h-32 overflow-y-auto">
          {tokens.map((token) => (
            <button
              key={token.id}
              onClick={() => {
                setSelectedTokenId(token.id)
                setResult(null)
                // Auto-populate height from token elevation
                if (token.elevation && token.elevation > 0) {
                  setHeight(token.elevation)
                }
              }}
              className={`w-full text-left px-3 py-1.5 border rounded-lg cursor-pointer ${
                selectedTokenId === token.id
                  ? 'bg-amber-900/30 border-amber-500'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-700'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-200">
                  {token.label}
                  {token.elevation ? (
                    <span className="text-blue-400 ml-1 text-xs">({token.elevation}ft up)</span>
                  ) : null}
                </span>
                {token.currentHP != null && (
                  <span className="text-xs text-gray-500">
                    HP: {token.currentHP}/{token.maxHP}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {!result ? (
        <button
          onClick={handleRoll}
          disabled={!selectedToken || diceCount <= 0}
          className="w-full px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Roll {diceCount}d6 Falling Damage
        </button>
      ) : (
        <div className="space-y-3">
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <div className="text-xs text-gray-400 mb-1">Bludgeoning Damage</div>
            <div className="text-3xl font-bold text-red-400 font-mono mb-1">{result.total}</div>
            <div className="flex gap-1 justify-center flex-wrap">
              {result.rolls.map((r, i) => (
                <span
                  key={i}
                  className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono bg-gray-700 text-gray-300 border border-gray-600"
                >
                  {r}
                </span>
              ))}
            </div>
            <div className="text-xs text-orange-400 mt-2">+ Prone condition</div>
          </div>
          <button
            onClick={handleApply}
            className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
          >
            Apply {result.total} damage + Prone to {selectedToken?.label}
          </button>
        </div>
      )}

      <div className="text-[10px] text-gray-600 mt-2">
        Water landing: Reaction for DC 15 STR(Athletics) or DEX(Acrobatics) = half damage.
      </div>
    </NarrowModalShell>
  )
}
