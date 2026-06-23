import { useState } from 'react'
import { LANGUAGE_DESCRIPTIONS } from '../../../data/language-descriptions'
import { useT } from '../../../i18n'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import { ALL_LANGUAGES_5E } from '../../../types/character-common'

interface TraitEditor5eProps {
  character: Character5e
  readonly?: boolean
  getLatest: () => Character5e | undefined
  saveAndBroadcast: (updated: Character5e) => void
}

export default function TraitEditor5e({
  character,
  readonly,
  getLatest,
  saveAndBroadcast
}: TraitEditor5eProps): JSX.Element {
  const { t } = useT()
  const [showAddPet, setShowAddPet] = useState(false)
  const [petName, setPetName] = useState('')
  const [petType, setPetType] = useState('')
  const [showAddLanguage, setShowAddLanguage] = useState<false | 'list' | 'custom'>(false)
  const [newLanguage, setNewLanguage] = useState('')
  const [newLangDesc, setNewLangDesc] = useState('')
  const [langSearch, setLangSearch] = useState('')
  const [expandedLanguage, setExpandedLanguage] = useState<string | null>(null)

  const pets = character.pets ?? []
  const languages: string[] = character.proficiencies.languages

  const handleRemovePet = (index: number): void => {
    const latest = getLatest()
    if (!latest) return
    const currentPets = latest.pets ?? []
    const updated = {
      ...latest,
      pets: currentPets.filter((_, i) => i !== index),
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated as Character5e)
  }

  const handleAddPet = (): void => {
    const name = petName.trim()
    if (!name) return
    const latest = getLatest()
    if (!latest) return
    const currentPets = latest.pets ?? []
    const updated = {
      ...latest,
      pets: [...currentPets, { name, type: petType.trim() || '' }],
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated as Character5e)
    setPetName('')
    setPetType('')
    setShowAddPet(false)
  }

  const handleRemoveLanguage = (lang: string): void => {
    const latest = getLatest()
    if (!latest) return
    const updated = {
      ...latest,
      proficiencies: {
        ...latest.proficiencies,
        languages: latest.proficiencies.languages.filter((x) => x !== lang)
      },
      updatedAt: new Date().toISOString()
    }
    saveAndBroadcast(updated)
  }

  const handleAddLanguageFromList = (lang: string): void => {
    const latest = getLatest()
    if (!latest) return
    if (latest.proficiencies.languages.includes(lang)) return
    const updated = {
      ...latest,
      proficiencies: {
        ...latest.proficiencies,
        languages: [...latest.proficiencies.languages, lang]
      },
      updatedAt: new Date().toISOString()
    }
    saveAndBroadcast(updated)
  }

  const handleAddCustomLanguage = (): void => {
    const lang = newLanguage.trim()
    if (!lang) return
    const latest = getLatest()
    if (!latest) return
    if (latest.proficiencies.languages.includes(lang)) return
    const desc = newLangDesc.trim()
    const updated = {
      ...latest,
      proficiencies: {
        ...latest.proficiencies,
        languages: [...latest.proficiencies.languages, lang]
      },
      languageDescriptions: desc ? { ...latest.languageDescriptions, [lang]: desc } : latest.languageDescriptions,
      updatedAt: new Date().toISOString()
    }
    saveAndBroadcast(updated)
    setNewLanguage('')
    setNewLangDesc('')
    setShowAddLanguage(false)
  }

  return (
    <>
      {/* Pets */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.traitEditor.pets')}</div>
        {pets.length > 0 ? (
          <div className="space-y-1">
            {pets.map((pet, i) => (
              <div key={i} className="flex items-center justify-between bg-surface-2/50 rounded px-2 py-1 text-sm">
                <div>
                  <span className="text-gray-300 font-medium">{pet.name}</span>
                  {pet.type && <span className="text-gray-500 text-xs ml-1.5">({pet.type})</span>}
                </div>
                {!readonly && (
                  <button
                    onClick={() => handleRemovePet(i)}
                    className="text-gray-600 hover:text-red-400 cursor-pointer text-xs ml-2"
                    title={t('sheet.traitEditor.removePet')}
                  >
                    &#x2715;
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t('sheet.traitEditor.noPets')}</p>
        )}
        {!readonly && (
          <div className="mt-2">
            {showAddPet ? (
              <div className="bg-surface-2/50 rounded p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    aria-label={t('sheet.traitEditor.petNamePlaceholder')}
                    type="text"
                    name="pet-name"
                    placeholder={t('sheet.traitEditor.petNamePlaceholder')}
                    value={petName}
                    onChange={(e) => setPetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddPet()
                    }}
                    className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
                  />
                  <input
                    aria-label={t('sheet.traitEditor.petTypePlaceholder')}
                    type="text"
                    name="pet-type"
                    placeholder={t('sheet.traitEditor.petTypePlaceholder')}
                    value={petType}
                    onChange={(e) => setPetType(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddPet()
                    }}
                    className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleAddPet}
                    disabled={!petName.trim()}
                    className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong disabled:opacity-50 rounded text-white cursor-pointer"
                  >
                    {t('sheet.traitEditor.add')}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddPet(false)
                      setPetName('')
                      setPetType('')
                    }}
                    className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
                  >
                    {t('common.actions.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddPet(true)}
                className="text-xs text-accent hover:text-amber-300 cursor-pointer"
              >
                {t('sheet.traitEditor.addPet')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Languages as green pills */}
      {languages.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.traitEditor.languages')}</div>
          <div className="flex flex-wrap gap-1.5">
            {languages.map((lang) => {
              const desc = character.languageDescriptions?.[lang] || LANGUAGE_DESCRIPTIONS[lang]
              const isLangExpanded = expandedLanguage === lang
              return (
                <div key={lang} className="inline-flex flex-col">
                  <span
                    className={`inline-flex items-center gap-1 bg-green-900/50 text-green-300 border border-green-700/50 rounded-full px-2.5 py-0.5 text-xs ${desc ? 'cursor-pointer hover:bg-green-900/70' : ''}`}
                    onClick={() => {
                      if (desc) setExpandedLanguage(isLangExpanded ? null : lang)
                    }}
                  >
                    {lang}
                    {desc && <span className="text-green-500/60 text-xs">{isLangExpanded ? '\u25BE' : '?'}</span>}
                    {!readonly && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveLanguage(lang)
                        }}
                        className="text-green-500 hover:text-red-400 cursor-pointer ml-0.5"
                        title={t('sheet.traitEditor.removeLanguage')}
                      >
                        &#x2715;
                      </button>
                    )}
                  </span>
                  {isLangExpanded && desc && (
                    <div className="text-xs text-gray-500 bg-surface-2/50 rounded px-2 py-1 mt-1 max-w-xs">{desc}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add Language */}
      {!readonly && (
        <div className="mb-3">
          {showAddLanguage === 'list' ? (
            <div className="bg-surface-2/50 rounded p-3 space-y-2">
              <div className="text-xs text-muted font-medium mb-1">{t('sheet.traitEditor.standardLanguages')}</div>
              <input
                aria-label={t('sheet.traitEditor.searchLanguagesPlaceholder')}
                type="text"
                name="language-search"
                placeholder={t('sheet.traitEditor.searchLanguagesPlaceholder')}
                value={langSearch}
                onChange={(e) => setLangSearch(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
              />
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {ALL_LANGUAGES_5E.filter((l) => !languages.includes(l))
                  .filter((l) => !langSearch || l.toLowerCase().includes(langSearch.toLowerCase()))
                  .map((lang) => (
                    <button
                      key={lang}
                      onClick={() => handleAddLanguageFromList(lang)}
                      className="w-full flex items-center justify-between text-xs py-1 px-2 hover:bg-surface-2/50 rounded text-left cursor-pointer"
                    >
                      <span className="text-gray-300">{lang}</span>
                      {LANGUAGE_DESCRIPTIONS[lang] && (
                        <span className="text-gray-600 text-xs truncate ml-2 max-w-[60%]">
                          {LANGUAGE_DESCRIPTIONS[lang]}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowAddLanguage(false)
                    setLangSearch('')
                  }}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
                >
                  {t('common.actions.close')}
                </button>
              </div>
            </div>
          ) : showAddLanguage === 'custom' ? (
            <div className="bg-surface-2/50 rounded p-3 space-y-2">
              <div className="text-xs text-muted font-medium mb-1">{t('sheet.traitEditor.customLanguage')}</div>
              <input
                aria-label={t('sheet.traitEditor.languageNamePlaceholder')}
                type="text"
                name="language-name"
                placeholder={t('sheet.traitEditor.languageNamePlaceholder')}
                value={newLanguage}
                onChange={(e) => setNewLanguage(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
              />
              <input
                aria-label={t('sheet.traitEditor.descriptionPlaceholder')}
                type="text"
                name="language-description"
                placeholder={t('sheet.traitEditor.descriptionPlaceholder')}
                value={newLangDesc}
                onChange={(e) => setNewLangDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustomLanguage()
                }}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleAddCustomLanguage}
                  disabled={!newLanguage.trim()}
                  className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong disabled:opacity-50 rounded text-white cursor-pointer"
                >
                  {t('sheet.traitEditor.add')}
                </button>
                <button
                  onClick={() => {
                    setShowAddLanguage(false)
                    setNewLanguage('')
                    setNewLangDesc('')
                  }}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
                >
                  {t('common.actions.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddLanguage('list')}
                className="text-xs text-accent hover:text-amber-300 cursor-pointer"
              >
                {t('sheet.traitEditor.addStandardLanguage')}
              </button>
              <button
                onClick={() => setShowAddLanguage('custom')}
                className="text-xs text-accent hover:text-amber-300 cursor-pointer"
              >
                {t('sheet.traitEditor.addCustomLanguage')}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
