import { useRef, useState } from 'react'
import { xpThresholdForNextLevel } from '../../../data/xp-thresholds'
import { PRESET_ICONS } from '../../../stores/use-builder-store'
import { useCharacterStore } from '../../../stores/use-character-store'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import { CharacterIcon, getCharacterIconProps } from '../../builder/shared/IconPicker'

interface SheetHeader5eProps {
  character: Character5e
  onEdit?: () => void
  onClose?: () => void
  readonly?: boolean
}

export default function SheetHeader5e({ character, onEdit, onClose, readonly }: SheetHeader5eProps): JSX.Element {
  const saveCharacter = useCharacterStore((s) => s.saveCharacter)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(character.name)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showInspirationTransfer, setShowInspirationTransfer] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isMulticlass = character.classes.length > 1
  const className = isMulticlass
    ? character.classes.map((c) => `${c.name} ${c.level}`).join(' / ')
    : character.classes.map((c) => c.name).join(' / ')
  const speciesName = character.subspecies ? `${character.subspecies} ${character.species}` : character.species
  const subtitle = `${character.background} \u00B7 ${character.alignment || 'No alignment'}`

  const iconProps = getCharacterIconProps(character)

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
    if (!target || target.gameSystem !== 'dnd5e') return

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

  // Get other 5e characters that don't have inspiration (for transfer)
  const transferTargets = useCharacterStore((s) =>
    s.characters.filter((c) => c.id !== character.id && is5eCharacter(c) && !c.heroicInspiration)
  )

  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="relative">
        {!readonly ? (
          <button
            onClick={() => setShowIconPicker(!showIconPicker)}
            className="cursor-pointer"
            aria-label="Change character icon"
            title="Change icon"
          >
            <CharacterIcon {...iconProps} size="lg" />
          </button>
        ) : (
          <CharacterIcon {...iconProps} size="lg" />
        )}

        {showIconPicker && !readonly && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl w-64">
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => saveIcon(undefined, undefined)}
                className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700"
              >
                Letter
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700"
              >
                Upload
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
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  {icon.emoji}
                </button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {!readonly && editingName ? (
          <input
            type="text"
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
            className="text-3xl font-bold text-amber-400 bg-gray-800 border border-amber-500 rounded px-2 py-0.5 w-full focus:outline-none"
          />
        ) : (
          <h2
            className={`text-3xl font-bold text-amber-400 truncate ${!readonly ? 'cursor-pointer hover:text-amber-300' : ''}`}
            onClick={() => {
              if (!readonly) {
                setNameValue(character.name)
                setEditingName(true)
              }
            }}
            title={!readonly ? 'Click to edit name' : undefined}
          >
            {character.name}
          </h2>
        )}
        <p className="text-gray-400">
          Level {character.level} {speciesName} {className}
        </p>
        <p className="text-gray-500 text-sm">{subtitle}</p>
        {/* Leveling mode + XP display */}
        <div className="flex items-center gap-2 mt-0.5">
          {readonly ? (
            character.levelingMode === 'xp' && (
              <span className="text-xs text-gray-500">
                XP: <span className="text-gray-300">{character.xp}</span>
                <span className="text-gray-600">
                  {' '}
                  / {character.level >= 20 ? 'MAX' : xpThresholdForNextLevel(character.level)}
                </span>
              </span>
            )
          ) : (
            <>
              <select
                className="text-xs bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-400 focus:outline-none focus:border-amber-500"
                value={character.levelingMode}
                onChange={(e) => {
                  const val = e.target.value as 'xp' | 'milestone'
                  const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
                  const updated = { ...latest, levelingMode: val, updatedAt: new Date().toISOString() }
                  saveCharacter(updated)
                }}
              >
                <option value="milestone">Milestone</option>
                <option value="xp">XP</option>
              </select>
              {character.levelingMode === 'xp' && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">XP:</span>
                  <input
                    type="number"
                    className="w-20 text-xs bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-300 focus:outline-none focus:border-amber-500"
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
                    / {character.level >= 20 ? 'MAX' : xpThresholdForNextLevel(character.level)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        {/* Heroic Inspiration (5e) */}
        <div className="flex items-center gap-1 mt-0.5 relative">
          {readonly ? (
            <span className="text-lg" title="Heroic Inspiration">
              {character.heroicInspiration ? '\u2605' : '\u2606'}
            </span>
          ) : (
            <button
              className="text-lg cursor-pointer"
              onClick={toggleInspiration}
              title={
                character.heroicInspiration ? 'Give Heroic Inspiration to another player' : 'Gain Heroic Inspiration'
              }
            >
              {character.heroicInspiration ? (
                <span className="text-amber-400">{'\u2605'}</span>
              ) : (
                <span className="text-gray-500">{'\u2606'}</span>
              )}
            </button>
          )}
          <span className="text-xs text-gray-500">Heroic Inspiration</span>

          {/* Transfer dropdown */}
          {showInspirationTransfer && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-amber-500/50 rounded-lg p-2 shadow-xl w-56">
              <p className="text-[10px] text-amber-400 font-semibold mb-1.5">Give Inspiration To:</p>
              {transferTargets.length === 0 ? (
                <p className="text-[10px] text-gray-500">No eligible characters</p>
              ) : (
                transferTargets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => transferInspiration(t.id)}
                    className="w-full text-left px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 rounded cursor-pointer"
                  >
                    {t.name}
                  </button>
                ))
              )}
              <div className="border-t border-gray-700 mt-1.5 pt-1.5">
                <button
                  onClick={removeInspiration}
                  className="w-full text-left px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 rounded cursor-pointer"
                >
                  Remove (don't transfer)
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
            className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors"
          >
            Edit
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-300 text-2xl cursor-pointer w-8 h-8 flex items-center justify-center"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        )}
      </div>
    </div>
  )
}
