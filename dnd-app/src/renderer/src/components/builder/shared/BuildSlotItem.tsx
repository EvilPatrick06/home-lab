import { useT } from '../../../i18n'
import type { BuildSlot } from '../../../types/character-common'

interface BuildSlotItemProps {
  slot: BuildSlot
  onClick: () => void
}

const categoryIcons: Record<string, string> = {
  ancestry: '🧬',
  heritage: '🏠',
  background: '📜',
  class: '⚔️',
  'ability-scores': '🎲',
  'skill-choice': '📚',
  'ancestry-feat': '✦',
  'class-feat': '⚡',
  'skill-feat': '🎯',
  'general-feat': '★',
  'ability-boost': '↑',
  'class-feature': '🔷',
  'epic-boon': '🌟',
  'fighting-style': '🗡️',
  'primal-order': '🌿',
  'divine-order': '✟',
  expertise: '🎓'
}

export default function BuildSlotItem({ slot, onClick }: BuildSlotItemProps): JSX.Element {
  const { t } = useT()
  const isSelected = slot.selectedId !== null
  const isAutoGranted = slot.isAutoGranted

  return (
    <button
      onClick={onClick}
      disabled={isAutoGranted}
      className={`w-full text-start px-3 py-2 rounded border transition-colors cursor-pointer ${
        isAutoGranted
          ? 'bg-surface-2/50 border-border/50 !cursor-default opacity-60'
          : isSelected
            ? 'bg-amber-900/20 border-amber-600/40 hover:border-amber-500/60 hover:bg-amber-900/30'
            : 'bg-surface-2/60 border-border hover:border-gray-500 hover:bg-surface-2'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm shrink-0">{categoryIcons[slot.category] ?? '◆'}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-500 leading-tight">{slot.label}</div>
          <div className={`text-sm truncate ${isSelected ? 'text-accent font-medium' : 'text-muted italic'}`}>
            {slot.selectedName ?? t('builder.buildSlotItem.select')}
          </div>
        </div>
        {slot.required && !isSelected && <span className="text-red-400 text-xs shrink-0">*</span>}
      </div>
    </button>
  )
}
