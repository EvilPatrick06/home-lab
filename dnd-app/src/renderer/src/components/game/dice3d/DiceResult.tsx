import { memo } from 'react'

interface DiceResultProps {
  formula: string
  rolls: number[]
  total: number
  rollerName: string
  dieSides?: number
  isCritDamage?: boolean
}

export default memo(function DiceResult({
  formula,
  rolls,
  total,
  rollerName,
  dieSides,
  isCritDamage
}: DiceResultProps): JSX.Element {
  // Detect critical / fumble for d20 rolls
  const isSingleD20 = formula.match(/^1?d20/)
  const isCritical = isSingleD20 && rolls.length === 1 && rolls[0] === 20
  const isFumble = isSingleD20 && rolls.length === 1 && rolls[0] === 1

  return (
    <div
      className={`bg-gray-800/50 rounded-lg p-2.5 border transition-all
        ${
          isCritical || isCritDamage
            ? 'border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
            : isFumble
              ? 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
              : 'border-gray-700'
        }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{rollerName}</span>
        <span className="text-[10px] text-gray-500 font-mono">{formula}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Individual rolls */}
        <div className="flex gap-1 flex-wrap">
          {rolls.map((roll, i) => (
            <span
              key={i}
              className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono font-semibold
                ${
                  dieSides && roll === dieSides
                    ? 'bg-green-600/30 text-green-300 border border-green-500/50'
                    : roll === 1
                      ? 'bg-red-600/30 text-red-300 border border-red-500/50'
                      : 'bg-gray-700 text-gray-300 border border-gray-600'
                }`}
            >
              {roll}
            </span>
          ))}
        </div>

        {/* Phase 17z — explicit base + modifier = total breakdown.
            Previously this component only rendered the final `total`, so the
            user couldn't see the modifier was even applied — they suspected
            the dice tray's modifier wasn't getting carried into chat (it was,
            but the visual didn't surface it). The modifier is derived from
            `total - sum(rolls)` (always exact) and rendered as a `+M` / `-M`
            chip + the explicit base sum + the total. Same field used by
            both DM and player views; same source of truth as the tray. */}
        {(() => {
          const base = rolls.reduce((s, r) => s + r, 0)
          const modifier = total - base
          const totalColor = isCritical ? 'text-green-400' : isFumble ? 'text-red-400' : 'text-amber-400'
          return (
            <div className="ml-auto flex items-center gap-1.5 font-mono">
              {modifier !== 0 && (
                <>
                  <span className="text-[11px] text-gray-500">{base}</span>
                  <span className={`text-[11px] ${modifier > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {modifier > 0 ? '+' : ''}
                    {modifier}
                  </span>
                  <span className="text-[11px] text-gray-500">=</span>
                </>
              )}
              <span className={`text-xl font-bold ${totalColor}`}>{total}</span>
            </div>
          )
        })()}
      </div>

      {isCritical && <p className="text-[10px] text-green-400 font-semibold mt-1">NATURAL 20 - CRITICAL!</p>}
      {isFumble && <p className="text-[10px] text-red-400 font-semibold mt-1">NATURAL 1 - FUMBLE!</p>}
      {isCritDamage && <p className="text-[10px] text-green-400 font-semibold mt-1">CRITICAL DAMAGE - Dice doubled!</p>}
    </div>
  )
})
