import { useState } from 'react'
import Modal from '../../components/ui/Modal'
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
    <Modal open={open} onClose={onClose} title="Create Bastion">
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Bastion Name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Thornwall Keep"
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Owner (Character)</label>
          <select
            value={newOwnerId}
            onChange={(e) => setNewOwnerId(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          >
            <option value="">Select a character...</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (Lv {c.level})
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500">
          Starts with 2 basic facilities (Bedroom + Storage). Add special facilities after creation.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || !newOwnerId}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  )
}
