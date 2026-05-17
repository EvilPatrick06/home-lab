import { useState } from 'react'
import { INVITE_CODE_LENGTH } from '../../constants'
import { Button } from '../ui'

export interface PasswordPromptProps {
  gameName: string
  onSubmit: (code: string) => void
  onCancel: () => void
}

export default function PasswordPrompt({ gameName, onSubmit, onCancel }: PasswordPromptProps): JSX.Element {
  const [code, setCode] = useState('')
  const valid = code.trim().length === INVITE_CODE_LENGTH && /^[A-Z0-9]+$/.test(code.trim().toUpperCase())

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-lg font-semibold text-gray-100 mb-1">Private Game</h2>
        <p className="text-sm text-gray-400 mb-4">
          Enter the invite code shared by the host of <span className="text-amber-300">{gameName}</span>.
        </p>
        <input
          type="text"
          value={code}
          autoFocus
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onSubmit(code.trim().toUpperCase())
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="e.g. ABC123"
          maxLength={INVITE_CODE_LENGTH + 2}
          className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-center text-xl font-mono tracking-[0.3em] uppercase focus:outline-none focus:border-amber-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onCancel} className="text-sm">
            Cancel
          </Button>
          <Button onClick={() => onSubmit(code.trim().toUpperCase())} disabled={!valid} className="text-sm">
            Join
          </Button>
        </div>
      </div>
    </div>
  )
}
