import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AccessibilitySection } from '../components/settings/AccessibilitySection'
import { Section } from '../components/settings/SettingsSection'
import DiscordIntegrationSettings from '../components/ui/DiscordIntegrationSettings'
import MultiplayerStatusSection from '../components/ui/MultiplayerStatusSection'
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
import { i18n, LOCALE_LABELS, SUPPORTED_LOCALES, setLocale, useT } from '../i18n'
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
import { type KeyCombo, useAccessibilityStore } from '../stores/use-accessibility-store'
import { useCampaignStore } from '../stores/use-campaign-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useConfigStore } from '../stores/use-config-store'
import { useLibraryStore } from '../stores/use-library-store'
import { useOnboardingStore } from '../stores/use-onboarding-store'
import { usePluginStore } from '../stores/use-plugin-store'
import { getAllSystems, unregisterSystem } from '../systems/init'
import type { UserProfile } from '../types/user'
import { logger } from '../utils/logger'

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

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  combat: 'pages.settingsPage.categoryCombat',
  navigation: 'pages.settingsPage.categoryNavigation',
  tools: 'pages.settingsPage.categoryTools',
  general: 'pages.settingsPage.categoryGeneral'
}

function KeybindingEditor(): JSX.Element {
  const { t } = useT()
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
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {CATEGORY_LABEL_KEYS[category] ? t(CATEGORY_LABEL_KEYS[category]) : category}
          </div>
          <div className="space-y-1">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut.action}
                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-2/50"
              >
                <span className="text-sm text-gray-300">{shortcut.description}</span>
                <div className="flex items-center gap-2">
                  <kbd
                    className={`px-2 py-1 text-xs border rounded font-mono min-w-[60px] text-center ${
                      isCustom(shortcut.action)
                        ? 'bg-amber-900/30 border-amber-700/50 text-amber-300'
                        : 'bg-surface border-border text-gray-300'
                    }`}
                  >
                    {formatKeyCombo(shortcut)}
                  </kbd>
                  {capturing === shortcut.action ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-accent animate-pulse">{t('pages.settingsPage.pressAKey')}</span>
                      <button
                        onClick={() => {
                          setCapturing(null)
                          setConflict(null)
                          setPendingCombo(null)
                        }}
                        className="px-2 py-0.5 text-xs bg-gray-700 border border-gray-600 rounded text-muted hover:text-gray-200 cursor-pointer"
                      >
                        {t('common.actions.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCapturing(shortcut.action)}
                      className="px-2 py-0.5 text-xs bg-gray-700 border border-gray-600 rounded text-muted hover:text-gray-200 hover:border-amber-600 cursor-pointer"
                    >
                      {t('pages.settingsPage.rebind')}
                    </button>
                  )}
                  {isCustom(shortcut.action) && (
                    <button
                      onClick={() => resetKeybinding(shortcut.action)}
                      className="px-2 py-0.5 text-xs bg-surface border border-gray-600 rounded text-fg hover:text-red-300 cursor-pointer"
                    >
                      {t('pages.settingsPage.reset')}
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
          <p className="text-xs text-red-300 mb-2">
            {t('pages.settingsPage.keyConflict', { description: conflict.description })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleSwap}
              className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong text-white rounded cursor-pointer"
            >
              {t('pages.settingsPage.swapBindings')}
            </button>
            <button
              onClick={() => {
                setConflict(null)
                setPendingCombo(null)
                setCapturing(null)
              }}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
            >
              {t('common.actions.cancel')}
            </button>
          </div>
        </div>
      )}

      {customKeybindings && Object.keys(customKeybindings).length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <button
            onClick={resetAllKeybindings}
            className="px-3 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded text-muted hover:text-red-400 hover:border-red-600 cursor-pointer"
          >
            {t('pages.settingsPage.resetAllToDefaults')}
          </button>
        </div>
      )}
    </div>
  )
}

