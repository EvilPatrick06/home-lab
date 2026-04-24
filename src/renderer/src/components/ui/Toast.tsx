import { dismissToast, type Toast, type ToastVariant, useToast } from '../../hooks/use-toast'

type _Toast = Toast

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-green-500/60 bg-green-950/90 text-green-200',
  error: 'border-red-500/60 bg-red-950/90 text-red-200',
  warning: 'border-amber-500/60 bg-amber-950/90 text-amber-200',
  info: 'border-blue-500/60 bg-blue-950/90 text-blue-200'
}

const iconMap: Record<ToastVariant, string> = {
  success: '\u2714',
  error: '\u2716',
  warning: '\u26A0',
  info: '\u2139'
}

export default function ToastContainer(): JSX.Element | null {
  const { toasts } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          aria-live="assertive"
          onClick={() => dismissToast(toast.id)}
          className={`pointer-events-auto px-4 py-3 rounded-lg border shadow-xl backdrop-blur-sm
            text-sm font-medium flex items-center gap-2.5 cursor-pointer
            animate-[slideIn_0.2s_ease-out] max-w-sm ${variantStyles[toast.variant]}`}
        >
          <span className="text-base flex-shrink-0">{iconMap[toast.variant]}</span>
          <span className="leading-snug">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
