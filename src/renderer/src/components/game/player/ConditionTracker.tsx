import { useEffect, useState } from 'react'
import { type ConditionDef, getBuffs5e } from '../../../data/conditions'
import { addToast } from '../../../hooks/use-toast'
import type { EntityCondition } from '../../../types/game-state'
import { logger } from '../../../utils/logger'

interface ConditionTrackerProps {
  conditions: EntityCondition[]
  isHost: boolean
  onRemoveCondition: (conditionId: string) => void
}

const CONDITION_ICONS: Record<string, string> = {
  blinded: '\u{1F441}',
  charmed: '\u{1F495}',
  deafened: '\u{1F442}',
  frightened: '\u{1F631}',
  grappled: '\u{270B}',
  incapacitated: '\u{1F4A4}',
  invisible: '\u{1F47B}',
  paralyzed: '\u{26A1}',
  petrified: '\u{1FAA8}',
  poisoned: '\u{2620}',
  prone: '\u{1F938}',
  restrained: '\u{26D3}',
  stunned: '\u{1F4AB}',
  unconscious: '\u{1F634}',
  exhaustion: '\u{1F62B}'
}

export default function ConditionTracker({
  conditions,
  isHost,
  onRemoveCondition
}: ConditionTrackerProps): JSX.Element {
  // Load available buffs for identifying positive conditions
  const [buffs, setBuffs] = useState<ConditionDef[]>([])
  useEffect(() => {
    getBuffs5e()
      .then(setBuffs)
      .catch((err) => {
        logger.error('Failed to load condition buffs', err)
        addToast('Failed to load condition data', 'error')
        setBuffs([])
      })
  }, [])
  const buffNames = new Set(buffs.map((b) => b.name.toLowerCase()))

  if (conditions.length === 0) {
    return <div className="text-xs text-gray-500 text-center py-2">No active conditions</div>
  }

  return (
    <div className="space-y-1">
      {conditions.map((cond) => {
        const isBuff = buffNames.has(cond.condition.toLowerCase())
        const icon = CONDITION_ICONS[cond.condition.toLowerCase()] ?? (isBuff ? '\u{2B50}' : '\u{26A0}')
        const durationText =
          cond.duration === 'permanent'
            ? 'Permanent'
            : `${cond.duration} round${cond.duration !== 1 ? 's' : ''} remaining`

        return (
          <div key={cond.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-gray-800/50 text-xs">
            <span className="text-base">{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className={`font-medium capitalize ${isBuff ? 'text-green-300' : 'text-gray-200'}`}>
                  {cond.condition}
                </span>
                {cond.value !== undefined && <span className="text-amber-400 font-semibold">{cond.value}</span>}
              </div>
              <p className="text-[10px] text-gray-500 truncate">{durationText}</p>
            </div>
            {isHost && (
              <button
                onClick={() => onRemoveCondition(cond.id)}
                className="text-gray-500 hover:text-red-400 cursor-pointer text-xs flex-shrink-0"
                title="Remove condition"
              >
                &#x2715;
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
