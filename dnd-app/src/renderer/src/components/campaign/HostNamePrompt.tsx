import { useEffect, useState } from 'react'
import { MAX_DISPLAY_NAME_LENGTH } from '../../constants'
import { useT } from '../../i18n'
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
  const { t } = useT()
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
    <Modal open={open} onClose={onCancel} title={t('campaign.hostNamePrompt.title')} className="max-w-sm">
      <p className="text-gray-400 text-sm mb-4">{t('campaign.hostNamePrompt.description')}</p>

      <Input
        label={t('campaign.hostNamePrompt.hostName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('campaign.hostNamePrompt.hostNamePlaceholder')}
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
          {t('common.actions.cancel')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isValid}
          className="px-4 py-2 rounded-lg transition-colors cursor-pointer text-sm
            font-semibold text-white bg-amber-600 hover:bg-amber-500
            disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          {t('campaign.hostNamePrompt.startHosting')}
        </button>
      </div>
    </Modal>
  )
}
