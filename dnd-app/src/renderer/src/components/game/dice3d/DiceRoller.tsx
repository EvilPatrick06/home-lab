import diceTypesJson from '@data/5e/game/mechanics/dice-types.json'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { load5eDiceTypes } from '../../../services/data-provider'
import { parseDiceFormula, rollDice } from '../../../services/dice/dice-engine'
import { play, playDiceSound } from '../../../services/sound-manager'
import type { GameSystem } from '../../../types/game-system'
import DiceResult from './DiceResult'

const DiceHistory = lazy(() => import('./DiceHistory'))

interface DiceRollerProps {
  system: GameSystem
  rollerName: string
  onRoll?: (result: { formula: string; total: number; rolls: number[] }) => void
  allowCritDoubling?: boolean
}

/** Load dice type definitions from the data store (includes plugin dice). */
export async function loadDiceTypeData(): Promise<unknown> {
  return load5eDiceTypes()
}

interface RollResult {
  id: string
  formula: string
  total: number
  rolls: number[]
  rollerName: string
  dieSides: number
  timestamp: number
  isCritDamage?: boolean
}

const DICE = diceTypesJson

export default function DiceRoller({
  system,
  rollerName,
  onRoll,
  allowCritDoubling = true
}: DiceRollerProps): JSX.Element {
  const [modifier, setModifier] = useState(0)
  const [customFormula, setCustomFormula] = useState('')
  const [advantage, setAdvantage] = useState<'normal' | 'advantage' | 'disadvantage'>('normal')
  const [results, setResults] = useState<RollResult[]>([])
  const [animatingId, setAnimatingId] = useState<string | null>(null)
  const [lastRollWasCrit, setLastRollWasCrit] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const animatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (animatingTimeoutRef.current) clearTimeout(animatingTimeoutRef.current)
    }
  }, [])

  const addResult = (formula: string, rolls: number[], total: number, sides: number, isCritDamage = false): void => {
    const id = `roll-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`
    const result: RollResult = {
      id,
      formula,
      total,
      rolls,
      rollerName,
      dieSides: sides,
      timestamp: Date.now(),
      isCritDamage
    }
    setResults((prev) => [result, ...prev].slice(0, 20))
    setAnimatingId(id)
    if (animatingTimeoutRef.current) clearTimeout(animatingTimeoutRef.current)
    animatingTimeoutRef.current = setTimeout(() => {
      animatingTimeoutRef.current = null
      setAnimatingId(null)
    }, 500)
    onRoll?.({ formula, total, rolls })

    // Sound effects
    playDiceSound(sides)
    if (sides === 20 && rolls.length === 1 && rolls[0] === 20) play('nat-20')
    else if (sides === 20 && rolls.length === 1 && rolls[0] === 1) play('nat-1')
  }

  const handleQuickRoll = (sides: number): void => {
    // If last roll was a crit and this is a damage die (not d20), double the dice
    if (lastRollWasCrit && sides !== 20) {
      const rolls = rollDice(2, sides) // Double dice for crit
      const total = rolls.reduce((s, r) => s + r, 0) + modifier
      const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''
      addResult(`2d${sides}${modStr} (CRIT)`, rolls, total, sides, true)
      setLastRollWasCrit(false)
      return
    }

    if (sides === 20 && system === 'dnd5e' && advantage !== 'normal') {
      // Roll with advantage/disadvantage
      const roll1 = rollDice(1, 20)
      const roll2 = rollDice(1, 20)
      const allRolls = [...roll1, ...roll2]
      const chosen = advantage === 'advantage' ? Math.max(roll1[0], roll2[0]) : Math.min(roll1[0], roll2[0])
      const total = chosen + modifier
      const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''
      const advLabel = advantage === 'advantage' ? ' (Adv)' : ' (Dis)'
      addResult(`1d20${modStr}${advLabel}`, allRolls, total, sides)
      // Check for crit on the chosen die
      setLastRollWasCrit(chosen === 20)
      return
    }

    const rolls = rollDice(1, sides)
    const total = rolls[0] + modifier
    const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''
    addResult(`1d${sides}${modStr}`, rolls, total, sides)

    // Track if this d20 was a natural 20
    if (sides === 20) {
      setLastRollWasCrit(rolls[0] === 20)
    }
  }

  const handleCustomRoll = (): void => {
    const parsed = parseDiceFormula(customFormula)
    if (!parsed) return

    const diceCount = allowCritDoubling && lastRollWasCrit && parsed.sides !== 20 ? parsed.count * 2 : parsed.count
    const isCritDamage = allowCritDoubling && lastRollWasCrit && parsed.sides !== 20

    const rolls = rollDice(diceCount, parsed.sides)
    const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier + modifier
    const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''
    const critLabel = isCritDamage ? ' (CRIT)' : ''
    const formulaDisplay = isCritDamage
      ? `${diceCount}d${parsed.sides}${parsed.modifier ? (parsed.modifier > 0 ? `+${parsed.modifier}` : parsed.modifier) : ''}${modStr}${critLabel}`
      : `${customFormula}${modStr}`
    addResult(formulaDisplay, rolls, total, parsed.sides, isCritDamage)
    setCustomFormula('')
    if (isCritDamage) setLastRollWasCrit(false)
  }

  return (
    <div className="space-y-3">
      {/* History toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="px-2 py-1 text-[10px] rounded transition-colors cursor-pointer bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
        >
          {showHistory ? 'Hide History' : 'History'}
        </button>
      </div>
      {showHistory && (
        <Suspense fallback={null}>
          <DiceHistory onClose={() => setShowHistory(false)} />
        </Suspense>
      )}

      {/* Quick roll buttons */}
      <div className="flex gap-1 flex-wrap">
        {DICE.map((die) => (
          <button
            key={die.sides}
            onClick={() => handleQuickRoll(die.sides)}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700
              text-gray-300 hover:bg-amber-600 hover:text-white hover:border-amber-500
              transition-colors cursor-pointer font-mono font-semibold"
            aria-label={`Roll ${die.label}`}
          >
            {die.label}
          </button>
        ))}
      </div>

      {/* Modifier and advantage */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Mod</span>
          <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700">
            <button
              onClick={() => setModifier((m) => m - 1)}
              className="px-2 py-1 text-gray-400 hover:text-gray-200 cursor-pointer text-sm"
            >
              -
            </button>
            <span className="w-8 text-center text-sm text-gray-200 font-mono">
              {modifier >= 0 ? `+${modifier}` : modifier}
            </span>
            <button
              onClick={() => setModifier((m) => m + 1)}
              className="px-2 py-1 text-gray-400 hover:text-gray-200 cursor-pointer text-sm"
              aria-label="Increase modifier"
            >
              +
            </button>
          </div>
        </div>

        {system === 'dnd5e' && (
          <div className="flex gap-1 ml-2">
            {(['normal', 'advantage', 'disadvantage'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setAdvantage(mode)}
                className={`px-2 py-1 text-[10px] rounded transition-colors cursor-pointer
                  ${
                    advantage === mode
                      ? mode === 'advantage'
                        ? 'bg-green-600 text-white'
                        : mode === 'disadvantage'
                          ? 'bg-red-600 text-white'
                          : 'bg-amber-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
              >
                {mode === 'normal' ? 'Norm' : mode === 'advantage' ? 'Adv' : 'Dis'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Crit damage prompt */}
      {lastRollWasCrit && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/40 border border-green-500/50 rounded-lg">
          <span className="text-xs text-green-300 font-semibold">CRITICAL HIT! Next damage roll doubles dice.</span>
          <button
            onClick={() => setLastRollWasCrit(false)}
            className="text-[10px] text-green-400 hover:text-green-200 cursor-pointer underline ml-auto"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Custom formula */}
      <div className="flex gap-1">
        <input
          type="text"
          value={customFormula}
          onChange={(e) => setCustomFormula(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCustomRoll()
          }}
          placeholder="2d6+3"
          className="flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
            placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm font-mono"
        />
        <button
          onClick={handleCustomRoll}
          disabled={!parseDiceFormula(customFormula)}
          className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white
            font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Roll
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto" aria-live="polite" aria-label="Dice roll results">
          {results.map((result) => (
            <div
              key={result.id}
              className={`transition-transform ${animatingId === result.id ? 'animate-[scaleIn_0.3s_ease-out]' : ''}`}
            >
              <DiceResult
                formula={result.formula}
                rolls={result.rolls}
                total={result.total}
                rollerName={result.rollerName}
                dieSides={result.dieSides}
                isCritDamage={result.isCritDamage}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
