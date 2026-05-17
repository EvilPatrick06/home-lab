import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * Phase 16C — Non-blocking floating window primitive.
 *
 * Draggable, optionally resizable, persistent-position panel that sits on
 * top of the map without blocking interaction the way a modal does.
 * Designed for DM reference tools (initiative tracker, creature lookup,
 * notes) that the DM needs to keep visible while moving tokens or panning.
 *
 * Position + size persist in sessionStorage keyed on `storageKey`. Z-order
 * uses a small module-level counter so clicking any floating window brings
 * it forward.
 *
 * NOT a modal replacement for confirmation flows / blocking confirmations.
 * Floating is for "side-panel reference content" only.
 */

interface FloatingWindowProps {
  /** Stable identifier — also used as the sessionStorage key for position. */
  storageKey: string
  title: string
  children: ReactNode
  defaultPosition?: { x: number; y: number }
  defaultSize?: { width: number; height: number }
  minSize?: { width: number; height: number }
  resizable?: boolean
  onClose: () => void
}

interface PersistedRect {
  x: number
  y: number
  width: number
  height: number
}

let zCounter = 1000

function loadRect(key: string): PersistedRect | null {
  try {
    const raw = sessionStorage.getItem(`floating-window-${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedRect>
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number'
    ) {
      return null
    }
    return parsed as PersistedRect
  } catch {
    return null
  }
}

function saveRect(key: string, rect: PersistedRect): void {
  try {
    sessionStorage.setItem(`floating-window-${key}`, JSON.stringify(rect))
  } catch {
    /* sessionStorage may be unavailable */
  }
}

export default function FloatingWindow({
  storageKey,
  title,
  children,
  defaultPosition = { x: 80, y: 80 },
  defaultSize = { width: 360, height: 480 },
  minSize = { width: 240, height: 200 },
  resizable = true,
  onClose
}: FloatingWindowProps): JSX.Element {
  const headerId = useId()
  const persisted = loadRect(storageKey)
  const [rect, setRect] = useState<PersistedRect>(
    persisted ?? {
      x: defaultPosition.x,
      y: defaultPosition.y,
      width: defaultSize.width,
      height: defaultSize.height
    }
  )
  const [zIndex, setZIndex] = useState(() => ++zCounter)
  const dragState = useRef<{ kind: 'move' | 'resize'; startX: number; startY: number; orig: PersistedRect } | null>(
    null
  )

  // Persist position + size whenever they change.
  useEffect(() => {
    saveRect(storageKey, rect)
  }, [storageKey, rect])

  const bringToFront = useCallback(() => {
    setZIndex(++zCounter)
  }, [])

  const startDrag = useCallback(
    (kind: 'move' | 'resize') => (e: React.MouseEvent) => {
      e.preventDefault()
      dragState.current = {
        kind,
        startX: e.clientX,
        startY: e.clientY,
        orig: { ...rect }
      }
      bringToFront()
    },
    [rect, bringToFront]
  )

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const ds = dragState.current
      if (!ds) return
      const dx = e.clientX - ds.startX
      const dy = e.clientY - ds.startY
      if (ds.kind === 'move') {
        // Clamp to viewport so the window can't be dragged off-screen.
        const maxX = window.innerWidth - 80
        const maxY = window.innerHeight - 40
        setRect({
          ...ds.orig,
          x: Math.max(0, Math.min(maxX, ds.orig.x + dx)),
          y: Math.max(0, Math.min(maxY, ds.orig.y + dy))
        })
      } else {
        setRect({
          ...ds.orig,
          width: Math.max(minSize.width, ds.orig.width + dx),
          height: Math.max(minSize.height, ds.orig.height + dy)
        })
      }
    }
    const onUp = (): void => {
      dragState.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [minSize.width, minSize.height])

  return (
    <div
      role="dialog"
      aria-labelledby={headerId}
      aria-modal="false"
      onMouseDown={bringToFront}
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex
      }}
      className="bg-gray-900/95 backdrop-blur-sm border border-gray-700/60 rounded-xl shadow-2xl flex flex-col overflow-hidden"
    >
      <div
        onMouseDown={startDrag('move')}
        className="flex items-center justify-between px-3 py-1.5 bg-gray-800/80 border-b border-gray-700/60 cursor-move select-none"
      >
        <span id={headerId} className="text-xs font-semibold text-gray-200 truncate">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="text-gray-500 hover:text-gray-200 text-base cursor-pointer leading-none"
        >
          &times;
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2">{children}</div>
      {resizable && (
        <div
          onMouseDown={startDrag('resize')}
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize border-r-2 border-b-2 border-gray-500/60"
        />
      )}
    </div>
  )
}
