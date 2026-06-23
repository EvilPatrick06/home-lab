import { useEffect } from 'react'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { usePluginStore } from '../../stores/use-plugin-store'

export function PluginManager(): JSX.Element {
  const { t } = useT()
  const plugins = usePluginStore((s) => s.plugins)
  const initialized = usePluginStore((s) => s.initialized)
  const enablePlugin = usePluginStore((s) => s.enablePlugin)
  const disablePlugin = usePluginStore((s) => s.disablePlugin)
  const installPlugin = usePluginStore((s) => s.installPlugin)
  const uninstallPlugin = usePluginStore((s) => s.uninstallPlugin)
  const refreshPluginList = usePluginStore((s) => s.refreshPluginList)

  useEffect(() => {
    refreshPluginList()
  }, [refreshPluginList])

  const handleToggle = async (plugin: (typeof plugins)[number]): Promise<void> => {
    try {
      if (plugin.enabled) {
        await disablePlugin(plugin.id)
      } else {
        await enablePlugin(plugin.id)
      }
      addToast(
        plugin.enabled
          ? t('pages.settingsPage.toastPluginDisabled', { name: plugin.manifest.name })
          : t('pages.settingsPage.toastPluginEnabled', { name: plugin.manifest.name }),
        'success'
      )
    } catch {
      addToast(t('pages.settingsPage.toastPluginToggleFailed'), 'error')
    }
  }

  const handleInstall = async (): Promise<void> => {
    const result = await installPlugin()
    if (result.success) {
      addToast(t('pages.settingsPage.toastPluginInstalled'), 'success')
    } else if (result.error && result.error !== 'Cancelled') {
      addToast(result.error, 'error')
    }
  }

  const handleUninstall = async (plugin: (typeof plugins)[number]): Promise<void> => {
    const result = await uninstallPlugin(plugin.id)
    if (result.success) {
      addToast(t('pages.settingsPage.toastPluginUninstalled', { name: plugin.manifest.name }), 'success')
    } else {
      addToast(result.error ?? t('pages.settingsPage.toastUninstallFailed'), 'error')
    }
  }

  if (!initialized) {
    return <p className="text-xs text-gray-500">{t('pages.settingsPage.scanningPlugins')}</p>
  }

  return (
    <div className="space-y-3">
      {/* Phase 28g.2 — plugin trust-model warning. Plugins run with full access
          to game data; only install ones you trust. */}
      <p className="text-[11px] text-accent/90 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1">
        {t('pages.settingsPage.pluginTrustWarning')}
      </p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {plugins.length === 0
            ? t('pages.settingsPage.noPluginsInstalled')
            : plugins.length !== 1
              ? t('pages.settingsPage.pluginsFoundPlural', { count: plugins.length })
              : t('pages.settingsPage.pluginsFoundSingular', { count: plugins.length })}
        </p>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-accent-strong text-white transition-colors cursor-pointer"
        >
          {t('pages.settingsPage.installFromFile')}
        </button>
      </div>

      {plugins.map((plugin) => (
        <div
          key={plugin.id}
          className={`p-3 rounded-lg border transition-colors ${
            plugin.error
              ? 'border-red-700/50 bg-red-900/10'
              : plugin.enabled
                ? 'border-amber-700/30 bg-amber-900/10'
                : 'border-border/50 bg-surface-2/30'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200 truncate">{plugin.manifest.name ?? plugin.id}</span>
                <span className="text-xs text-gray-500 font-mono">v{plugin.manifest.version ?? '?'}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700/50 text-muted">{plugin.manifest.type}</span>
                {plugin.loaded && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">
                    {t('pages.settingsPage.pluginLoaded')}
                  </span>
                )}
                {plugin.error && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">
                    {t('pages.settingsPage.pluginError')}
                  </span>
                )}
              </div>
              {!!plugin.manifest.description && (
                <p className="text-xs text-muted mt-1 truncate">{plugin.manifest.description}</p>
              )}
              {!!plugin.manifest.author && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('pages.settingsPage.pluginBy', { author: plugin.manifest.author })}
                </p>
              )}
              {plugin.error && <p className="text-xs text-red-400 mt-1">{plugin.error}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!plugin.error && (
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="plugin-enabled"
                    checked={plugin.enabled}
                    onChange={() => handleToggle(plugin)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600" />
                </label>
              )}
              <button
                onClick={() => handleUninstall(plugin)}
                className="px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-muted hover:text-red-400 hover:border-red-600 cursor-pointer"
              >
                {t('pages.settingsPage.uninstall')}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
