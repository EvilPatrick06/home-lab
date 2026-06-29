import { useCallback, useState } from 'react'
import { useT } from '../../i18n'
import { getTheme, getThemeNames, setTheme, type ThemeName } from '../../services/theme-manager'
import { Section } from './SettingsSection'

const THEME_LABEL_KEYS: Record<ThemeName, string> = {
  dark: 'pages.settingsPage.themeDark',
  parchment: 'pages.settingsPage.themeParchment',
  'high-contrast': 'pages.settingsPage.themeHighContrast',
  'royal-purple': 'pages.settingsPage.themeRoyalPurple'
}
const THEME_PREVIEWS: Record<ThemeName, { bg: string; accent: string; text: string }> = {
  dark: { bg: 'bg-surface', accent: 'bg-amber-600', text: 'text-fg' },
  parchment: { bg: 'bg-amber-100', accent: 'bg-yellow-700', text: 'text-amber-950' },
  'high-contrast': { bg: 'bg-black', accent: 'bg-yellow-400', text: 'text-white' },
  'royal-purple': { bg: 'bg-purple-950', accent: 'bg-purple-500', text: 'text-gray-200' }
}

export function ThemeSection(): JSX.Element {
  const { t } = useT()
  const [activeTheme, setActiveTheme] = useState<ThemeName>(getTheme())
  const handleThemeChange = useCallback((theme: ThemeName) => {
    setTheme(theme)
    setActiveTheme(theme)
  }, [])
  return (
    <Section title={t('pages.settingsPage.theme')}>
      <div className="grid grid-cols-2 gap-3">
        {getThemeNames().map((theme) => {
          const preview = THEME_PREVIEWS[theme]
          const isActive = activeTheme === theme
          return (
            <button
              key={theme}
              onClick={() => handleThemeChange(theme)}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                isActive ? 'border-amber-500 bg-gray-700/40' : 'border-border bg-surface-2/30 hover:border-gray-600'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg ${preview.bg} border border-gray-600 flex items-center justify-center`}
              >
                <div className={`w-4 h-4 rounded ${preview.accent}`} />
              </div>
              <div className="text-start">
                <div className="text-sm font-medium text-gray-200">{t(THEME_LABEL_KEYS[theme])}</div>
                {isActive && <div className="text-xs text-accent">{t('pages.settingsPage.active')}</div>}
              </div>
            </button>
          )
        })}
      </div>
    </Section>
  )
}
