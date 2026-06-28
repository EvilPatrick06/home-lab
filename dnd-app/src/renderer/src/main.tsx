import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router'
import './utils/bootstrap-storage'
import './stores/register-stores'
import App from './App'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { initI18n } from './i18n'
import { initPluginSystem } from './services/plugin-system'
import { logger } from './utils/logger'
import { isEmbedBuild, isWebBuild } from './utils/platform'
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
    // Routing target:
    //  - EMBED (RN WebView): MemoryRouter seeded from the URL hash the native
    //    shell sets (e.g. `#/game/abc`), since it's loaded from a file/opaque
    //    origin where BrowserRouter deep links don't work.
    //  - WEB: BrowserRouter (basename = the Vite base, /DungeonTableOnline) so
    //    deep links + refresh land on the right page and routes code-split.
    //  - DESKTOP: MemoryRouter (runs from file://).
    const isEmbed = isEmbedBuild()
    const isWeb = isWebBuild() && !isEmbed
    const basename = isWeb ? import.meta.env.BASE_URL.replace(/\/+$/, '') || undefined : undefined
    const initialEntry = isEmbed ? decodeURIComponent(window.location.hash.replace(/^#/, '')) || '/' : '/'
    const router = isWeb ? (
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    ) : (
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    )
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <ErrorBoundary>{router}</ErrorBoundary>
      </React.StrictMode>
    )
  })

// Initialize plugin system after render
initPluginSystem().catch((e) => logger.warn('[Init] Plugin system init failed', e))
