import { lazy, Suspense, useRef, useState } from 'react'
import type { SidebarCategory, SidebarEntry, SidebarEntryStatBlock } from '../../../types/game-state'
import { sidebarToDisplay } from '../../../utils/stat-block-converter'
import StatBlockForm from './StatBlockForm'

const UnifiedStatBlock = lazy(() => import('../UnifiedStatBlock'))

const CATEGORY_LABELS: Record<SidebarCategory, string> = {
  allies: 'Allies',
  enemies: 'Enemies',
  places: 'Places'
}

interface EntryCardProps {
  entry: SidebarEntry
  category: SidebarCategory
  isDM: boolean
  isEditing: boolean
  editName: string
  editDesc: string
  editNotes: string
  editStatBlock: SidebarEntryStatBlock | undefined
  showStatBlock: boolean
  onEditNameChange: (v: string) => void
  onEditDescChange: (v: string) => void
  onEditNotesChange: (v: string) => void
  onEditStatBlockChange: (v: SidebarEntryStatBlock | undefined) => void
  onToggleStatBlock: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onRemove: () => void
  onToggleVisibility: () => void
  onMoveTo: (target: SidebarCategory) => void
  onAddToInitiative?: () => void
  onReadAloud?: (text: string, style: 'chat' | 'dramatic') => void
  onOpenCreatureSearch: () => void
}

export default function EntryCard({
  entry,
  category,
  isDM,
  isEditing,
  editName,
  editDesc,
  editNotes,
  editStatBlock,
  showStatBlock,
  onEditNameChange,
  onEditDescChange,
  onEditNotesChange,
  onEditStatBlockChange,
  onToggleStatBlock,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onToggleVisibility,
  onMoveTo,
  onAddToInitiative,
  onReadAloud,
  onOpenCreatureSearch
}: EntryCardProps): JSX.Element {
  const [viewStatBlockId, setViewStatBlockId] = useState(false)
  const [readAloudMenuOpen, setReadAloudMenuOpen] = useState(false)
  const readAloudMenuRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className={`bg-gray-800/50 border rounded-lg p-2.5 ${
        !entry.visibleToPlayers && isDM ? 'border-gray-700/50 opacity-60' : 'border-gray-700/30'
      }`}
    >
      {isEditing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
            placeholder="Name"
          />
          <textarea
            value={editDesc}
            onChange={(e) => onEditDescChange(e.target.value)}
            className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500 resize-none"
            rows={2}
            placeholder="Description"
          />
          <textarea
            value={editNotes}
            onChange={(e) => onEditNotesChange(e.target.value)}
            className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500 resize-none"
            rows={2}
            placeholder="DM Notes (hidden from players)"
          />
          {/* Stat Block section */}
          <div className="border border-gray-700/40 rounded">
            <button
              type="button"
              onClick={onToggleStatBlock}
              className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-amber-400 transition-colors cursor-pointer"
            >
              <span>Stat Block {editStatBlock ? '(configured)' : ''}</span>
              <span className="text-gray-500 text-[10px]">{showStatBlock ? '\u25B2' : '\u25BC'}</span>
            </button>
            {showStatBlock && (
              <div className="px-2 pb-2">
                <StatBlockForm statBlock={editStatBlock} onChange={onEditStatBlockChange} />
              </div>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={onSaveEdit}
              className="px-2 py-0.5 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer"
            >
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-200 truncate">{entry.name}</span>
                {/* Category badge with click-to-cycle (DM only, allies/enemies only) */}
                {isDM && (category === 'allies' || category === 'enemies') && (
                  <button
                    onClick={() => {
                      const target: SidebarCategory = category === 'allies' ? 'enemies' : 'allies'
                      onMoveTo(target)
                    }}
                    title={`Move to ${category === 'allies' ? 'Enemies' : 'Allies'}`}
                    className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-colors shrink-0 ${
                      category === 'allies'
                        ? 'text-green-400 bg-green-400/10 hover:bg-red-400/10 hover:text-red-400'
                        : 'text-red-400 bg-red-400/10 hover:bg-green-400/10 hover:text-green-400'
                    }`}
                  >
                    {CATEGORY_LABELS[category]}
                  </button>
                )}
              </div>
              {entry.description && (
                <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{entry.description}</p>
              )}
              {isDM && entry.notes && <p className="text-[10px] text-amber-400/70 mt-1 italic">{entry.notes}</p>}
            </div>

            {isDM && (
              <div className="flex items-center gap-0.5 shrink-0">
                {onAddToInitiative && (
                  <button
                    onClick={onAddToInitiative}
                    title="Add to initiative"
                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-amber-400 cursor-pointer text-xs font-bold"
                  >
                    +
                  </button>
                )}
                {entry.description && onReadAloud && (
                  <div className="relative">
                    <button
                      onClick={() => setReadAloudMenuOpen(!readAloudMenuOpen)}
                      title="Read Aloud"
                      className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-amber-400 cursor-pointer text-[10px]"
                    >
                      &#x1F4D6;
                    </button>
                    {readAloudMenuOpen && (
                      <div
                        ref={readAloudMenuRef}
                        className="absolute right-0 top-7 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
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
                <button
                  onClick={onToggleVisibility}
                  title={entry.visibleToPlayers ? 'Hide from players' : 'Show to players'}
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 cursor-pointer text-xs"
                >
                  {entry.visibleToPlayers ? '\u{1F441}' : '\u{1F441}\u{200D}\u{1F5E8}'}
                </button>
                <button
                  onClick={onStartEdit}
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-amber-400 cursor-pointer text-xs"
                  title="Edit"
                >
                  &#9998;
                </button>
                {!entry.isAutoPopulated && (
                  <button
                    onClick={onRemove}
                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-400 cursor-pointer text-xs"
                    title="Delete"
                  >
                    &#10005;
                  </button>
                )}
              </div>
            )}
          </div>
          {entry.isAutoPopulated && isDM && <span className="text-[9px] text-gray-600 mt-1 block">Auto-populated</span>}
          {/* Stat block quick actions (DM only, allies/enemies) */}
          {isDM && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {entry.statBlock && (
                <button
                  onClick={() => setViewStatBlockId(!viewStatBlockId)}
                  className="text-[10px] text-gray-500 hover:text-amber-400 cursor-pointer"
                >
                  {viewStatBlockId ? 'Hide Stat Block' : 'View Stat Block'}
                </button>
              )}
              <button
                onClick={onOpenCreatureSearch}
                className="text-[10px] text-gray-500 hover:text-amber-400 cursor-pointer"
              >
                Link from Creature DB
              </button>
              {entry.monsterStatBlockId && (
                <span className="text-[9px] text-gray-600">Linked: {entry.monsterStatBlockId}</span>
              )}
            </div>
          )}
          {/* Inline unified stat block view */}
          {viewStatBlockId && entry.statBlock && (
            <div className="mt-2">
              <Suspense fallback={<div className="text-[10px] text-gray-500">Loading...</div>}>
                <UnifiedStatBlock statBlock={sidebarToDisplay(entry.statBlock, entry.name)} />
              </Suspense>
            </div>
          )}
        </>
      )}
    </div>
  )
}
