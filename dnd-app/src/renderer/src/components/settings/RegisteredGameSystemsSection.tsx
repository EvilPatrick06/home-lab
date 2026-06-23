import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { getAllSystems, unregisterSystem } from '../../systems/init'
import { Section } from './SettingsSection'

export function RegisteredGameSystemsSection(): JSX.Element {
  const { t } = useT()
  return (
    <Section title={t('pages.settingsPage.registeredGameSystems')}>
      {(() => {
        const systems = getAllSystems()
        if (systems.length === 0) {
          return <p className="text-xs text-gray-500">{t('pages.settingsPage.noGameSystems')}</p>
        }
        return (
          <div className="space-y-2">
            {systems.map((sys) => (
              <div key={sys.id} className="flex items-center justify-between py-2 px-3 bg-surface-2/40 rounded-lg">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-200 font-medium">{sys.name}</span>
                  <span className="text-xs text-gray-500 ml-2 font-mono">{sys.id}</span>
                </div>
                {sys.id !== 'dnd5e' && (
                  <button
                    onClick={() => {
                      unregisterSystem(sys.id)
                      addToast(t('pages.settingsPage.toastSystemUnregistered', { name: sys.name }), 'success')
                    }}
                    className="px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-muted hover:text-red-400 hover:border-red-600 cursor-pointer"
                  >
                    {t('pages.settingsPage.remove')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      })()}
    </Section>
  )
}
