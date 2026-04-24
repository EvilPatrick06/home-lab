import { useCallback, useMemo, useRef, useState } from 'react'
import type { Handout, HandoutPage } from '../../../../types/game-state'

interface HandoutViewerModalProps {
  handout: Handout
  onClose: () => void
}

export default function HandoutViewerModal({ handout, onClose }: HandoutViewerModalProps): JSX.Element {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [activePage, setActivePage] = useState(0)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })

  // Filter out dmOnly pages (DM strips them before sharing)
  const visiblePages = useMemo<HandoutPage[]>(() => {
    if (!handout.pages || handout.pages.length === 0) return []
    return handout.pages.filter((p) => !p.dmOnly)
  }, [handout.pages])

  const hasPages = visiblePages.length > 0
  const currentPage = hasPages ? visiblePages[Math.min(activePage, visiblePages.length - 1)] : null
  const activeContentType = currentPage ? currentPage.contentType : handout.contentType
  const activeContent = currentPage ? currentPage.content : handout.content

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    setScale((prev) => {
      const next = prev + (e.deltaY < 0 ? 0.1 : -0.1)
      return Math.max(0.25, Math.min(5, next))
    })
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (handout.contentType !== 'image') return
      setDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
      offsetStart.current = { ...offset }
    },
    [handout.contentType, offset]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return
      setOffset({
        x: offsetStart.current.x + (e.clientX - dragStart.current.x),
        y: offsetStart.current.y + (e.clientY - dragStart.current.y)
      })
    },
    [dragging]
  )

  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  const resetView = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-3xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-200 truncate">{handout.title}</h3>
          <div className="flex items-center gap-2">
            {activeContentType === 'image' && (
              <>
                <span className="text-[10px] text-gray-500">{Math.round(scale * 100)}%</span>
                <button
                  onClick={resetView}
                  className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                >
                  Reset
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Page tabs */}
        {hasPages && (
          <div className="flex gap-0.5 mb-2 shrink-0 overflow-x-auto">
            {visiblePages.map((page, idx) => (
              <button
                key={page.id}
                onClick={() => {
                  setActivePage(idx)
                  resetView()
                }}
                className={`px-3 py-1 text-[10px] font-medium rounded-t-lg whitespace-nowrap cursor-pointer transition-colors ${
                  activePage === idx
                    ? 'bg-amber-600/25 border border-b-0 border-amber-500/50 text-amber-300'
                    : 'bg-gray-800/40 border border-b-0 border-gray-700/30 text-gray-400 hover:bg-gray-700/40'
                }`}
              >
                {page.label || `Page ${idx + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div
          className={`flex-1 overflow-hidden rounded-lg border border-gray-700/40 bg-gray-800/50 min-h-0 ${
            activeContentType === 'image' ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          onWheel={activeContentType === 'image' ? handleWheel : undefined}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {activeContentType === 'image' ? (
            <div className="w-full h-full flex items-center justify-center overflow-hidden select-none">
              <img
                src={activeContent}
                alt={handout.title}
                draggable={false}
                className="max-w-none"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  transformOrigin: 'center center'
                }}
              />
            </div>
          ) : (
            <div className="p-4 overflow-y-auto h-full">
              <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{activeContent}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
