import { useState } from 'react'
import { useT } from '../../i18n'
import * as AutoSave from '../../services/io/auto-save'
import { Section } from './SettingsSection'

export function AutoSaveSection(): JSX.Element {
  const { t } = useT()
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => AutoSave.getConfig().enabled)
  const [autoSaveInterval, setAutoSaveInterval] = useState(() => AutoSave.getConfig().intervalMs / 60000)
  const [autoSaveIntervalDraft, setAutoSaveIntervalDraft] = useState(() => String(autoSaveInterval))
  return (
    <Section title={t('pages.settingsPage.autoSave')}>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => {
            setAutoSaveEnabled(true)
            setAutoSaveInterval(5)
            setAutoSaveIntervalDraft('5')
            AutoSave.setConfig({ enabled: true, intervalMs: 300000 })
          }}
          className="px-2 py-0.5 text-xs bg-surface border border-gray-600 rounded text-fg hover:text-red-300 cursor-pointer"
        >
          {t('pages.settingsPage.resetAutoSaveDefaults')}
        </button>
      </div>
      <div className="space-y-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm text-gray-300">{t('pages.settingsPage.enableAutoSave')}</span>
            <p className="text-xs text-gray-500">{t('pages.settingsPage.enableAutoSaveDesc')}</p>
          </div>
          <input
            type="checkbox"
            checked={autoSaveEnabled}
            onChange={(e) => {
              const val = e.target.checked
              setAutoSaveEnabled(val)
              AutoSave.setConfig({ enabled: val })
            }}
            className="w-4 h-4 accent-amber-500 cursor-pointer"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">{t('pages.settingsPage.intervalMinutes')}</span>
          <input
            type="number"
            min={1}
            max={60}
            value={autoSaveIntervalDraft}
            onChange={(e) => setAutoSaveIntervalDraft(e.target.value)}
            onBlur={() => {
              const raw = parseInt(autoSaveIntervalDraft, 10)
              const numeric = Number.isFinite(raw) ? raw : 1
              const val = numeric < 1 ? 1 : numeric > 60 ? 60 : numeric
              setAutoSaveInterval(val)
              setAutoSaveIntervalDraft(String(val))
              AutoSave.setConfig({ intervalMs: val * 60000 })
            }}
            disabled={!autoSaveEnabled}
            className="w-20 px-2 py-1 text-sm bg-surface border border-border rounded text-gray-300 disabled:opacity-50"
          />
        </div>
      </div>
    </Section>
  )
}
