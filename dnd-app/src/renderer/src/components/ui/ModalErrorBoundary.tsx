import { Component, type ErrorInfo, type ReactNode } from 'react'
import { i18n } from '../../i18n'
import { logger } from '../../utils/logger'

interface Props {
  children: ReactNode
  onClose?: () => void
  modalName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ModalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(`[ModalErrorBoundary] Error in ${this.props.modalName ?? 'modal'}:`, error)
    logger.error('[ModalErrorBoundary] Component stack:', info.componentStack)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  handleClose = (): void => {
    this.setState({ hasError: false, error: null })
    this.props.onClose?.()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="max-w-md w-full mx-4 bg-surface border border-red-500/50 rounded-xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-red-400 mb-2">
              {this.props.modalName
                ? i18n.t('ui.modalErrorBoundary.errorInModal', { modalName: this.props.modalName })
                : i18n.t('ui.modalErrorBoundary.title')}
            </h2>
            <p className="text-sm text-muted mb-3">{i18n.t('ui.modalErrorBoundary.description')}</p>
            {this.state.error && (
              <pre className="text-xs text-red-300/80 bg-base rounded-lg p-3 mb-4 overflow-auto max-h-32 border border-gray-800">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-accent-strong text-white rounded-lg cursor-pointer transition-colors"
              >
                {i18n.t('ui.modalErrorBoundary.tryAgain')}
              </button>
              <button
                onClick={this.handleClose}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg cursor-pointer transition-colors"
              >
                {i18n.t('common.actions.close')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
