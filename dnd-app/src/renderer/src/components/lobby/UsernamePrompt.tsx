import { useState } from 'react'
import { Button, Input } from '../ui'

export interface UsernamePromptProps {
  onSubmit: (displayName: string) => void
  onCancel: () => void
}

export default function UsernamePrompt({ onSubmit, onCancel }: UsernamePromptProps): JSX.Element {
  const [name, setName] = useState('')
  const valid = name.trim().length >= 1 && name.trim().length <= 30

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-lg font-semibold text-gray-100 mb-1">What should we call you?</h2>
        <p className="text-sm text-gray-400 mb-4">
          Pick a display name. Other players will see this in chat, the player list, and the host's lobby.
        </p>
        <Input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onSubmit(name.trim())
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="e.g. Patrick"
          maxLength={30}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onCancel} className="text-sm">
            Cancel
          </Button>
          <Button onClick={() => onSubmit(name.trim())} disabled={!valid} className="text-sm">
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
