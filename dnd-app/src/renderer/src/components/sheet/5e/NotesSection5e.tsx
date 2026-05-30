import { useT } from '../../../i18n'
import { useCharacterStore } from '../../../stores/use-character-store'
import type { Character5e } from '../../../types/character-5e'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'

const ALIGNMENTS = [
  '',
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil'
]

interface NotesSection5eProps {
  character: Character5e
  readonly?: boolean
}

function saveField(character: Character5e, updater: (latest: Character5e) => Character5e): void {
  const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
  const updated = updater(latest as Character5e)
  useCharacterStore.getState().saveCharacter(updated)
}

export default function NotesSection5e({ character, readonly }: NotesSection5eProps): JSX.Element {
  const { t } = useT()
  const backstory = character.backstory
  const personality = character.details.personality ?? ''
  const notes = character.notes

  const inputClass =
    'bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-amber-500'
  const textareaClass =
    'bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 w-full resize-y focus:outline-none focus:border-amber-500 min-h-[60px]'
  const selectClass =
    'bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-amber-500'

  return (
    <SheetSectionWrapper title={t('sheet.notesSection.title')}>
      {/* Alignment / Status / XP row */}
      <div className="flex flex-wrap items-end gap-4 mb-4">
        {/* Alignment */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {t('sheet.notesSection.alignment')}
          </label>
          {readonly ? (
            <span className="text-sm text-gray-300">{character.alignment || t('sheet.notesSection.none')}</span>
          ) : (
            <select
              className={selectClass}
              defaultValue={character.alignment}
              onChange={(e) => {
                const val = e.target.value
                saveField(character, (latest) => ({
                  ...latest,
                  alignment: val,
                  updatedAt: new Date().toISOString()
                }))
              }}
            >
              {ALIGNMENTS.map((a) => (
                <option key={a} value={a}>
                  {a || t('sheet.notesSection.noneOption')}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Status */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.notesSection.status')}</label>
          {readonly ? (
            <span className="text-sm text-gray-300 capitalize">{character.status}</span>
          ) : (
            <select
              className={selectClass}
              defaultValue={character.status}
              onChange={(e) => {
                const val = e.target.value as 'active' | 'retired' | 'deceased'
                saveField(character, (latest) => ({
                  ...latest,
                  status: val,
                  updatedAt: new Date().toISOString()
                }))
              }}
            >
              <option value="active">{t('sheet.notesSection.statusActive')}</option>
              <option value="retired">{t('sheet.notesSection.statusRetired')}</option>
              <option value="deceased">{t('sheet.notesSection.statusDeceased')}</option>
            </select>
          )}
        </div>

        {/* XP */}
        {character.levelingMode === 'xp' && (
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.notesSection.xp')}</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.xp}</span>
            ) : (
              <input
                type="number"
                className={`${inputClass} w-24`}
                defaultValue={character.xp}
                min={0}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10) || 0
                  saveField(character, (latest) => ({
                    ...latest,
                    xp: val,
                    updatedAt: new Date().toISOString()
                  }))
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Personality */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.notesSection.personality')}</div>
        {readonly ? (
          <p className="text-sm text-gray-400">{personality || t('sheet.notesSection.none')}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={personality}
            placeholder={t('sheet.notesSection.personalityPlaceholder')}
            onBlur={(e) => {
              const val = e.target.value
              saveField(character, (latest) => ({
                ...latest,
                details: { ...latest.details, personality: val },
                updatedAt: new Date().toISOString()
              }))
            }}
          />
        )}
      </div>

      {/* Ideals, Bonds, Flaws */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.notesSection.ideals')}</div>
        {readonly ? (
          <p className="text-sm text-gray-400">{character.details.ideals || t('sheet.notesSection.none')}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={character.details.ideals ?? ''}
            placeholder={t('sheet.notesSection.idealsPlaceholder')}
            onBlur={(e) => {
              const val = e.target.value
              saveField(character, (latest) => ({
                ...latest,
                details: { ...latest.details, ideals: val },
                updatedAt: new Date().toISOString()
              }))
            }}
          />
        )}
      </div>

      <div className="mb-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.notesSection.bonds')}</div>
        {readonly ? (
          <p className="text-sm text-gray-400">{character.details.bonds || t('sheet.notesSection.none')}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={character.details.bonds ?? ''}
            placeholder={t('sheet.notesSection.bondsPlaceholder')}
            onBlur={(e) => {
              const val = e.target.value
              saveField(character, (latest) => ({
                ...latest,
                details: { ...latest.details, bonds: val },
                updatedAt: new Date().toISOString()
              }))
            }}
          />
        )}
      </div>

      <div className="mb-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.notesSection.flaws')}</div>
        {readonly ? (
          <p className="text-sm text-gray-400">{character.details.flaws || t('sheet.notesSection.none')}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={character.details.flaws ?? ''}
            placeholder={t('sheet.notesSection.flawsPlaceholder')}
            onBlur={(e) => {
              const val = e.target.value
              saveField(character, (latest) => ({
                ...latest,
                details: { ...latest.details, flaws: val },
                updatedAt: new Date().toISOString()
              }))
            }}
          />
        )}
      </div>

      {/* Backstory */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.notesSection.backstory')}</div>
        {readonly ? (
          <p className="text-sm text-gray-400 bg-gray-900/50 border border-gray-700 rounded-lg p-3 whitespace-pre-wrap">
            {backstory || t('sheet.notesSection.none')}
          </p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={backstory}
            placeholder={t('sheet.notesSection.backstoryPlaceholder')}
            onBlur={(e) => {
              const val = e.target.value
              saveField(character, (latest) => ({
                ...latest,
                backstory: val,
                updatedAt: new Date().toISOString()
              }))
            }}
          />
        )}
      </div>

      {/* Notes */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.notesSection.notes')}</div>
        {readonly ? (
          <p className="text-sm text-gray-400 whitespace-pre-wrap">{notes || t('sheet.notesSection.none')}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={notes}
            placeholder={t('sheet.notesSection.notesPlaceholder')}
            onBlur={(e) => {
              const val = e.target.value
              saveField(character, (latest) => ({
                ...latest,
                notes: val,
                updatedAt: new Date().toISOString()
              }))
            }}
          />
        )}
      </div>

      {/* Character Details subsection */}
      <div className="border-t border-gray-700 pt-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
          {t('sheet.notesSection.characterDetails')}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {/* Gender */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-0.5">{t('sheet.notesSection.gender')}</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.gender || t('sheet.notesSection.dash')}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.gender ?? ''}
                placeholder={t('sheet.notesSection.gender')}
                onBlur={(e) => {
                  const val = e.target.value
                  saveField(character, (latest) => ({
                    ...latest,
                    details: { ...latest.details, gender: val },
                    updatedAt: new Date().toISOString()
                  }))
                }}
              />
            )}
          </div>
          {/* Deity */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-0.5">{t('sheet.notesSection.deity')}</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.deity || t('sheet.notesSection.dash')}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.deity ?? ''}
                placeholder={t('sheet.notesSection.deity')}
                onBlur={(e) => {
                  const val = e.target.value
                  saveField(character, (latest) => ({
                    ...latest,
                    details: { ...latest.details, deity: val },
                    updatedAt: new Date().toISOString()
                  }))
                }}
              />
            )}
          </div>
          {/* Age */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-0.5">{t('sheet.notesSection.age')}</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.age || t('sheet.notesSection.dash')}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.age ?? ''}
                placeholder={t('sheet.notesSection.age')}
                onBlur={(e) => {
                  const val = e.target.value
                  saveField(character, (latest) => ({
                    ...latest,
                    details: { ...latest.details, age: val },
                    updatedAt: new Date().toISOString()
                  }))
                }}
              />
            )}
          </div>
          {/* Height */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-0.5">{t('sheet.notesSection.height')}</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.height || t('sheet.notesSection.dash')}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.height ?? ''}
                placeholder={t('sheet.notesSection.height')}
                onBlur={(e) => {
                  const val = e.target.value
                  saveField(character, (latest) => ({
                    ...latest,
                    details: { ...latest.details, height: val },
                    updatedAt: new Date().toISOString()
                  }))
                }}
              />
            )}
          </div>
          {/* Weight */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-0.5">{t('sheet.notesSection.weight')}</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.weight || t('sheet.notesSection.dash')}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.weight ?? ''}
                placeholder={t('sheet.notesSection.weight')}
                onBlur={(e) => {
                  const val = e.target.value
                  saveField(character, (latest) => ({
                    ...latest,
                    details: { ...latest.details, weight: val },
                    updatedAt: new Date().toISOString()
                  }))
                }}
              />
            )}
          </div>
          {/* Eyes */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-0.5">{t('sheet.notesSection.eyes')}</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.eyes || t('sheet.notesSection.dash')}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.eyes ?? ''}
                placeholder={t('sheet.notesSection.eyes')}
                onBlur={(e) => {
                  const val = e.target.value
                  saveField(character, (latest) => ({
                    ...latest,
                    details: { ...latest.details, eyes: val },
                    updatedAt: new Date().toISOString()
                  }))
                }}
              />
            )}
          </div>
          {/* Hair */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-0.5">{t('sheet.notesSection.hair')}</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.hair || t('sheet.notesSection.dash')}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.hair ?? ''}
                placeholder={t('sheet.notesSection.hair')}
                onBlur={(e) => {
                  const val = e.target.value
                  saveField(character, (latest) => ({
                    ...latest,
                    details: { ...latest.details, hair: val },
                    updatedAt: new Date().toISOString()
                  }))
                }}
              />
            )}
          </div>
          {/* Skin */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-0.5">{t('sheet.notesSection.skin')}</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.skin || t('sheet.notesSection.dash')}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.skin ?? ''}
                placeholder={t('sheet.notesSection.skin')}
                onBlur={(e) => {
                  const val = e.target.value
                  saveField(character, (latest) => ({
                    ...latest,
                    details: { ...latest.details, skin: val },
                    updatedAt: new Date().toISOString()
                  }))
                }}
              />
            )}
          </div>
        </div>
        {/* Appearance */}
        <div className="mt-3">
          <label className="text-xs text-gray-500 mb-0.5 block">{t('sheet.notesSection.appearance')}</label>
          {readonly ? (
            <p className="text-sm text-gray-300">{character.details.appearance || t('sheet.notesSection.dash')}</p>
          ) : (
            <textarea
              className={textareaClass}
              defaultValue={character.details.appearance ?? ''}
              placeholder={t('sheet.notesSection.appearancePlaceholder')}
              onBlur={(e) => {
                const val = e.target.value
                saveField(character, (latest) => ({
                  ...latest,
                  details: { ...latest.details, appearance: val },
                  updatedAt: new Date().toISOString()
                }))
              }}
            />
          )}
        </div>
      </div>
    </SheetSectionWrapper>
  )
}
