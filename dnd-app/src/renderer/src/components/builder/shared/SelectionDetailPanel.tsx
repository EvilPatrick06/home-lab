import type { SelectableOption } from '../../../types/character-common'

interface SelectionDetailPanelProps {
  option: SelectableOption | null
}

export default function SelectionDetailPanel({ option }: SelectionDetailPanelProps): JSX.Element {
  if (!option) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Select an option to view details
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <h3 className="text-xl font-bold text-amber-400 mb-1">{option.name}</h3>

      <div className="flex items-center gap-2 mb-4">
        {option.rarity !== 'common' && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              option.rarity === 'uncommon'
                ? 'bg-orange-900/50 text-orange-300'
                : option.rarity === 'rare'
                  ? 'bg-blue-900/50 text-blue-300'
                  : 'bg-purple-900/50 text-purple-300'
            }`}
          >
            {option.rarity}
          </span>
        )}
        <span className="text-xs text-gray-500">
          {typeof option.source === 'string' ? option.source : ((option.source as { book?: string })?.book ?? 'SRD')}
        </span>
      </div>

      {option.traits.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {option.traits.map((trait) => (
            <span key={trait} className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300">
              {trait}
            </span>
          ))}
        </div>
      )}

      {option.description && <p className="text-sm text-gray-300 leading-relaxed mb-4">{option.description}</p>}

      <div className="space-y-3">
        {option.detailFields
          .filter((f) => f.label !== 'Description')
          .map((field, i) => (
            <div key={i}>
              <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{field.label}</dt>
              <dd className="text-sm text-gray-200 leading-relaxed">
                {typeof field.value === 'string' ? field.value : JSON.stringify(field.value)}
              </dd>
            </div>
          ))}
      </div>

      {option.prerequisites && option.prerequisites.length > 0 && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-800/30 rounded">
          <div className="text-xs font-semibold text-red-400 uppercase mb-1">Prerequisites</div>
          <div className="text-sm text-gray-300">{option.prerequisites.join(', ')}</div>
        </div>
      )}
    </div>
  )
}
