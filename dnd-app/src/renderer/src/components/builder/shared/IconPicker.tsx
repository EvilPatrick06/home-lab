import { useRef } from 'react'
import { PRESET_ICONS, useBuilderStore } from '../../../stores/use-builder-store'

export default function IconPicker(): JSX.Element {
  const iconType = useBuilderStore((s) => s.iconType)
  const iconPreset = useBuilderStore((s) => s.iconPreset)
  const iconCustom = useBuilderStore((s) => s.iconCustom)
  const characterName = useBuilderStore((s) => s.characterName)
  const setIconType = useBuilderStore((s) => s.setIconType)
  const setIconPreset = useBuilderStore((s) => s.setIconPreset)
  const setIconCustom = useBuilderStore((s) => s.setIconCustom)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setIconCustom(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 font-semibold uppercase">Character Icon</div>

      {/* Current icon preview */}
      <div className="flex items-center gap-3">
        <CharacterIcon
          iconType={iconType}
          iconPreset={iconPreset}
          iconCustom={iconCustom}
          name={characterName}
          size="lg"
        />
        <div className="flex gap-1">
          <button
            onClick={() => setIconType('letter')}
            className={`px-2 py-1 text-xs rounded ${
              iconType === 'letter' ? 'bg-amber-900/30 text-amber-300' : 'bg-gray-800 text-gray-400'
            }`}
          >
            Letter
          </button>
          <button
            onClick={() => setIconType('preset')}
            className={`px-2 py-1 text-xs rounded ${
              iconType === 'preset' ? 'bg-amber-900/30 text-amber-300' : 'bg-gray-800 text-gray-400'
            }`}
          >
            Preset
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className={`px-2 py-1 text-xs rounded ${
              iconType === 'custom' ? 'bg-amber-900/30 text-amber-300' : 'bg-gray-800 text-gray-400'
            }`}
          >
            Upload
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
      </div>

      {/* Preset grid */}
      <div className="grid grid-cols-9 gap-1">
        {PRESET_ICONS.map((icon) => (
          <button
            key={icon.id}
            onClick={() => setIconPreset(icon.id)}
            title={icon.label}
            className={`w-8 h-8 rounded flex items-center justify-center text-lg transition-colors ${
              iconType === 'preset' && iconPreset === icon.id
                ? 'bg-amber-900/40 ring-1 ring-amber-400'
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            {icon.emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

// Shared component for displaying character icon
export function CharacterIcon({
  iconType,
  iconPreset,
  iconCustom,
  name,
  size = 'md'
}: {
  iconType: 'letter' | 'preset' | 'custom'
  iconPreset?: string
  iconCustom?: string
  name: string
  size?: 'sm' | 'md' | 'lg'
}): JSX.Element {
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-lg',
    lg: 'w-14 h-14 text-2xl'
  }

  if (iconType === 'custom' && iconCustom) {
    return (
      <img
        src={iconCustom}
        alt={name}
        className={`${sizeClasses[size]} rounded bg-gray-800 border border-gray-600 object-cover shrink-0`}
      />
    )
  }

  if (iconType === 'preset' && iconPreset) {
    const preset = PRESET_ICONS.find((p) => p.id === iconPreset)
    return (
      <div
        className={`${sizeClasses[size]} rounded bg-gray-800 border border-gray-600 flex items-center justify-center shrink-0`}
      >
        {preset?.emoji ?? '?'}
      </div>
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded bg-gray-800 border border-gray-600 flex items-center justify-center text-amber-400 font-bold shrink-0`}
    >
      {name ? name[0].toUpperCase() : '?'}
    </div>
  )
}

// Helper to get icon props from a character object
export function getCharacterIconProps(character: { name: string; iconPreset?: string; portraitPath?: string }): {
  iconType: 'letter' | 'preset' | 'custom'
  iconPreset?: string
  iconCustom?: string
  name: string
} {
  if (character.iconPreset) {
    return { iconType: 'preset', iconPreset: character.iconPreset, name: character.name }
  }
  if (character.portraitPath) {
    return { iconType: 'custom', iconCustom: character.portraitPath, name: character.name }
  }
  return { iconType: 'letter', name: character.name }
}
