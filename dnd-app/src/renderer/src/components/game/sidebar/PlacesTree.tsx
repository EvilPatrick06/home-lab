import { useEffect, useRef, useState } from 'react'
import type { PlaceType, SidebarEntry } from '../../../types/game-state'

const PLACE_TYPE_COLORS: Record<PlaceType, string> = {
  world: 'bg-purple-900/60 text-purple-300',
  continent: 'bg-blue-900/60 text-blue-300',
  kingdom: 'bg-amber-900/60 text-amber-300',
  province: 'bg-green-900/60 text-green-300',
  city: 'bg-orange-900/60 text-orange-300',
  district: 'bg-teal-900/60 text-teal-300',
  building: 'bg-stone-700/60 text-stone-300',
  room: 'bg-gray-700/60 text-gray-300',
  dungeon: 'bg-red-900/60 text-red-300',
  landmark: 'bg-cyan-900/60 text-cyan-300'
}

const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  world: 'World',
  continent: 'Continent',
  kingdom: 'Kingdom',
  province: 'Province',
  city: 'City',
  district: 'District',
  building: 'Building',
  room: 'Room',
  dungeon: 'Dungeon',
  landmark: 'Landmark'
}

interface TreeNode {
  entry: SidebarEntry
  children: TreeNode[]
}

interface PlacesTreeProps {
  entries: SidebarEntry[]
  isDM: boolean
  onEdit: (entry: SidebarEntry) => void
  onToggleVisibility: (id: string) => void
  onRemove: (id: string) => void
  onReparent: (entryId: string, newParentId: string | null) => void
  onGoToMap?: (mapId: string) => void
  onReadAloud?: (text: string, style: 'chat' | 'dramatic') => void
}

function buildTree(entries: SidebarEntry[]): TreeNode[] {
  const entryMap = new Map<string, SidebarEntry>()
  for (const entry of entries) {
    entryMap.set(entry.id, entry)
  }

  const childrenMap = new Map<string, TreeNode[]>()
  const roots: TreeNode[] = []

  // Sort entries by sortOrder, then name
  const sorted = [...entries].sort((a, b) => {
    const oa = a.sortOrder ?? 0
    const ob = b.sortOrder ?? 0
    if (oa !== ob) return oa - ob
    return a.name.localeCompare(b.name)
  })

  for (const entry of sorted) {
    const node: TreeNode = { entry, children: [] }

    if (entry.parentId && entryMap.has(entry.parentId)) {
      const siblings = childrenMap.get(entry.parentId) ?? []
      siblings.push(node)
      childrenMap.set(entry.parentId, siblings)
    } else {
      roots.push(node)
    }
  }

  // Attach children to their parents
  function attachChildren(nodes: TreeNode[]): void {
    for (const node of nodes) {
      node.children = childrenMap.get(node.entry.id) ?? []
      attachChildren(node.children)
    }
  }

  attachChildren(roots)
  return roots
}

interface TreeNodeRowProps {
  node: TreeNode
  depth: number
  isDM: boolean
  onEdit: (entry: SidebarEntry) => void
  onToggleVisibility: (id: string) => void
  onRemove: (id: string) => void
  onReparent: (entryId: string, newParentId: string | null) => void
  onGoToMap?: (mapId: string) => void
  onReadAloud?: (text: string, style: 'chat' | 'dramatic') => void
  allEntries: SidebarEntry[]
}

