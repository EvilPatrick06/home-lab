import { useCallback, useEffect, useRef, useState } from 'react'
import { saveGameState } from '../../../services/io/game-state-saver'
import { useCampaignStore } from '../../../stores/use-campaign-store'
import { type SessionLogEntry, useGameStore } from '../../../stores/use-game-store'

export default function DMNotepad(): JSX.Element {
  const sessionLog = useGameStore((s) => s.sessionLog)
  const currentSessionLabel = useGameStore((s) => s.currentSessionLabel)
  const addLogEntry = useGameStore((s) => s.addLogEntry)
  const updateLogEntry = useGameStore((s) => s.updateLogEntry)
  const deleteLogEntry = useGameStore((s) => s.deleteLogEntry)
  const startNewSession = useGameStore((s) => s.startNewSession)
  const inGameTime = useGameStore((s) => s.inGameTime)

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [newEntryText, setNewEntryText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save on changes
  const persistNotes = useCallback(async () => {
    const campaign = useCampaignStore.getState().getActiveCampaign()
    if (!campaign) return
    try {
      await saveGameState(campaign)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const scheduleAutoSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => persistNotes(), 500)
  }, [persistNotes])

  const handleAddEntry = useCallback(() => {
    const content = newEntryText.trim()
    if (!content) return
    // Simple in-game time formatting (hours:minutes from seconds)
    let inGameTs: string | undefined
    if (inGameTime && inGameTime.totalSeconds > 0) {
      const totalSec = inGameTime.totalSeconds
      const hours = Math.floor(totalSec / 3600)
      const mins = Math.floor((totalSec % 3600) / 60)
      const days = Math.floor(hours / 24)
      const hh = hours % 24
      inGameTs =
        days > 0
          ? `Day ${days + 1}, ${String(hh).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
          : `${String(hh).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
    }
    addLogEntry(content, inGameTs)
    setNewEntryText('')
    scheduleAutoSave()
  }, [newEntryText, inGameTime, addLogEntry, scheduleAutoSave])

  const handleStartEdit = useCallback((entry: SessionLogEntry) => {
    setEditingId(entry.id)
    setEditText(entry.content)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (editingId && editText.trim()) {
      updateLogEntry(editingId, editText.trim())
      scheduleAutoSave()
    }
    setEditingId(null)
    setEditText('')
  }, [editingId, editText, updateLogEntry, scheduleAutoSave])

  const handleDelete = useCallback(
    (entryId: string) => {
      deleteLogEntry(entryId)
      setConfirmDeleteId(null)
      scheduleAutoSave()
    },
    [deleteLogEntry, scheduleAutoSave]
  )

  const handleNewSession = useCallback(() => {
    startNewSession()
    scheduleAutoSave()
  }, [startNewSession, scheduleAutoSave])

  // Group entries by session (reverse chronological — newest first)
  const filteredEntries = searchQuery
    ? sessionLog.filter((e) => e.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessionLog

  const sessionGroups = new Map<string, { label: string; entries: SessionLogEntry[] }>()
  for (const entry of filteredEntries) {
    if (!sessionGroups.has(entry.sessionId)) {
      sessionGroups.set(entry.sessionId, { label: entry.sessionLabel, entries: [] })
    }
    sessionGroups.get(entry.sessionId)!.entries.push(entry)
  }

  const formatRealTime = (ts: number): string => {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        <span className={`text-xs text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>&#9654;</span>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Session Notes</h3>
        <span className="ml-auto text-[9px] text-gray-600">{sessionLog.length} entries</span>
      </button>

      {!isCollapsed && (
        <div className="space-y-2">
          {/* Action bar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewSession}
              className="px-2 py-1 text-[10px] rounded bg-amber-600/30 text-amber-300 hover:bg-amber-600/50 cursor-pointer"
            >
              New Session
            </button>
            <span className="text-[9px] text-gray-500 truncate flex-1">{currentSessionLabel}</span>
          </div>

          {/* Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500"
          />

          {/* New entry */}
          <div className="flex gap-1.5">
            <textarea
              value={newEntryText}
              onChange={(e) => setNewEntryText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleAddEntry()
                }
              }}
              placeholder="Add a new note... (Ctrl+Enter to save)"
              rows={2}
              className="flex-1 px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-none"
            />
            <button
              onClick={handleAddEntry}
              disabled={!newEntryText.trim()}
              className="px-3 py-1 text-xs rounded bg-green-600/30 text-green-300 hover:bg-green-600/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed self-end"
            >
              Add
            </button>
          </div>

          {/* Session groups (newest first) */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {Array.from(sessionGroups.entries()).map(([sessionId, group]) => (
              <SessionGroup
                key={sessionId}
                label={group.label}
                entries={group.entries}
                editingId={editingId}
                editText={editText}
                confirmDeleteId={confirmDeleteId}
                onStartEdit={handleStartEdit}
                onEditTextChange={setEditText}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => {
                  setEditingId(null)
                  setEditText('')
                }}
                onRequestDelete={setConfirmDeleteId}
                onConfirmDelete={handleDelete}
                onCancelDelete={() => setConfirmDeleteId(null)}
                formatRealTime={formatRealTime}
              />
            ))}

            {filteredEntries.length === 0 && (
              <p className="text-[10px] text-gray-600 text-center py-4">
                {searchQuery ? 'No matching notes found.' : 'No session notes yet. Add your first entry above.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Session group (collapsible) ────────────────────────────

interface SessionGroupProps {
  label: string
  entries: SessionLogEntry[]
  editingId: string | null
  editText: string
  confirmDeleteId: string | null
  onStartEdit: (entry: SessionLogEntry) => void
  onEditTextChange: (text: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onRequestDelete: (id: string) => void
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
  formatRealTime: (ts: number) => string
}

function SessionGroup({
  label,
  entries,
  editingId,
  editText,
  confirmDeleteId,
  onStartEdit,
  onEditTextChange,
  onSaveEdit,
  onCancelEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  formatRealTime
}: SessionGroupProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="border border-gray-700/30 rounded-lg overflow-hidden">
      {/* Session header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-2 py-1.5 bg-gray-800/40 hover:bg-gray-800/60 cursor-pointer text-left"
      >
        <span className={`text-[10px] text-gray-500 transition-transform ${collapsed ? '' : 'rotate-90'}`}>
          &#9654;
        </span>
        <span className="text-[11px] font-medium text-amber-300">{label}</span>
        <span className="text-[9px] text-gray-500 ml-auto">{entries.length} notes</span>
      </button>

      {/* Entries */}
      {!collapsed && (
        <div className="divide-y divide-gray-700/30">
          {entries.map((entry) => (
            <div key={entry.id} className="px-2 py-1.5 hover:bg-gray-800/20 group">
              {/* Timestamps */}
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] text-gray-500">{formatRealTime(entry.realTimestamp)}</span>
                {entry.inGameTimestamp && <span className="text-[9px] text-purple-400">{entry.inGameTimestamp}</span>}
                {entry.editedAt && <span className="text-[8px] text-gray-600">(edited)</span>}
              </div>

              {/* Content */}
              {editingId === entry.id ? (
                <div className="space-y-1">
                  <textarea
                    value={editText}
                    onChange={(e) => onEditTextChange(e.target.value)}
                    rows={3}
                    className="w-full px-2 py-1 rounded bg-gray-800 border border-amber-500 text-xs text-gray-200 focus:outline-none resize-none"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={onSaveEdit}
                      className="text-[9px] px-2 py-0.5 bg-green-600/30 text-green-300 rounded cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      onClick={onCancelEdit}
                      className="text-[9px] px-2 py-0.5 bg-gray-700 text-gray-400 rounded cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-1">
                  <p className="text-xs text-gray-300 flex-1 whitespace-pre-wrap">{entry.content}</p>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => onStartEdit(entry)}
                      className="text-[8px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded cursor-pointer hover:text-gray-200"
                    >
                      Edit
                    </button>
                    {confirmDeleteId === entry.id ? (
                      <>
                        <button
                          onClick={() => onConfirmDelete(entry.id)}
                          className="text-[8px] px-1.5 py-0.5 bg-red-600/40 text-red-300 rounded cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={onCancelDelete}
                          className="text-[8px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded cursor-pointer"
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onRequestDelete(entry.id)}
                        className="text-[8px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded cursor-pointer hover:text-red-400"
                      >
                        Del
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
