import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import { useT } from '../../i18n'
import type { Bastion } from '../../types/bastion'
import { createDefaultBastion } from '../../types/bastion'
import type { Character } from '../../types/character'

export function CreateBastionModal({
  open,
  onClose,
  characters,
  saveBastion,
  setSelectedBastionId
}: {
  open: boolean
  onClose: () => void
  characters: Character[]
  saveBastion: (b: Bastion) => void
  setSelectedBastionId: (id: string | null) => void
}): JSX.Element {
  const { t } = useT()
  const [newName, setNewName] = useState('')
  const [newOwnerId, setNewOwnerId] = useState('')

  const handleCreate = (): void => {
    if (!newName.trim() || !newOwnerId) return
    const bastion = createDefaultBastion(newOwnerId, newName.trim())
    saveBastion(bastion)
    setSelectedBastionId(bastion.id)
    onClose()
    setNewName('')
    setNewOwnerId('')
  }

  return (
    <Modal open={open} onClose={onClose} title={t('pages.createBastionModal.title')}>
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('pages.createBastionModal.bastionName')}</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('pages.createBastionModal.bastionNamePlaceholder')}
            className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('pages.createBastionModal.ownerCharacter')}</label>
          <select
            value={newOwnerId}
            onChange={(e) => setNewOwnerId(e.target.value)}
            className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
          >
            <option value="">{t('pages.createBastionModal.selectCharacter')}</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (Lv {c.level})
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500">{t('pages.createBastionModal.startsWithHint')}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || !newOwnerId}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
          >
            {t('pages.createBastionModal.create')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
