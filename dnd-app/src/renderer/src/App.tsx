import { Suspense, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { DiceOverlay } from './components/game/dice3d'
import { ErrorBoundary, ShortcutsOverlay, Spinner, ToastContainer } from './components/ui'
import ColorblindFilters from './components/ui/ColorblindFilters'
import CommandPalette from './components/ui/CommandPalette'
import GlobalSettingsButton from './components/ui/GlobalSettingsButton'
import OllamaFirstRunPrompt from './components/ui/OllamaFirstRunPrompt'
import OnboardingTour from './components/ui/OnboardingTour'
import ScreenReaderAnnouncer from './components/ui/ScreenReaderAnnouncer'
import ScreenReaderPrompt from './components/ui/ScreenReaderPrompt'
import SkipToContent from './components/ui/SkipToContent'
import UpdatePrompt from './components/ui/UpdatePrompt'
import { addToast } from './hooks/use-toast'
import { i18n, SUPPORTED_LOCALES } from './i18n'
import { setIceConfig } from './network'
import MainMenuPage from './pages/MainMenuPage'
import { backupStaleness } from './services/backup/backup-staleness'
import { preloadAllData } from './services/data-provider'
import { loadShortcutDefinitions } from './services/keyboard-shortcuts'
import * as NotificationService from './services/notification-service'
import { loadTemplates as loadNotificationTemplates } from './services/notification-service'
import { init as initSoundManager, preloadEssential } from './services/sound-manager'
import { applyColorblindFilter, loadSavedTheme, loadThemeDefinitions } from './services/theme-manager'
import { useAccessibilityStore } from './stores/use-accessibility-store'
import { initGameSystems } from './systems/init'
import { lazyWithReload } from './utils/lazy-with-reload'
import { logger } from './utils/logger'

const ViewCharactersPage = lazyWithReload(() => import('./pages/ViewCharactersPage'))
const JoinGamePage = lazyWithReload(() => import('./pages/JoinGamePage'))
const MakeGamePage = lazyWithReload(() => import('./pages/MakeGamePage'))
const AboutPage = lazyWithReload(() => import('./pages/AboutPage'))
const LobbyPage = lazyWithReload(() => import('./pages/LobbyPage'))
const ScenePrepPage = lazyWithReload(() => import('./pages/ScenePrepPage'))
const InGamePage = lazyWithReload(() => import('./pages/InGamePage'))
const CreateCharacterPage = lazyWithReload(() => import('./pages/CreateCharacterPage'))
const CampaignDetailPage = lazyWithReload(() => import('./pages/CampaignDetailPage'))
const CalendarPage = lazyWithReload(() => import('./pages/CalendarPage'))
const BastionPage = lazyWithReload(() => import('./pages/BastionPage'))
const CharacterSheet5ePage = lazyWithReload(() => import('./pages/CharacterSheet5ePage'))
const LevelUp5ePage = lazyWithReload(() => import('./pages/LevelUp5ePage'))
const LibraryPage = lazyWithReload(() => import('./pages/LibraryPage'))
const NotFoundPage = lazyWithReload(() => import('./pages/NotFoundPage'))
const SettingsPage = lazyWithReload(() => import('./pages/SettingsPage'))

function App(): JSX.Element {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const uiScale = useAccessibilityStore((s) => s.uiScale)
  const colorblindMode = useAccessibilityStore((s) => s.colorblindMode)
  const fontStyle = useAccessibilityStore((s) => s.fontStyle)

  // Initialize game system registry and notification service
  useEffect(() => {
    initGameSystems()
    NotificationService.init()
    loadSavedTheme()
    initSoundManager()
    preloadEssential()
    preloadAllData()

    // Phase 20c — apply user-configured TURN servers from settings at boot so a
    // saved relay works without first re-opening Network Settings. (Hardcoded
    // TURN credentials were removed; real creds now live only in settings.)
    window.api
      .loadSettings()
      .then((settings) => {
        if (settings.turnServers && settings.turnServers.length > 0) {
          setIceConfig(
            settings.turnServers.map((s) => ({
              urls: s.urls,
              username: s.username,
              credential: s.credential
            }))
          )
        }
        // Apply the persisted UI language (init stays 'en' for deterministic
        // first paint; switch here post-load if a supported locale was saved).
        if (
          settings.language &&
          (SUPPORTED_LOCALES as readonly string[]).includes(settings.language) &&
          i18n.language !== settings.language
        ) {
          i18n.changeLanguage(settings.language).catch((e) => logger.warn('Failed to apply saved language', e))
        }
        // On launch, when the last cloud backup is stale AND there's campaign
        // data worth backing up (never nag fresh/empty installs): auto-run the
        // backup (default on) if cloud/rclone is configured, else fall back to a
        // one-time nudge. Auto-backup is a no-op when the Pi/cloud isn't set up.
        // Account-aware cloud strategy on launch:
        //  - signed in  → start the per-user sync engine (it handles ALL cloud
        //    sync, including the first-login "claim" of existing local data); the
        //    legacy per-campaign backup is skipped to avoid redundant uploads.
        //  - signed out → fall back to the legacy stale-campaign backup/nudge
        //    (unchanged behavior for users without an account).
        window.api.account
          .getStatus()
          .then(async (status) => {
            if (status.signedIn) {
              const { startSync } = await import('./services/sync/sync-engine')
              startSync()
              return
            }
            const backup = backupStaleness(settings.lastBackupTime)
            if (!backup.stale) return
            const campaigns = await window.api.loadCampaigns()
            if (campaigns.length === 0) return
            if (settings.autoBackupOnLaunch !== false) {
              try {
                const cloud = await window.api.cloudSync.getStatus()
                if (!cloud.configured) return // cloud not set up → nothing to auto-back-up
                const c = campaigns[0] as { id: string; name: string }
                const res = await window.api.cloudSync.backupCampaign(c.id, c.name)
                if (res.success) {
                  await window.api.saveSettings({ ...settings, lastBackupTime: new Date().toISOString() })
                  addToast(i18n.t('notify.backup.autoDone'), 'success', 5000)
                }
              } catch {
                /* best-effort — stay quiet on failure rather than double-notifying */
              }
              return
            }
            addToast(i18n.t('notify.backup.staleReminder', { days: backup.daysSince ?? 0 }), 'warning', 8000)
          })
          .catch(() => {})
      })
      .catch((e) => logger.warn('Failed to apply saved settings at boot', e))

    // Warm caches for module-level data loaders so they are referenced as used exports.
    // These are fire-and-forget; errors are non-fatal (data-provider caches handle fallback).
    loadShortcutDefinitions()
    loadThemeDefinitions()
    loadNotificationTemplates()

    // Dynamic imports for component/store-level cache loaders
    import('./services/character/auto-populate-5e')
      .then((m) => m.loadSpeciesSpellData())
      .catch((e) => logger.warn('preload auto-populate-5e failed', e))
    import('./components/builder/5e/gear-tab-types')
      .then((m) => m.loadCurrencyConfigData())
      .catch((e) => logger.warn('preload gear-tab-types failed', e))
    import('./components/builder/5e/LanguagesTab5e')
      .then((m) => m.loadLanguageD12Data())
      .catch((e) => logger.warn('preload LanguagesTab5e failed', e))
    import('./components/builder/shared/SelectionFilterBar')
      .then((m) => m.loadRarityOptionData())
      .catch((e) => logger.warn('preload SelectionFilterBar failed', e))
    import('./components/game/bottom/DMTabPanel')
      .then((m) => m.loadDmTabData())
      .catch((e) => logger.warn('preload DMTabPanel failed', e))
    import('./components/game/dice3d/dice-meshes')
      .then((m) => m.loadDiceColorData())
      .catch((e) => logger.warn('preload dice-meshes failed', e))
    import('./components/game/dm/StatBlockEditor')
      .then((m) => m.loadCreatureTypeData())
      .catch((e) => logger.warn('preload StatBlockEditor failed', e))
    import('./stores/builder/types')
      .then((m) => {
        m.loadAbilityScoreConfigData()
        m.loadPresetIconData()
      })
      .catch((e) => logger.warn('preload builder/types failed', e))
    import('./components/campaign/AdventureWizard')
      .then((m) => m.loadAdventureSeedData())
      .catch((e) => logger.warn('preload AdventureWizard failed', e))
    import('./components/campaign/SessionZeroStep')
      .then((m) => m.loadSessionZeroConfigData())
      .catch((e) => logger.warn('preload SessionZeroStep failed', e))
    import('./components/campaign/MapConfigStep')
      .then((m) => m.loadBuiltInMapData())
      .catch((e) => logger.warn('preload MapConfigStep failed', e))
  }, [])

  // Apply UI scale to root font-size (rem-based Tailwind scales with this)
  useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale}%`
  }, [uiScale])

  // Apply colorblind filter
  useEffect(() => {
    applyColorblindFilter(colorblindMode)
  }, [colorblindMode])

  // Phase 18i — toggle the Cinzel fantasy heading font on <body>
  useEffect(() => {
    document.body.classList.toggle('fantasy-font', fontStyle === 'fantasy')
  }, [fontStyle])

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'

      if (e.key === '?' && !isInput) {
        e.preventDefault()
        setShortcutsOpen((prev) => !prev)
        return
      }

      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          setShortcutsOpen(false)
          return
        }
      }
    },
    [shortcutsOpen]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  useEffect(() => {
    const handler = (e: PromiseRejectionEvent): void => {
      logger.error('[UnhandledRejection]', e.reason)
      addToast('An unexpected error occurred. See logs for details.', 'error')
    }
    window.addEventListener('unhandledrejection', handler)
    return () => window.removeEventListener('unhandledrejection', handler)
  }, [])

  return (
    <div className="relative min-h-screen bg-base text-fg">
      <SkipToContent />
      <ColorblindFilters />
      <ScreenReaderAnnouncer />
      <DiceOverlay />
      <ToastContainer />
      <UpdatePrompt />
      <OllamaFirstRunPrompt />
      <ScreenReaderPrompt />
      <OnboardingTour />
      <CommandPalette />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <GlobalSettingsButton />
      <main id="main-content">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-screen">
                <Spinner size="lg" />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<MainMenuPage />} />
              <Route path="/characters" element={<ViewCharactersPage />} />
              {/* Phase 18f — 5e is the only system; redirect the legacy generic
                  create path to the 5e builder (bookmarks / external links). */}
              <Route path="/characters/create" element={<Navigate to="/characters/5e/create" replace />} />
              <Route
                path="/characters/:systemSeg/create"
                element={
                  <ErrorBoundary>
                    <CreateCharacterPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/characters/5e/edit/:id"
                element={
                  <ErrorBoundary>
                    <CreateCharacterPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/characters/5e/:id"
                element={
                  <ErrorBoundary>
                    <CharacterSheet5ePage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/characters/5e/:id/levelup"
                element={
                  <ErrorBoundary>
                    <LevelUp5ePage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/characters/edit/:id"
                element={
                  <ErrorBoundary>
                    <CreateCharacterPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/join" element={<JoinGamePage />} />
              <Route path="/make" element={<MakeGamePage />} />
              <Route
                path="/campaign/:id"
                element={
                  <ErrorBoundary>
                    <CampaignDetailPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/about" element={<AboutPage />} />
              <Route
                path="/lobby/:campaignId"
                element={
                  <ErrorBoundary>
                    <LobbyPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/prepare/:campaignId"
                element={
                  <ErrorBoundary>
                    <ScenePrepPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/game/:campaignId"
                element={
                  <ErrorBoundary>
                    <InGamePage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/library"
                element={
                  <ErrorBoundary>
                    <LibraryPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/bastions"
                element={
                  <ErrorBoundary>
                    <BastionPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ErrorBoundary>
                    <CalendarPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/settings"
                element={
                  <ErrorBoundary>
                    <SettingsPage />
                  </ErrorBoundary>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
