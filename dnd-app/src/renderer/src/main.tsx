import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import './stores/register-stores'
import App from './App'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { initI18n } from './i18n'
import { initPluginSystem } from './services/plugin-system'
import { logger } from './utils/logger'
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
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <ErrorBoundary>
          <MemoryRouter>
            <App />
          </MemoryRouter>
        </ErrorBoundary>
      </React.StrictMode>
    )
  })

// Initialize plugin system after render
initPluginSystem().catch((e) => logger.warn('[Init] Plugin system init failed', e))
