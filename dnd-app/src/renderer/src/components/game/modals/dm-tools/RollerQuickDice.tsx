import { useCallback, useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import type { DiceRollHiddenPayload } from '../../../../network'
import { useNetworkStore } from '../../../../stores/use-network-store'
import { rollDice } from '../../../../utils/dice-utils'

export interface QuickRollResult {
  id: string
  formula: string
  rolls: number[]
  total: number
  label: string
  hidden: boolean
  timestamp: number
}

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const

interface RollerQuickDiceProps {
  autoMinimize: () => void
  onRevealQuickResult: (qr: QuickRollResult) => void
}

export default function RollerQuickDice({ autoMinimize, onRevealQuickResult }: RollerQuickDiceProps): JSX.Element {
  const [quickExpression, setQuickExpression] = useState('')
  const [quickCount, setQuickCount] = useState(1)
  const [quickHiddenDefault, setQuickHiddenDefault] = useState(true)
  const [quickResults, setQuickResults] = useState<QuickRollResult[]>([])
  const [quickLabel, setQuickLabel] = useState('')

  const sendMessage = useNetworkStore((s) => s.sendMessage)

  const handleQuickDie = useCallback(
    (die: string) => {
      const results: QuickRollResult[] = []
      for (let i = 0; i < quickCount; i++) {
        const result = rollDice(`1${die}`)
        if (result) {
          const qrFormula = quickCount > 1 ? `1${die} (#${i + 1})` : `1${die}`
          results.push({
            id: `qr-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
            formula: qrFormula,
            rolls: result.rolls,
            total: result.total,
            label: quickLabel || die,
            hidden: quickHiddenDefault,
            timestamp: Date.now()
          })
          autoMinimize()
          trigger3dDice({ formula: `1${die}`, rolls: result.rolls, total: result.total, rollerName: 'DM' })
          if (quickHiddenDefault) {
            const hiddenPayload: DiceRollHiddenPayload = {
              formula: `1${die}`,
              diceCount: 1,
              dieSides: [parseInt(die.slice(1), 10)],
              rollerName: 'DM'
            }
            sendMessage('game:dice-roll-hidden', hiddenPayload)
          }
        }
      }
      setQuickResults((prev) => [...results, ...prev].slice(0, 50))
    },
    [quickCount, quickHiddenDefault, quickLabel, autoMinimize, sendMessage]
  )

  const handleQuickExpression = useCallback(() => {
    const expr = quickExpression.trim()
    if (!expr) return
    const results: QuickRollResult[] = []
    for (let i = 0; i < quickCount; i++) {
      const result = rollDice(expr)
      if (result) {
        results.push({
          id: `qr-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
          formula: quickCount > 1 ? `${expr} (#${i + 1})` : expr,
          rolls: result.rolls,
          total: result.total,
          label: quickLabel || expr,
          hidden: quickHiddenDefault,
          timestamp: Date.now()
        })
        autoMinimize()
        trigger3dDice({ formula: expr, rolls: result.rolls, total: result.total, rollerName: 'DM' })
        if (quickHiddenDefault) {
          const diceMatch = expr.match(/(\d*)d(\d+)/)
          const sides = diceMatch ? [parseInt(diceMatch[2], 10)] : [20]
          const hiddenPayload: DiceRollHiddenPayload = {
            formula: expr,
            diceCount: result.rolls.length,
            dieSides: sides,
            rollerName: 'DM'
          }
          sendMessage('game:dice-roll-hidden', hiddenPayload)
        }
      }
    }
    if (results.length > 0) {
      setQuickResults((prev) => [...results, ...prev].slice(0, 50))
    }
  }, [quickExpression, quickCount, quickHiddenDefault, quickLabel, autoMinimize, sendMessage])

  return (
    <div className="border-b border-gray-700/50 pb-3 mb-3 space-y-2">
      <div className="text-[9px] text-gray-500 uppercase tracking-wider">Quick Roll</div>
      {/* Dice buttons row */}
      <div className="flex items-center gap-1 flex-wrap">
        {QUICK_DICE.map((die) => (
          <button
            key={die}
            onClick={() => handleQuickDie(die)}
            className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-300 hover:bg-amber-600/40 hover:text-amber-300 transition-colors cursor-pointer border border-gray-700"
          >
            {die}
          </button>
        ))}
      </div>
      {/* Custom expression + count + label */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={quickExpression}
          onChange={(e) => setQuickExpression(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleQuickExpression()
          }}
          placeholder="2d6+3"
          className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
        <label className="flex items-center gap-1 text-[10px] text-gray-500 shrink-0">
          <span>x</span>
          <input
            type="number"
            min={1}
            max={10}
            value={quickCount}
            onChange={(e) => setQuickCount(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
            className="w-10 px-1 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 text-center focus:outline-none focus:border-amber-500"
          />
        </label>
        <input
          type="text"
          value={quickLabel}
          onChange={(e) => setQuickLabel(e.target.value)}
          placeholder="Label"
          className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
        <button
          onClick={handleQuickExpression}
          disabled={!quickExpression.trim()}
          className="px-2 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Roll
        </button>
      </div>
      {/* Hidden toggle */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={quickHiddenDefault}
            onChange={(e) => setQuickHiddenDefault(e.target.checked)}
            className="rounded accent-purple-500"
          />
          Hidden by default
        </label>
      </div>
      {/* Quick roll results */}
      {quickResults.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {quickResults.map((qr) => (
            <div key={qr.id} className="flex items-center gap-2 bg-gray-800/50 rounded px-2 py-1">
              <span className="text-[10px] text-gray-400">{qr.formula}:</span>
              <span className="text-xs text-gray-300">[{qr.rolls.join(', ')}]</span>
              <span className="text-xs text-amber-300 font-bold">= {qr.total}</span>
              {qr.label && qr.label !== qr.formula.replace(/ \(#\d+\)$/, '') && (
                <span className="text-[9px] text-gray-500">({qr.label})</span>
              )}
              <span className="ml-auto flex gap-1">
                <button
                  onClick={() => onRevealQuickResult(qr)}
                  className="text-[8px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded cursor-pointer hover:bg-green-600/50"
                >
                  Reveal
                </button>
                {qr.hidden && (
                  <span className="text-[8px] px-1 py-0.5 bg-gray-700/50 text-gray-500 rounded">Hidden</span>
                )}
              </span>
            </div>
          ))}
          <button
            onClick={() => setQuickResults([])}
            className="text-[9px] text-gray-600 hover:text-red-400 cursor-pointer"
          >
            Clear Quick Rolls
          </button>
        </div>
      )}
    </div>
  )
}
