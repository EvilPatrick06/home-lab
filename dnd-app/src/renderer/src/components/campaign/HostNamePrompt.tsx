import { useEffect, useState } from 'react'
import { MAX_DISPLAY_NAME_LENGTH } from '../../constants'
import { Input, Modal } from '../ui'

interface HostNamePromptProps {
  open: boolean
  defaultName: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

export default function HostNamePrompt({
  open,
  defaultName,
  onSubmit,
  onCancel
}: HostNamePromptProps): JSX.Element | null {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  const trimmed = name.trim()
  const isValid = trimmed.length > 0

  const handleConfirm = (): void => {
    if (!isValid) return
    onSubmit(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && isValid) handleConfirm()
  }

  return (
    <Modal open={open} onClose={onCancel} title="Choose Host Name" className="max-w-sm">
      <p className="text-gray-400 text-sm mb-4">
        This name appears next to the &ldquo;DM&rdquo; badge in the lobby and chat.
      </p>

      <Input
        label="Host Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Dungeon Master"
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        autoFocus
      />

      <div className="flex gap-3 justify-end mt-5">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800
            transition-colors cursor-pointer text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isValid}
          className="px-4 py-2 rounded-lg transition-colors cursor-pointer text-sm
            font-semibold text-white bg-amber-600 hover:bg-amber-500
            disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          Start Hosting
        </button>
      </div>
    </Modal>
  )
}
