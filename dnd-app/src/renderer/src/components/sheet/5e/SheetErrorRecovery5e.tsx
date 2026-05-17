interface SheetErrorRecovery5eProps {
  onReload: () => void
  onBack: () => void
  error?: Error | null
}

export default function SheetErrorRecovery5e({ onReload, onBack, error }: SheetErrorRecovery5eProps): JSX.Element {
  const isDev = import.meta.env.DEV
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full bg-gray-900 border border-amber-500/40 rounded-xl p-6 shadow-xl">
        <h2 className="text-base font-semibold text-amber-400 mb-2">Character sheet hit a render error</h2>
        <p className="text-sm text-gray-400 mb-4">
          One of the sheet sections crashed while rendering. Your data is safe — you can reload the sheet to try again
          or step back to the character list.
        </p>
        {isDev && error && (
          <pre className="text-[11px] text-red-300/80 bg-gray-950 rounded-lg p-3 mb-4 overflow-auto max-h-32 border border-gray-800 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 text-sm border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-gray-100 rounded cursor-pointer transition-colors"
          >
            Back to characters
          </button>
          <button
            type="button"
            onClick={onReload}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded font-semibold cursor-pointer transition-colors"
          >
            Reload sheet
          </button>
        </div>
      </div>
    </div>
  )
}
