import { useEffect, useMemo, useState } from 'react'

/**
 * Phase 15d — Personal player journal.
 *
 * Per-character notes the player can keep private. Stored exclusively in
 * `localStorage` under `player-notes-{characterId}` — never broadcast on
 * the network, never sent to the DM. If the player switches characters
 * the panel reloads the other character's notes.
 */

interface PlayerNote {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  tags: string[]
}

interface PlayerNotesPanelProps {
  characterId: string | null
  onClose: () => void
}

const STORAGE_PREFIX = 'player-notes-'

function loadNotes(characterId: string): PlayerNote[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${characterId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (n): n is PlayerNote =>
        typeof n === 'object' &&
        n !== null &&
        typeof (n as PlayerNote).id === 'string' &&
        typeof (n as PlayerNote).title === 'string' &&
        typeof (n as PlayerNote).content === 'string'
    )
  } catch {
    return []
  }
}

function saveNotes(characterId: string, notes: PlayerNote[]): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${characterId}`, JSON.stringify(notes))
  } catch {
    /* localStorage may be full — caller is responsible for surfacing failure */
  }
}

function generateId(): string {
  return `note-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

export default function PlayerNotesPanel({ characterId, onClose }: PlayerNotesPanelProps): JSX.Element {
  const [notes, setNotes] = useState<PlayerNote[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!characterId) return
    setNotes(loadNotes(characterId))
  }, [characterId])

  useEffect(() => {
    if (!characterId) return
    saveNotes(characterId, notes)
  }, [characterId, notes])

  const filtered = useMemo(() => {
    if (!search.trim()) return notes
    const needle = search.toLowerCase()
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(needle) ||
        n.content.toLowerCase().includes(needle) ||
        n.tags.some((t) => t.toLowerCase().includes(needle))
    )
  }, [notes, search])

  const active = notes.find((n) => n.id === activeId) ?? null

  const handleCreate = (): void => {
    const now = new Date().toISOString()
    const note: PlayerNote = {
      id: generateId(),
      title: 'Untitled note',
      content: '',
      createdAt: now,
      updatedAt: now,
      tags: []
    }
    setNotes((prev) => [note, ...prev])
    setActiveId(note.id)
  }

  const handleUpdate = (patch: Partial<Pick<PlayerNote, 'title' | 'content' | 'tags'>>): void => {
    if (!active) return
    setNotes((prev) =>
      prev.map((n) =>
        n.id === active.id
          ? {
              ...n,
              ...patch,
              updatedAt: new Date().toISOString()
            }
          : n
      )
    )
  }

  const handleDelete = (id: string): void => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    if (activeId === id) setActiveId(null)
  }

  if (!characterId) {
    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center pb-20">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-md w-full mx-4">
          <p className="text-sm text-gray-300">Select a character first to access your personal notes.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center pb-20">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-3xl w-full mx-4 shadow-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">My Notes</h3>
            <p className="text-[10px] text-gray-500">
              Private — stored locally, never synced to the DM or other players.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close my notes"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[14rem_1fr] gap-3">
          {/* Note list */}
          <div className="flex flex-col gap-2 min-h-0">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="px-2 py-1 text-xs rounded bg-gray-800 border border-gray-700/50 text-gray-200"
            />
            <button
              type="button"
              onClick={handleCreate}
              className="px-2 py-1.5 text-xs rounded bg-amber-700/40 border border-amber-600/40 text-amber-200 hover:bg-amber-700/60 cursor-pointer"
            >
              + New note
            </button>
            <div className="flex-1 overflow-y-auto space-y-1">
              {filtered.length === 0 ? (
                <p className="text-[11px] text-gray-500 py-4 text-center">{search ? 'No matches.' : 'No notes yet.'}</p>
              ) : (
                filtered.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setActiveId(n.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                      activeId === n.id
                        ? 'bg-amber-900/40 border border-amber-600/40 text-amber-100'
                        : 'bg-gray-800/40 hover:bg-gray-800 text-gray-300'
                    }`}
                  >
                    <div className="font-medium truncate">{n.title || 'Untitled'}</div>
                    {n.tags.length > 0 && <div className="text-[9px] text-gray-500 truncate">{n.tags.join(' · ')}</div>}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="flex flex-col gap-2 min-h-0">
            {active ? (
              <>
                <input
                  type="text"
                  value={active.title}
                  onChange={(e) => handleUpdate({ title: e.target.value })}
                  placeholder="Title"
                  className="px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700/50 text-gray-100"
                />
                <input
                  type="text"
                  value={active.tags.join(', ')}
                  onChange={(e) =>
                    handleUpdate({
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                    })
                  }
                  placeholder="Tags (comma-separated)"
                  className="px-2 py-1 text-[11px] rounded bg-gray-800 border border-gray-700/50 text-gray-300"
                />
                <textarea
                  value={active.content}
                  onChange={(e) => handleUpdate({ content: e.target.value })}
                  placeholder="Write your private notes…"
                  className="flex-1 min-h-[8rem] px-2 py-1.5 text-xs rounded bg-gray-800 border border-gray-700/50 text-gray-200 resize-none font-mono"
                />
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <span>Updated {new Date(active.updatedAt).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(active.id)}
                    className="px-2 py-0.5 rounded bg-red-900/40 border border-red-700/40 text-red-300 hover:bg-red-900/60 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500 self-center justify-self-center">Select or create a note.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
