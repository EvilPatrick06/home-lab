import { memo } from 'react'
import { renderInlineMarkdown } from '../../utils/markdown'

interface BackgroundEquipmentOption {
  option?: string
  items?: string[]
}

interface BackgroundData {
  name?: string
  description?: string
  abilityScores?: string[]
  skillProficiencies?: string[]
  toolProficiency?: string
  feat?: string
  equipment?: BackgroundEquipmentOption[]
  source?: string
}

interface BackgroundDetailViewProps {
  background: Record<string, unknown>
}

function BackgroundDetailView({ background }: BackgroundDetailViewProps): JSX.Element {
  const b = background as unknown as BackgroundData

  return (
    <div className="bg-gray-900 border border-amber-800/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-amber-900/30 border-b border-amber-800/40 px-3 py-2">
        <h3 className="text-base font-bold text-amber-400">{b.name ?? 'Unknown Background'}</h3>
        {b.source && <p className="text-xs text-gray-400 italic">{b.source}</p>}
      </div>

      <div className="px-3 py-2 space-y-2">
        {b.description && (
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{renderInlineMarkdown(b.description)}</p>
        )}

        <div className="border-t border-amber-800/30" />

        <div className="space-y-0.5 text-sm">
          {b.abilityScores && b.abilityScores.length > 0 && (
            <div className="flex gap-1">
              <span className="text-amber-500 font-semibold">Ability Scores</span>
              <span className="text-gray-300">{b.abilityScores.join(', ')}</span>
            </div>
          )}
          {b.skillProficiencies && b.skillProficiencies.length > 0 && (
            <div className="flex gap-1">
              <span className="text-amber-500 font-semibold">Skill Proficiencies</span>
              <span className="text-gray-300">{b.skillProficiencies.join(', ')}</span>
            </div>
          )}
          {b.toolProficiency && (
            <div className="flex gap-1">
              <span className="text-amber-500 font-semibold">Tool Proficiency</span>
              <span className="text-gray-300">{b.toolProficiency}</span>
            </div>
          )}
          {b.feat && (
            <div className="flex gap-1">
              <span className="text-amber-500 font-semibold">Origin Feat</span>
              <span className="text-gray-300">{b.feat}</span>
            </div>
          )}
        </div>

        {b.equipment && b.equipment.length > 0 && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Starting Equipment</h4>
              {b.equipment.map((opt, i) => (
                <div key={i} className="text-xs">
                  <span className="text-amber-400 font-semibold italic">
                    Option {opt.option ?? String.fromCharCode(65 + i)}.{' '}
                  </span>
                  <span className="text-gray-300">{(opt.items ?? []).join(', ')}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default memo(BackgroundDetailView)
