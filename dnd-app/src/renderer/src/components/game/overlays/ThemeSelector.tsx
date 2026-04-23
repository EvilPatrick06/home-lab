import { useState } from 'react'
import { getTheme, getThemeNames, setTheme, type ThemeName } from '../../../services/theme-manager'

interface ThemeSelectorProps {
  onClose?: () => void
}

const THEME_LABELS: Record<ThemeName, string> = {
  dark: 'Dark',
  parchment: 'Parchment',
  'high-contrast': 'High Contrast',
  'royal-purple': 'Royal Purple'
}

/** Preview swatches: [background, text, accent] */
const THEME_SWATCHES: Record<ThemeName, [string, string, string]> = {
  dark: ['#030712', '#f3f4f6', '#d97706'],
  parchment: ['#f5f0e1', '#2c1810', '#b8860b'],
  'high-contrast': ['#000000', '#ffffff', '#ffff00'],
  'royal-purple': ['#1a0a2e', '#c0c0c0', '#9b59b6']
}

export default function ThemeSelector({ onClose }: ThemeSelectorProps): JSX.Element {
  const [active, setActive] = useState<ThemeName>(getTheme)

  const handleSelect = (theme: ThemeName): void => {
    setTheme(theme)
    setActive(theme)
  }

  return (
    <div className="w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl overflow-hidden shadow-xl">
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-200">Theme</span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors cursor-pointer text-sm leading-none"
            title="Close"
          >
            &#10005;
          </button>
        )}
      </div>

      <div className="py-1">
        {getThemeNames().map((name) => {
          const [bg, text, accent] = THEME_SWATCHES[name]
          const isActive = name === active

          return (
            <button
              key={name}
              onClick={() => handleSelect(name)}
              className={`w-full px-4 py-2 flex items-center gap-3 text-left text-xs transition-colors cursor-pointer ${
                isActive ? 'bg-gray-800 text-gray-100' : 'text-gray-300 hover:bg-gray-800/60 hover:text-gray-100'
              }`}
            >
              {/* Color swatches */}
              <span className="flex gap-1 shrink-0">
                <span
                  className="w-3.5 h-3.5 rounded-sm border border-gray-600"
                  style={{ backgroundColor: bg }}
                  title="Background"
                />
                <span
                  className="w-3.5 h-3.5 rounded-sm border border-gray-600"
                  style={{ backgroundColor: text }}
                  title="Text"
                />
                <span
                  className="w-3.5 h-3.5 rounded-sm border border-gray-600"
                  style={{ backgroundColor: accent }}
                  title="Accent"
                />
              </span>

              <span className="flex-1">{THEME_LABELS[name]}</span>

              {isActive && <span className="text-amber-400 text-[10px] font-semibold shrink-0">Active</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