function PluginManager(): JSX.Element {
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

type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

interface UpdateStatusInfo {
  state: UpdateState
  version?: string
  percent?: number
  message?: string
  releaseNotes?: string
}

function UpdateSection(): JSX.Element {
  const { t } = useT()
  const [status, setStatus] = useState<UpdateStatusInfo>({ state: 'idle' })
  const [appVersion, setAppVersion] = useState<string>('')
  const listenerRegistered = useRef(false)

  // v2.1.16: persisted auto-update preferences. Auto-check defaults ON (matches
  // the main-process default in updater.ts) so it surfaces fixes out of the box.
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true)
  const [autoDownloadUpdates, setAutoDownloadUpdates] = useState(false)
  const [autoRestartAfterUpdate, setAutoRestartAfterUpdate] = useState(false)
  const [autoInstallSilent, setAutoInstallSilent] = useState(false)

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
    // Hydrate the auto-update prefs from persisted settings.
    window.api.loadSettings().then((s) => {
      setAutoCheckUpdates(s.autoCheckUpdates !== false)
      setAutoDownloadUpdates(s.autoDownloadUpdates === true)
      setAutoRestartAfterUpdate(s.autoRestartAfterUpdate === true)
      setAutoInstallSilent(s.autoInstallSilent === true)
    })
    return () => {
      window.api.update.removeStatusListener()
      listenerRegistered.current = false
    }
  }, [])

  // Persist auto-update pref changes immediately so the main process
  // picks them up on next launch (and on the next install handler).
  const persistAutoPrefs = async (patch: {
    autoCheckUpdates?: boolean
    autoDownloadUpdates?: boolean
    autoRestartAfterUpdate?: boolean
    autoInstallSilent?: boolean
  }): Promise<void> => {
    try {
      const settings = await window.api.loadSettings()
      await window.api.saveSettings({ ...settings, ...patch })
    } catch {
      // ignore — UI keeps the local state; user can retry by toggling again
    }
  }

  const handleCheck = async (): Promise<void> => {
    setStatus({ state: 'checking' })
    try {
      const result = await window.api.update.checkForUpdates()
      setStatus(result as UpdateStatusInfo)
    } catch {
      setStatus({ state: 'error', message: t('pages.settingsPage.checkUpdatesFailed') })
    }
  }

  const handleDownload = async (): Promise<void> => {
    setStatus({ state: 'downloading', percent: 0, version: status.version })
    try {
      const result = await window.api.update.downloadUpdate()
      setStatus(result as UpdateStatusInfo)
    } catch {
      setStatus({ state: 'error', message: t('pages.settingsPage.downloadFailed') })
    }
  }

  const handleInstall = async (): Promise<void> => {
    try {
      await window.api.update.installUpdate()
    } catch {
      setStatus({ state: 'error', message: t('pages.settingsPage.installFailed') })
    }
  }

  const statusLabel = (): string => {
    switch (status.state) {
      case 'idle':
        return ''
      case 'checking':
        return t('pages.settingsPage.checkingForUpdates')
      case 'available':
        return t('pages.settingsPage.versionAvailable', { version: status.version ?? 'unknown' })
      case 'not-available':
        return t('pages.settingsPage.onLatestVersion')
      case 'downloading':
        return t('pages.settingsPage.downloadingUpdate', { percent: status.percent ?? 0 })
      case 'downloaded':
        return t('pages.settingsPage.versionDownloaded', { version: status.version ?? 'unknown' })
      case 'error':
        return status.message ?? t('pages.settingsPage.errorOccurred')
    }
  }

  return (
    <div className="space-y-3">
      {appVersion && (
        <p className="text-xs text-gray-500">{t('pages.settingsPage.currentVersion', { version: appVersion })}</p>
      )}

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
                  : 'bg-surface-2/50 text-gray-300 border border-border/50'
          }`}
        >
          {statusLabel()}
        </div>
      )}

      {/* Download progress bar */}
      {status.state === 'downloading' && (
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-strong rounded-full transition-all duration-300"
            style={{ width: `${status.percent ?? 0}%` }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {(status.state === 'idle' || status.state === 'not-available' || status.state === 'error') && (
          <button
            onClick={handleCheck}
            className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer"
          >
            {t('pages.settingsPage.checkForUpdates')}
          </button>
        )}
        {status.state === 'available' && (
          <button
            onClick={handleDownload}
            className="px-4 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-accent-strong text-white transition-colors cursor-pointer"
          >
            {t('pages.settingsPage.downloadUpdate')}
          </button>
        )}
        {status.state === 'downloaded' && (
          <button
            onClick={handleInstall}
            className="px-4 py-1.5 text-sm rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors cursor-pointer"
          >
            {t('pages.settingsPage.installAndRestart')}
          </button>
        )}
        {status.state === 'checking' && (
          <span className="text-sm text-muted animate-pulse">{t('pages.settingsPage.checking')}</span>
        )}
      </div>

      {(status.state === 'available' || status.state === 'downloaded') && status.releaseNotes && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">{t('pages.settingsPage.whatsNew')}</p>
          <div className="text-sm text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {status.releaseNotes}
          </div>
        </div>
      )}

      {/* v2.1.16 auto-update preferences. All four default off; opt-in. */}
      <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
        <p className="text-xs uppercase tracking-wider text-gray-500">{t('pages.settingsPage.autoUpdatePrefs')}</p>
        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCheckUpdates}
            onChange={(e) => {
              setAutoCheckUpdates(e.target.checked)
              void persistAutoPrefs({ autoCheckUpdates: e.target.checked })
            }}
            className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer"
          />
          <span>
            {t('pages.settingsPage.autoCheckLabel')}
            <span className="block text-xs text-gray-500">{t('pages.settingsPage.autoCheckDesc')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoDownloadUpdates}
            disabled={!autoCheckUpdates}
            onChange={(e) => {
              setAutoDownloadUpdates(e.target.checked)
              void persistAutoPrefs({ autoDownloadUpdates: e.target.checked })
            }}
            className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <span>
            {t('pages.settingsPage.autoDownloadLabel')}
            <span className="block text-xs text-gray-500">{t('pages.settingsPage.autoDownloadDesc')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRestartAfterUpdate}
            disabled={!autoCheckUpdates || !autoDownloadUpdates}
            onChange={(e) => {
              setAutoRestartAfterUpdate(e.target.checked)
              void persistAutoPrefs({ autoRestartAfterUpdate: e.target.checked })
            }}
            className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <span>
            {t('pages.settingsPage.autoRestartLabel')}
            <span className="block text-xs text-gray-500">{t('pages.settingsPage.autoRestartDesc')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoInstallSilent}
            onChange={(e) => {
              setAutoInstallSilent(e.target.checked)
              void persistAutoPrefs({ autoInstallSilent: e.target.checked })
            }}
            className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer"
          />
          <span>
            {t('pages.settingsPage.silentInstallLabel')}
            <span className="block text-xs text-gray-500">{t('pages.settingsPage.silentInstallDesc')}</span>
          </span>
        </label>
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
  const { t } = useT()
  const [syncState, setSyncState] = useState<CloudSyncState>({
    configured: false,
    remotes: [],
    campaigns: []
  })
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  // Auto-backup on launch when stale (default on; no-op unless cloud configured).
  const [autoBackup, setAutoBackup] = useState(true)
  // The Pi base URL is preset for everyone (the public tunnel default + LAN
  // mDNS auto-discovery) and BMO is reachable without an API key, so there's
  // nothing to configure here — just the backup actions below.

  // Phase 36 / R-lib — the 5e library loads from the Pi by default and falls
  // back to bundled data automatically when the Pi is unreachable (see
  // services/library/remote-library.ts). There is intentionally NO setting for
  // this — it's automatic, so no toggle is rendered here.
  useEffect(() => {
    window.api
      .loadSettings()
      .then((s) => {
        // Seed the backup display from the persisted timestamp so it survives relaunch.
        if (s?.lastBackupTime) setSyncState((prev) => ({ ...prev, lastBackupTime: s.lastBackupTime }))
        setAutoBackup(s?.autoBackupOnLaunch !== false)
      })
      .catch(() => {})
  }, [])

  const handleToggleAutoBackup = async (checked: boolean): Promise<void> => {
    setAutoBackup(checked)
    try {
      const s = await window.api.loadSettings()
      await window.api.saveSettings({ ...s, autoBackupOnLaunch: checked })
    } catch {
      setAutoBackup(!checked) // revert on failure
    }
  }

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
        setMessage({ text: t('pages.settingsPage.cloudPiUnreachable'), type: 'error' })
      } else if (result.configured) {
        setMessage({ text: t('pages.settingsPage.cloudConnected'), type: 'success' })
      }
    } catch {
      setMessage({ text: t('pages.settingsPage.cloudConnectFailed'), type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  const handleBackupNow = async (): Promise<void> => {
    setLoading('backup')
    setMessage(null)
    try {
      const campaigns = (await window.api.loadCampaigns()) as { id: string; name: string }[] | null
      if (!campaigns || campaigns.length === 0) {
        setMessage({ text: t('pages.settingsPage.noCampaignsToBackup'), type: 'error' })
        return
      }
      // CLD-2 — back up EVERY campaign, not just campaigns[0]. "Backup Now" implies
      // all data; backing up only the first silently left the rest unprotected.
      let succeeded = 0
      const failures: string[] = []
      for (const campaign of campaigns) {
        try {
          const result = await window.api.cloudSync.backupCampaign(campaign.id, campaign.name)
          if (result.success) succeeded++
          else failures.push(campaign.name)
        } catch {
          failures.push(campaign.name)
        }
      }
      if (succeeded > 0) {
        const now = new Date().toISOString()
        setSyncState((prev) => ({ ...prev, lastBackupTime: now }))
        // Persist so both the display and the on-launch staleness nudge survive a relaunch.
        try {
          const s = await window.api.loadSettings()
          await window.api.saveSettings({ ...s, lastBackupTime: now })
        } catch {
          /* best-effort persist */
        }
      }
      if (failures.length === 0) {
        setMessage({ text: t('pages.settingsPage.backupCompletedAll', { count: succeeded }), type: 'success' })
      } else if (succeeded > 0) {
        setMessage({
          text: t('pages.settingsPage.backupPartial', { succeeded, failed: failures.length }),
          type: 'error'
        })
      } else {
        setMessage({ text: t('pages.settingsPage.backupFailed'), type: 'error' })
      }
    } catch {
      setMessage({ text: t('pages.settingsPage.backupFailedReachable'), type: 'error' })
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
        // The remote list keys on campaign id (no name stored on the Pi). Show
        // the friendly local name where we have that campaign locally; fall back
        // to the id for backups of campaigns not on this machine.
        const local = ((await window.api.loadCampaigns()) ?? []) as Array<{ id: string; name: string }>
        const nameById = new Map(local.map((c) => [c.id, c.name]))
        const named = (result.campaigns ?? []).map((c) => ({ ...c, name: nameById.get(c.id) ?? c.id }))
        setSyncState((prev) => ({
          ...prev,
          campaigns: named
        }))
        setMessage({
          text:
            result.campaigns.length > 0
              ? result.campaigns.length !== 1
                ? t('pages.settingsPage.foundBackupsPlural', { count: result.campaigns.length })
                : t('pages.settingsPage.foundBackupsSingular', { count: result.campaigns.length })
              : t('pages.settingsPage.noBackupsFound'),
          type: 'success'
        })
      } else {
        setMessage({ text: result.error ?? t('pages.settingsPage.listBackupsFailed'), type: 'error' })
      }
    } catch {
      setMessage({ text: t('pages.settingsPage.listBackupsFailedReachable'), type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  const handleRestore = async (id: string, name: string): Promise<void> => {
    // Restore overwrites the local copy — confirm first (window.confirm is the
    // page's established pattern for destructive actions).
    if (!window.confirm(t('pages.settingsPage.restoreConfirm', { name }))) return
    setLoading(`restore:${id}`)
    setMessage(null)
    try {
      const result = await window.api.cloudSync.restoreCampaign(id)
      if (result.success) {
        setMessage({ text: result.message ?? t('pages.settingsPage.restored'), type: 'success' })
      } else {
        setMessage({ text: result.error ?? t('pages.settingsPage.restoreFailed'), type: 'error' })
      }
    } catch {
      setMessage({ text: t('pages.settingsPage.restoreFailed'), type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('pages.settingsPage.cloudBackupDesc')}</p>

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
        <div className="text-xs text-muted space-y-1">
          {syncState.remotes.length > 0 && (
            <p>{t('pages.settingsPage.configuredRemotes', { remotes: syncState.remotes.join(', ') })}</p>
          )}
          {syncState.version && <p>{t('pages.settingsPage.rcloneVersion', { version: syncState.version })}</p>}
          {syncState.lastBackupTime && (
            <p>{t('pages.settingsPage.lastBackup', { time: new Date(syncState.lastBackupTime).toLocaleString() })}</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleCheckStatus}
          disabled={loading === 'status'}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'status' ? t('pages.settingsPage.checking') : t('pages.settingsPage.checkStatus')}
        </button>
        <button
          onClick={handleBackupNow}
          disabled={loading === 'backup'}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'backup' ? t('pages.settingsPage.backingUp') : t('pages.settingsPage.backupNow')}
        </button>
        <button
          onClick={handleListBackups}
          disabled={loading === 'list'}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'list' ? t('common.states.loading') : t('pages.settingsPage.listBackups')}
        </button>
      </div>

      {/* Auto-backup-on-launch toggle (opt out of the automatic stale backup) */}
      <label className="flex items-start gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={autoBackup}
          onChange={(e) => void handleToggleAutoBackup(e.target.checked)}
          className="mt-0.5 cursor-pointer"
        />
        <span>
          {t('pages.settingsPage.autoBackupToggle')}
          <span className="block text-xs text-gray-500">{t('pages.settingsPage.autoBackupDesc')}</span>
        </span>
      </label>

      {/* Backed-up campaigns list */}
      {syncState.campaigns.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted font-semibold">{t('pages.settingsPage.backedUpCampaigns')}</p>
          {syncState.campaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between py-1.5 px-2 rounded bg-surface-2/30 border border-border/30"
            >
              <span className="text-sm text-gray-300">{c.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">{c.id.slice(0, 8)}...</span>
                <button
                  onClick={() => void handleRestore(c.id, c.name)}
                  disabled={loading === `restore:${c.id}`}
                  className="px-2.5 py-1 text-xs rounded border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading === `restore:${c.id}` ? t('pages.settingsPage.restoring') : t('pages.settingsPage.restore')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Phase 17q — split the previous "Factory Reset" into two clearly-scoped
// operations. `resetAllData` (was `factoryResetAllSettings`) keeps its
// destructive footprint: localStorage wipe + file-based settings + a11y +
// theme + audio. `restoreDefaultSettings` is the non-destructive sibling
// that ONLY touches preferences (a11y/theme/audio/turn-server), leaving
// campaigns/characters/library/macros/drafts/notifications intact. Public
// export of the legacy name preserved as an alias for any third-party
// caller that may still reference it.
export async function resetAllData(): Promise<void> {
  // 1. Wipe every FILE-BASED content directory under userData (characters,
  //    campaigns, homebrew, library assets, bastions, game-states, …). This is
  //    the load-bearing fix — previously only localStorage was cleared, so the
  //    on-disk character/campaign .json files survived a "Reset All Data" and
  //    reappeared on the next load.
  try {
    const result = await window.api.wipeAllData()
    if (!result?.success) {
      logger.error('[resetAllData] file wipe reported failure:', result?.error)
    }
  } catch (err) {
    logger.error('[resetAllData] file wipe threw:', err)
  }

  // 2. Clear in-memory stores so the UI reflects the wipe immediately (without
  //    these, the already-loaded characters/campaigns linger until reload).
  try {
    useCharacterStore.setState({ characters: [], selectedCharacterId: null })
    useCampaignStore.setState({ campaigns: [], activeCampaignId: null })
    useLibraryStore.getState().clearAll()
    useConfigStore.getState().clearAll()
  } catch (err) {
    logger.error('[resetAllData] in-memory store clear failed:', err)
  }

  // 3. Clear ALL app-owned localStorage (macros, drafts, notification history,
  //    autosaves, library UI, lobby, dice tray, narration, encounters, prefs).
  //    Broadened to a hard wipe of any key that isn't an unrelated third-party
  //    key — every key this app writes is covered by these prefixes.
  const APP_KEY_PREFIXES = [
    'dnd-vtt-',
    'autosave:',
    'notification',
    'lobby',
    'macro',
    'builder-draft',
    'library',
    'dice-tray',
    'narration',
    'encounter',
    'campaign',
    'character',
    'bastion',
    'homebrew',
    'theme',
    'accessibility',
    'audio'
  ]
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && APP_KEY_PREFIXES.some((p) => key.startsWith(p))) keysToRemove.push(key)
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k))

  // 4. Apply the same preference defaults the non-destructive path uses.
  await restoreDefaultSettings()
}

export async function restoreDefaultSettings(): Promise<void> {
  // Phase 17q — non-destructive settings restore. Only resets preferences
  // (turn-server / userProfile / bmoPiBaseUrl, audio levels, a11y,
  // theme). Does NOT touch user content (campaigns, characters, macros,
  // library, drafts, notifications history).

  // Reset file-based settings
  await window.api.saveSettings({ turnServers: undefined, userProfile: undefined, bmoPiBaseUrl: undefined })

  // Reset in-memory audio state
  setGlobalVolume(1)
  setGlobalAmbientVolume(0.3)
  setGlobalAudioMuted(false)
  setGlobalAudioEnabled(true)

  // Reset accessibility store
  const accessStore = useAccessibilityStore.getState()
  accessStore.resetAllKeybindings()
  accessStore.setUiScale(100)
  accessStore.setColorblindMode('none')
  accessStore.setReducedMotion(false)
  accessStore.setScreenReaderMode(false)
  accessStore.setTooltipsEnabled(true)
  accessStore.setFontStyle('system')

  // Reset theme
  setTheme('dark')
}

export default function SettingsPage(): JSX.Element {
  const { t } = useT()
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
  // Draft string so users can type intermediate states like "-" or "1" → "12" without
  // each keystroke being clamped (which made "-99" snap to MAX after the user only meant MIN).
  // Clamping happens onBlur, against the final string.
  const [autoSaveIntervalDraft, setAutoSaveIntervalDraft] = useState(() => String(autoSaveInterval))

  // Accessibility store

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

  // Phase 17u — read returnTo state from the in-game Settings dropdown so
  // we can surface a "Return to game" link at the top.
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string })?.returnTo

  return (
    <div className="h-screen bg-base text-fg overflow-y-auto">
      {/* Header — sticky so the back button + title + (fixed) gear stay visible
          while the settings content scrolls. z-40 sits just under the fixed
          GlobalSettingsButton gear (z-50). */}
      <div className="sticky top-0 z-40 border-b border-gray-800 bg-base">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              aria-label={t('pages.settingsPage.goBack')}
              className="text-muted hover:text-gray-200 transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path
                  fillRule="evenodd"
                  d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-fg">{t('pages.settingsPage.title')}</h1>
          </div>
          {returnTo?.startsWith('/game/') && (
            <button
              onClick={() => navigate(returnTo)}
              className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded font-semibold transition-colors cursor-pointer"
            >
              {t('pages.settingsPage.returnToGame')}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Profile */}
        <Section title={t('pages.settingsPage.profile')}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">{t('pages.settingsPage.displayName')}</span>
            <input
              aria-label={t('pages.settingsPage.yourName')}
              type="text"
              maxLength={32}
              placeholder={t('pages.settingsPage.yourName')}
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              onBlur={() => saveProfile(profileName)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveProfile(profileName)
              }}
              className="w-48 px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-gray-200 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">{t('pages.settingsPage.displayNameHint')}</p>
        </Section>

        {/* Language */}
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

        {/* Theme */}
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
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-200">{t(THEME_LABEL_KEYS[theme])}</div>
                    {isActive && <div className="text-xs text-accent">{t('pages.settingsPage.active')}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Audio */}
        <Section title={t('pages.settingsPage.audio')}>
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                handleMasterVolumeChange(100)
                handleAmbientVolumeChange(30)
                handleMutedChange(false)
                handleEnabledChange(true)
              }}
              className="px-2 py-0.5 text-xs bg-surface border border-gray-600 rounded text-fg hover:text-red-300 cursor-pointer"
            >
              {t('pages.settingsPage.resetAudioDefaults')}
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">{t('pages.settingsPage.soundSystem')}</span>
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
              <span className="text-sm text-gray-300">{t('pages.settingsPage.muteAllSounds')}</span>
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
              <span className="text-sm text-gray-300 w-32">{t('pages.settingsPage.masterVolume')}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={masterVolume}
                onChange={(e) => handleMasterVolumeChange(Number(e.target.value))}
                disabled={!audioEnabled || audioMuted}
                className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
              />
              <span className="text-xs text-muted w-8 text-right">{Math.round(masterVolume)}%</span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300 w-32">{t('pages.settingsPage.ambientMusic')}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={ambientVolume}
                onChange={(e) => handleAmbientVolumeChange(Number(e.target.value))}
                disabled={!audioEnabled || audioMuted}
                className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
              />
              <span className="text-xs text-muted w-8 text-right">{Math.round(ambientVolume)}%</span>
            </div>
          </div>
        </Section>

        {/* Accessibility */}
        <AccessibilitySection />

        {/* Grid Preferences */}
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
                  value={gridColor}
                  onChange={(e) => handleGridColorChange(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-600 cursor-pointer bg-transparent"
                />
                <span className="text-sm text-muted font-mono">{gridColor}</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Dice Roller */}
        <Section title={t('pages.settingsPage.diceRoller')}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">{t('pages.settingsPage.defaultDiceMode')}</span>
            <div className="flex gap-2">
              {(['3d', '2d'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleDiceModeChange(mode)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
                    diceRollMode === mode
                      ? 'bg-amber-600 border-amber-500 text-white'
                      : 'bg-surface-2 border-border text-muted hover:border-gray-600'
                  }`}
                >
                  {mode === '3d' ? t('pages.settingsPage.dice3d') : t('pages.settingsPage.dice2d')}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Notifications */}
        <Section title={t('pages.settingsPage.notifications')}>
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                setNotificationsEnabled(true)
                NotificationService.setEnabled(true)
                NotificationService.setSoundEnabled(true)
              }}
              className="px-2 py-0.5 text-xs bg-surface border border-gray-600 rounded text-fg hover:text-red-300 cursor-pointer"
            >
              {t('pages.settingsPage.resetNotificationDefaults')}
            </button>
          </div>
          {!NotificationService.isSupported() && (
            <p className="text-xs text-yellow-400 mb-3">{t('pages.settingsPage.notificationsUnavailable')}</p>
          )}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm text-gray-300">{t('pages.settingsPage.enableNotifications')}</span>
              <p className="text-xs text-gray-500">{t('pages.settingsPage.enableNotificationsDesc')}</p>
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
              <span className="text-sm text-gray-300">{t('pages.settingsPage.notificationSound')}</span>
              <p className="text-xs text-gray-500">{t('pages.settingsPage.notificationSoundDesc')}</p>
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
              <span className="text-sm text-gray-300">{t('pages.settingsPage.onlyWhenUnfocused')}</span>
              <p className="text-xs text-gray-500">{t('pages.settingsPage.onlyWhenUnfocusedDesc')}</p>
            </div>
            <input
              type="checkbox"
              checked={NotificationService.getConfig().onlyWhenBlurred}
              onChange={(e) => NotificationService.setOnlyWhenBlurred(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </label>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted font-semibold">{t('pages.settingsPage.eventToggles')}</p>
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
                <span className="text-xs text-gray-300">
                  {event
                    .replace(/-/g, ' ')
                    .replace(/\bai\b/gi, 'AI')
                    .replace(/^./, (c) => c.toUpperCase())
                    .replace(/ (.)/g, (_, c) => ` ${c.toUpperCase()}`)}
                </span>
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
            className="mt-3 px-3 py-1 text-xs bg-surface-2 text-gray-300 rounded hover:bg-gray-700 cursor-pointer"
            onClick={() => {
              const result = NotificationService.notify('your-turn', t('pages.settingsPage.testCharacter'), undefined, {
                force: true
              })
              if (result === 'shown') {
                addToast(t('pages.settingsPage.testNotificationSent'), 'success')
              } else if (result === 'unsupported') {
                addToast(t('pages.settingsPage.testNotificationUnsupported'), 'error')
              } else {
                // 'disabled' / 'event-off' — notifications turned off in settings
                addToast(t('pages.settingsPage.testNotificationDisabled'), 'info')
              }
            }}
          >
            {t('pages.settingsPage.testNotification')}
          </button>
        </Section>

        {/* Auto-Save */}
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

        {/* Import/Export Settings */}
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
                  addToast(
                    err instanceof Error ? err.message : t('pages.settingsPage.toastSettingsImportFailed'),
                    'error'
                  )
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

        {/* Content Packs & Plugins */}
        <Section title={t('pages.settingsPage.contentPacksPlugins')}>
          <PluginManager />
        </Section>

        {/* Game Systems */}
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

        {/* Updates */}
        <Section title={t('pages.settingsPage.updates')}>
          <UpdateSection />
        </Section>

        {/* Cloud Backup */}
        <Section title={t('pages.settingsPage.cloudBackup')}>
          <CloudBackupSection />
        </Section>

        {/* Ollama AI */}
        <Section title={t('pages.settingsPage.ollamaAi')}>
          <OllamaManagement />
        </Section>

        {/* Discord Integration */}
        <Section title={t('pages.settingsPage.discordIntegration')}>
          <DiscordIntegrationSettings />
        </Section>

        {/* Multiplayer — P2P signaling reachability */}
        <Section title={t('pages.settingsPage.multiplayer')}>
          <MultiplayerStatusSection />
        </Section>

        {/* Keybindings */}
        <Section title={t('pages.settingsPage.keybindings')}>
          <KeybindingEditor />
        </Section>

        {/* Phase 17q — Reset / Restore — two scoped operations.
            "Restore Default Settings" is non-destructive (preferences only).
            "Reset All Data" is the legacy Factory Reset, renamed for clarity. */}
        <Section title={t('pages.settingsPage.resetRestore')}>
          <p className="text-xs text-amber-300 mb-2">
            <strong className="text-amber-200">{t('pages.settingsPage.restoreDefaultSettings')}</strong>
            {t('pages.settingsPage.restoreDefaultSettingsDesc')}
          </p>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm(t('pages.settingsPage.restoreDefaultsConfirm'))) {
                await restoreDefaultSettings()
                window.location.reload()
              }
            }}
            className="px-4 py-1.5 text-sm rounded-lg border bg-amber-900/30 border-amber-700/50 text-amber-200 hover:bg-amber-800/50 hover:text-amber-100 transition-colors cursor-pointer"
          >
            {t('pages.settingsPage.restoreDefaultSettings')}
          </button>

          <p className="text-xs text-red-400 mt-6 mb-2">
            <strong className="text-red-300">{t('pages.settingsPage.resetAllData')}</strong>
            {t('pages.settingsPage.resetAllDataDesc')}
          </p>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm(t('pages.settingsPage.resetAllDataConfirm'))) {
                await resetAllData()
                window.location.reload()
              }
            }}
            className="px-4 py-1.5 text-sm rounded-lg border bg-red-900/30 border-red-700/50 text-red-300 hover:bg-red-800/50 hover:text-red-100 transition-colors cursor-pointer"
          >
            {t('pages.settingsPage.resetAllData')}
          </button>
        </Section>
      </div>
    </div>
  )
}
