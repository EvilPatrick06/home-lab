import { memo } from 'react'
import type { Character } from '../../types/character'
import { computeDynamicAC } from '../../utils/ac-calculator'
import { CharacterIcon, getCharacterIconProps } from '../builder/shared/IconPicker'

interface CharacterCardProps {
  character: Character
  onClick: () => void
  onDelete: () => void
  onExport?: () => void
  onExportPdf?: () => void
}

export default memo(function CharacterCard({
  character,
  onClick,
  onDelete,
  onExport,
  onExportPdf
}: CharacterCardProps): JSX.Element {
  const className = character.classes.map((c) => c.name).join(' / ') || 'Unknown Class'
  const speciesName = character.species
  const subclass = character.classes[0]?.subclass
  const alignment = character.alignment

  const systemLabel = 'D&D 5e'
  const systemColor = 'bg-red-900/50 text-red-400'

  const dynamicAC = computeDynamicAC(character)
  const displayHP = character.hitPoints.current + character.hitPoints.temporary

  const iconProps = getCharacterIconProps(character)

  return (
    <div
      className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 hover:border-amber-600/50
                 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <CharacterIcon {...iconProps} size="md" />
          <div>
            <h3 className="text-lg font-semibold group-hover:text-amber-400 transition-colors">{character.name}</h3>
            <p className="text-gray-400 text-sm">
              Level {character.level} {speciesName} {className}
            </p>
            {subclass && <p className="text-gray-500 text-xs mt-0.5">{subclass}</p>}
            {alignment && <p className="text-gray-500 text-xs">{alignment}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${systemColor}`}>{systemLabel}</span>
          {character.status !== 'active' && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                character.status === 'retired' ? 'bg-gray-700 text-gray-300' : 'bg-red-900/50 text-red-400'
              }`}
            >
              {character.status.charAt(0).toUpperCase() + character.status.slice(1)}
            </span>
          )}
          {onExportPdf && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onExportPdf()
              }}
              className="text-gray-600 hover:text-amber-400 transition-colors text-[10px] cursor-pointer px-1.5 py-1 font-medium"
              title="Export to PDF"
            >
              PDF
            </button>
          )}
          {onExport && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onExport()
              }}
              className="text-gray-600 hover:text-amber-400 transition-colors text-sm cursor-pointer px-2 py-1"
              title="Export character"
            >
              &#8663;
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="text-gray-600 hover:text-red-400 transition-colors text-sm cursor-pointer px-2 py-1"
            title="Delete character"
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="flex gap-3 mt-3">
        <div className="text-xs text-gray-500">
          HP:{' '}
          <span className="text-green-400">
            {displayHP}/{character.hitPoints.maximum}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          AC: <span className="text-gray-300">{dynamicAC}</span>
        </div>
      </div>
    </div>
  )
})
