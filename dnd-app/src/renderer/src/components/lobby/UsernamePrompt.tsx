import { useState } from 'react'
import { useT } from '../../i18n'
import { Button, Input } from '../ui'

export interface UsernamePromptProps {
  onSubmit: (displayName: string) => void
  onCancel: () => void
}

export default function UsernamePrompt({ onSubmit, onCancel }: UsernamePromptProps): JSX.Element {
  const { t } = useT()
  const [name, setName] = useState('')
  const valid = name.trim().length >= 1 && name.trim().length <= 30

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface border border-border rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-lg font-semibold text-fg mb-1">{t('lobby.usernamePrompt.title')}</h2>
        <p className="text-sm text-muted mb-4">{t('lobby.usernamePrompt.desc')}</p>
        <Input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onSubmit(name.trim())
            if (e.key === 'Escape') onCancel()
          }}
          placeholder={t('lobby.usernamePrompt.placeholder')}
          maxLength={30}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onCancel} className="text-sm">
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={() => onSubmit(name.trim())} disabled={!valid} className="text-sm">
            {t('lobby.usernamePrompt.continue')}
          </Button>
        </div>
      </div>
    </div>
  )
}
