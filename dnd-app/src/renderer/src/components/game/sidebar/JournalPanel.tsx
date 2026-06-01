import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useMemo, useState } from 'react'
import { useT } from '../../../i18n'
import { useNetworkStore } from '../../../stores/network-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { SharedJournalEntry } from '../../../types/game-state'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JournalPanelProps {
  campaignId: string
  isDM: boolean
  playerName: string
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, isActive, title, children }: ToolbarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-colors cursor-pointer ${
        isActive ? 'bg-amber-600 text-white' : 'text-muted hover:text-gray-200 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JournalPanel({ campaignId, isDM, playerName }: JournalPanelProps): JSX.Element {
  const { t } = useT()
  const entries = useGameStore((s) => s.sharedJournal)
  const addJournalEntry = useGameStore((s) => s.addJournalEntry)
  const updateJournalEntry = useGameStore((s) => s.updateJournalEntry)
  const deleteJournalEntry = useGameStore((s) => s.deleteJournalEntry)
  const localPeerId = useNetworkStore((s) => s.localPeerId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')

  // Suppress unused-variable warning for campaignId (would be used for persistence)
  void campaignId

  const authorName = isDM ? 'DM' : playerName

  // The currently selected entry
  const selectedEntry = useMemo(() => entries.find((e) => e.id === selectedId) ?? null, [entries, selectedId])

  // Filtered entries: DM sees all, players see only their own + public entries
  const visibleEntries = useMemo(() => {
    let list = isDM ? entries : entries.filter((e) => e.visibility === 'public' || e.authorName === playerName)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q) ||
          e.authorName.toLowerCase().includes(q)
      )
    }
    // Sort newest first
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [entries, isDM, playerName, searchQuery])

  // -------------------------------------------------------------------------
  // TipTap editor
  // -------------------------------------------------------------------------

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          HTMLAttributes: { class: 'text-accent underline hover:text-amber-300' }
        }
      }),
      Placeholder.configure({
        placeholder: t('game.journalPanel.editorPlaceholder')
      })
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2 text-gray-200'
      }
    },
    editable: isEditing,
    content: selectedEntry?.content ?? ''
  })

  // Sync editor content when selection changes
  const selectEntry = useCallback(
    (id: string) => {
      setSelectedId(id)
      setIsEditing(false)
      const entry = entries.find((e) => e.id === id)
      if (editor && entry) {
        editor.commands.setContent(entry.content)
        editor.setEditable(false)
      }
    },
    [editor, entries]
  )

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  const handleCreate = (): void => {
    const now = Date.now()
    const newEntry: SharedJournalEntry = {
      id: crypto.randomUUID(),
      title: t('game.journalPanel.untitledEntry'),
      content: '',
      authorPeerId: localPeerId || 'local',
      authorName,
      visibility: isDM ? 'public' : 'private',
      createdAt: now,
      updatedAt: now
    }
    const sendMessage = useNetworkStore.getState().sendMessage
    sendMessage('player:journal-add', { entry: newEntry })
    addJournalEntry(newEntry)
    setSelectedId(newEntry.id)
    setEditTitle(newEntry.title)
    setIsEditing(true)
    if (editor) {
      editor.commands.setContent('')
      editor.setEditable(true)
      // Focus editor after a tick so DOM updates
      setTimeout(() => editor.commands.focus(), 50)
    }
  }

  const handleStartEdit = (): void => {
    if (!selectedEntry) return
    setEditTitle(selectedEntry.title)
    setIsEditing(true)
    if (editor) {
      editor.setEditable(true)
      editor.commands.focus()
    }
  }

  const handleSave = (): void => {
    if (!selectedEntry || !editor) return
    const html = editor.getHTML()
    const now = Date.now()

    useNetworkStore.getState().sendMessage('player:journal-update', {
      entryId: selectedEntry.id,
      title: editTitle.trim() || t('game.journalPanel.untitledEntry'),
      content: html,
      updatedAt: now
    })

    updateJournalEntry(selectedEntry.id, {
      title: editTitle.trim() || t('game.journalPanel.untitledEntry'),
      content: html
    } as Parameters<typeof updateJournalEntry>[1])
    setIsEditing(false)
    editor.setEditable(false)
  }

  const handleCancelEdit = (): void => {
    if (!selectedEntry || !editor) return
    editor.commands.setContent(selectedEntry.content)
    editor.setEditable(false)
    setIsEditing(false)
  }

  const handleDelete = (id: string): void => {
    useNetworkStore.getState().sendMessage('player:journal-delete', { entryId: id })
    deleteJournalEntry(id)
    if (selectedId === id) {
      setSelectedId(null)
      setIsEditing(false)
      if (editor) {
        editor.commands.setContent('')
        editor.setEditable(false)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Toolbar helpers
  // -------------------------------------------------------------------------

  const handleAddLink = (): void => {
    if (!editor) return
    const url = window.prompt(t('game.journalPanel.enterUrl'))
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  // -------------------------------------------------------------------------
  // Date formatting
  // -------------------------------------------------------------------------

  const formatDate = (ts: number): string => {
    const d = new Date(ts)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // -------------------------------------------------------------------------
  // Can the current user edit the selected entry?
  // -------------------------------------------------------------------------

  const canEdit = selectedEntry ? isDM || selectedEntry.authorName === playerName : false

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-surface text-fg">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border/50 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
          {t('game.journalPanel.title')}
        </span>
        <button
          onClick={handleCreate}
          title={t('game.journalPanel.newEntry')}
          className="px-2 py-1 text-xs font-semibold bg-amber-600 hover:bg-accent-strong text-white rounded transition-colors cursor-pointer"
        >
          {t('game.journalPanel.newButton')}
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 py-2 border-b border-border/50">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('game.journalPanel.searchPlaceholder')}
          className="w-full px-2 py-1 rounded bg-surface-2 border border-border text-xs text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Main area: list + editor stacked vertically */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Entry list */}
        <div className="shrink-0 max-h-48 overflow-y-auto border-b border-border/50">
          {visibleEntries.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              {searchQuery.trim() ? t('game.journalPanel.noMatching') : t('game.journalPanel.noEntries')}
            </p>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {visibleEntries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => selectEntry(entry.id)}
                  className={`px-3 py-2 cursor-pointer transition-colors ${
                    selectedId === entry.id
                      ? 'bg-amber-900/20 border-l-2 border-l-amber-500'
                      : 'hover:bg-surface-2/50 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium text-gray-200 truncate flex-1">{entry.title}</span>
                    {(isDM || entry.authorName === playerName) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(entry.id)
                        }}
                        title={t('game.journalPanel.deleteEntry')}
                        className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-400 cursor-pointer text-xs shrink-0"
                      >
                        &#10005;
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">{entry.authorName}</span>
                    <span className="text-xs text-gray-600">{formatDate(entry.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Editor area */}
        {selectedEntry ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Title + action buttons */}
            <div className="shrink-0 px-3 py-2 border-b border-border/50 flex items-center gap-2">
              {isEditing ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="flex-1 px-2 py-1 rounded bg-surface-2 border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
                  placeholder={t('game.journalPanel.entryTitlePlaceholder')}
                />
              ) : (
                <span className="flex-1 text-sm font-medium text-gray-200 truncate">{selectedEntry.title}</span>
              )}
              {isEditing ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={handleSave}
                    className="px-2 py-1 text-xs font-semibold bg-amber-600 hover:bg-accent-strong text-white rounded transition-colors cursor-pointer"
                  >
                    {t('common.actions.save')}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-2 py-1 text-xs text-muted hover:text-gray-200 cursor-pointer"
                  >
                    {t('common.actions.cancel')}
                  </button>
                </div>
              ) : canEdit ? (
                <button
                  onClick={handleStartEdit}
                  title={t('game.journalPanel.editEntry')}
                  className="px-2 py-1 text-xs font-semibold text-muted hover:text-accent border border-border hover:border-amber-600/50 rounded transition-colors cursor-pointer"
                >
                  {t('game.journalPanel.edit')}
                </button>
              ) : null}
            </div>

            {/* Formatting toolbar (visible only when editing) */}
            {isEditing && editor && (
              <div className="shrink-0 px-3 py-1.5 border-b border-border/50 flex items-center gap-0.5 flex-wrap">
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  isActive={editor.isActive('bold')}
                  title={t('game.journalPanel.bold')}
                >
                  B
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  isActive={editor.isActive('italic')}
                  title={t('game.journalPanel.italic')}
                >
                  <span className="italic">I</span>
                </ToolbarButton>
                <div className="w-px h-5 bg-gray-700 mx-1" />
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                  isActive={editor.isActive('heading', { level: 1 })}
                  title={t('game.journalPanel.heading1')}
                >
                  H1
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  isActive={editor.isActive('heading', { level: 2 })}
                  title={t('game.journalPanel.heading2')}
                >
                  H2
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                  isActive={editor.isActive('heading', { level: 3 })}
                  title={t('game.journalPanel.heading3')}
                >
                  H3
                </ToolbarButton>
                <div className="w-px h-5 bg-gray-700 mx-1" />
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  isActive={editor.isActive('bulletList')}
                  title={t('game.journalPanel.bulletList')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path
                      fillRule="evenodd"
                      d="M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75ZM6 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 10Zm0 5.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75ZM1.99 4.75a1 1 0 0 1 1-1h.01a1 1 0 0 1 0 2h-.01a1 1 0 0 1-1-1Zm1 5.25a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01Zm0 5.25a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  isActive={editor.isActive('orderedList')}
                  title={t('game.journalPanel.orderedList')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path
                      fillRule="evenodd"
                      d="M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75ZM6 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 10Zm0 5.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75Z"
                      clipRule="evenodd"
                    />
                    <text x="1.5" y="6.5" fontSize="6" fill="currentColor" fontFamily="sans-serif">
                      1
                    </text>
                    <text x="1.5" y="12" fontSize="6" fill="currentColor" fontFamily="sans-serif">
                      2
                    </text>
                    <text x="1.5" y="17.5" fontSize="6" fill="currentColor" fontFamily="sans-serif">
                      3
                    </text>
                  </svg>
                </ToolbarButton>
                <div className="w-px h-5 bg-gray-700 mx-1" />
                <ToolbarButton
                  onClick={handleAddLink}
                  isActive={editor.isActive('link')}
                  title={t('game.journalPanel.addLink')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z" />
                    <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z" />
                  </svg>
                </ToolbarButton>
              </div>
            )}

            {/* Editor content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <EditorContent editor={editor} />
            </div>

            {/* Entry metadata footer */}
            <div className="shrink-0 px-3 py-1 border-t border-border/50 flex items-center justify-between">
              <span className="text-xs text-gray-600">
                {t('game.journalPanel.by', { author: selectedEntry.authorName })}
              </span>
              <span className="text-xs text-gray-600">
                {t('game.journalPanel.updated', { date: formatDate(selectedEntry.updatedAt) })}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-gray-600">{t('game.journalPanel.selectOrCreate')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
