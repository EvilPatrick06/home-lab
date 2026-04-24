import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '../../utils/logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  private componentStack: string | undefined

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.componentStack = info.componentStack ?? undefined
    logger.error('[ErrorBoundary] Uncaught error:', error)
    logger.error('[ErrorBoundary] Component stack:', info.componentStack)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
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
        `Memory: ${JSON.stringify((performance as unknown as { memory?: unknown }).memory ?? 'N/A')}`
      ].join('\n')

      const path = await window.api.showSaveDialog({
        title: 'Save Bug Report',
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
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
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-gray-950 text-gray-100">
          <div className="max-w-lg w-full mx-4 bg-gray-900 border border-red-500/50 rounded-xl p-8 shadow-2xl">
            <h1 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-400 mb-4">
              The application encountered an unexpected error. You can try again or restart the app.
            </p>
            {this.state.error && (
              <pre className="text-xs text-red-300/80 bg-gray-950 rounded-lg p-3 mb-6 overflow-auto max-h-40 border border-gray-800">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg cursor-pointer transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleRestart}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg cursor-pointer transition-colors"
              >
                Restart App
              </button>
              <button
                onClick={this.handleCopyErrorReport}
                className="px-4 py-2.5 text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg cursor-pointer transition-colors"
              >
                Copy Error Report
              </button>
              <button
                onClick={() => {
                  void this.handleSaveBugReport()
                }}
                className="px-4 py-2.5 text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg cursor-pointer transition-colors"
              >
                Save Bug Report
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
