interface ImagePreviewItemProps {
  item: {
    id: string
    name: string
    data: Record<string, unknown>
  }
  onClick?: () => void
  isFavorite?: boolean
  onToggleFavorite?: (id: string) => void
}

export default function ImagePreviewItem({
  item,
  onClick,
  isFavorite,
  onToggleFavorite
}: ImagePreviewItemProps): JSX.Element {
  const imageData = (item.data.data as string) ?? (item.data.path as string) ?? ''
  const isDataUrl = imageData.startsWith('data:')

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded bg-gray-700/60 overflow-hidden flex items-center justify-center flex-shrink-0">
        {isDataUrl ? (
          <img src={imageData} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl">🖼️</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-100 group-hover:text-amber-400 transition-colors truncate block">
          {item.name}
        </span>
        <p className="text-xs text-gray-500 truncate mt-0.5">Portrait / Icon</p>
      </div>

      {/* Favorite star */}
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite(item.id)
          }}
          className={`text-lg flex-shrink-0 transition-colors cursor-pointer ${
            isFavorite ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'
          }`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      )}

      {/* Arrow */}
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
  )
}
