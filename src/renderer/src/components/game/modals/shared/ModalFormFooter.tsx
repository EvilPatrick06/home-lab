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
  saveLabel = 'Save',
  editingLabel = 'Update',
  onCancel,
  onSave,
  leftSlot
}: ModalFormFooterProps): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">{leftSlot}</div>
      <div className="flex gap-1.5">
        {isEditing && (
          <button
            onClick={onCancel}
            className="px-3 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          onClick={onSave}
          disabled={isSaveDisabled}
          className="px-3 py-1 text-[10px] bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded cursor-pointer"
        >
          {isEditing ? editingLabel : saveLabel}
        </button>
      </div>
    </div>
  )
}
