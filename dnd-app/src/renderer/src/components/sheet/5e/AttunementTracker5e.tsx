import { useState } from 'react'
import type { Character5e } from '../../../types/character-5e'

interface AttunementTracker5eProps {
  character: Character5e
  readonly?: boolean
  getLatest: () => Character5e | undefined
  saveAndBroadcast: (updated: Character5e) => void
}

export default function AttunementTracker5e({
  character,
  readonly,
  getLatest,
  saveAndBroadcast
}: AttunementTracker5eProps): JSX.Element {
  const [showAttuneForm, setShowAttuneForm] = useState(false)
  const [attuneForm, setAttuneForm] = useState({ name: '', description: '' })

  const handleAttune = (): void => {
    if (!attuneForm.name.trim()) return
    const latest = getLatest()
    if (!latest) return
    const updated = {
      ...latest,
      attunement: [
        ...(latest.attunement ?? []),
        { name: attuneForm.name.trim(), description: attuneForm.description.trim() }
      ],
      updatedAt: new Date().toISOString()
    } as Character5e
    saveAndBroadcast(updated)
    setAttuneForm({ name: '', description: '' })
    setShowAttuneForm(false)
  }

  return (
    <div className="mb-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        Attunement ({(character.attunement ?? []).length}/3)
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map((slotIdx) => {
          const item = (character.attunement ?? [])[slotIdx]
          return (
            <div
              key={slotIdx}
              className={`flex-1 rounded-lg border p-2 text-center text-xs ${
                item
                  ? 'border-purple-700/50 bg-purple-900/20 text-purple-300'
                  : 'border-gray-700 bg-gray-900/30 text-gray-600'
              }`}
            >
              {item ? (
                <div>
                  <div className="font-medium truncate" title={item.description}>
                    {item.name}
                  </div>
                  {!readonly && (
                    <button
                      onClick={() => {
                        const latest = getLatest()
                        if (!latest) return
                        const updated = {
                          ...latest,
                          attunement: (latest.attunement ?? []).filter((_, i) => i !== slotIdx),
                          updatedAt: new Date().toISOString()
                        } as Character5e
                        saveAndBroadcast(updated)
                      }}
                      className="text-purple-400 hover:text-red-400 cursor-pointer mt-0.5"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ) : !readonly && (character.attunement ?? []).length <= slotIdx ? (
                showAttuneForm && (character.attunement ?? []).length === slotIdx ? (
                  <div className="space-y-1 w-full">
                    <input
                      type="text"
                      placeholder="Item name"
                      value={attuneForm.name}
                      onChange={(e) => setAttuneForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500"
                    />
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={attuneForm.description}
                      onChange={(e) => setAttuneForm((f) => ({ ...f, description: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && attuneForm.name.trim()) {
                          handleAttune()
                        }
                      }}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500"
                    />
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={handleAttune}
                        disabled={!attuneForm.name.trim()}
                        className="px-1.5 py-0.5 text-[10px] bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded text-white cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setShowAttuneForm(false)
                          setAttuneForm({ name: '', description: '' })
                        }}
                        className="px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAttuneForm(true)}
                    className="text-purple-400 hover:text-purple-300 cursor-pointer"
                  >
                    + Attune
                  </button>
                )
              ) : (
                <span>Empty</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
