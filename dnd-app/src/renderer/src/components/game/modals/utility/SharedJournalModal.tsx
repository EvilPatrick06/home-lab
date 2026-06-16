import { useCallback, useEffect, useRef, useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { addToast } from '../../../../hooks/use-toast'
import { useT } from '../../../../i18n'
import { useNetworkStore } from '../../../../stores/network-store'
import { useCampaignStore } from '../../../../stores/use-campaign-store'
import { useGameStore } from '../../../../stores/use-game-store'
import type { SharedJournalEntry } from '../../../../types/game-state'
import ModalFormFooter from '../shared/ModalFormFooter'

interface SharedJournalModalProps {
  isDM: boolean
  playerName: string
  localPeerId: string
  onClose: () => void
  // PHASE-13 13H — when a journal-linked map pin is clicked, open scrolled to + highlighting
  // this entry.
  initialEntryId?: string
}

export default function SharedJournalModal({
  isDM,
  playerName,
  localPeerId,
  onClose,
  initialEntryId
}: SharedJournalModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
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

  // PHASE-13 13H — scroll the deep-linked entry into view + flash a highlight ring once.
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const didFocusRef = useRef(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  useEffect(() => {
    if (!initialEntryId || didFocusRef.current) return
    if (!visibleEntries.some((e) => e.id === initialEntryId)) return
    const node = entryRefs.current[initialEntryId]
    if (!node) return
    didFocusRef.current = true
    node.scrollIntoView({ block: 'center' })
    setHighlightId(initialEntryId)
    const tmo = setTimeout(() => setHighlightId(null), 2000)
    return () => clearTimeout(tmo)
  }, [initialEntryId, visibleEntries])

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

  const handleArchiveToCampaign = async () => {
    const campaign = useCampaignStore.getState().getActiveCampaign()
    if (!campaign) return

    try {
      const maxSession = campaign.journal.entries.reduce((max, e) => Math.max(max, e.sessionNumber), 0)
      const content = visibleEntries.map((e) => `[${e.authorName}] ${e.title}\n${e.content}`).join('\n\n---\n\n')

      const newEntry = {
        id: crypto.randomUUID(),
        sessionNumber: maxSession + 1,
        date: new Date().toISOString(),
        title: t('game.sharedJournalModal.archiveEntryTitle'),
        content,
        isPrivate: false,
        authorId: localPeerId,
        createdAt: new Date().toISOString()
      }

      const updatedCampaign = {
        ...campaign,
        journal: {
          ...campaign.journal,
          entries: [...campaign.journal.entries, newEntry]
        },
        updatedAt: new Date().toISOString()
      }

      await useCampaignStore.getState().saveCampaign(updatedCampaign)
      addToast(t('game.sharedJournalModal.archivedToast'), 'success')
      onClose()
    } catch {
      addToast(t('game.sharedJournalModal.archiveFailedToast'), 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} role="presentation" />
      <div className="relative bg-surface/95 backdrop-blur-sm border border-border/50 rounded-xl p-4 max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-200">{t('game.sharedJournalModal.title')}</h3>
            {isDM && visibleEntries.length > 0 && (
              <button
                onClick={handleArchiveToCampaign}
                className="px-2 py-0.5 text-xs bg-amber-600/30 text-amber-300 rounded hover:bg-amber-600/50 transition-colors"
                title={t('game.sharedJournalModal.archiveTitle')}
              >
                {t('game.sharedJournalModal.archiveToCampaign')}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        {/* Create / Edit form */}
        <div className="border border-border/50 rounded-lg p-3 mb-3 space-y-2 shrink-0">
          <input
            aria-label={t('game.sharedJournalModal.titlePlaceholder')}
            type="text"
            placeholder={t('game.sharedJournalModal.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50"
          />
          <textarea
            aria-label={t('game.sharedJournalModal.contentPlaceholder')}
            placeholder={t('game.sharedJournalModal.contentPlaceholder')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50 resize-y"
          />
          <ModalFormFooter
            isEditing={!!editingId}
            isSaveDisabled={!title.trim() || !content.trim()}
            saveLabel={t('game.sharedJournalModal.addEntry')}
            editingLabel={t('game.modalFormFooter.update')}
            onCancel={resetForm}
            onSave={handleSave}
            leftSlot={
              <>
                <span className="text-xs text-gray-500">{t('game.sharedJournalModal.visibilityLabel')}</span>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                  className="bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-gray-300 outline-none cursor-pointer"
                >
                  <option value="public">{t('game.sharedJournalModal.public')}</option>
                  <option value="private">{t('game.sharedJournalModal.private')}</option>
                </select>
              </>
            }
          />
        </div>

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {visibleEntries.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">{t('game.sharedJournalModal.noEntries')}</p>
          ) : (
            visibleEntries.map((entry) => (
              <div
                key={entry.id}
                ref={(el) => {
                  entryRefs.current[entry.id] = el
                }}
                className={`bg-surface-2/60 border border-border/40 rounded-lg p-3 transition-shadow ${
                  highlightId === entry.id ? 'ring-2 ring-amber-400' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-gray-200 truncate">{entry.title}</h4>
                    <p className="text-xs text-gray-500">
                      {t('game.sharedJournalModal.byline', {
                        author: entry.authorName,
                        visibility:
                          entry.visibility === 'public'
                            ? t('game.sharedJournalModal.public')
                            : t('game.sharedJournalModal.private'),
                        date: new Date(entry.updatedAt).toLocaleDateString()
                      })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {isDM && (
                      <button
                        onClick={() => handleToggleVisibility(entry)}
                        title={
                          entry.visibility === 'public'
                            ? t('game.sharedJournalModal.makePrivate')
                            : t('game.sharedJournalModal.makePublic')
                        }
                        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                      >
                        {entry.visibility === 'public'
                          ? t('game.sharedJournalModal.hide')
                          : t('game.sharedJournalModal.show')}
                      </button>
                    )}
                    {canEdit(entry) && (
                      <button
                        onClick={() => handleEdit(entry)}
                        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                      >
                        {t('game.sharedJournalModal.edit')}
                      </button>
                    )}
                    {canDelete(entry) && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="px-2 py-0.5 text-xs bg-red-900/40 hover:bg-red-800/40 text-red-300 border border-red-700/30 rounded cursor-pointer"
                      >
                        {t('common.actions.delete')}
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
