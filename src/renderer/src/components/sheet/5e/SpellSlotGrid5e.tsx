interface SpellSlotGridProps {
  label: string
  slotLevels: Record<string, { max: number; current: number }>
  onSlotClick: (level: number, index: number, isFilled: boolean) => void
  readonly: boolean
  isPact?: boolean
}

export default function SpellSlotGrid5e({
  label,
  slotLevels,
  onSlotClick,
  readonly,
  isPact = false
}: SpellSlotGridProps): JSX.Element {
  return (
    <div className="mb-3">
      <div className={`text-xs uppercase tracking-wide mb-1 ${isPact ? 'text-purple-400' : 'text-gray-500'}`}>
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(slotLevels)
          .filter(([level]) => Number(level) > 0)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([level, slots]) => (
            <div key={level} className={`rounded px-2 py-1.5 ${isPact ? 'bg-purple-900/30' : 'bg-gray-800/50'}`}>
              <div className="text-[10px] text-gray-500 text-center mb-1">{`${level}${ordinal(Number(level))}`}</div>
              <div className="flex gap-1">
                {Array.from({ length: slots.max }, (_, i) => {
                  const isFilled = i < slots.current
                  return (
                    <button
                      key={i}
                      onClick={() => onSlotClick(Number(level), i, isFilled)}
                      disabled={readonly}
                      className={`w-5 h-5 rounded-full border-2 transition-colors ${
                        isFilled
                          ? isPact
                            ? 'bg-purple-500 border-purple-400'
                            : 'bg-amber-500 border-amber-400'
                          : 'border-gray-600 bg-gray-800'
                      } ${readonly ? 'cursor-default' : isPact ? 'cursor-pointer hover:border-purple-400' : 'cursor-pointer hover:border-amber-400'}`}
                      title={
                        isFilled
                          ? isPact
                            ? 'Use pact slot'
                            : 'Use slot'
                          : isPact
                            ? 'Recover pact slot'
                            : 'Recover slot'
                      }
                    />
                  )
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}
