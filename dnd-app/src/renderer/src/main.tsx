import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router'
import './stores/register-stores'
import App from './App'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { initI18n } from './i18n'
import { initPluginSystem } from './services/plugin-system'
import { logger } from './utils/logger'
import { isWebBuild } from './utils/platform'
import './styles/globals.css'

// Log unhandled errors to console (ErrorBoundary catches render errors,
// these catch everything else)
window.addEventListener('error', (e) => {
  logger.error('[Global] Uncaught error:', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  logger.error('[Global] Unhandled promise rejection:', e.reason)
})

// Phase 34a — initialize i18n before first render (English is bundled, so this
// resolves synchronously; the await keeps the contract for future async locales).
initI18n()
  .catch((e) => logger.warn('[Init] i18n init failed', e))
  .finally(() => {
    // Web build: real URLs via BrowserRouter (basename = the Vite base,
    // /DungeonTableOnline) so deep links + refresh land on the right page instead
    // of resetting to the menu, and each route code-splits. Desktop runs from
    // file://, where only the in-memory router works.
    const isWeb = isWebBuild()
    const Router = isWeb ? BrowserRouter : MemoryRouter
    const basename = isWeb ? import.meta.env.BASE_URL.replace(/\/+$/, '') || undefined : undefined
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <ErrorBoundary>
          <Router basename={basename}>
            <App />
          </Router>
        </ErrorBoundary>
      </React.StrictMode>
    )
  })

// Initialize plugin system after render
initPluginSystem().catch((e) => logger.warn('[Init] Plugin system init failed', e))
