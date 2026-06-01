import { useT } from '../../../i18n'

interface SheetErrorRecovery5eProps {
  onReload: () => void
  onBack: () => void
  error?: Error | null
}

export default function SheetErrorRecovery5e({ onReload, onBack, error }: SheetErrorRecovery5eProps): JSX.Element {
  const { t } = useT()
  const isDev = import.meta.env.DEV
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full bg-surface border border-amber-500/40 rounded-xl p-6 shadow-xl">
        <h2 className="text-base font-semibold text-accent mb-2">{t('sheet.errorRecovery.title')}</h2>
        <p className="text-sm text-muted mb-4">{t('sheet.errorRecovery.description')}</p>
        {isDev && error && (
          <pre className="text-[11px] text-red-300/80 bg-base rounded-lg p-3 mb-4 overflow-auto max-h-32 border border-gray-800 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 text-sm border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-fg rounded cursor-pointer transition-colors"
          >
            {t('sheet.errorRecovery.backToCharacters')}
          </button>
          <button
            type="button"
            onClick={onReload}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded font-semibold cursor-pointer transition-colors"
          >
            {t('sheet.errorRecovery.reloadSheet')}
          </button>
        </div>
      </div>
    </div>
  )
}
