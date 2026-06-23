import { useCallback, useState } from 'react'
import { SETTINGS_KEYS } from '../../constants'
import { useT } from '../../i18n'
import { Section } from './SettingsSection'

export function GridSection(): JSX.Element {
  const { t } = useT()
  const [gridOpacity, setGridOpacity] = useState(() => {
    const saved = localStorage.getItem(SETTINGS_KEYS.GRID_OPACITY)
    return saved ? Number(saved) : 40
  })
  const [gridColor, setGridColor] = useState(() => localStorage.getItem(SETTINGS_KEYS.GRID_COLOR) ?? '#ffffff')
  const handleGridOpacityChange = useCallback((val: number) => {
    setGridOpacity(val)
    localStorage.setItem(SETTINGS_KEYS.GRID_OPACITY, String(val))
  }, [])
  const handleGridColorChange = useCallback((val: string) => {
    setGridColor(val)
    localStorage.setItem(SETTINGS_KEYS.GRID_COLOR, val)
  }, [])
  return (
    <Section title={t('pages.settingsPage.grid')}>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => {
            handleGridOpacityChange(40)
            handleGridColorChange('#ffffff')
          }}
          className="px-2 py-0.5 text-xs bg-surface border border-gray-600 rounded text-fg hover:text-red-300 cursor-pointer"
        >
          {t('pages.settingsPage.resetGridDefaults')}
        </button>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">{t('pages.settingsPage.gridOpacity')}</span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              name="grid-opacity"
              min={0}
              max={100}
              value={gridOpacity}
              onChange={(e) => handleGridOpacityChange(Number(e.target.value))}
              className="w-36 h-1 accent-amber-500 cursor-pointer"
            />
            <span className="text-sm text-muted w-10 text-right">{gridOpacity}%</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">{t('pages.settingsPage.gridColor')}</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              name="grid-color"
              value={gridColor}
              onChange={(e) => handleGridColorChange(e.target.value)}
              className="w-8 h-8 rounded border border-gray-600 cursor-pointer bg-transparent"
            />
            <span className="text-sm text-muted font-mono">{gridColor}</span>
          </div>
        </div>
      </div>
    </Section>
  )
}
