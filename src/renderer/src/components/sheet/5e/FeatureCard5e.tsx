import { useState } from 'react'
import { formatPrerequisites } from '../../../services/data-provider'
import type { Character5e } from '../../../types/character-5e'
import type { FeatData } from '../../../types/data'
import { meetsFeatPrerequisites } from '../../../utils/feat-prerequisites'

interface FeatureRowProps {
  feature: { name: string; source?: string; description: string; level?: number }
  onRemove?: () => void
}

export function FeatureRow({ feature, onRemove }: FeatureRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-gray-800 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-gray-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-200 font-medium">{feature.name}</span>
          {feature.source && <span className="text-xs text-gray-500">({feature.source})</span>}
        </div>
        <div className="flex items-center gap-2">
          {feature.level != null && <span className="text-xs text-gray-600 font-mono">Lv {feature.level}</span>}
          {onRemove && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  onRemove()
                }
              }}
              className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer ml-1"
              title="Remove feat"
            >
              &times;
            </span>
          )}
        </div>
      </button>
      {expanded && feature.description && (
        <p className="px-3 pb-2 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{feature.description}</p>
      )}
    </div>
  )
}

interface FeatPickerRowProps {
  feat: FeatData
  character: Character5e
  onSelect: (feat: FeatData) => void
}

export function FeatPickerRow({ feat, character, onSelect }: FeatPickerRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const meetsPrereqs = meetsFeatPrerequisites(character, feat.prerequisites)
  return (
    <div
      className={`border rounded ${meetsPrereqs ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-900/50 border-gray-800 opacity-50'}`}
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left cursor-pointer">
          <span className="text-sm text-amber-300 font-medium">{feat.name}</span>
          <span className="text-xs text-gray-500 ml-2">({feat.category})</span>
          {feat.repeatable && <span className="text-xs text-purple-400 ml-1">*</span>}
        </button>
        <button
          onClick={() => meetsPrereqs && onSelect(feat)}
          disabled={!meetsPrereqs}
          className={`px-2 py-0.5 text-xs rounded transition-colors ml-2 ${
            meetsPrereqs
              ? 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Add
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2">
          {formatPrerequisites(feat.prerequisites).length > 0 && (
            <p className={`text-xs mb-1 ${meetsPrereqs ? 'text-yellow-500' : 'text-red-400'}`}>
              Requires: {formatPrerequisites(feat.prerequisites).join(', ')}
            </p>
          )}
          <p className="text-xs text-gray-400 whitespace-pre-wrap">
            {feat.benefits.map((b) => b.description).join(' ')}
          </p>
        </div>
      )}
    </div>
  )
}
