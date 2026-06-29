import { useCallback, useEffect, useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'

interface DiscordConfig {
  enabled: boolean
  dmMode: 'webhook' | 'bot-api'
  webhookUrl: string
  botToken: string
  channelId: string
  userId: string
}

interface DiscordConfigResponse {
  success: boolean
  config?: {
    enabled: boolean
    dmMode: 'webhook' | 'bot-api'
    webhookUrl: string
    botToken: string
    channelId: string
    userId: string
  }
  error?: string
}

export default function DiscordIntegrationSettings(): JSX.Element {
  const { t } = useT()
  const [config, setConfig] = useState<DiscordConfig>({
    enabled: false,
    dmMode: 'webhook',
    webhookUrl: '',
    botToken: '',
    channelId: '',
    userId: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Load initial config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // boundary cast: IPC getConfig is typed flat in preload but resolves to a {success, config} wrapper at runtime
        const result = (await window.api.discord.getConfig()) as unknown as DiscordConfigResponse
        if (result.success && result.config) {
          setConfig({
            enabled: result.config.enabled,
            dmMode: result.config.dmMode,
            webhookUrl: result.config.webhookUrl === '[configured]' ? '' : result.config.webhookUrl,
            botToken: result.config.botToken === '[configured]' ? '' : result.config.botToken,
            channelId: result.config.channelId,
            userId: result.config.userId
          })
        }
      } catch {
        addToast(t('ui.discordIntegration.loadFailed'), 'error')
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [t])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // Build the config to save - if field shows '[configured]', keep existing
      const currentConfig = (await window.api.discord.getConfig()) as unknown as DiscordConfigResponse
      const configToSave: DiscordConfig = {
        ...config,
        webhookUrl: config.webhookUrl || (currentConfig.config?.webhookUrl === '[configured]' ? 'keep' : ''),
        botToken: config.botToken || (currentConfig.config?.botToken === '[configured]' ? 'keep' : '')
      }

      const result = await window.api.discord.saveConfig(configToSave)
      if (result.success) {
        addToast(t('ui.discordIntegration.saveSuccess'), 'success')
        setHasChanges(false)
        // Reload to get the masked values
        const refreshed = (await window.api.discord.getConfig()) as unknown as DiscordConfigResponse
        if (refreshed.success && refreshed.config) {
          setConfig((prev) => ({
            ...prev,
            webhookUrl: refreshed.config!.webhookUrl === '[configured]' ? '' : prev.webhookUrl,
            botToken: refreshed.config!.botToken === '[configured]' ? '' : prev.botToken
          }))
        }
      } else {
        addToast((result as { error?: string }).error || t('ui.discordIntegration.saveFailed'), 'error')
      }
    } catch {
      addToast(t('ui.discordIntegration.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }, [config, t])

  const handleTest = useCallback(async () => {
    setTesting(true)
    try {
      // First save any pending changes
      if (hasChanges) {
        await handleSave()
      }

      const result = await window.api.discord.testConnection()
      if (result.success) {
        addToast(t('ui.discordIntegration.testSuccess'), 'success')
      } else {
        addToast(result.error || t('ui.discordIntegration.testSendFailed'), 'error')
      }
    } catch {
      addToast(t('ui.discordIntegration.testConnectionFailed'), 'error')
    } finally {
      setTesting(false)
    }
  }, [hasChanges, handleSave, t])

  const updateConfig = useCallback((updates: Partial<DiscordConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }))
    setHasChanges(true)
  }, [])

  if (loading) {
    return <p className="text-xs text-gray-500">{t('ui.discordIntegration.loading')}</p>
  }

  return (
    <div className="space-y-4">
      {/* Enable/Disable Toggle */}
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <span className="text-sm text-gray-300">{t('ui.discordIntegration.pushToDiscord')}</span>
          <p className="text-xs text-gray-500">{t('ui.discordIntegration.pushToDiscordDesc')}</p>
        </div>
        <input
          type="checkbox"
          name="discord-enabled"
          checked={config.enabled}
          onChange={(e) => updateConfig({ enabled: e.target.checked })}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
      </label>

      {config.enabled && (
        <>
          {/* DM Mode Selection */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <span className="text-sm text-gray-300 block">{t('ui.discordIntegration.integrationMode')}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateConfig({ dmMode: 'webhook' })}
                className={`p-2 rounded-lg border text-start transition-colors cursor-pointer ${
                  config.dmMode === 'webhook'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface-2/30 hover:border-gray-600'
                }`}
              >
                <div className="text-xs font-medium text-gray-200">{t('ui.discordIntegration.webhook')}</div>
                <div className="text-xs text-gray-500">{t('ui.discordIntegration.webhookDesc')}</div>
              </button>
              <button
                onClick={() => updateConfig({ dmMode: 'bot-api' })}
                className={`p-2 rounded-lg border text-start transition-colors cursor-pointer ${
                  config.dmMode === 'bot-api'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface-2/30 hover:border-gray-600'
                }`}
              >
                <div className="text-xs font-medium text-gray-200">{t('ui.discordIntegration.botDm')}</div>
                <div className="text-xs text-gray-500">{t('ui.discordIntegration.botDmDesc')}</div>
              </button>
            </div>
          </div>

          {/* Webhook Configuration */}
          {config.dmMode === 'webhook' && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-sm text-gray-300 block mb-1">{t('ui.discordIntegration.webhookUrlLabel')}</label>
                <input
                  aria-label="https://discord.com/api/webhooks/..."
                  name="discord-webhook-url"
                  type="password"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={config.webhookUrl}
                  onChange={(e) => updateConfig({ webhookUrl: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-gray-200 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">{t('ui.discordIntegration.webhookHelp')}</p>
              </div>
            </div>
          )}

          {/* Bot API Configuration */}
          {config.dmMode === 'bot-api' && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-sm text-gray-300 block mb-1">{t('ui.discordIntegration.botTokenLabel')}</label>
                <input
                  aria-label={t('ui.discordIntegration.botTokenPlaceholder')}
                  name="discord-bot-token"
                  type="password"
                  placeholder={t('ui.discordIntegration.botTokenPlaceholder')}
                  value={config.botToken}
                  onChange={(e) => updateConfig({ botToken: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-gray-200 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">{t('ui.discordIntegration.botTokenHelp')}</p>
              </div>
              <div>
                <label className="text-sm text-gray-300 block mb-1">{t('ui.discordIntegration.userIdLabel')}</label>
                <input
                  aria-label={t('ui.discordIntegration.userIdPlaceholder')}
                  name="discord-user-id"
                  type="text"
                  placeholder={t('ui.discordIntegration.userIdPlaceholder')}
                  value={config.userId}
                  onChange={(e) => updateConfig({ userId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-gray-200 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">{t('ui.discordIntegration.userIdHelp')}</p>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
            <p className="text-xs text-blue-300">{t('ui.discordIntegration.infoBox')}</p>
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-4 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-accent-strong text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('ui.discordIntegration.saving') : t('ui.discordIntegration.saveSettings')}
        </button>
        {config.enabled && (
          <button
            onClick={handleTest}
            disabled={testing || hasChanges}
            className="px-4 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? t('ui.discordIntegration.testing') : t('ui.discordIntegration.testConnection')}
          </button>
        )}
        {hasChanges && <span className="text-xs text-accent ms-2">{t('ui.discordIntegration.unsavedChanges')}</span>}
      </div>
    </div>
  )
}
