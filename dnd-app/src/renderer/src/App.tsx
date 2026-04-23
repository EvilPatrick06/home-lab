import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router'
import { DiceOverlay } from './components/game/dice3d'
import { ErrorBoundary, ShortcutsOverlay, Spinner, ToastContainer } from './components/ui'
import ColorblindFilters from './components/ui/ColorblindFilters'
import GlobalSettingsButton from './components/ui/GlobalSettingsButton'
import ScreenReaderAnnouncer from './components/ui/ScreenReaderAnnouncer'
import SkipToContent from './components/ui/SkipToContent'
import UpdatePrompt from './components/ui/UpdatePrompt'
import { addToast } from './hooks/use-toast'
import MainMenuPage from './pages/MainMenuPage'
import { preloadAllData } from './services/data-provider'
import { loadShortcutDefinitions } from './services/keyboard-shortcuts'
import * as NotificationService from './services/notification-service'
import { loadTemplates as loadNotificationTemplates } from './services/notification-service'
import { init as initSoundManager, preloadEssential } from './services/sound-manager'
import { applyColorblindFilter, loadSavedTheme, loadThemeDefinitions } from './services/theme-manager'
import { useAccessibilityStore } from './stores/use-accessibility-store'
import { initGameSystems } from './systems/init'
import { logger } from './utils/logger'

const ViewCharactersPage = lazy(() => import('./pages/ViewCharactersPage'))
const JoinGamePage = lazy(() => import('./pages/JoinGamePage'))
const MakeGamePage = lazy(() => import('./pages/MakeGamePage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const LobbyPage = lazy(() => import('./pages/LobbyPage'))
const InGamePage = lazy(() => import('./pages/InGamePage'))
const CreateCharacterPage = lazy(() => import('./pages/CreateCharacterPage'))
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const BastionPage = lazy(() => import('./pages/BastionPage'))
const CharacterSheet5ePage = lazy(() => import('./pages/CharacterSheet5ePage'))
const LevelUp5ePage = lazy(() => import('./pages/LevelUp5ePage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function App(): JSX.Element {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const uiScale = useAccessibilityStore((s) => s.uiScale)
  const colorblindMode = useAccessibilityStore((s) => s.colorblindMode)

  // Initialize game system registry and notification service
  useEffect(() => {
    initGameSystems()
    NotificationService.init()
    loadSavedTheme()
    initSoundManager()
    preloadEssential()
    preloadAllData()

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
    <div className="relative min-h-screen bg-gray-950 text-gray-100">
      <SkipToContent />
      <ColorblindFilters />
      <ScreenReaderAnnouncer />
      <DiceOverlay />
      <ToastContainer />
      <UpdatePrompt />
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
              <Route
                path="/characters/create"
                element={
                  <ErrorBoundary>
                    <CreateCharacterPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/characters/5e/create"
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
