import { useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'
import DiceResult from '../../dice3d/DiceResult'

interface HiddenDiceModalProps {
  onClose: () => void
}

function parseDiceFormula(formula: string): { count: number; sides: number; modifier: number } | null {
  const match = formula.trim().match(/^(\d*)d(\d+)([+-]\d+)?$/)
  if (!match) return null
  return {
    count: match[1] ? parseInt(match[1], 10) : 1,
    sides: parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0
  }
}

export default function HiddenDiceModal({ onClose }: HiddenDiceModalProps): JSX.Element {
  const [formula, setFormula] = useState('1d20')
  const hiddenDiceResults = useGameStore((s) => s.hiddenDiceResults)
  const addHiddenDiceResult = useGameStore((s) => s.addHiddenDiceResult)
  const clearHiddenDiceResults = useGameStore((s) => s.clearHiddenDiceResults)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)

  const handleRoll = (): void => {
    const parsed = parseDiceFormula(formula)
    if (!parsed) return

    const rolls: number[] = []
    for (let i = 0; i < parsed.count; i++) {
      rolls.push(Math.floor(Math.random() * parsed.sides) + 1)
    }
    const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier

    addHiddenDiceResult({
      id: crypto.randomUUID(),
      formula,
      rolls,
      total,
      timestamp: Date.now()
    })
  }

  const handleReveal = (result: { formula: string; rolls: number[]; total: number }): void => {
    addChatMessage({
      id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'dm',
      senderName: 'DM',
      content: `rolled ${result.formula}`,
      timestamp: Date.now(),
      isSystem: false,
      isDiceRoll: true,
      diceResult: result
    })
  }

  const QUICK_DICE = ['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '2d6', '1d100']

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-purple-300">Hidden Dice (DM Only)</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Quick dice */}
        <div className="flex flex-wrap gap-1 mb-3">
          {QUICK_DICE.map((d) => (
            <button
              key={d}
              onClick={() => setFormula(d)}
              className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
                formula === d
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Custom formula + roll */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRoll()
            }}
            className="flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-xs focus:outline-none focus:border-purple-500"
            placeholder="e.g. 2d6+3"
          />
          <button
            onClick={handleRoll}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer"
          >
            Roll
          </button>
        </div>

        {/* Results */}
        <div className="max-h-48 overflow-y-auto space-y-2">
          {hiddenDiceResults.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-3">No hidden rolls yet</p>
          ) : (
            hiddenDiceResults
              .slice()
              .reverse()
              .map((result) => (
                <div key={result.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <DiceResult
                      formula={result.formula}
                      rolls={result.rolls}
                      total={result.total}
                      rollerName="DM (Hidden)"
                    />
                  </div>
                  <button
                    onClick={() => handleReveal(result)}
                    className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-amber-600/30 text-gray-400 hover:text-amber-300 rounded transition-colors cursor-pointer shrink-0"
                  >
                    Reveal
                  </button>
                </div>
              ))
          )}
        </div>

        {hiddenDiceResults.length > 0 && (
          <button
            onClick={clearHiddenDiceResults}
            className="mt-2 text-[10px] text-gray-500 hover:text-red-400 cursor-pointer"
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  )
}
