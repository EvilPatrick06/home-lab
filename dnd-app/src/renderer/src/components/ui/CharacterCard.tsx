import { memo } from 'react'
import { useT } from '../../i18n'
import { getEffectiveClasses } from '../../services/character/effective-character-5e'
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
  const { t } = useT()
  const classes = getEffectiveClasses(character)
  const className = classes.map((c) => c.name).join(' / ') || t('ui.characterCard.unknownClass')
  const speciesName = character.species
  const subclass = classes[0]?.subclass
  const alignment = character.alignment

  const systemLabel = t('ui.characterCard.systemLabel')
  const systemColor = 'bg-red-900/50 text-red-400'

  const dynamicAC = computeDynamicAC(character)
  const displayHP = character.hitPoints.current + character.hitPoints.temporary

  const iconProps = getCharacterIconProps(character)

  return (
    <div
      className="bg-surface/50 border border-gray-800 rounded-lg p-5 hover:border-amber-600/50
                 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <CharacterIcon {...iconProps} size="md" />
          <div>
            <h3 className="text-lg font-semibold group-hover:text-accent transition-colors">{character.name}</h3>
            <p className="text-muted text-sm">
              {t('ui.characterCard.levelLine', { level: character.level, species: speciesName, class: className })}
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
              {character.status === 'retired'
                ? t('ui.characterCard.statusRetired')
                : t('ui.characterCard.statusDeceased')}
            </span>
          )}
          {onExportPdf && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onExportPdf()
              }}
              className="text-gray-600 hover:text-accent transition-colors text-xs cursor-pointer px-1.5 py-1 font-medium"
              title={t('ui.characterCard.exportPdfTitle')}
            >
              {t('ui.characterCard.pdf')}
            </button>
          )}
          {onExport && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onExport()
              }}
              className="text-gray-600 hover:text-accent transition-colors text-sm cursor-pointer px-2 py-1"
              title={t('ui.characterCard.exportTitle')}
              aria-label={t('ui.characterCard.exportTitle')}
            >
              {/* QA: the old ⤗ glyph read as a pencil/"edit". ⬇ unambiguously means
                  export/save-to-file (this exports a .dndchar). */}
              &#11015;
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="text-gray-600 hover:text-red-400 transition-colors text-sm cursor-pointer px-2 py-1"
            title={t('ui.characterCard.deleteTitle')}
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="flex gap-3 mt-3">
        <div className="text-xs text-gray-500">
          {t('ui.characterCard.hpLabel')}{' '}
          <span className="text-green-400">
            {displayHP}/{character.hitPoints.maximum}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          {t('ui.characterCard.acLabel')} <span className="text-gray-300">{dynamicAC}</span>
        </div>
      </div>
    </div>
  )
})
