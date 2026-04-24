import type { SelectableOption } from '../../../types/character-common'

interface SelectionOptionListProps {
  options: SelectableOption[]
  previewOptionId: string | null
  selectedOptionId: string | null
  onPreview: (optionId: string) => void
}

const rarityColors: Record<string, string> = {
  common: '',
  uncommon: 'border-l-orange-500',
  rare: 'border-l-blue-500',
  unique: 'border-l-purple-500'
}

export default function SelectionOptionList({
  options,
  previewOptionId,
  selectedOptionId,
  onPreview
}: SelectionOptionListProps): JSX.Element {
  if (options.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm p-4">
        No options match your filters
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {options.map((option) => {
        const isPreviewing = option.id === previewOptionId
        const isSelected = option.id === selectedOptionId

        return (
          <button
            key={option.id}
            onClick={() => onPreview(option.id)}
            className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${rarityColors[option.rarity] || ''} ${
              isPreviewing
                ? 'bg-amber-900/30 border-l-amber-400'
                : isSelected
                  ? 'bg-green-900/20 border-l-green-500'
                  : 'border-l-transparent hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${isPreviewing ? 'text-amber-300' : 'text-gray-200'}`}>
                {option.name}
              </span>
              {isSelected && <span className="text-green-400 text-xs">✓ Selected</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 truncate">{option.description}</div>
            {option.traits.length > 0 && (
              <div className="flex gap-1 mt-1">
                {option.traits.slice(0, 3).map((trait) => (
                  <span key={trait} className="text-xs px-1.5 py-0.5 bg-gray-800 rounded text-gray-400">
                    {trait}
                  </span>
                ))}
                {option.traits.length > 3 && <span className="text-xs text-gray-500">+{option.traits.length - 3}</span>}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
