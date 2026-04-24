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
    <SheetSectionWrapper title="Notes & Backstory">
      {/* Alignment / Status / XP row */}
      <div className="flex flex-wrap items-end gap-4 mb-4">
        {/* Alignment */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1">Alignment</label>
          {readonly ? (
            <span className="text-sm text-gray-300">{character.alignment || 'None'}</span>
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
                  {a || '-- None --'}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Status */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</label>
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
              <option value="active">Active</option>
              <option value="retired">Retired</option>
              <option value="deceased">Deceased</option>
            </select>
          )}
        </div>

        {/* XP */}
        {character.levelingMode === 'xp' && (
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1">XP</label>
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
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Personality</div>
        {readonly ? (
          <p className="text-sm text-gray-400">{personality || 'None'}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={personality}
            placeholder="Personality traits..."
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
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ideals</div>
        {readonly ? (
          <p className="text-sm text-gray-400">{character.details.ideals || 'None'}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={character.details.ideals ?? ''}
            placeholder="Ideals..."
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
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bonds</div>
        {readonly ? (
          <p className="text-sm text-gray-400">{character.details.bonds || 'None'}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={character.details.bonds ?? ''}
            placeholder="Bonds..."
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
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Flaws</div>
        {readonly ? (
          <p className="text-sm text-gray-400">{character.details.flaws || 'None'}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={character.details.flaws ?? ''}
            placeholder="Flaws..."
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
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Backstory</div>
        {readonly ? (
          <p className="text-sm text-gray-400 bg-gray-900/50 border border-gray-700 rounded-lg p-3 whitespace-pre-wrap">
            {backstory || 'None'}
          </p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={backstory}
            placeholder="Character backstory..."
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
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</div>
        {readonly ? (
          <p className="text-sm text-gray-400 whitespace-pre-wrap">{notes || 'None'}</p>
        ) : (
          <textarea
            className={textareaClass}
            defaultValue={notes}
            placeholder="Additional notes..."
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
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Character Details</div>
        <div className="grid grid-cols-3 gap-3">
          {/* Gender */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-0.5">Gender</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.gender || '-'}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.gender ?? ''}
                placeholder="Gender"
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
            <label className="text-xs text-gray-500 mb-0.5">Deity</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.deity || '-'}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.deity ?? ''}
                placeholder="Deity"
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
            <label className="text-xs text-gray-500 mb-0.5">Age</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.age || '-'}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.age ?? ''}
                placeholder="Age"
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
            <label className="text-xs text-gray-500 mb-0.5">Height</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.height || '-'}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.height ?? ''}
                placeholder="Height"
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
            <label className="text-xs text-gray-500 mb-0.5">Weight</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.weight || '-'}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.weight ?? ''}
                placeholder="Weight"
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
            <label className="text-xs text-gray-500 mb-0.5">Eyes</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.eyes || '-'}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.eyes ?? ''}
                placeholder="Eyes"
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
            <label className="text-xs text-gray-500 mb-0.5">Hair</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.hair || '-'}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.hair ?? ''}
                placeholder="Hair"
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
            <label className="text-xs text-gray-500 mb-0.5">Skin</label>
            {readonly ? (
              <span className="text-sm text-gray-300">{character.details.skin || '-'}</span>
            ) : (
              <input
                type="text"
                className={inputClass}
                defaultValue={character.details.skin ?? ''}
                placeholder="Skin"
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
          <label className="text-xs text-gray-500 mb-0.5 block">Appearance</label>
          {readonly ? (
            <p className="text-sm text-gray-300">{character.details.appearance || '-'}</p>
          ) : (
            <textarea
              className={textareaClass}
              defaultValue={character.details.appearance ?? ''}
              placeholder="Describe your character's appearance..."
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