function TreeNodeRow({
  node,
  depth,
  isDM,
  onEdit,
  onToggleVisibility,
  onRemove,
  onReparent,
  onGoToMap,
  onReadAloud,
  allEntries
}: TreeNodeRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const [readAloudMenuOpen, setReadAloudMenuOpen] = useState(false)
  const moveMenuRef = useRef<HTMLDivElement>(null)
  const readAloudMenuRef = useRef<HTMLDivElement>(null)

  const { entry } = node
  const hasChildren = node.children.length > 0
  const placeType = entry.placeType
  const indentPx = depth * 16

  // Close move menu on click outside
  useEffect(() => {
    if (!moveMenuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setMoveMenuOpen(false)
      }
    }
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMoveMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [moveMenuOpen])

  // Close read-aloud menu on click outside
  useEffect(() => {
    if (!readAloudMenuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (readAloudMenuRef.current && !readAloudMenuRef.current.contains(e.target as Node)) {
        setReadAloudMenuOpen(false)
      }
    }
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setReadAloudMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [readAloudMenuOpen])

  // Build list of possible parents for "Move to..." menu (exclude self and descendants)
  const getDescendantIds = (nodeToCheck: TreeNode): Set<string> => {
    const ids = new Set<string>()
    const stack = [...nodeToCheck.children]
    while (stack.length > 0) {
      const child = stack.pop()!
      ids.add(child.entry.id)
      stack.push(...child.children)
    }
    return ids
  }

  const descendantIds = getDescendantIds(node)

  const moveTargets = allEntries.filter((e) => e.id !== entry.id && !descendantIds.has(e.id))

  return (
    <>
      <div
        className={`flex items-center gap-1 py-1 px-1.5 rounded hover:bg-gray-800/50 group ${
          !entry.visibleToPlayers && isDM ? 'opacity-60' : ''
        }`}
        style={{ paddingLeft: `${indentPx + 4}px` }}
      >
        {/* Expand/collapse chevron */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-4 h-4 flex items-center justify-center shrink-0 cursor-pointer ${
            hasChildren ? 'text-gray-400 hover:text-gray-200' : 'text-transparent'
          }`}
          disabled={!hasChildren}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Place type badge */}
        {placeType && (
          <span
            className={`text-[8px] px-1 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0 ${PLACE_TYPE_COLORS[placeType]}`}
          >
            {PLACE_TYPE_LABELS[placeType]}
          </span>
        )}

        {/* Name */}
        <span className="text-xs text-gray-200 truncate flex-1 min-w-0">{entry.name}</span>

        {/* Go to map button */}
        {entry.linkedMapId && onGoToMap && (
          <button
            onClick={() => onGoToMap(entry.linkedMapId!)}
            title="Go to linked map"
            className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-blue-400 cursor-pointer text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            &#x1F5FA;
          </button>
        )}

        {/* DM controls */}
        {isDM && (
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Read Aloud */}
            {entry.description && onReadAloud && (
              <div className="relative">
                <button
                  onClick={() => setReadAloudMenuOpen(!readAloudMenuOpen)}
                  title="Read Aloud"
                  className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-amber-400 cursor-pointer text-[10px]"
                >
                  &#x1F4D6;
                </button>
                {readAloudMenuOpen && (
                  <div
                    ref={readAloudMenuRef}
                    className="absolute right-0 top-6 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
                  >
                    <button
                      onClick={() => {
                        onReadAloud(entry.description!, 'chat')
                        setReadAloudMenuOpen(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 cursor-pointer"
                    >
                      Send to Chat
                    </button>
                    <button
                      onClick={() => {
                        onReadAloud(entry.description!, 'dramatic')
                        setReadAloudMenuOpen(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-amber-400 hover:bg-gray-800 hover:text-amber-300 cursor-pointer"
                    >
                      Dramatic Reveal
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Move to... */}
            <div className="relative">
              <button
                onClick={() => setMoveMenuOpen(!moveMenuOpen)}
                title="Move to..."
                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-amber-400 cursor-pointer text-[10px]"
              >
                &#x21C5;
              </button>
              {moveMenuOpen && (
                <div
                  ref={moveMenuRef}
                  className="absolute right-0 top-6 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px] max-h-48 overflow-y-auto"
                >
                  <button
                    onClick={() => {
                      onReparent(entry.id, null)
                      setMoveMenuOpen(false)
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-800 cursor-pointer ${
                      !entry.parentId ? 'text-amber-400 font-semibold' : 'text-gray-300 hover:text-gray-100'
                    }`}
                  >
                    (Root level)
                  </button>
                  {moveTargets.map((target) => (
                    <button
                      key={target.id}
                      onClick={() => {
                        onReparent(entry.id, target.id)
                        setMoveMenuOpen(false)
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-800 cursor-pointer ${
                        entry.parentId === target.id
                          ? 'text-amber-400 font-semibold'
                          : 'text-gray-300 hover:text-gray-100'
                      }`}
                    >
                      {target.placeType && (
                        <span className={`text-[7px] px-0.5 rounded mr-1 ${PLACE_TYPE_COLORS[target.placeType]}`}>
                          {PLACE_TYPE_LABELS[target.placeType]}
                        </span>
                      )}
                      {target.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Visibility toggle */}
            <button
              onClick={() => onToggleVisibility(entry.id)}
              title={entry.visibleToPlayers ? 'Hide from players' : 'Show to players'}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 cursor-pointer text-[10px]"
            >
              {entry.visibleToPlayers ? '\u{1F441}' : '\u{1F441}\u{200D}\u{1F5E8}'}
            </button>

            {/* Edit */}
            <button
              onClick={() => onEdit(entry)}
              title="Edit"
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-amber-400 cursor-pointer text-[10px]"
            >
              &#9998;
            </button>

            {/* Remove (non-auto-populated only) */}
            {!entry.isAutoPopulated && (
              <button
                onClick={() => onRemove(entry.id)}
                title="Delete"
                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-400 cursor-pointer text-[10px]"
              >
                &#10005;
              </button>
            )}
          </div>
        )}
      </div>

      {/* Description (collapsed inline) */}
      {entry.description && (
        <div className="text-[10px] text-gray-500 truncate" style={{ paddingLeft: `${indentPx + 24}px` }}>
          {entry.description}
        </div>
      )}

      {/* DM notes */}
      {isDM && entry.notes && (
        <div className="text-[9px] text-amber-400/60 italic truncate" style={{ paddingLeft: `${indentPx + 24}px` }}>
          {entry.notes}
        </div>
      )}

      {/* Children */}
      {expanded &&
        node.children.map((child) => (
          <TreeNodeRow
            key={child.entry.id}
            node={child}
            depth={depth + 1}
            isDM={isDM}
            onEdit={onEdit}
            onToggleVisibility={onToggleVisibility}
            onRemove={onRemove}
            onReparent={onReparent}
            onGoToMap={onGoToMap}
            onReadAloud={onReadAloud}
            allEntries={allEntries}
          />
        ))}
    </>
  )
}

export default function PlacesTree({
  entries,
  isDM,
  onEdit,
  onToggleVisibility,
  onRemove,
  onReparent,
  onGoToMap,
  onReadAloud
}: PlacesTreeProps): JSX.Element {
  const visibleEntries = isDM ? entries : entries.filter((e) => e.visibleToPlayers)
  const tree = buildTree(visibleEntries)

  if (tree.length === 0) {
    return <p className="text-xs text-gray-500 text-center py-4">No places</p>
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <TreeNodeRow
          key={node.entry.id}
          node={node}
          depth={0}
          isDM={isDM}
          onEdit={onEdit}
          onToggleVisibility={onToggleVisibility}
          onRemove={onRemove}
          onReparent={onReparent}
          onGoToMap={onGoToMap}
          onReadAloud={onReadAloud}
          allEntries={visibleEntries}
        />
      ))}
    </div>
  )
}
