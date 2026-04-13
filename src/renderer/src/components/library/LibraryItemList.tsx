import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import { setDragPayload } from '../../services/library/drag-data'
import type { LibraryCategory, LibraryItem } from '../../types/library'
import { getCategoryDef } from '../../types/library'
import AudioPlayerItem from './AudioPlayerItem'
import ImagePreviewItem from './ImagePreviewItem'

const DRAGGABLE_CATEGORIES = new Set<LibraryCategory>([
  'monsters',
  'creatures',
  'npcs',
  'spells',
  'weapons',
  'armor',
  'gear',
  'magic-items'
])

interface LibraryItemListProps {
  items: LibraryItem[]
  loading: boolean
  onSelectItem: (item: LibraryItem) => void
  onCreateNew: () => void
  categoryLabel: string
  category?: LibraryCategory | null
  favorites?: Set<string>
  onToggleFavorite?: (itemId: string) => void
}

export default function LibraryItemList({
  items,
  loading,
  onSelectItem,
  onCreateNew,
  categoryLabel,
  category,
  favorites,
  onToggleFavorite
}: LibraryItemListProps): JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading {categoryLabel}...</span>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <svg
          className="w-12 h-12 mb-3 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <p className="text-lg mb-1">No items found</p>
        <p className="text-sm mb-4">Try adjusting your search or filters</p>
        <button
          onClick={onCreateNew}
          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          Create Custom {categoryLabel}
        </button>
      </div>
    )
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          const catDef = getCategoryDef(item.category)
          const isFav = favorites?.has(item.id) ?? false
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              {category === 'sounds' ? (
                <AudioPlayerItem
                  item={{ id: item.id, name: item.name, data: item.data }}
                  onClick={() => onSelectItem(item)}
                  isFavorite={isFav}
                  onToggleFavorite={onToggleFavorite}
                />
              ) : category === 'portraits' ? (
                <ImagePreviewItem
                  item={{ id: item.id, name: item.name, data: item.data }}
                  onClick={() => onSelectItem(item)}
                  isFavorite={isFav}
                  onToggleFavorite={onToggleFavorite}
                />
              ) : (
                <div
                  onClick={() => onSelectItem(item)}
                  draggable={DRAGGABLE_CATEGORIES.has(item.category)}
                  onDragStart={(e) => {
                    const dragType = (['monsters', 'creatures', 'npcs'] as LibraryCategory[]).includes(item.category)
                      ? ('library-monster' as const)
                      : item.category === 'spells'
                        ? ('library-spell' as const)
                        : ('library-item' as const)
                    const payload =
                      dragType === 'library-item'
                        ? { type: dragType, itemId: item.id, itemName: item.name, category: item.category }
                        : { type: dragType, itemId: item.id, itemName: item.name }
                    setDragPayload(e, payload)
                    setDraggingId(item.id)
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-800/50
                    hover:bg-gray-800/40 transition-colors cursor-pointer group ${draggingId === item.id ? 'opacity-50' : ''}`}
                >
                  {catDef && <span className="text-lg leading-none flex-shrink-0">{catDef.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-100 group-hover:text-amber-400 transition-colors truncate">
                        {item.name}
                      </span>
                      {item.source === 'homebrew' && (
                        <span className="text-[10px] bg-purple-600/30 text-purple-300 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          Homebrew
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{item.summary}</p>
                  </div>
                  {onToggleFavorite && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFavorite(item.id)
                      }}
                      className={`text-lg flex-shrink-0 transition-colors cursor-pointer ${
                        isFav ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'
                      }`}
                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isFav ? '★' : '☆'}
                    </button>
                  )}
                  <svg
                    className="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
