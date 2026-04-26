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
  warning: 'bg-amber-600 hover:bg-amber-500'
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element | null {
  return (
    <Modal open={open} onClose={onCancel} title={title} className="max-w-sm">
      <p className="text-gray-400 text-sm mb-4">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800
            transition-colors cursor-pointer text-sm"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-4 py-2 rounded-lg transition-colors cursor-pointer text-sm
            font-semibold text-white ${variantStyles[variant]}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
