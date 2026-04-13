import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import DiscordIntegrationSettings from '../components/ui/DiscordIntegrationSettings'
import OllamaManagement, { type AvailableModelList, type InstalledModelList } from '../components/ui/OllamaManagement'
import { SETTINGS_KEYS } from '../constants'

/** Re-exported Ollama model list components for use by consumers importing from SettingsPage. */
type _AvailableModelList = typeof AvailableModelList
type _InstalledModelList = typeof InstalledModelList

import { addToast } from '../hooks/use-toast'
import type { ValidationResult } from '../network'

type _ValidationResult = ValidationResult

import type { AutoSaveConfig, SaveVersion } from '../services/io/auto-save'

type _AutoSaveConfig = AutoSaveConfig
type _SaveVersion = SaveVersion

import * as AutoSave from '../services/io/auto-save'
import {
  type EntityType,
  type ExportEnvelope,
  exportEntities,
  type ImportResult,
  importEntities
} from '../services/io/entity-io'

type _EntityType = EntityType
type _ExportEnvelope = ExportEnvelope
type _ImportResult = ImportResult<unknown>

import { importDndBeyondCharacter } from '../services/io/import-export'
import {
  DEFAULT_SHORTCUTS,
  formatKeyCombo,
  getShortcutsByCategory,
  hasConflict,
  type ShortcutDefinition
} from '../services/keyboard-shortcuts'
import type { NotificationEvent } from '../services/notification-service'

type _NotificationEvent = NotificationEvent

import { DISPLAY_NAME_KEY } from '../constants'
import * as NotificationService from '../services/notification-service'
import {
  getAmbientVolume,
  getVolume,
  isEnabled as isAudioSystemEnabled,
  isMuted as isAudioSystemMuted,
  setAmbientVolume as setGlobalAmbientVolume,
  setEnabled as setGlobalAudioEnabled,
  setMuted as setGlobalAudioMuted,
  setVolume as setGlobalVolume
} from '../services/sound-manager'
import { getTheme, getThemeNames, setTheme, type ThemeName } from '../services/theme-manager'
import { type ColorblindMode, type KeyCombo, useAccessibilityStore } from '../stores/use-accessibility-store'
import { usePluginStore } from '../stores/use-plugin-store'
import { getAllSystems, unregisterSystem } from '../systems/init'
import type { UserProfile } from '../types/user'

const THEME_LABELS: Record<ThemeName, string> = {
  dark: 'Dark',
  parchment: 'Parchment',
  'high-contrast': 'High Contrast',
  'royal-purple': 'Royal Purple'
}

const THEME_PREVIEWS: Record<ThemeName, { bg: string; accent: string; text: string }> = {
  dark: { bg: 'bg-gray-900', accent: 'bg-amber-600', text: 'text-gray-100' },
  parchment: { bg: 'bg-amber-100', accent: 'bg-yellow-700', text: 'text-amber-950' },
  'high-contrast': { bg: 'bg-black', accent: 'bg-yellow-400', text: 'text-white' },
  'royal-purple': { bg: 'bg-purple-950', accent: 'bg-purple-500', text: 'text-gray-200' }
}

const CATEGORY_LABELS: Record<string, string> = {
  combat: 'Combat',
  navigation: 'Navigation',
  tools: 'Tools',
  general: 'General'
}

const COLORBLIND_OPTIONS: { mode: ColorblindMode; label: string; description: string }[] = [
  { mode: 'none', label: 'None', description: 'No color filter' },
  { mode: 'deuteranopia', label: 'Deuteranopia', description: 'Red-green (most common)' },
  { mode: 'protanopia', label: 'Protanopia', description: 'Red-blind' },
  { mode: 'tritanopia', label: 'Tritanopia', description: 'Blue-yellow' }
]

interface SettingsSectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SettingsSectionProps): JSX.Element {
  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-amber-400 mb-4 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

function KeybindingEditor(): JSX.Element {
  const grouped = getShortcutsByCategory()
  const customKeybindings = useAccessibilityStore((s) => s.customKeybindings)
  const setCustomKeybinding = useAccessibilityStore((s) => s.setCustomKeybinding)
  const resetKeybinding = useAccessibilityStore((s) => s.resetKeybinding)
  const resetAllKeybindings = useAccessibilityStore((s) => s.resetAllKeybindings)

  const [capturing, setCapturing] = useState<string | null>(null) // action being rebound
  const [conflict, setConflict] = useState<{ action: string; description: string } | null>(null)
  const [pendingCombo, setPendingCombo] = useState<KeyCombo | null>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!capturing) return

