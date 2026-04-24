import type { BuildSlot } from '../../../types/character-common'
import BuildSlotItem from './BuildSlotItem'

interface BuildLevelGroupProps {
  level: number
  slots: BuildSlot[]
  onSlotClick: (slotId: string) => void
}

export default function BuildLevelGroup({ level, slots, onSlotClick }: BuildLevelGroupProps): JSX.Element {
  return (
    <div>
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-900/50 sticky top-0">
        {level === 0 ? 'Character Foundation' : `Level ${level}`}
      </div>
      <div className="flex flex-col gap-1 p-2">
        {slots.map((slot) => (
          <BuildSlotItem key={slot.id} slot={slot} onClick={() => onSlotClick(slot.id)} />
        ))}
      </div>
    </div>
  )
}
