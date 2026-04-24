import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../../stores/use-game-store'
import type { PlaceType, SidebarCategory, SidebarEntry, SidebarEntryStatBlock } from '../../../types/game-state'
import type { MonsterStatBlock } from '../../../types/monster'
import { monsterToSidebar } from '../../../utils/stat-block-converter'
import AddEntryForm from './AddEntryForm'
import CreatureSearchModal from './CreatureSearchModal'
import EntryCard from './EntryCard'
import PlacesTree from './PlacesTree'

const PLACE_TYPES: PlaceType[] = [
  'world',
  'continent',
  'kingdom',
  'province',
  'city',
  'district',
  'building',
  'room',
  'dungeon',
  'landmark'
]

const CATEGORY_LABELS: Record<SidebarCategory, string> = {
  allies: 'Allies',
  enemies: 'Enemies',
  places: 'Places'
}

interface SidebarEntryListProps {
  category: SidebarCategory
  entries: SidebarEntry[]
  isDM: boolean
  onAddToInitiative?: (entry: SidebarEntry) => void
  onReadAloud?: (text: string, style: 'chat' | 'dramatic') => void
}

export default function SidebarEntryList({
  category,
  entries,
  isDM,
  onAddToInitiative,
  onReadAloud
}: SidebarEntryListProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editStatBlock, setEditStatBlock] = useState<SidebarEntryStatBlock | undefined>(undefined)
  const [showStatBlock, setShowStatBlock] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entryId: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Creature DB search modal for linking to existing entries
  const [creatureSearchOpen, setCreatureSearchOpen] = useState(false)
  const [creatureSearchTarget, setCreatureSearchTarget] = useState<string | null>(null)

  // Places-specific state for edit form
  const [editPlaceType, setEditPlaceType] = useState<PlaceType | ''>('')
  const [editParentId, setEditParentId] = useState<string>('')
  const [editLinkedMapId, setEditLinkedMapId] = useState<string>('')

  const isPlaces = category === 'places'

  const addSidebarEntry = useGameStore((s) => s.addSidebarEntry)
  const updateSidebarEntry = useGameStore((s) => s.updateSidebarEntry)
  const removeSidebarEntry = useGameStore((s) => s.removeSidebarEntry)
  const moveSidebarEntry = useGameStore((s) => s.moveSidebarEntry)
  const toggleEntryVisibility = useGameStore((s) => s.toggleEntryVisibility)
  const reparentPlace = useGameStore((s) => s.reparentPlace)
  const setActiveMap = useGameStore((s) => s.setActiveMap)
  const activeMapId = useGameStore((s) => s.activeMapId)
  const maps = useGameStore((s) => s.maps)

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent): void => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [contextMenu])

  const openCreatureSearch = (entryId: string): void => {
    setCreatureSearchTarget(entryId)
    setCreatureSearchOpen(true)
  }

  const linkCreatureToEntry = (monster: MonsterStatBlock): void => {
    if (!creatureSearchTarget) return
    const sidebarSB = monsterToSidebar(monster)
    updateSidebarEntry(category, creatureSearchTarget, {
      statBlock: sidebarSB,
      monsterStatBlockId: monster.id
    })
    setCreatureSearchOpen(false)
    setCreatureSearchTarget(null)
  }

  const handleContextMenu = (e: React.MouseEvent, entryId: string): void => {
    if (!isDM) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, entryId })
  }

  const moveTargets = (['allies', 'enemies', 'places'] as SidebarCategory[]).filter((c) => c !== category)

  const visibleEntries = isDM ? entries : entries.filter((e) => e.visibleToPlayers)

  const startEdit = (entry: SidebarEntry): void => {
    setEditingId(entry.id)
    setEditName(entry.name)
    setEditDesc(entry.description || '')
    setEditNotes(entry.notes || '')
    setEditStatBlock(entry.statBlock)
    setShowStatBlock(!!entry.statBlock)
    if (isPlaces) {
      setEditPlaceType(entry.placeType || '')
      setEditParentId(entry.parentId || '')
      setEditLinkedMapId(entry.linkedMapId || '')
    }
  }

  const saveEdit = (): void => {
    if (!editingId || !editName.trim()) return
    const updates: Partial<SidebarEntry> = {
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      notes: editNotes.trim() || undefined,
      statBlock: showStatBlock ? editStatBlock : undefined
    }
    if (isPlaces) {
      updates.placeType = editPlaceType || undefined
      updates.parentId = editParentId || undefined
      updates.linkedMapId = editLinkedMapId || undefined
    }
    updateSidebarEntry(category, editingId, updates)
    setEditingId(null)
    setShowStatBlock(false)
    setEditStatBlock(undefined)
  }

  const handleAdd = (newEntry: SidebarEntry): void => {
    addSidebarEntry(category, newEntry)
    setShowAdd(false)
  }

  // Get tokens from active map for Quick Add
  const activeMap = activeMapId ? maps.find((m) => m.id === activeMapId) : null
  const boardTokens = activeMap?.tokens ?? []

  // Places-specific: edit form rendered inline (outside tree)
  const placesEditForm =
    isPlaces && editingId ? (
      <div className="bg-gray-800/50 border border-gray-700/30 rounded-lg p-2.5 space-y-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Editing Place</span>
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
          placeholder="Name"
        />
        <select
          value={editPlaceType}
          onChange={(e) => setEditPlaceType(e.target.value as PlaceType | '')}
          className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
        >
          <option value="">No type</option>
          {PLACE_TYPES.map((pt) => (
            <option key={pt} value={pt}>
              {pt.charAt(0).toUpperCase() + pt.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={editParentId}
          onChange={(e) => setEditParentId(e.target.value)}
          className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
        >
          <option value="">(Root level)</option>
          {entries
            .filter((e) => e.id !== editingId)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <select
          value={editLinkedMapId}
          onChange={(e) => setEditLinkedMapId(e.target.value)}
          className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
        >
          <option value="">No linked map</option>
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500 resize-none"
          rows={2}
          placeholder="Description"
        />
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500 resize-none"
          rows={2}
          placeholder="DM Notes (hidden from players)"
        />
        <div className="flex gap-1">
          <button
            onClick={saveEdit}
            className="px-2 py-0.5 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer"
          >
            Save
          </button>
          <button
            onClick={() => setEditingId(null)}
            className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    ) : null

  return (
    <div className="space-y-2">
      {/* Places tree view */}
      {isPlaces ? (
        <>
          <PlacesTree
            entries={entries}
            isDM={isDM}
            onEdit={startEdit}
            onToggleVisibility={(id) => toggleEntryVisibility('places', id)}
            onRemove={(id) => removeSidebarEntry('places', id)}
            onReparent={reparentPlace}
            onGoToMap={setActiveMap}
            onReadAloud={onReadAloud}
          />
          {placesEditForm}
        </>
      ) : (
        <>
          {visibleEntries.length === 0 && <p className="text-xs text-gray-500 text-center py-4">No entries</p>}

          {visibleEntries.map((entry) => (
            <div key={entry.id} onContextMenu={(e) => handleContextMenu(e, entry.id)}>
              <EntryCard
                entry={entry}
                category={category}
                isDM={isDM}
                isEditing={editingId === entry.id}
                editName={editName}
                editDesc={editDesc}
                editNotes={editNotes}
                editStatBlock={editStatBlock}
                showStatBlock={showStatBlock}
                onEditNameChange={setEditName}
                onEditDescChange={setEditDesc}
                onEditNotesChange={setEditNotes}
                onEditStatBlockChange={setEditStatBlock}
                onToggleStatBlock={() => setShowStatBlock(!showStatBlock)}
                onStartEdit={() => startEdit(entry)}
                onSaveEdit={saveEdit}
                onCancelEdit={() => {
                  setEditingId(null)
                  setShowStatBlock(false)
                  setEditStatBlock(undefined)
                }}
                onRemove={() => removeSidebarEntry(category, entry.id)}
                onToggleVisibility={() => toggleEntryVisibility(category, entry.id)}
                onMoveTo={(target) => moveSidebarEntry(category, target, entry.id)}
                onAddToInitiative={onAddToInitiative ? () => onAddToInitiative(entry) : undefined}
                onReadAloud={onReadAloud}
                onOpenCreatureSearch={() => openCreatureSearch(entry.id)}
              />
            </div>
          ))}

          {/* Right-click context menu */}
          {contextMenu && (
            <div
              ref={contextMenuRef}
              className="fixed bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {moveTargets.map((target) => (
                <button
                  key={target}
                  onClick={() => {
                    moveSidebarEntry(category, target, contextMenu.entryId)
                    setContextMenu(null)
                  }}
                  className="w-full px-4 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 cursor-pointer"
                >
                  Move to {CATEGORY_LABELS[target]}
                </button>
              ))}
              <div className="border-t border-gray-700/50 my-0.5" />
              <button
                onClick={() => {
                  toggleEntryVisibility(category, contextMenu.entryId)
                  setContextMenu(null)
                }}
                className="w-full px-4 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 cursor-pointer"
              >
                Toggle Visibility
              </button>
              <button
                onClick={() => {
                  removeSidebarEntry(category, contextMenu.entryId)
                  setContextMenu(null)
                }}
                className="w-full px-4 py-1.5 text-left text-xs text-red-400 hover:bg-gray-800 hover:text-red-300 cursor-pointer"
              >
                Delete
              </button>
            </div>
          )}
        </>
      )}

      {/* Add new entry (DM only) */}
      {isDM &&
        (showAdd ? (
          <AddEntryForm
            category={category}
            entries={entries}
            maps={maps}
            boardTokens={boardTokens}
            onAdd={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full py-2 text-xs text-gray-500 hover:text-amber-400 border border-dashed border-gray-700 hover:border-amber-600/50 rounded-lg transition-colors cursor-pointer"
          >
            + Add {isPlaces ? 'Place' : 'Entry'}
          </button>
        ))}

      {/* Creature DB Search Modal for linking to existing entries */}
      <CreatureSearchModal
        open={creatureSearchOpen && !!creatureSearchTarget}
        onClose={() => {
          setCreatureSearchOpen(false)
          setCreatureSearchTarget(null)
        }}
        title="Link from Creature DB"
        onSelect={linkCreatureToEntry}
      />
    </div>
  )
}
