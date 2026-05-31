import { useT } from '../../../i18n'
import {
  getEffectiveFeats,
  getEffectiveKnownSpells,
  getEffectivePreparedSpellIds
} from '../../../services/character/effective-character-5e'
import type { Character5e, Feature } from '../../../types/character-5e'
import type { SpellEntry } from '../../../types/character-common'

interface PrintSheetSpellsProps {
  character: Character5e
}

export default function PrintSheetSpells({ character }: PrintSheetSpellsProps): JSX.Element {
  const { t } = useT()
  const knownSpells = getEffectiveKnownSpells(character)
  const preparedSpellIds = getEffectivePreparedSpellIds(character)
  const feats = getEffectiveFeats(character)

  // Group spells by level
  const spellsByLevel: Record<number, SpellEntry[]> = {}
  for (const spell of knownSpells) {
    if (!spellsByLevel[spell.level]) spellsByLevel[spell.level] = []
    spellsByLevel[spell.level].push(spell)
  }
  const sortedSpellLevels = Object.keys(spellsByLevel)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <>
      {/* Spells */}
      {sortedSpellLevels.length > 0 && (
        <div className="mb-4 break-inside-avoid">
          <h2 className="mb-1 text-[8pt] font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5">
            {t('sheet.printSheetSpells.spells')}
          </h2>
          {sortedSpellLevels.map((lvl) => {
            const spells = spellsByLevel[lvl]
            const slotInfo = lvl === 0 ? null : character.spellSlotLevels[lvl]
            return (
              <div key={lvl} className="mt-1.5">
                <div className="text-[8pt] font-bold">
                  {lvl === 0 ? t('sheet.printSheetSpells.cantrips') : t('sheet.printSheetSpells.level', { level: lvl })}
                  {slotInfo && (
                    <span className="font-normal text-gray-500 ml-1">
                      {t('sheet.printSheetSpells.slots', { current: slotInfo.current, max: slotInfo.max })}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[8.5pt]">
                  {spells.map((sp: SpellEntry) => {
                    const isPrepared = lvl === 0 || preparedSpellIds.includes(sp.id)
                    return (
                      <span key={sp.id} className={isPrepared ? 'font-semibold' : 'text-gray-400'}>
                        {sp.name}
                        {sp.concentration && <span className="text-[7pt] align-super ml-px">C</span>}
                        {sp.ritual && <span className="text-[7pt] align-super ml-px">R</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Features */}
      {character.features.length > 0 && (
        <div className="mb-4 break-inside-avoid">
          <h2 className="mb-1 text-[8pt] font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5">
            {t('sheet.printSheetSpells.featuresAndTraits')}
          </h2>
          <div className="mt-0.5 space-y-1 text-[8.5pt]">
            {character.features.map((f: Feature, i: number) => (
              <div key={`${f.name}-${i}`}>
                <strong>{f.name}</strong>
                <span className="text-gray-400 text-[7pt] ml-1">({f.source})</span>
                {f.description && <span className="ml-1">{f.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feats */}
      {feats.length > 0 && (
        <div className="mb-4 break-inside-avoid">
          <h2 className="mb-1 text-[8pt] font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5">
            {t('sheet.printSheetSpells.feats')}
          </h2>
          <div className="mt-0.5 space-y-1 text-[8.5pt]">
            {feats.map((f: { id: string; name: string; description: string }) => (
              <div key={f.id}>
                <strong>{f.name}</strong>
                {f.description && <span className="ml-1">{f.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Details */}
      {character.details && (
        <div className="mb-4 break-inside-avoid">
          <h2 className="mb-1 text-[8pt] font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5">
            {t('sheet.printSheetSpells.characterDetails')}
          </h2>
          <div className="mt-0.5 space-y-0.5 text-[8.5pt]">
            {character.details.personality && (
              <div>
                <strong>{t('sheet.printSheetSpells.personality')}</strong> {character.details.personality}
              </div>
            )}
            {character.details.ideals && (
              <div>
                <strong>{t('sheet.printSheetSpells.ideals')}</strong> {character.details.ideals}
              </div>
            )}
            {character.details.bonds && (
              <div>
                <strong>{t('sheet.printSheetSpells.bonds')}</strong> {character.details.bonds}
              </div>
            )}
            {character.details.flaws && (
              <div>
                <strong>{t('sheet.printSheetSpells.flaws')}</strong> {character.details.flaws}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backstory */}
      {character.backstory && (
        <div className="mb-4 break-inside-avoid">
          <h2 className="mb-1 text-[8pt] font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5">
            {t('sheet.printSheetSpells.backstory')}
          </h2>
          <div className="mt-0.5 text-[8.5pt] whitespace-pre-wrap">{character.backstory}</div>
        </div>
      )}
    </>
  )
}
