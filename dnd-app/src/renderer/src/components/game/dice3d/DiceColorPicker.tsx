import { useState } from 'react'
import { useT } from '../../../i18n'
import type { DiceColors } from '.'
import { DEFAULT_DICE_COLORS, DICE_COLOR_PRESETS } from '.'

interface DiceColorPickerProps {
  colors: DiceColors
  onChange: (colors: DiceColors) => void
}

export default function DiceColorPicker({ colors, onChange }: DiceColorPickerProps): JSX.Element {
  const { t } = useT()
  const [showCustom, setShowCustom] = useState(false)

  const isPreset = DICE_COLOR_PRESETS.some(
    (p) => p.bodyColor === colors.bodyColor && p.numberColor === colors.numberColor
  )

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-300">{t('game.diceColorPicker.diceColors')}</div>

      {/* Presets */}
      <div className="grid grid-cols-4 gap-2">
        {DICE_COLOR_PRESETS.map((preset) => {
          const isActive = preset.bodyColor === colors.bodyColor && preset.numberColor === colors.numberColor
          return (
            <button
              key={preset.label}
              onClick={() => {
                onChange({ bodyColor: preset.bodyColor, numberColor: preset.numberColor })
                setShowCustom(false)
              }}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                isActive ? 'border-amber-500 bg-gray-700/50' : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
              }`}
              title={preset.label}
            >
              {/* Mini die preview */}
              <div
                className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold border border-gray-600"
                style={{
                  backgroundColor: preset.bodyColor,
                  color: preset.numberColor
                }}
              >
                20
              </div>
              <span className="text-xs text-gray-400 truncate w-full text-center">{preset.label}</span>
            </button>
          )
        })}
      </div>

      {/* Custom toggle */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className={`text-xs px-3 py-1 rounded border transition-colors ${
          showCustom || !isPreset
            ? 'border-amber-500 text-amber-400'
            : 'border-gray-600 text-gray-400 hover:text-gray-300'
        }`}
      >
        {t('game.diceColorPicker.customColors')}
      </button>

      {/* Custom color inputs */}
      {showCustom && (
        <div className="space-y-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-400 w-16">{t('game.diceColorPicker.body')}</label>
            <input
              type="color"
              value={colors.bodyColor}
              onChange={(e) => onChange({ ...colors, bodyColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
            />
            <input
              type="text"
              value={colors.bodyColor}
              onChange={(e) => {
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  onChange({ ...colors, bodyColor: e.target.value })
                }
              }}
              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 w-20 font-mono"
              placeholder={t('game.diceColorPicker.bodyPlaceholder')}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-400 w-16">{t('game.diceColorPicker.numbers')}</label>
            <input
              type="color"
              value={colors.numberColor}
              onChange={(e) => onChange({ ...colors, numberColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
            />
            <input
              type="text"
              value={colors.numberColor}
              onChange={(e) => {
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  onChange({ ...colors, numberColor: e.target.value })
                }
              }}
              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 w-20 font-mono"
              placeholder={t('game.diceColorPicker.numberPlaceholder')}
            />
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-gray-500">{t('game.diceColorPicker.preview')}</span>
            <div
              className="w-10 h-10 rounded flex items-center justify-center text-sm font-bold border border-gray-600"
              style={{
                backgroundColor: colors.bodyColor,
                color: colors.numberColor
              }}
            >
              20
            </div>
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold border border-gray-600"
              style={{
                backgroundColor: colors.bodyColor,
                color: colors.numberColor
              }}
            >
              6
            </div>
          </div>

          <button onClick={() => onChange(DEFAULT_DICE_COLORS)} className="text-xs text-gray-500 hover:text-gray-300">
            {t('game.diceColorPicker.resetToDefault')}
          </button>
        </div>
      )}
    </div>
  )
}
