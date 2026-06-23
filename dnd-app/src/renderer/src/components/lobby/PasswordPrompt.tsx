import { useState } from 'react'
import { INVITE_CODE_LENGTH } from '../../constants'
import { useT } from '../../i18n'
import { Button } from '../ui'

export interface PasswordPromptProps {
  gameName: string
  onSubmit: (code: string) => void
  onCancel: () => void
}

export default function PasswordPrompt({ gameName, onSubmit, onCancel }: PasswordPromptProps): JSX.Element {
  const { t } = useT()
  const [code, setCode] = useState('')
  const valid = code.trim().length === INVITE_CODE_LENGTH && /^[A-Z0-9]+$/.test(code.trim().toUpperCase())

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface border border-border rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-lg font-semibold text-fg mb-1">{t('lobby.passwordPrompt.title')}</h2>
        <p className="text-sm text-muted mb-4">
          {t('lobby.passwordPrompt.descPrefix')} <span className="text-amber-300">{gameName}</span>
          {t('lobby.passwordPrompt.descSuffix')}
        </p>
        <input
          type="text"
          name="invite-code"
          value={code}
          autoFocus
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onSubmit(code.trim().toUpperCase())
            if (e.key === 'Escape') onCancel()
          }}
          placeholder={t('lobby.passwordPrompt.placeholder')}
          maxLength={INVITE_CODE_LENGTH + 2}
          className="w-full p-3 rounded-lg bg-surface-2 border border-border text-fg text-center text-xl font-mono tracking-[0.3em] uppercase focus:outline-none focus:border-amber-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onCancel} className="text-sm">
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={() => onSubmit(code.trim().toUpperCase())} disabled={!valid} className="text-sm">
            {t('lobby.passwordPrompt.join')}
          </Button>
        </div>
      </div>
    </div>
  )
}
