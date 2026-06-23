import { useLocation, useNavigate } from 'react-router'
import { AccessibilitySection } from '../components/settings/AccessibilitySection'
import { AudioSection } from '../components/settings/AudioSection'
import { AutoSaveSection } from '../components/settings/AutoSaveSection'
import { CloudBackupSection } from '../components/settings/CloudBackupSection'
import { DiceSection } from '../components/settings/DiceSection'
import { GridSection } from '../components/settings/GridSection'
import { KeybindingEditor } from '../components/settings/KeybindingEditor'
import { LanguageSection } from '../components/settings/LanguageSection'
import { NotificationsSection } from '../components/settings/NotificationsSection'
import { PluginManager } from '../components/settings/PluginManager'
import { ProfileSection } from '../components/settings/ProfileSection'
import { RegisteredGameSystemsSection } from '../components/settings/RegisteredGameSystemsSection'
import { SettingsImportExportSection } from '../components/settings/SettingsImportExportSection'
import { Section } from '../components/settings/SettingsSection'
import { ThemeSection } from '../components/settings/ThemeSection'
import { UpdateSection } from '../components/settings/UpdateSection'
import DiscordIntegrationSettings from '../components/ui/DiscordIntegrationSettings'
import MultiplayerStatusSection from '../components/ui/MultiplayerStatusSection'
import OllamaManagement, { type AvailableModelList, type InstalledModelList } from '../components/ui/OllamaManagement'
import { useCampaignStore } from '../stores/use-campaign-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useConfigStore } from '../stores/use-config-store'
import { useLibraryStore } from '../stores/use-library-store'
import { logger } from '../utils/logger'
import { isWebBuild } from '../utils/platform'

/** Re-exported Ollama model list components for use by consumers importing from SettingsPage. */
type _AvailableModelList = typeof AvailableModelList
type _InstalledModelList = typeof InstalledModelList

import type { ValidationResult } from '../network'

type _ValidationResult = ValidationResult

import type { AutoSaveConfig, SaveVersion } from '../services/io/auto-save'

type _AutoSaveConfig = AutoSaveConfig
type _SaveVersion = SaveVersion

import type { EntityType, ExportEnvelope, ImportResult } from '../services/io/entity-io'

type _EntityType = EntityType
type _ExportEnvelope = ExportEnvelope
type _ImportResult = ImportResult<unknown>

import type { NotificationEvent } from '../services/notification-service'

type _NotificationEvent = NotificationEvent

import { useT } from '../i18n'
import {
  setAmbientVolume as setGlobalAmbientVolume,
  setEnabled as setGlobalAudioEnabled,
  setMuted as setGlobalAudioMuted,
  setVolume as setGlobalVolume
} from '../services/sound-manager'
import { setTheme } from '../services/theme-manager'
import { useAccessibilityStore } from '../stores/use-accessibility-store'

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

  // Notification settings

  // Auto-save settings

  // Accessibility store

  // Audio settings

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
        <ProfileSection />

        {/* Language */}
        <LanguageSection />

        {/* Theme */}
        <ThemeSection />

        {/* Audio */}
        <AudioSection />

        {/* Accessibility */}
        <AccessibilitySection />

        {/* Grid Preferences */}
        <GridSection />

        {/* Dice Roller */}
        <DiceSection />

        {/* Notifications */}
        <NotificationsSection />

        {/* Auto-Save */}
        <AutoSaveSection />

        {/* Import/Export Settings */}
        <SettingsImportExportSection />

        {/* Content Packs & Plugins */}
        <Section title={t('pages.settingsPage.contentPacksPlugins')}>
          <PluginManager />
        </Section>

        {/* Game Systems */}
        <RegisteredGameSystemsSection />

        {/* Updates — desktop-only (auto-updater is Electron; the web build
            updates on reload). Hidden in the web build (PHASE-45). */}
        {!isWebBuild() && (
          <Section title={t('pages.settingsPage.updates')}>
            <UpdateSection />
          </Section>
        )}

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
