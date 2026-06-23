import { Component, type ErrorInfo, type ReactNode } from 'react'
import { i18n } from '../../i18n'
import { isChunkLoadError } from '../../utils/lazy-with-reload'
import { logger } from '../../utils/logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  isChunkError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, isChunkError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // A stale-chunk failure after a redeploy (PHASE-44) is not a real crash —
    // surface a "new version, reload" affordance instead of the generic error.
    return { hasError: true, error, isChunkError: isChunkLoadError(error) }
  }

  private componentStack: string | undefined

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.componentStack = info.componentStack ?? undefined
    logger.error('[ErrorBoundary] Uncaught error:', error)
    logger.error('[ErrorBoundary] Component stack:', info.componentStack)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, isChunkError: false })
  }

  handleRestart = (): void => {
    window.location.reload()
  }

  handleCopyErrorReport = (): void => {
    const error = this.state.error
    if (!error) return
    const report = [
      `Error: ${error.message}`,
      `Stack: ${error.stack ?? 'N/A'}`,
      `Component: ${this.componentStack ?? 'N/A'}`,
      `Time: ${new Date().toISOString()}`,
      `Platform: ${navigator.userAgent}`
    ].join('\n\n')
    navigator.clipboard.writeText(report).catch(() => {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = report
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      } catch {
        /* exhausted fallbacks */
      }
    })
  }

  handleSaveBugReport = async (): Promise<void> => {
    const error = this.state.error
    if (!error) return
    try {
      const report = [
        '=== D&D VTT Bug Report ===',
        `Time: ${new Date().toISOString()}`,
        `Platform: ${navigator.userAgent}`,
        '',
        '--- Error ---',
        `Message: ${error.message}`,
        `Stack: ${error.stack ?? 'N/A'}`,
        '',
        '--- Component Stack ---',
        this.componentStack ?? 'N/A',
        '',
        '--- Window State ---',
        `URL: ${window.location.href}`,
        `Viewport: ${window.innerWidth}x${window.innerHeight}`,
        `Memory: ${JSON.stringify((performance as { memory?: unknown }).memory ?? 'N/A')}`
      ].join('\n')

      const path = await window.api.showSaveDialog({
        title: i18n.t('ui.errorBoundary.saveBugReport'),
        defaultPath: `dnd-vtt-bug-report-${new Date().toISOString().slice(0, 10)}.txt`,
        filters: [{ name: i18n.t('ui.errorBoundary.textFilesFilter'), extensions: ['txt'] }]
      })
      if (path) {
        await window.api.writeFile(path, report)
      }
    } catch {
      // Fallback to clipboard
      this.handleCopyErrorReport()
    }
  }

  handleOpenDevTools = (): void => {
    try {
      window.api.openDevTools()
    } catch {
      // DevTools not available
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }
      if (this.state.isChunkError) {
        // PHASE-44 F3b backstop: the lazyWithReload one-shot already tried a
        // reload and the chunk is still gone (or this boundary caught the
        // failure directly). Offer an explicit reload-to-latest rather than the
        // scary generic crash UI. Strings are i18n-keyed but kept terse.
        return (
          <div className="h-screen w-screen flex items-center justify-center bg-base text-fg">
            <div className="max-w-md w-full mx-4 bg-surface border border-amber-500/50 rounded-xl p-8 shadow-2xl">
              <h1 className="text-xl font-bold text-amber-400 mb-2">{i18n.t('ui.errorBoundary.newVersionTitle')}</h1>
              <p className="text-sm text-muted mb-6">{i18n.t('ui.errorBoundary.newVersionDescription')}</p>
              <button
                onClick={this.handleRestart}
                className="w-full px-4 py-2.5 text-sm font-semibold bg-amber-600 hover:bg-accent-strong text-white rounded-lg cursor-pointer transition-colors"
              >
                {i18n.t('ui.errorBoundary.reload')}
              </button>
            </div>
          </div>
        )
      }
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-base text-fg">
          <div className="max-w-lg w-full mx-4 bg-surface border border-red-500/50 rounded-xl p-8 shadow-2xl">
            <h1 className="text-xl font-bold text-red-400 mb-2">{i18n.t('ui.errorBoundary.title')}</h1>
            <p className="text-sm text-muted mb-4">{i18n.t('ui.errorBoundary.description')}</p>
            {this.state.error && (
              <pre className="text-xs text-red-300/80 bg-base rounded-lg p-3 mb-6 overflow-auto max-h-40 border border-gray-800">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-amber-600 hover:bg-accent-strong text-white rounded-lg cursor-pointer transition-colors"
              >
                {i18n.t('ui.errorBoundary.tryAgain')}
              </button>
              <button
                onClick={this.handleRestart}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg cursor-pointer transition-colors"
              >
                {i18n.t('ui.errorBoundary.restartApp')}
              </button>
              <button
                onClick={this.handleCopyErrorReport}
                className="px-4 py-2.5 text-sm font-semibold bg-surface-2 hover:bg-gray-700 text-muted rounded-lg cursor-pointer transition-colors"
              >
                {i18n.t('ui.errorBoundary.copyErrorReport')}
              </button>
              <button
                onClick={() => {
                  void this.handleSaveBugReport()
                }}
                className="px-4 py-2.5 text-sm font-semibold bg-surface-2 hover:bg-gray-700 text-muted rounded-lg cursor-pointer transition-colors"
              >
                {i18n.t('ui.errorBoundary.saveBugReport')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
