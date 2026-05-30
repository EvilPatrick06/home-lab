import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { Button, Input, Modal } from '../ui'

interface JournalEntryModalProps {
  open: boolean
  onClose: () => void
  onSave: (entry: { title: string; content: string; isPrivate: boolean }) => void
  initialData?: { title: string; content: string; isPrivate: boolean } | null
}

export default function JournalEntryModal({ open, onClose, onSave, initialData }: JournalEntryModalProps): JSX.Element {
  const { t } = useT()
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [content, setContent] = useState(initialData?.content ?? '')
  const [isPrivate, setIsPrivate] = useState(initialData?.isPrivate ?? false)

  useEffect(() => {
    if (open) {
      setTitle(initialData?.title ?? '')
      setContent(initialData?.content ?? '')
      setIsPrivate(initialData?.isPrivate ?? false)
    }
  }, [open, initialData])

  const handleSave = () => {
    if (!title.trim() || !content.trim()) return
    onSave({ title: title.trim(), content: content.trim(), isPrivate })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialData ? t('campaign.journalEntryModal.editTitle') : t('campaign.journalEntryModal.newTitle')}
    >
      <div className="space-y-4">
        <Input
          label={t('campaign.journalEntryModal.title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('campaign.journalEntryModal.titlePlaceholder')}
        />
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            {t('campaign.journalEntryModal.content')}
          </label>
          <textarea
            className="w-full h-48 bg-gray-900 border border-gray-700 rounded-md p-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors resize-y shadow-inner drop-shadow-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('campaign.journalEntryModal.contentPlaceholder')}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="w-4 h-4 accent-amber-500 rounded border-gray-700 bg-gray-900"
          />
          <span className="text-sm text-gray-300">{t('campaign.journalEntryModal.dmOnly')}</span>
        </label>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || !content.trim()}>
            {t('common.actions.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