    const handleKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      // Ignore bare modifier presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const combo: KeyCombo = {
        key: e.key,
        ...(e.ctrlKey || e.metaKey ? { ctrl: true } : {}),
        ...(e.shiftKey ? { shift: true } : {}),
        ...(e.altKey ? { alt: true } : {})
      }

      const result = hasConflict(capturing, combo)
      if (result.conflicting) {
        setConflict({ action: result.conflictAction!, description: result.conflictDescription! })
        setPendingCombo(combo)
        return
      }

      setCustomKeybinding(capturing, combo)
      setCapturing(null)
      setConflict(null)
      setPendingCombo(null)
    }

    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [capturing, setCustomKeybinding])

  const handleSwap = (): void => {
    if (!pendingCombo || !capturing || !conflict) return
    // Find the current binding of the conflicting action and assign it to the one being rebound
    const currentBinding = getDefaultForAction(capturing)
    if (currentBinding) {
      setCustomKeybinding(conflict.action, {
        key: currentBinding.key,
        ...(currentBinding.ctrl ? { ctrl: true } : {}),
        ...(currentBinding.shift ? { shift: true } : {}),
        ...(currentBinding.alt ? { alt: true } : {})
      })
    }
    setCustomKeybinding(capturing, pendingCombo)
    setCapturing(null)
    setConflict(null)
    setPendingCombo(null)
  }

  const getDefaultForAction = (action: string): ShortcutDefinition | undefined => {
    return DEFAULT_SHORTCUTS.find((s) => s.action === action)
  }

  const isCustom = (action: string): boolean => {
    return customKeybindings != null && action in customKeybindings
  }

  return (
    <div ref={captureRef}>
      {Object.entries(grouped).map(([category, shortcuts]) => (
        <div key={category} className="mb-4 last:mb-0">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {CATEGORY_LABELS[category] ?? category}
          </div>
          <div className="space-y-1">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut.action}
                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-800/50"
              >
                <span className="text-sm text-gray-300">{shortcut.description}</span>
                <div className="flex items-center gap-2">
                  <kbd
                    className={`px-2 py-1 text-xs border rounded font-mono min-w-[60px] text-center ${
                      isCustom(shortcut.action)
                        ? 'bg-amber-900/30 border-amber-700/50 text-amber-300'
                        : 'bg-gray-900 border-gray-700 text-gray-300'
                    }`}
                  >
                    {formatKeyCombo(shortcut)}
                  </kbd>
                  {capturing === shortcut.action ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-amber-400 animate-pulse">Press a key...</span>
                      <button
                        onClick={() => {
                          setCapturing(null)
                          setConflict(null)
                          setPendingCombo(null)
                        }}
                        className="px-2 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-gray-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCapturing(shortcut.action)}
                      className="px-2 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-gray-200 hover:border-amber-600 cursor-pointer"
                    >
                      Rebind
                    </button>
                  )}
                  {isCustom(shortcut.action) && (
                    <button
                      onClick={() => resetKeybinding(shortcut.action)}
                      className="px-2 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-red-400 cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Conflict modal */}
      {conflict && pendingCombo && (
        <div className="mt-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
          <p className="text-xs text-red-300 mb-2">This key combo conflicts with &quot;{conflict.description}&quot;.</p>
          <div className="flex gap-2">
            <button
              onClick={handleSwap}
              className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer"
            >
              Swap bindings
            </button>
            <button
              onClick={() => {
                setConflict(null)
                setPendingCombo(null)
                setCapturing(null)
              }}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {customKeybindings && Object.keys(customKeybindings).length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <button
            onClick={resetAllKeybindings}
            className="px-3 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-red-400 hover:border-red-600 cursor-pointer"
          >
            Reset All to Defaults
          </button>
        </div>
      )}
    </div>
  )
}

function PluginManager(): JSX.Element {
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
      addToast(`Plugin "${plugin.manifest.name}" ${plugin.enabled ? 'disabled' : 'enabled'}`, 'success')
    } catch {
      addToast('Failed to toggle plugin', 'error')
    }
  }

  const handleInstall = async (): Promise<void> => {
    const result = await installPlugin()
    if (result.success) {
      addToast('Plugin installed', 'success')
    } else if (result.error && result.error !== 'Cancelled') {
      addToast(result.error, 'error')
    }
  }

  const handleUninstall = async (plugin: (typeof plugins)[number]): Promise<void> => {
    const result = await uninstallPlugin(plugin.id)
    if (result.success) {
      addToast(`Plugin "${plugin.manifest.name}" uninstalled`, 'success')
    } else {
      addToast(result.error ?? 'Uninstall failed', 'error')
    }
  }

  if (!initialized) {
    return <p className="text-xs text-gray-500">Scanning plugins...</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {plugins.length === 0
            ? 'No plugins installed.'
            : `${plugins.length} plugin${plugins.length !== 1 ? 's' : ''} found.`}
        </p>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
        >
          Install from File
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
                : 'border-gray-700/50 bg-gray-800/30'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200 truncate">{plugin.manifest.name ?? plugin.id}</span>
                <span className="text-[10px] text-gray-500 font-mono">v{plugin.manifest.version ?? '?'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400">
                  {plugin.manifest.type}
                </span>
                {plugin.loaded && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">Loaded</span>
                )}
                {plugin.error && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">Error</span>
                )}
              </div>
              {!!plugin.manifest.description && (
                <p className="text-xs text-gray-400 mt-1 truncate">{plugin.manifest.description}</p>
              )}
              {!!plugin.manifest.author && (
                <p className="text-[10px] text-gray-500 mt-0.5">by {plugin.manifest.author}</p>
              )}
              {plugin.error && <p className="text-[10px] text-red-400 mt-1">{plugin.error}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!plugin.error && (
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={plugin.enabled}
                    onChange={() => handleToggle(plugin)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600" />
                </label>
              )}
              <button
                onClick={() => handleUninstall(plugin)}
                className="px-2 py-1 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-red-400 hover:border-red-600 cursor-pointer"
              >
                Uninstall
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

interface UpdateStatusInfo {
  state: UpdateState
  version?: string
  percent?: number
  message?: string
}

function UpdateSection(): JSX.Element {
  const [status, setStatus] = useState<UpdateStatusInfo>({ state: 'idle' })
  const [appVersion, setAppVersion] = useState<string>('')
  const listenerRegistered = useRef(false)

  useEffect(() => {
    window.api
      .getVersion()
      .then(setAppVersion)
      .catch(() => {})
    if (!listenerRegistered.current) {
      listenerRegistered.current = true
      window.api.update.onStatus((s) => {
        setStatus(s as UpdateStatusInfo)
      })
    }
    return () => {
      window.api.update.removeStatusListener()
      listenerRegistered.current = false
    }
  }, [])

  const handleCheck = async (): Promise<void> => {
    setStatus({ state: 'checking' })
    try {
      const result = await window.api.update.checkForUpdates()
      setStatus(result as UpdateStatusInfo)
    } catch {
      setStatus({ state: 'error', message: 'Failed to check for updates' })
    }
  }

  const handleDownload = async (): Promise<void> => {
    setStatus({ state: 'downloading', percent: 0, version: status.version })
    try {
      const result = await window.api.update.downloadUpdate()
      setStatus(result as UpdateStatusInfo)
    } catch {
      setStatus({ state: 'error', message: 'Download failed' })
    }
  }

  const handleInstall = async (): Promise<void> => {
    try {
      await window.api.update.installUpdate()
    } catch {
      setStatus({ state: 'error', message: 'Install failed' })
    }
  }

  const statusLabel = (): string => {
    switch (status.state) {
      case 'idle':
        return ''
      case 'checking':
        return 'Checking for updates...'
      case 'available':
        return `Version ${status.version ?? 'unknown'} is available`
      case 'not-available':
        return 'You are on the latest version'
      case 'downloading':
        return `Downloading update... ${status.percent ?? 0}%`
      case 'downloaded':
        return `Version ${status.version ?? 'unknown'} downloaded and ready to install`
      case 'error':
        return status.message ?? 'An error occurred'
    }
  }

  return (
    <div className="space-y-3">
      {appVersion && <p className="text-xs text-gray-500">Current version: {appVersion}</p>}

      {/* Status display */}
      {status.state !== 'idle' && (
        <div
          className={`text-sm px-3 py-2 rounded-lg ${
            status.state === 'error'
              ? 'bg-red-900/30 text-red-300 border border-red-700/50'
              : status.state === 'downloaded'
                ? 'bg-green-900/30 text-green-300 border border-green-700/50'
                : status.state === 'available'
                  ? 'bg-amber-900/30 text-amber-300 border border-amber-700/50'
                  : 'bg-gray-800/50 text-gray-300 border border-gray-700/50'
          }`}
        >
          {statusLabel()}
        </div>
      )}

      {/* Download progress bar */}
      {status.state === 'downloading' && (
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-300"
            style={{ width: `${status.percent ?? 0}%` }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {(status.state === 'idle' || status.state === 'not-available' || status.state === 'error') && (
          <button
            onClick={handleCheck}
            className="px-4 py-1.5 text-sm rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-600 hover:text-amber-400 transition-colors cursor-pointer"
          >
            Check for Updates
          </button>
        )}
        {status.state === 'available' && (
          <button
            onClick={handleDownload}
            className="px-4 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
          >
            Download Update
          </button>
        )}
        {status.state === 'downloaded' && (
          <button
            onClick={handleInstall}
            className="px-4 py-1.5 text-sm rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors cursor-pointer"
          >
            Install & Restart
          </button>
        )}
        {status.state === 'checking' && <span className="text-sm text-gray-400 animate-pulse">Checking...</span>}
      </div>
    </div>
  )
}

interface CloudSyncState {
  configured: boolean
  remotes: string[]
  version?: string
  error?: string
  lastBackupTime?: string
  campaigns: Array<{ id: string; name: string }>
}

function CloudBackupSection(): JSX.Element {
  const [syncState, setSyncState] = useState<CloudSyncState>({
    configured: false,
    remotes: [],
    campaigns: []
  })
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const handleCheckStatus = async (): Promise<void> => {
    setLoading('status')
    setMessage(null)
    try {
      const result = await window.api.cloudSync.getStatus()
      setSyncState((prev) => ({
        ...prev,
        configured: result.configured,
        remotes: result.remotes,
        version: result.version,
        error: result.error
      }))
      if (!result.configured && result.error) {
        setMessage({ text: `Pi unreachable: ${result.error}`, type: 'error' })
      } else if (result.configured) {
        setMessage({ text: 'Connected to BMO Pi', type: 'success' })
      }
    } catch {
      setMessage({ text: 'Failed to connect to BMO Pi. Is it running?', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  const handleBackupNow = async (): Promise<void> => {
    setLoading('backup')
    setMessage(null)
    try {
      // Load the current campaigns to pick the first one (or the most recently used)
      const campaigns = await window.api.loadCampaigns()
      if (!campaigns || campaigns.length === 0) {
        setMessage({ text: 'No campaigns to backup', type: 'error' })
        return
      }
      const campaign = campaigns[0] as { id: string; name: string }
      const result = await window.api.cloudSync.backupCampaign(campaign.id, campaign.name)
      if (result.success) {
        setSyncState((prev) => ({
          ...prev,
          lastBackupTime: new Date().toISOString()
        }))
        setMessage({ text: result.message ?? 'Backup completed successfully', type: 'success' })
      } else {
        setMessage({ text: result.error ?? 'Backup failed', type: 'error' })
      }
    } catch {
      setMessage({ text: 'Backup failed. Is BMO Pi reachable?', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  const handleListBackups = async (): Promise<void> => {
    setLoading('list')
    setMessage(null)
    try {
      const result = await window.api.cloudSync.listRemoteCampaigns()
      if (result.success && result.campaigns) {
        setSyncState((prev) => ({
          ...prev,
          campaigns: result.campaigns ?? []
        }))
        setMessage({
          text:
            result.campaigns.length > 0
              ? `Found ${result.campaigns.length} backed-up campaign${result.campaigns.length !== 1 ? 's' : ''}`
              : 'No backups found on Google Drive',
          type: 'success'
        })
      } else {
        setMessage({ text: result.error ?? 'Failed to list backups', type: 'error' })
      }
    } catch {
      setMessage({ text: 'Failed to list backups. Is BMO Pi reachable?', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Back up campaign data to Google Drive via rclone on BMO Pi. Credentials are stored on the Pi — nothing is stored
        locally.
      </p>

      {/* Status display */}
      {message && (
        <div
          className={`text-sm px-3 py-2 rounded-lg ${
            message.type === 'error'
              ? 'bg-red-900/30 text-red-300 border border-red-700/50'
              : 'bg-green-900/30 text-green-300 border border-green-700/50'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Remote info */}
      {syncState.configured && (
        <div className="text-xs text-gray-400 space-y-1">
          {syncState.remotes.length > 0 && <p>Configured remotes: {syncState.remotes.join(', ')}</p>}
          {syncState.version && <p>Rclone version: {syncState.version}</p>}
          {syncState.lastBackupTime && <p>Last backup: {new Date(syncState.lastBackupTime).toLocaleString()}</p>}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleCheckStatus}
          disabled={loading === 'status'}
          className="px-4 py-1.5 text-sm rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-600 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'status' ? 'Checking...' : 'Check Status'}
        </button>
        <button
          onClick={handleBackupNow}
          disabled={loading === 'backup'}
          className="px-4 py-1.5 text-sm rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-600 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'backup' ? 'Backing up...' : 'Backup Now'}
        </button>
        <button
          onClick={handleListBackups}
          disabled={loading === 'list'}
          className="px-4 py-1.5 text-sm rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-600 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'list' ? 'Loading...' : 'List Backups'}
        </button>
      </div>

      {/* Backed-up campaigns list */}
      {syncState.campaigns.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-400 font-semibold">Backed-up Campaigns</p>
          {syncState.campaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-800/30 border border-gray-700/30"
            >
              <span className="text-sm text-gray-300">{c.name}</span>
              <span className="text-[10px] text-gray-500 font-mono">{c.id.slice(0, 8)}...</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export async function factoryResetAllSettings(): Promise<void> {
  // 1. Clear all localStorage keys
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (
      key?.startsWith('dnd-vtt-') ||
      key?.startsWith('autosave:') ||
      key?.startsWith('notification') ||
      key?.startsWith('lobby-') ||
      key?.startsWith('macro-storage-') ||
      key?.startsWith('builder-draft-') ||
      key?.startsWith('library-') ||
      key?.startsWith('dice-tray') ||
      key?.startsWith('narration-') ||
      key?.startsWith('encounter-')
    ) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k))

  // 2. Reset file-based settings
  await window.api.saveSettings({ turnServers: undefined, userProfile: undefined })

  // 3. Reset in-memory state
  setGlobalVolume(1)
  setGlobalAmbientVolume(0.3)
  setGlobalAudioMuted(false)
  setGlobalAudioEnabled(true)

  // 4. Reset accessibility store
  const accessStore = useAccessibilityStore.getState()
  accessStore.resetAllKeybindings()
  accessStore.setUiScale(100)
  accessStore.setColorblindMode('none')
  accessStore.setReducedMotion(false)
  accessStore.setScreenReaderMode(false)
  accessStore.setTooltipsEnabled(true)

  // 5. Reset theme
  setTheme('dark')
}

export default function SettingsPage(): JSX.Element {
  const navigate = useNavigate()
  const [activeTheme, setActiveTheme] = useState<ThemeName>(getTheme())
  const [gridOpacity, setGridOpacity] = useState(() => {
    const saved = localStorage.getItem(SETTINGS_KEYS.GRID_OPACITY)
    return saved ? Number(saved) : 40
  })
  const [gridColor, setGridColor] = useState(() => {
    return localStorage.getItem(SETTINGS_KEYS.GRID_COLOR) ?? '#ffffff'
  })
  const [diceRollMode, setDiceRollMode] = useState<'3d' | '2d'>(() => {
    return (localStorage.getItem(SETTINGS_KEYS.DICE_MODE) as '3d' | '2d') ?? '3d'
  })

  // Profile settings
  const [profileName, setProfileName] = useState('')
  const [profileLoaded, setProfileLoaded] = useState(false)

  useEffect(() => {
    window.api.loadSettings().then((settings) => {
      if (settings.userProfile?.displayName) {
        setProfileName(settings.userProfile.displayName)
      }
      setProfileLoaded(true)
    })
  }, [])

  const saveProfile = useCallback(
    async (name: string) => {
      if (!profileLoaded || !name.trim()) return
      try {
        const settings = await window.api.loadSettings()
        const profile: UserProfile = settings.userProfile ?? {
          id: crypto.randomUUID(),
          displayName: '',
          createdAt: new Date().toISOString()
        }
        profile.displayName = name.trim()
        await window.api.saveSettings({ ...settings, userProfile: profile })
        localStorage.setItem(DISPLAY_NAME_KEY, name.trim())
      } catch {
        // save failed silently
      }
    },
    [profileLoaded]
  )

  // Notification settings
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => NotificationService.getConfig().enabled)

  // Auto-save settings
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => AutoSave.getConfig().enabled)
  const [autoSaveInterval, setAutoSaveInterval] = useState(() => AutoSave.getConfig().intervalMs / 60000)

  // Accessibility store
  const uiScale = useAccessibilityStore((s) => s.uiScale)
  const setUiScale = useAccessibilityStore((s) => s.setUiScale)
  const colorblindMode = useAccessibilityStore((s) => s.colorblindMode)
  const setColorblindMode = useAccessibilityStore((s) => s.setColorblindMode)
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion)
  const setReducedMotion = useAccessibilityStore((s) => s.setReducedMotion)
  const screenReaderMode = useAccessibilityStore((s) => s.screenReaderMode)
  const setScreenReaderMode = useAccessibilityStore((s) => s.setScreenReaderMode)
  const tooltipsEnabled = useAccessibilityStore((s) => s.tooltipsEnabled)
  const setTooltipsEnabled = useAccessibilityStore((s) => s.setTooltipsEnabled)

  // Audio settings
  const [masterVolume, setMasterVolume] = useState(() => getVolume() * 100)
  const [ambientVolume, setAmbientVolumeState] = useState(() => getAmbientVolume() * 100)
  const [audioMuted, setAudioMuted] = useState(() => isAudioSystemMuted())
  const [audioEnabled, setAudioEnabled] = useState(() => isAudioSystemEnabled())

  const handleMasterVolumeChange = useCallback((val: number) => {
    setMasterVolume(val)
    setGlobalVolume(val / 100)
  }, [])

  const handleAmbientVolumeChange = useCallback((val: number) => {
    setAmbientVolumeState(val)
    setGlobalAmbientVolume(val / 100)
  }, [])

  const handleMutedChange = useCallback((val: boolean) => {
    setAudioMuted(val)
    setGlobalAudioMuted(val)
  }, [])

  const handleEnabledChange = useCallback((val: boolean) => {
    setAudioEnabled(val)
    setGlobalAudioEnabled(val)
  }, [])

  const handleThemeChange = useCallback((theme: ThemeName) => {
    setTheme(theme)
    setActiveTheme(theme)
  }, [])

  const handleGridOpacityChange = useCallback((val: number) => {
    setGridOpacity(val)
    localStorage.setItem(SETTINGS_KEYS.GRID_OPACITY, String(val))
  }, [])

  const handleGridColorChange = useCallback((val: string) => {
    setGridColor(val)
    localStorage.setItem(SETTINGS_KEYS.GRID_COLOR, val)
  }, [])

  const handleDiceModeChange = useCallback((mode: '3d' | '2d') => {
    setDiceRollMode(mode)
    localStorage.setItem(SETTINGS_KEYS.DICE_MODE, mode)
  }, [])

  return (
    <div className="h-screen bg-gray-950 text-gray-100 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path
                  fillRule="evenodd"
                  d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-100">Settings</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Profile */}
        <Section title="Profile">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Display Name</span>
            <input
              type="text"
              maxLength={32}
              placeholder="Your name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              onBlur={() => saveProfile(profileName)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveProfile(profileName)
              }}
              className="w-48 px-3 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <p className="text-[10px] text-gray-500 mt-2">Used as your default name when joining games.</p>
        </Section>

        {/* Theme */}
        <Section title="Theme">
          <div className="grid grid-cols-2 gap-3">
            {getThemeNames().map((theme) => {
              const preview = THEME_PREVIEWS[theme]
              const isActive = activeTheme === theme
              return (
                <button
                  key={theme}
                  onClick={() => handleThemeChange(theme)}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                    isActive
                      ? 'border-amber-500 bg-gray-700/40'
                      : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg ${preview.bg} border border-gray-600 flex items-center justify-center`}
                  >
                    <div className={`w-4 h-4 rounded ${preview.accent}`} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-200">{THEME_LABELS[theme]}</div>
                    {isActive && <div className="text-[10px] text-amber-400">Active</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Audio */}
        <Section title="Audio">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                handleMasterVolumeChange(100)
                handleAmbientVolumeChange(30)
                handleMutedChange(false)
                handleEnabledChange(true)
              }}
              className="px-2 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-red-400 cursor-pointer"
            >
              Reset Audio Defaults
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Sound System</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={audioEnabled}
                  onChange={(e) => handleEnabledChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600" />
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Mute All Sounds</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={audioMuted}
                  onChange={(e) => handleMutedChange(e.target.checked)}
                  disabled={!audioEnabled}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600 peer-disabled:opacity-50" />
              </label>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300 w-32">Master Volume</span>
              <input
                type="range"
                min="0"
                max="100"
                value={masterVolume}
                onChange={(e) => handleMasterVolumeChange(Number(e.target.value))}
                disabled={!audioEnabled || audioMuted}
                className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
              />
              <span className="text-xs text-gray-400 w-8 text-right">{Math.round(masterVolume)}%</span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300 w-32">Ambient Music</span>
              <input
                type="range"
                min="0"
                max="100"
                value={ambientVolume}
                onChange={(e) => handleAmbientVolumeChange(Number(e.target.value))}
                disabled={!audioEnabled || audioMuted}
                className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
              />
              <span className="text-xs text-gray-400 w-8 text-right">{Math.round(ambientVolume)}%</span>
            </div>
          </div>
        </Section>

        {/* Accessibility */}
        <Section title="Accessibility">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                setUiScale(100)
                setColorblindMode('none')
                setReducedMotion(false)
                setScreenReaderMode(false)
                setTooltipsEnabled(true)
              }}
              className="px-2 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-red-400 cursor-pointer"
            >
              Reset Accessibility Defaults
            </button>
          </div>
          <div className="space-y-5">
            {/* UI Scale */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">UI Scale</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 w-10 text-right">{uiScale}%</span>
                  {uiScale !== 100 && (
                    <button
                      onClick={() => setUiScale(100)}
                      className="px-2 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-gray-200 cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={75}
                max={150}
                step={5}
                value={uiScale}
                onChange={(e) => setUiScale(Number(e.target.value))}
                className="w-full h-1 accent-amber-500 cursor-pointer"
                aria-label="UI Scale"
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>75%</span>
                <span>100%</span>
                <span>150%</span>
              </div>
            </div>

            {/* Colorblind Mode */}
            <div>
              <span className="text-sm text-gray-300 block mb-2">Colorblind Mode</span>
              <div className="grid grid-cols-2 gap-2">
                {COLORBLIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.mode}
                    onClick={() => setColorblindMode(opt.mode)}
                    className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                      colorblindMode === opt.mode
                        ? 'border-amber-500 bg-amber-900/20'
                        : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-xs font-medium text-gray-200">{opt.label}</div>
                    <div className="text-[10px] text-gray-500">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Toggle options */}
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-gray-300">Reduced Motion</span>
                  <p className="text-[10px] text-gray-500">Disable combat animations and dice physics</p>
                </div>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-gray-300">Screen Reader Mode</span>
                  <p className="text-[10px] text-gray-500">Enable extra ARIA live region announcements</p>
                </div>
                <input
                  type="checkbox"
                  checked={screenReaderMode}
                  onChange={(e) => setScreenReaderMode(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-gray-300">Tooltips</span>
                  <p className="text-[10px] text-gray-500">Show tooltips on hover over buttons</p>
                </div>
                <input
                  type="checkbox"
                  checked={tooltipsEnabled}
                  onChange={(e) => setTooltipsEnabled(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </Section>

        {/* Grid Preferences */}
        <Section title="Grid">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                handleGridOpacityChange(40)
                handleGridColorChange('#ffffff')
              }}
              className="px-2 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-red-400 cursor-pointer"
            >
              Reset Grid Defaults
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Grid Opacity</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={gridOpacity}
                  onChange={(e) => handleGridOpacityChange(Number(e.target.value))}
                  className="w-36 h-1 accent-amber-500 cursor-pointer"
                />
                <span className="text-sm text-gray-400 w-10 text-right">{gridOpacity}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Grid Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={gridColor}
                  onChange={(e) => handleGridColorChange(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-600 cursor-pointer bg-transparent"
                />
                <span className="text-sm text-gray-400 font-mono">{gridColor}</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Dice Roller */}
        <Section title="Dice Roller">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Default Dice Mode</span>
            <div className="flex gap-2">
              {(['3d', '2d'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleDiceModeChange(mode)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
                    diceRollMode === mode
                      ? 'bg-amber-600 border-amber-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {mode === '3d' ? '3D Dice' : '2D Quick Roll'}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                setNotificationsEnabled(true)
                NotificationService.setEnabled(true)
                NotificationService.setSoundEnabled(true)
              }}
              className="px-2 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-red-400 cursor-pointer"
            >
              Reset Notification Defaults
            </button>
          </div>
          {!NotificationService.isSupported() && (
            <p className="text-xs text-yellow-400 mb-3">Desktop notifications are not available in this environment.</p>
          )}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm text-gray-300">Enable Notifications</span>
              <p className="text-[10px] text-gray-500">Show desktop notifications for game events</p>
            </div>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => {
                const val = e.target.checked
                setNotificationsEnabled(val)
                NotificationService.setEnabled(val)
              }}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer mt-3">
            <div>
              <span className="text-sm text-gray-300">Notification Sound</span>
              <p className="text-[10px] text-gray-500">Play a sound with each notification</p>
            </div>
            <input
              type="checkbox"
              checked={NotificationService.getConfig().soundEnabled}
              onChange={(e) => NotificationService.setSoundEnabled(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer mt-3">
            <div>
              <span className="text-sm text-gray-300">Only When Unfocused</span>
              <p className="text-[10px] text-gray-500">Only show notifications when the window is not in focus</p>
            </div>
            <input
              type="checkbox"
              checked={NotificationService.getConfig().onlyWhenBlurred}
              onChange={(e) => NotificationService.setOnlyWhenBlurred(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </label>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-400 font-semibold">Event Toggles</p>
            {(
              [
                'your-turn',
                'roll-request',
                'whisper',
                'ai-response',
                'timer-expired',
                'combat-start',
                'level-up',
                'damage-taken'
              ] as const
            ).map((event) => (
              <label key={event} className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-gray-300 capitalize">{event.replace(/-/g, ' ')}</span>
                <input
                  type="checkbox"
                  checked={NotificationService.getConfig().enabledEvents.has(event)}
                  onChange={(e) => NotificationService.setEventEnabled(event, e.target.checked)}
                  className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                />
              </label>
            ))}
          </div>
          <button
            className="mt-3 px-3 py-1 text-xs bg-gray-800 text-gray-300 rounded hover:bg-gray-700 cursor-pointer"
            onClick={() => NotificationService.notify('your-turn', 'Test Character')}
          >
            Test Notification
          </button>
        </Section>

        {/* Auto-Save */}
        <Section title="Auto-Save">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                setAutoSaveEnabled(true)
                setAutoSaveInterval(5)
                AutoSave.setConfig({ enabled: true, intervalMs: 300000 })
              }}
              className="px-2 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-red-400 cursor-pointer"
            >
              Reset Auto-Save Defaults
            </button>
          </div>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-gray-300">Enable Auto-Save</span>
                <p className="text-[10px] text-gray-500">Periodically save game state during sessions</p>
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
              <span className="text-sm text-gray-300">Interval (minutes)</span>
              <input
                type="number"
                min={1}
                max={60}
                value={autoSaveInterval}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(60, Number(e.target.value)))
                  setAutoSaveInterval(val)
                  AutoSave.setConfig({ intervalMs: val * 60000 })
                }}
                disabled={!autoSaveEnabled}
                className="w-20 px-2 py-1 text-sm bg-gray-900 border border-gray-700 rounded text-gray-300 disabled:opacity-50"
              />
            </div>
          </div>
        </Section>

        {/* Import/Export Settings */}
        <Section title="Settings Import / Export">
          <p className="text-xs text-gray-400 mb-3">
            Export your app preferences to a file, or import settings from another device.
          </p>
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
                  if (ok) addToast('Settings exported', 'success')
                } catch {
                  addToast('Settings export failed', 'error')
                }
              }}
              className="px-4 py-1.5 text-sm rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-600 hover:text-amber-400 transition-colors cursor-pointer"
            >
              Export Settings
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
                        `These settings are from app version ${item.appVersion}, but you are running ${__APP_VERSION__}. Import anyway?`
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

                  addToast('Settings imported. Reloading to apply modifications...', 'success')
                  setTimeout(() => window.location.reload(), 1500)
                } catch (err) {
                  addToast(err instanceof Error ? err.message : 'Settings import failed', 'error')
                }
              }}
              className="px-4 py-1.5 text-sm rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-600 hover:text-amber-400 transition-colors cursor-pointer"
            >
              Import Settings
            </button>
            <button
              onClick={async () => {
                try {
                  const result = await importDndBeyondCharacter()
                  if (result) {
                    addToast('D&D Beyond character imported', 'success')
                  }
                } catch {
                  addToast('D&D Beyond import failed', 'error')
                }
              }}
              className="px-4 py-1.5 text-sm rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:border-purple-600 hover:text-purple-400 transition-colors cursor-pointer"
            >
              D&D Beyond Import
            </button>
          </div>
        </Section>

        {/* Content Packs & Plugins */}
        <Section title="Content Packs & Plugins">
          <PluginManager />
        </Section>

        {/* Game Systems */}
        <Section title="Registered Game Systems">
          {(() => {
            const systems = getAllSystems()
            if (systems.length === 0) {
              return <p className="text-xs text-gray-500">No game systems registered.</p>
            }
            return (
              <div className="space-y-2">
                {systems.map((sys) => (
                  <div key={sys.id} className="flex items-center justify-between py-2 px-3 bg-gray-800/40 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-200 font-medium">{sys.name}</span>
                      <span className="text-[10px] text-gray-500 ml-2 font-mono">{sys.id}</span>
                    </div>
                    {sys.id !== 'dnd5e' && (
                      <button
                        onClick={() => {
                          unregisterSystem(sys.id)
                          addToast(`Unregistered system "${sys.name}"`, 'success')
                        }}
                        className="px-2 py-1 text-[10px] bg-gray-700 border border-gray-600 rounded text-gray-400 hover:text-red-400 hover:border-red-600 cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
        </Section>

        {/* Updates */}
        <Section title="Updates">
          <UpdateSection />
        </Section>

        {/* Cloud Backup */}
        <Section title="Cloud Backup">
          <CloudBackupSection />
        </Section>

        {/* Ollama AI */}
        <Section title="Ollama AI">
          <OllamaManagement />
        </Section>

        {/* Discord Integration */}
        <Section title="Discord Integration">
          <DiscordIntegrationSettings />
        </Section>

        {/* Keybindings */}
        <Section title="Keybindings">
          <KeybindingEditor />
        </Section>

        {/* Factory Reset */}
        <Section title="Reset Everything">
          <p className="text-xs text-red-400 mb-3">
            This will reset ALL settings to their defaults. Campaigns, characters, and custom data will not be deleted.
          </p>
          <button
            onClick={async () => {
              if (window.confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
                await factoryResetAllSettings()
                window.location.reload()
              }
            }}
            className="px-4 py-1.5 text-sm rounded-lg border bg-red-900/30 border-red-700/50 text-red-300 hover:bg-red-800/50 hover:text-red-100 transition-colors cursor-pointer"
          >
            Factory Reset
          </button>
        </Section>
      </div>
    </div>
  )
}
