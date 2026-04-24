import { useState } from 'react'

interface CraftableItem {
  name: string
  rawMaterialCost: string
  craftingTimeDays: number
  category: 'weapon' | 'armor' | 'gear'
}

interface CraftingToolEntry {
  tool: string
  items: CraftableItem[]
}

interface CraftingRecipeList5eProps {
  matchingTools: CraftingToolEntry[]
  readonly?: boolean
  onCraft: (item: CraftableItem) => void
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case 'weapon':
      return 'Weapon'
    case 'armor':
      return 'Armor'
    case 'gear':
      return 'Gear'
    default:
      return cat
  }
}

function categoryColor(cat: string): string {
  switch (cat) {
    case 'weapon':
      return 'text-red-400 bg-red-900/30 border-red-700/50'
    case 'armor':
      return 'text-blue-400 bg-blue-900/30 border-blue-700/50'
    case 'gear':
      return 'text-green-400 bg-green-900/30 border-green-700/50'
    default:
      return 'text-gray-400 bg-gray-900/30 border-gray-700/50'
  }
}

export default function CraftingRecipeList5e({
  matchingTools,
  readonly,
  onCraft
}: CraftingRecipeList5eProps): JSX.Element {
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})

  const toggleTool = (tool: string): void => {
    setExpandedTools((prev) => ({ ...prev, [tool]: !prev[tool] }))
  }

  return (
    <>
      {/* Tool proficiency summary */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {matchingTools.map((entry) => (
          <span
            key={entry.tool}
            className="inline-flex items-center bg-amber-900/30 text-amber-300 border border-amber-700/50 rounded-full px-2.5 py-0.5 text-xs"
          >
            {entry.tool}
          </span>
        ))}
      </div>

      {/* Collapsible sections per tool */}
      <div className="space-y-2">
        {matchingTools.map((entry) => {
          const isExpanded = expandedTools[entry.tool] ?? false
          return (
            <div key={entry.tool} className="border border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleTool(entry.tool)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/60 hover:bg-gray-800 transition-colors cursor-pointer"
              >
                <span className="text-sm font-medium text-gray-200">{entry.tool}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {entry.items.length} recipe{entry.items.length !== 1 ? 's' : ''}
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-700">
                  {entry.items.map((item, idx) => (
                    <div
                      key={item.name}
                      className={`flex items-center justify-between px-3 py-2 text-sm ${
                        idx < entry.items.length - 1 ? 'border-b border-gray-800' : ''
                      } hover:bg-gray-900/30 transition-colors`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-200 font-medium truncate">{item.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${categoryColor(item.category)}`}>
                            {categoryLabel(item.category)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-amber-400">{item.rawMaterialCost}</span>
                          <span className="text-xs text-gray-500">
                            {item.craftingTimeDays} day{item.craftingTimeDays !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      {!readonly && (
                        <button
                          onClick={() => onCraft(item)}
                          className="ml-2 px-2.5 py-1 text-xs bg-amber-600 hover:bg-amber-500 rounded text-white cursor-pointer transition-colors flex-shrink-0"
                        >
                          Craft
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
