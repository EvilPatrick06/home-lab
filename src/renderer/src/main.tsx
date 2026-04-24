import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import './stores/register-stores'
import App from './App'
import ErrorBoundary from './components/ui/ErrorBoundary'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </ErrorBoundary>
  </React.StrictMode>
)

// Initialize plugin system after render
initPluginSystem().catch((e) => logger.warn('[Init] Plugin system init failed', e))
