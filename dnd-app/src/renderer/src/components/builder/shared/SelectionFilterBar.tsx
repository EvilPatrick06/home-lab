import rarityOptionsJson from '@data/ui/rarity-options.json'
import { useT } from '../../../i18n'
import { load5eRarityOptions } from '../../../services/data-provider'
import type { Rarity } from '../../../types/character-common'

interface SelectionFilterBarProps {
  rarityFilter: Rarity | 'all'
  searchQuery: string
  onRarityChange: (filter: Rarity | 'all') => void
  onSearchChange: (query: string) => void
}

const RARITY_OPTIONS = rarityOptionsJson as Array<{ value: Rarity | 'all'; label: string; color: string }>

/** Load rarity options from the data store (includes plugin additions). */
export async function loadRarityOptionData(): Promise<unknown> {
  return load5eRarityOptions()
}

export default function SelectionFilterBar({
  rarityFilter,
  searchQuery,
  onRarityChange,
  onSearchChange
}: SelectionFilterBarProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
      <div className="flex gap-1">
        {RARITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onRarityChange(opt.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              rarityFilter === opt.value
                ? `${opt.color} text-white ring-1 ring-white/20`
                : 'bg-surface-2 text-muted hover:text-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex-1">
        <input
          type="text"
          name="search-query"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('builder.selectionFilterBar.searchPlaceholder')}
          className="w-full bg-surface-2 border border-gray-600 rounded px-3 py-1.5 text-sm text-fg placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
      </div>
    </div>
  )
}
