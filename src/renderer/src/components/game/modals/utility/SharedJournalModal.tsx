import { useCallback, useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'
import { useNetworkStore } from '../../../../stores/use-network-store'
import type { SharedJournalEntry } from '../../../../types/game-state'
import ModalFormFooter from '../shared/ModalFormFooter'

interface SharedJournalModalProps {
  isDM: boolean
  playerName: string
  localPeerId: string
  onClose: () => void
}

export default function SharedJournalModal({
  isDM,
  playerName,
  localPeerId,
  onClose
}: SharedJournalModalProps): JSX.Element {
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const journal = useGameStore((s) => s.sharedJournal)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [editingId, setEditingId] = useState<string | null>(null)

  // Filter entries: players see own + public; DM sees all
  const visibleEntries = isDM
    ? journal
    : journal.filter((e) => e.authorPeerId === localPeerId || e.visibility === 'public')

  const resetForm = useCallback(() => {
    setTitle('')
    setContent('')
    setVisibility('public')
    setEditingId(null)
  }, [])

  const handleSave = useCallback(() => {
    if (!title.trim() || !content.trim()) return

    if (editingId) {
      const now = Date.now()
      sendMessage('player:journal-update', {
        entryId: editingId,
        title: title.trim(),
        content: content.trim(),
        visibility,
        updatedAt: now
      })
      useGameStore
        .getState()
        .updateJournalEntry(editingId, { title: title.trim(), content: content.trim(), visibility })
    } else {
      const entry: SharedJournalEntry = {
        id: crypto.randomUUID(),
        title: title.trim(),
        content: content.trim(),
        authorPeerId: localPeerId,
        authorName: playerName,
        visibility,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      sendMessage('player:journal-add', { entry })
      useGameStore.getState().addJournalEntry(entry)
    }
    resetForm()
  }, [title, content, visibility, editingId, sendMessage, localPeerId, playerName, resetForm])

  const handleEdit = useCallback((entry: SharedJournalEntry) => {
    setEditingId(entry.id)
    setTitle(entry.title)
    setContent(entry.content)
    setVisibility(entry.visibility)
  }, [])

  const handleDelete = useCallback(
    (entryId: string) => {
      sendMessage('player:journal-delete', { entryId })
      useGameStore.getState().deleteJournalEntry(entryId)
    },
    [sendMessage]
  )

  const handleToggleVisibility = useCallback(
    (entry: SharedJournalEntry) => {
      const newVis = entry.visibility === 'public' ? 'private' : 'public'
      sendMessage('player:journal-update', {
        entryId: entry.id,
        visibility: newVis,
        updatedAt: Date.now()
      })
      useGameStore.getState().updateJournalEntry(entry.id, { visibility: newVis })
    },
    [sendMessage]
  )

  const canEdit = (entry: SharedJournalEntry): boolean => isDM || entry.authorPeerId === localPeerId
  const canDelete = (entry: SharedJournalEntry): boolean => isDM || entry.authorPeerId === localPeerId

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-200">Shared Journal</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Create / Edit form */}
        <div className="border border-gray-700/50 rounded-lg p-3 mb-3 space-y-2 shrink-0">
          <input
            type="text"
            placeholder="Entry title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50"
          />
          <textarea
            placeholder="Write your journal entry..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50 resize-y"
          />
          <ModalFormFooter
            isEditing={!!editingId}
            isSaveDisabled={!title.trim() || !content.trim()}
            saveLabel="Add Entry"
            editingLabel="Update"
            onCancel={resetForm}
            onSave={handleSave}
            leftSlot={
              <>
                <span className="text-[10px] text-gray-500">Visibility:</span>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 outline-none cursor-pointer"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </>
            }
          />
        </div>

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {visibleEntries.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No journal entries yet.</p>
          ) : (
            visibleEntries.map((entry) => (
              <div key={entry.id} className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-gray-200 truncate">{entry.title}</h4>
                    <p className="text-[10px] text-gray-500">
                      by {entry.authorName} &middot; {entry.visibility === 'public' ? 'Public' : 'Private'} &middot;{' '}
                      {new Date(entry.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {isDM && (
                      <button
                        onClick={() => handleToggleVisibility(entry)}
                        title={entry.visibility === 'public' ? 'Make private' : 'Make public'}
                        className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                      >
                        {entry.visibility === 'public' ? 'Hide' : 'Show'}
                      </button>
                    )}
                    {canEdit(entry) && (
                      <button
                        onClick={() => handleEdit(entry)}
                        className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete(entry) && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="px-2 py-0.5 text-[10px] bg-red-900/40 hover:bg-red-800/40 text-red-300 border border-red-700/30 rounded cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed mt-1">{entry.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
