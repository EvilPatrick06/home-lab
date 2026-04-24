import { useState } from 'react'

interface ScrollCostEntry {
  cost: number
  days: number
}

interface PreparedSpell {
  id: string
  name: string
  level: number
}

interface CraftingProgress5eProps {
  preparedSpells: PreparedSpell[]
  scrollCosts: Record<number, ScrollCostEntry>
  readonly?: boolean
  onCraftScroll: (spell: { id: string; name: string; level: number }) => void
}

export default function CraftingProgress5e({
  preparedSpells,
  scrollCosts,
  readonly,
  onCraftScroll
}: CraftingProgress5eProps): JSX.Element {
  const [scrollLevelFilter, setScrollLevelFilter] = useState<number | 'all'>('all')
  const [scrollExpanded, setScrollExpanded] = useState(false)

  const filteredScrollSpells =
    scrollLevelFilter === 'all' ? preparedSpells : preparedSpells.filter((s) => s.level === scrollLevelFilter)

  return (
    <div className="mt-3">
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setScrollExpanded(!scrollExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 bg-purple-900/20 hover:bg-purple-900/30 transition-colors cursor-pointer"
        >
          <span className="text-sm font-medium text-purple-300">Spell Scrolls</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {preparedSpells.length} spell{preparedSpells.length !== 1 ? 's' : ''} available
            </span>
            <svg
              className={`w-3.5 h-3.5 text-gray-500 transition-transform ${scrollExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {scrollExpanded && (
          <div className="border-t border-gray-700">
            {/* Level filter */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
              <span className="text-xs text-gray-500">Level:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setScrollLevelFilter('all')}
                  className={`px-2 py-0.5 text-xs rounded ${scrollLevelFilter === 'all' ? 'bg-purple-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  All
                </button>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setScrollLevelFilter(lvl)}
                    className={`px-2 py-0.5 text-xs rounded ${scrollLevelFilter === lvl ? 'bg-purple-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    {lvl === 0 ? 'C' : lvl}
                  </button>
                ))}
              </div>
            </div>

            {filteredScrollSpells.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-500">No spells available at this level.</div>
            ) : (
              filteredScrollSpells.map((spell, idx) => {
                const scrollInfo = scrollCosts[spell.level]
                if (!scrollInfo) return null
                return (
                  <div
                    key={spell.id}
                    className={`flex items-center justify-between px-3 py-2 text-sm ${
                      idx < filteredScrollSpells.length - 1 ? 'border-b border-gray-800' : ''
                    } hover:bg-gray-900/30 transition-colors`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-200 font-medium truncate">{spell.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border text-purple-400 bg-purple-900/30 border-purple-700/50">
                          {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-amber-400">{scrollInfo.cost.toLocaleString()} GP</span>
                        <span className="text-xs text-gray-500">
                          {scrollInfo.days} day{scrollInfo.days !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    {!readonly && (
                      <button
                        onClick={() => onCraftScroll(spell)}
                        className="ml-2 px-2.5 py-1 text-xs bg-purple-600 hover:bg-purple-500 rounded text-white cursor-pointer transition-colors flex-shrink-0"
                      >
                        Craft
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
