import { useCallback, useEffect, useState } from 'react'
import { addToast } from '../../hooks/use-toast'

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
        const result = (await window.api.discord.getConfig()) as DiscordConfigResponse
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
        addToast('Failed to load Discord configuration', 'error')
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // Build the config to save - if field shows '[configured]', keep existing
      const currentConfig = (await window.api.discord.getConfig()) as DiscordConfigResponse
      const configToSave: DiscordConfig = {
        ...config,
        webhookUrl: config.webhookUrl || (currentConfig.config?.webhookUrl === '[configured]' ? 'keep' : ''),
        botToken: config.botToken || (currentConfig.config?.botToken === '[configured]' ? 'keep' : '')
      }

      const result = await window.api.discord.saveConfig(configToSave)
      if (result.success) {
        addToast('Discord settings saved', 'success')
        setHasChanges(false)
        // Reload to get the masked values
        const refreshed = (await window.api.discord.getConfig()) as DiscordConfigResponse
        if (refreshed.success && refreshed.config) {
          setConfig((prev) => ({
            ...prev,
            webhookUrl: refreshed.config!.webhookUrl === '[configured]' ? '' : prev.webhookUrl,
            botToken: refreshed.config!.botToken === '[configured]' ? '' : prev.botToken
          }))
        }
      } else {
        addToast(result.error || 'Failed to save Discord settings', 'error')
      }
    } catch {
      addToast('Failed to save Discord settings', 'error')
    } finally {
      setSaving(false)
    }
  }, [config])

  const handleTest = useCallback(async () => {
    setTesting(true)
    try {
      // First save any pending changes
      if (hasChanges) {
        await handleSave()
      }

      const result = await window.api.discord.testConnection()
      if (result.success) {
        addToast('Test message sent to Discord successfully!', 'success')
      } else {
        addToast(result.error || 'Failed to send test message', 'error')
      }
    } catch {
      addToast('Test connection failed', 'error')
    } finally {
      setTesting(false)
    }
  }, [hasChanges, handleSave])

  const updateConfig = useCallback((updates: Partial<DiscordConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }))
    setHasChanges(true)
  }, [])

  if (loading) {
    return <p className="text-xs text-gray-500">Loading Discord configuration...</p>
  }

  return (
    <div className="space-y-4">
      {/* Enable/Disable Toggle */}
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <span className="text-sm text-gray-300">Push to Discord</span>
          <p className="text-[10px] text-gray-500">Forward AI DM narration to Discord</p>
        </div>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => updateConfig({ enabled: e.target.checked })}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
      </label>

      {config.enabled && (
        <>
          {/* DM Mode Selection */}
          <div className="space-y-2 pt-2 border-t border-gray-700/50">
            <span className="text-sm text-gray-300 block">Integration Mode</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateConfig({ dmMode: 'webhook' })}
                className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                  config.dmMode === 'webhook'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                }`}
              >
                <div className="text-xs font-medium text-gray-200">Webhook</div>
                <div className="text-[10px] text-gray-500">Send to channel via webhook URL</div>
              </button>
              <button
                onClick={() => updateConfig({ dmMode: 'bot-api' })}
                className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                  config.dmMode === 'bot-api'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                }`}
              >
                <div className="text-xs font-medium text-gray-200">Bot DM</div>
                <div className="text-[10px] text-gray-500">Send DM via bot token + user ID</div>
              </button>
            </div>
          </div>

          {/* Webhook Configuration */}
          {config.dmMode === 'webhook' && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-sm text-gray-300 block mb-1">Webhook URL</label>
                <input
                  type="password"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={config.webhookUrl}
                  onChange={(e) => updateConfig({ webhookUrl: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Create a webhook in Discord channel settings → Integrations → Webhooks
                </p>
              </div>
            </div>
          )}

          {/* Bot API Configuration */}
          {config.dmMode === 'bot-api' && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-sm text-gray-300 block mb-1">Bot Token</label>
                <input
                  type="password"
                  placeholder="Bot token from Discord Developer Portal"
                  value={config.botToken}
                  onChange={(e) => updateConfig({ botToken: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-1">From Discord Developer Portal → Bot → Token</p>
              </div>
              <div>
                <label className="text-sm text-gray-300 block mb-1">User ID</label>
                <input
                  type="text"
                  placeholder="Discord user ID to receive DMs"
                  value={config.userId}
                  onChange={(e) => updateConfig({ userId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Right-click your profile in Discord with Developer Mode enabled
                </p>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
            <p className="text-xs text-blue-300">
              AI DM narration will be sent to Discord after each response. Technical metadata like [DM_ACTIONS] and
              [STAT_CHANGES] is automatically filtered out.
            </p>
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-700/50">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-4 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {config.enabled && (
          <button
            onClick={handleTest}
            disabled={testing || hasChanges}
            className="px-4 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        )}
        {hasChanges && <span className="text-xs text-amber-400 ml-2">Unsaved changes</span>}
      </div>
    </div>
  )
}
