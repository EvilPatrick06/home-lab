import type { InitiativeEntry as InitiativeEntryType } from '../../../types/game-state'

interface InitiativeEntryProps {
  entry: InitiativeEntryType & { isLairAction?: boolean }
  realIndex: number
  isHost: boolean
  editingId: string | null
  editTotal: string
  draggedIndex: number | null
  dragOverIndex: number | null
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
  onDrop: (fromIndex: number | null, toIndex: number) => void
  onEditStart: (id: string, total: number) => void
  onEditChange: (value: string) => void
  onEditSave: (entryId: string) => void
  onEditCancel: () => void
  onUpdateEntry: (entryId: string, updates: Partial<InitiativeEntryType>) => void
  onRemoveEntry: (entryId: string) => void
  onDelayEntry: (entry: InitiativeEntryType) => void
  onCenterToken?: (entityId: string) => void
}

export default function InitiativeEntry({
  entry,
  realIndex,
  isHost,
  editingId,
  editTotal,
  draggedIndex,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onUpdateEntry,
  onRemoveEntry,
  onDelayEntry,
  onCenterToken
}: InitiativeEntryProps): JSX.Element {
  return (
    <div
      draggable={isHost && !entry.isLairAction}
      onDragStart={() => {
        if (!entry.isLairAction) onDragStart(realIndex)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!entry.isLairAction && realIndex >= 0) onDragOver(e, realIndex)
      }}
      onDragEnd={onDragEnd}
      onDrop={() => {
        if (draggedIndex !== null && realIndex >= 0 && draggedIndex !== realIndex) {
          onDrop(draggedIndex, realIndex)
        }
        onDragEnd()
      }}
      className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-colors
      ${
        entry.isLairAction
          ? 'bg-purple-900/30 border border-purple-700/50'
          : entry.isActive
            ? 'bg-amber-600/20 border border-amber-500'
            : dragOverIndex === realIndex && draggedIndex !== null
              ? 'bg-gray-700/50 border border-amber-500/50'
              : 'bg-gray-800/50 border border-transparent'
      } ${isHost && !entry.isLairAction ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Portrait avatar */}
      {entry.portraitUrl && !entry.isLairAction ? (
        <button
          onClick={() => {
            if (onCenterToken) onCenterToken(entry.entityId)
          }}
          className={`w-8 h-8 rounded-full flex-shrink-0 overflow-hidden
            ${entry.isActive ? 'ring-2 ring-amber-400 animate-pulse' : ''}
            cursor-pointer hover:brightness-125`}
          title={`Click to center on ${entry.entityName}`}
        >
          <img src={entry.portraitUrl} alt={entry.entityName} className="w-full h-full object-cover" />
        </button>
      ) : (
        <button
          onClick={() => {
            if (!entry.isLairAction && onCenterToken) onCenterToken(entry.entityId)
          }}
          className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white
          ${
            entry.isLairAction
              ? 'bg-purple-600'
              : entry.entityType === 'player'
                ? 'bg-blue-600'
                : entry.entityType === 'enemy'
                  ? 'bg-red-600'
                  : 'bg-yellow-600'
          }
          ${entry.isActive ? 'ring-2 ring-amber-400 animate-pulse' : ''}
          ${!entry.isLairAction ? 'cursor-pointer hover:brightness-125' : ''}`}
          title={entry.isLairAction ? 'Lair Action' : `Click to center on ${entry.entityName}`}
        >
          {entry.entityName.charAt(0).toUpperCase()}
        </button>
      )}

      <span className={`flex-1 truncate text-xs ${entry.isLairAction ? 'text-purple-300 italic' : 'text-gray-200'}`}>
        {entry.entityName}
      </span>

      {/* Legendary Resistance counter */}
      {!entry.isLairAction && entry.legendaryResistances && isHost && (
        <button
          onClick={() => {
            const lr = entry.legendaryResistances!
            if (lr.remaining > 0) {
              onUpdateEntry(entry.id, {
                legendaryResistances: { max: lr.max, remaining: lr.remaining - 1 }
              })
            }
          }}
          className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
            entry.legendaryResistances.remaining > 0
              ? 'bg-orange-700/50 text-orange-300 hover:bg-orange-600/50'
              : 'bg-gray-800 text-gray-600'
          }`}
          title={`Legendary Resistance: ${entry.legendaryResistances.remaining}/${entry.legendaryResistances.max} — Click to use`}
        >
          LR {entry.legendaryResistances.remaining}/{entry.legendaryResistances.max}
        </button>
      )}

      {/* In Lair toggle */}
      {!entry.isLairAction && entry.entityType === 'enemy' && isHost && (
        <button
          onClick={() => onUpdateEntry(entry.id, { inLair: !entry.inLair })}
          className={`text-[10px] px-1 py-0.5 rounded cursor-pointer transition-colors ${
            entry.inLair ? 'bg-purple-700/50 text-purple-300' : 'bg-gray-800/50 text-gray-600 hover:text-gray-400'
          }`}
          title={entry.inLair ? 'In Lair (click to toggle off)' : 'Not in lair (click to toggle on)'}
        >
          {entry.inLair ? 'Lair' : ''}
        </button>
      )}

      {/* Delay turn button (active entry only) */}
      {isHost && !entry.isLairAction && entry.isActive && (
        <button
          onClick={() => onDelayEntry(entry)}
          className="text-[10px] px-1 py-0.5 rounded bg-gray-700 text-gray-400 hover:text-yellow-300 hover:bg-gray-600 cursor-pointer"
          title="Delay turn (hold and re-enter later)"
        >
          Delay
        </button>
      )}

      {isHost && !entry.isLairAction && (
        <>
          {editingId === entry.id ? (
            <input
              type="number"
              value={editTotal}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={() => onEditSave(entry.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEditSave(entry.id)
                if (e.key === 'Escape') onEditCancel()
              }}
              className="w-10 p-0.5 rounded bg-gray-700 border border-amber-500 text-center text-xs text-gray-100"
            />
          ) : (
            <span
              className="text-xs font-mono font-semibold w-7 text-center cursor-pointer hover:text-amber-400 text-gray-300"
              onClick={() => onEditStart(entry.id, entry.total)}
              title="Click to edit"
            >
              {entry.total}
            </span>
          )}
          <button
            onClick={() => onRemoveEntry(entry.id)}
            className="text-gray-600 hover:text-red-400 text-xs cursor-pointer"
            title="Remove from initiative"
          >
            &#x2715;
          </button>
        </>
      )}

      {/* Lair action init count display */}
      {entry.isLairAction && <span className="text-xs font-mono text-purple-500 w-7 text-center">20</span>}
    </div>
  )
}
