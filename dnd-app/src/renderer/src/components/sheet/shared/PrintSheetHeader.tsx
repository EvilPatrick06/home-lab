import { useT } from '../../../i18n'
import { getEffectiveClasses } from '../../../services/character/effective-character-5e'
import type { Character5e, CharacterClass5e } from '../../../types/character-5e'
import { formatMod } from '../../../types/character-common'

interface PrintSheetHeaderProps {
  character: Character5e
  proficiencyBonus: number
}

export default function PrintSheetHeader({ character, proficiencyBonus: pb }: PrintSheetHeaderProps): JSX.Element {
  const { t } = useT()
  const classStr = getEffectiveClasses(character)
    .map((c: CharacterClass5e) => `${c.name}${c.subclass ? ` (${c.subclass})` : ''} ${c.level}`)
    .join(' / ')

  return (
    <div className="mb-4 border-b-2 border-black pb-2">
      <h1 className="text-[18pt] font-bold leading-tight">{character.name}</h1>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-[9pt]">
        <span>
          <strong>{t('sheet.printSheetHeader.class')}</strong> {classStr}
        </span>
        <span>
          <strong>{t('sheet.printSheetHeader.level')}</strong> {character.level}
        </span>
        <span>
          <strong>{t('sheet.printSheetHeader.species')}</strong> {character.species}
          {character.subspecies ? ` (${character.subspecies})` : ''}
        </span>
        <span>
          <strong>{t('sheet.printSheetHeader.background')}</strong> {character.background}
        </span>
        {character.alignment && (
          <span>
            <strong>{t('sheet.printSheetHeader.alignment')}</strong> {character.alignment}
          </span>
        )}
        <span>
          <strong>{t('sheet.printSheetHeader.proficiencyBonus')}</strong> {formatMod(pb)}
        </span>
      </div>
    </div>
  )
}
