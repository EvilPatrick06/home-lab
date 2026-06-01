import { useT } from '../../i18n'
import Modal from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
  onCancel: () => void
}

const variantStyles = {
  danger: 'bg-red-700 hover:bg-red-600',
  warning: 'bg-amber-600 hover:bg-accent-strong'
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element | null {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onCancel} title={title} className="max-w-sm">
      <p className="text-muted text-sm mb-4">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-surface-2
            transition-colors cursor-pointer text-sm"
        >
          {cancelLabel ?? t('common.actions.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-4 py-2 rounded-lg transition-colors cursor-pointer text-sm
            font-semibold text-white ${variantStyles[variant]}`}
        >
          {confirmLabel ?? t('common.actions.confirm')}
        </button>
      </div>
    </Modal>
  )
}
