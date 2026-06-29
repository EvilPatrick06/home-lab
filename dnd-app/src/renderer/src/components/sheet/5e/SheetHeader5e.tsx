import { useRef, useState } from 'react'
import { xpThresholdForNextLevel } from '../../../data/xp-thresholds'
import { useT } from '../../../i18n'
import { getEffectiveClasses, getEffectiveFeats } from '../../../services/character/effective-character-5e'
import { roll } from '../../../services/dice/dice-service'
import { PRESET_ICONS } from '../../../stores/use-builder-store'
import { useCharacterStore } from '../../../stores/use-character-store'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import { abilityModifier, formatMod } from '../../../types/character-common'
import { CharacterIcon, getCharacterIconProps } from '../../builder/shared/IconPicker'

interface SheetHeader5eProps {
  character: Character5e
  onEdit?: () => void
  onClose?: () => void
  readonly?: boolean
}

export default function SheetHeader5e({ character, onEdit, onClose, readonly }: SheetHeader5eProps): JSX.Element {
  const { t } = useT()
  const saveCharacter = useCharacterStore((s) => s.saveCharacter)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(character.name)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showInspirationTransfer, setShowInspirationTransfer] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Phase 15c.5 — derive class list (v3 shape) from v4 classRefs via the truth store.
  const effectiveClasses = getEffectiveClasses(character)
  const isMulticlass = effectiveClasses.length > 1
  // S-1 — title-case the class (hydrated refs can carry a lowercase "barbarian"),
  // and format lineage as "Aasimar (Heavenly Wings)" rather than jamming it in
  // front ("Heavenly Wings Aasimar").
  const titleCase = (s: string): string => s.replace(/\b\w/g, (m) => m.toUpperCase())
  const className = isMulticlass
    ? effectiveClasses.map((c) => `${titleCase(c.name)} ${c.level}`).join(' / ')
    : effectiveClasses.map((c) => titleCase(c.name)).join(' / ')
  const speciesName = character.subspecies
    ? `${titleCase(character.species)} (${titleCase(character.subspecies)})`
    : titleCase(character.species)
  const subtitle = `${character.background} \u00B7 ${character.alignment || t('sheet.sheetHeader.noAlignment')}`

  const iconProps = getCharacterIconProps(character)

  // Phase 23l — initiative roll from the sheet: 1d20 + DEX (+ proficiency if Alert).
  const profBonus = Math.ceil(character.level / 4) + 1
  const hasAlert = getEffectiveFeats(character).some((f) => f.name?.toLowerCase() === 'alert')
  const initMod = abilityModifier(character.abilityScores.dexterity) + (hasAlert ? profBonus : 0)
  const rollInitiative = (): void => {
    roll(`1d20${initMod >= 0 ? '+' : ''}${initMod}`, {
      label: t('sheet.sheetHeader.initiativeRollLabel', { name: character.name })
    })
  }

  const saveName = (): void => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === character.name) {
      setEditingName(false)
      setNameValue(character.name)
      return
    }
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    const updated = { ...latest, name: trimmed, updatedAt: new Date().toISOString() }
    saveCharacter(updated)
    setEditingName(false)
  }

  const saveIcon = (iconPreset?: string, portraitPath?: string): void => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    const updated = {
      ...latest,
      iconPreset: iconPreset ?? undefined,
      portraitPath: portraitPath ?? undefined,
      updatedAt: new Date().toISOString()
    }
    if (iconPreset) {
      updated.portraitPath = undefined
    } else if (portraitPath) {
      updated.iconPreset = undefined
    } else {
      updated.iconPreset = undefined
      updated.portraitPath = undefined
    }
    saveCharacter(updated)
    setShowIconPicker(false)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      saveIcon(undefined, reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const toggleInspiration = (): void => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    if (latest.gameSystem !== 'dnd5e') return

    // If already inspired, show transfer dropdown instead of toggling off
    if (latest.heroicInspiration) {
      setShowInspirationTransfer(!showInspirationTransfer)
      return
    }

    const updated = { ...latest, heroicInspiration: true, updatedAt: new Date().toISOString() }
    saveCharacter(updated)
  }

  const transferInspiration = (targetId: string): void => {
    const latest = (useCharacterStore.getState().characters.find((c) => c.id === character.id) ||
      character) as Character5e
    const target = useCharacterStore.getState().characters.find((c) => c.id === targetId)
    if (target?.gameSystem !== 'dnd5e') return

    // Remove from self
    saveCharacter({ ...latest, heroicInspiration: false, updatedAt: new Date().toISOString() })
    // Grant to target
    saveCharacter({ ...target, heroicInspiration: true, updatedAt: new Date().toISOString() } as typeof target)
    setShowInspirationTransfer(false)
  }

  const removeInspiration = (): void => {
    const latest = (useCharacterStore.getState().characters.find((c) => c.id === character.id) ||
      character) as Character5e
    saveCharacter({ ...latest, heroicInspiration: false, updatedAt: new Date().toISOString() })
    setShowInspirationTransfer(false)
  }

  // Get other 5e characters that don't have inspiration (for transfer).
  // Select the raw array (stable ref) and filter in the body — selecting
  // a `.filter()` result directly would return a fresh array every call,
  // which useSyncExternalStore treats as a changed snapshot and loops
  // until React throws #185 "Maximum update depth exceeded".
  const allCharacters = useCharacterStore((s) => s.characters)
  const transferTargets = allCharacters.filter((c) => c.id !== character.id && is5eCharacter(c) && !c.heroicInspiration)

  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="relative">
        {!readonly ? (
          <button
            onClick={() => setShowIconPicker(!showIconPicker)}
            className="cursor-pointer"
            aria-label={t('sheet.sheetHeader.changeIconAria')}
            title={t('sheet.sheetHeader.changeIconTitle')}
          >
            <CharacterIcon {...iconProps} size="lg" />
          </button>
        ) : (
          <CharacterIcon {...iconProps} size="lg" />
        )}

        {showIconPicker && !readonly && (
          <div className="absolute top-full start-0 mt-1 z-50 bg-surface border border-border rounded-lg p-3 shadow-xl w-64">
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => saveIcon(undefined, undefined)}
                className="px-2 py-1 text-xs rounded bg-surface-2 text-muted hover:bg-gray-700"
              >
                {t('sheet.sheetHeader.letter')}
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="px-2 py-1 text-xs rounded bg-surface-2 text-muted hover:bg-gray-700"
              >
                {t('sheet.sheetHeader.upload')}
              </button>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon.id}
                  onClick={() => saveIcon(icon.id, undefined)}
                  title={icon.label}
                  className={`w-7 h-7 rounded flex items-center justify-center text-base transition-colors ${
                    character.iconPreset === icon.id
                      ? 'bg-amber-900/40 ring-1 ring-amber-400'
                      : 'bg-surface-2 hover:bg-gray-700'
                  }`}
                >
                  {icon.emoji}
                </button>
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              name="portrait-upload"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {!readonly && editingName ? (
          <input
            type="text"
            name="character-name"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName()
              if (e.key === 'Escape') {
                setEditingName(false)
                setNameValue(character.name)
              }
            }}
            className="text-3xl font-bold text-accent bg-surface-2 border border-amber-500 rounded px-2 py-0.5 w-full focus:outline-none"
          />
        ) : (
          <h2
            className={`text-3xl font-bold text-accent truncate ${!readonly ? 'cursor-pointer hover:text-amber-300' : ''}`}
            onClick={() => {
              if (!readonly) {
                setNameValue(character.name)
                setEditingName(true)
              }
            }}
            title={!readonly ? t('sheet.sheetHeader.clickToEditName') : undefined}
          >
            {character.name}
          </h2>
        )}
        <p className="text-muted">
          {t('sheet.sheetHeader.levelLine', { level: character.level, speciesName, className })}
        </p>
        <p className="text-gray-500 text-sm">{subtitle}</p>
        {/* Phase 23l — roll initiative straight from the sheet header. */}
        <button
          onClick={rollInitiative}
          className="mt-1 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-border text-gray-300 hover:border-amber-500 hover:text-accent cursor-pointer"
          title={t('sheet.sheetHeader.rollInitiativeTitle', { mod: formatMod(initMod) })}
        >
          🎲 {t('sheet.sheetHeader.initiative', { mod: formatMod(initMod) })}
        </button>
        {/* Leveling mode + XP display */}
        <div className="flex items-center gap-2 mt-0.5">
          {readonly ? (
            character.levelingMode === 'xp' && (
              <span className="text-xs text-gray-500">
                {t('sheet.sheetHeader.xpLabel')} <span className="text-gray-300">{character.xp}</span>
                <span className="text-gray-600">
                  {' '}
                  / {character.level >= 20 ? t('sheet.sheetHeader.xpMax') : xpThresholdForNextLevel(character.level)}
                </span>
              </span>
            )
          ) : (
            <>
              <select
                className="text-xs bg-surface-2 border border-border rounded px-1 py-0.5 text-muted focus:outline-none focus:border-amber-500"
                name="leveling-mode"
                value={character.levelingMode}
                onChange={(e) => {
                  const val = e.target.value as 'xp' | 'milestone'
                  const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
                  const updated = { ...latest, levelingMode: val, updatedAt: new Date().toISOString() }
                  saveCharacter(updated)
                }}
              >
                <option value="milestone">{t('sheet.sheetHeader.milestone')}</option>
                <option value="xp">{t('sheet.sheetHeader.xp')}</option>
              </select>
              {character.levelingMode === 'xp' && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">{t('sheet.sheetHeader.xpColon')}</span>
                  <input
                    type="number"
                    name="xp"
                    className="w-20 text-xs bg-surface-2 border border-border rounded px-1 py-0.5 text-gray-300 focus:outline-none focus:border-amber-500"
                    defaultValue={character.xp}
                    min={0}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value, 10) || 0
                      const latest =
                        useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
                      const updated = { ...latest, xp: val, updatedAt: new Date().toISOString() }
                      saveCharacter(updated)
                    }}
                  />
                  <span className="text-xs text-gray-600">
                    / {character.level >= 20 ? t('sheet.sheetHeader.xpMax') : xpThresholdForNextLevel(character.level)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        {/* Heroic Inspiration (5e) */}
        <div className="flex items-center gap-1 mt-0.5 relative">
          {readonly ? (
            <span className="text-lg" title={t('sheet.sheetHeader.heroicInspiration')}>
              {character.heroicInspiration ? '\u2605' : '\u2606'}
            </span>
          ) : (
            <button
              className="text-lg cursor-pointer"
              onClick={toggleInspiration}
              title={
                character.heroicInspiration
                  ? t('sheet.sheetHeader.giveHeroicInspiration')
                  : t('sheet.sheetHeader.gainHeroicInspiration')
              }
            >
              {character.heroicInspiration ? (
                <span className="text-accent">{'\u2605'}</span>
              ) : (
                <span className="text-gray-500">{'\u2606'}</span>
              )}
            </button>
          )}
          <span className="text-xs text-gray-500">{t('sheet.sheetHeader.heroicInspiration')}</span>

          {/* Transfer dropdown */}
          {showInspirationTransfer && (
            <div className="absolute top-full start-0 mt-1 z-50 bg-surface border border-amber-500/50 rounded-lg p-2 shadow-xl w-56">
              <p className="text-xs text-accent font-semibold mb-1.5">{t('sheet.sheetHeader.giveInspirationTo')}</p>
              {transferTargets.length === 0 ? (
                <p className="text-xs text-gray-500">{t('sheet.sheetHeader.noEligibleCharacters')}</p>
              ) : (
                transferTargets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => transferInspiration(t.id)}
                    className="w-full text-start px-2 py-1 text-xs text-gray-200 hover:bg-surface-2 rounded cursor-pointer"
                  >
                    {t.name}
                  </button>
                ))
              )}
              <div className="border-t border-border mt-1.5 pt-1.5">
                <button
                  onClick={removeInspiration}
                  className="w-full text-start px-2 py-1 text-xs text-muted hover:bg-surface-2 rounded cursor-pointer"
                >
                  {t('sheet.sheetHeader.removeNoTransfer')}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-gray-600 text-xs mt-0.5">D&D 5e</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onEdit && (
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded transition-colors"
          >
            {t('sheet.sheetHeader.edit')}
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t('common.actions.close')}
            className="text-gray-500 hover:text-gray-300 text-2xl cursor-pointer w-8 h-8 flex items-center justify-center"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        )}
      </div>
    </div>
  )
}
