import { useT } from '../../../../i18n'

interface ModalFormFooterProps {
  isEditing: boolean
  isSaveDisabled: boolean
  saveLabel?: string
  editingLabel?: string
  onCancel: () => void
  onSave: () => void
  /** Slot for the left side (e.g. a visibility selector). */
  leftSlot?: React.ReactNode
}

/**
 * Shared form footer row used by editor-style modals (HandoutModal,
 * SharedJournalModal). Renders a left slot alongside Cancel / Save
 * (or Update) buttons.
 */
export default function ModalFormFooter({
  isEditing,
  isSaveDisabled,
  saveLabel,
  editingLabel,
  onCancel,
  onSave,
  leftSlot
}: ModalFormFooterProps): JSX.Element {
  const { t } = useT()
  const resolvedSaveLabel = saveLabel ?? t('common.actions.save')
  const resolvedEditingLabel = editingLabel ?? t('game.modalFormFooter.update')
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">{leftSlot}</div>
      <div className="flex gap-1.5">
        {isEditing && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
          >
            {t('common.actions.cancel')}
          </button>
        )}
        <button
          onClick={onSave}
          disabled={isSaveDisabled}
          className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded cursor-pointer"
        >
          {isEditing ? resolvedEditingLabel : resolvedSaveLabel}
        </button>
      </div>
    </div>
  )
}
