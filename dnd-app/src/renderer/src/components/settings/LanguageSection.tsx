import { i18n, LOCALE_LABELS, SUPPORTED_LOCALES, setLocale, useT } from '../../i18n'
import { Section } from './SettingsSection'

export function LanguageSection(): JSX.Element {
  const { t } = useT()
  return (
    <Section title={t('pages.settingsPage.language')}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">{t('pages.settingsPage.language')}</span>
        <select
          value={i18n.language}
          onChange={(e) => setLocale(e.target.value as (typeof SUPPORTED_LOCALES)[number])}
          className="w-48 px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-gray-200 focus:border-amber-500 focus:outline-none"
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <option key={loc} value={loc}>
              {LOCALE_LABELS[loc]}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-gray-500 mt-2">{t('pages.settingsPage.languageDescription')}</p>
    </Section>
  )
}
