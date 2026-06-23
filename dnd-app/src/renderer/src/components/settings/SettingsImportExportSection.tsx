import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { exportEntities, importEntities } from '../../services/io/entity-io'
import { importDndBeyondCharacter } from '../../services/io/import-export'
import { useOnboardingStore } from '../../stores/use-onboarding-store'
import { Section } from './SettingsSection'

export function SettingsImportExportSection(): JSX.Element {
  const { t } = useT()
  return (
    <Section title={t('pages.settingsPage.settingsImportExport')}>
      <p className="text-xs text-muted mb-3">{t('pages.settingsPage.settingsImportExportDesc')}</p>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            try {
              const settings = await window.api.loadSettings()
              const prefs: Record<string, string> = {}
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                // Export all settings keys, even those without dnd-vtt- prefixes
                if (key) prefs[key] = localStorage.getItem(key) ?? ''
              }

              // Use the globally defined __APP_VERSION__ constant
              const appVersion = __APP_VERSION__
              const ok = await exportEntities('settings', [{ settings, preferences: prefs, appVersion }])
              if (ok) addToast(t('pages.settingsPage.toastSettingsExported'), 'success')
            } catch {
              addToast(t('pages.settingsPage.toastSettingsExportFailed'), 'error')
            }
          }}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer"
        >
          {t('pages.settingsPage.exportSettings')}
        </button>
        <button
          onClick={async () => {
            try {
              const result = await importEntities<{
                settings?: Record<string, unknown>
                preferences?: Record<string, string>
                appVersion?: string
              }>('settings')
              if (!result) return
              const item = result.items[0]

              if (item.appVersion && item.appVersion !== __APP_VERSION__) {
                if (
                  !window.confirm(
                    t('pages.settingsPage.versionMismatchConfirm', {
                      fileVersion: item.appVersion,
                      appVersion: __APP_VERSION__
                    })
                  )
                ) {
                  return
                }
              }

              if (item.settings) {
                await window.api.saveSettings(item.settings as Parameters<typeof window.api.saveSettings>[0])
              }
              if (item.preferences) {
                for (const [key, value] of Object.entries(item.preferences)) {
                  if (typeof value === 'string') {
                    localStorage.setItem(key, value)
                  }
                }
              }

              addToast(t('pages.settingsPage.toastSettingsImported'), 'success')
              setTimeout(() => window.location.reload(), 1500)
            } catch (err) {
              addToast(err instanceof Error ? err.message : t('pages.settingsPage.toastSettingsImportFailed'), 'error')
            }
          }}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer"
        >
          {t('pages.settingsPage.importSettings')}
        </button>
        <button
          onClick={async () => {
            try {
              const res = await window.api.log.openFolder()
              if (res.ok) addToast(t('pages.settingsPage.toastLogRevealed'), 'success')
              else addToast(t('pages.settingsPage.logUnavailableWeb'), 'info')
            } catch {
              addToast(t('pages.settingsPage.toastLogRevealFailed'), 'error')
            }
          }}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer"
        >
          {t('pages.settingsPage.openLogFolder')}
        </button>
        <button
          type="button"
          onClick={() => useOnboardingStore.getState().open()}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer"
        >
          {t('onboarding.replay')}
        </button>
        <button
          onClick={async () => {
            try {
              const result = await importDndBeyondCharacter()
              if (result) {
                addToast(t('pages.settingsPage.toastDdbImported'), 'success')
              }
            } catch {
              addToast(t('pages.settingsPage.toastDdbImportFailed'), 'error')
            }
          }}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-purple-600 hover:text-purple-400 transition-colors cursor-pointer"
        >
          {t('pages.settingsPage.ddbImport')}
        </button>
      </div>
    </Section>
  )
}
