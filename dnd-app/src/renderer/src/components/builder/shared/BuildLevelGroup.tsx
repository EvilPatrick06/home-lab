import { useT } from '../../../i18n'
import type { BuildSlot } from '../../../types/character-common'
import BuildSlotItem from './BuildSlotItem'

interface BuildLevelGroupProps {
  level: number
  slots: BuildSlot[]
  onSlotClick: (slotId: string) => void
}

export default function BuildLevelGroup({ level, slots, onSlotClick }: BuildLevelGroupProps): JSX.Element {
  const { t } = useT()
  return (
    <div>
      <div className="px-3 py-1.5 text-xs font-semibold text-muted uppercase tracking-wider bg-surface/50 sticky top-0">
        {level === 0 ? t('builder.buildLevelGroup.foundation') : t('builder.buildLevelGroup.level', { level })}
      </div>
      <div className="flex flex-col gap-1 p-2">
        {slots.map((slot) => (
          <BuildSlotItem key={slot.id} slot={slot} onClick={() => onSlotClick(slot.id)} />
        ))}
      </div>
    </div>
  )
}
