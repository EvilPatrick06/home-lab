import { useCallback, useEffect, useRef } from 'react'
import { useT } from '../../i18n'

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  onDoubleClick?: () => void
}

export default function ResizeHandle({ direction, onResize, onDoubleClick }: ResizeHandleProps): JSX.Element {
  const { t } = useT()
  const dragging = useRef(false)
  const lastPos = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragging.current = true
      lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction]
  )

  // Keyboard operability: arrow keys nudge the split (Shift = larger step). A
  // horizontal handle (col-resize) responds to Left/Right; a vertical handle
  // (row-resize) to Up/Down — matching the drag axis.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 48 : 16
      const horizontal = direction === 'horizontal'
      const dec = horizontal ? 'ArrowLeft' : 'ArrowUp'
      const inc = horizontal ? 'ArrowRight' : 'ArrowDown'
      if (e.key === dec) {
        e.preventDefault()
        onResize(-step)
      } else if (e.key === inc) {
        e.preventDefault()
        onResize(step)
      }
    },
    [direction, onResize]
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = currentPos - lastPos.current
      lastPos.current = currentPos
      onResize(delta)
    }

    const handleMouseUp = (): void => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [direction, onResize])

  const isH = direction === 'horizontal'

  return (
    <div
      role="separator"
      aria-orientation={isH ? 'vertical' : 'horizontal'}
      aria-label={t('game.resizeHandle.title')}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={onDoubleClick}
      className={`group flex items-center justify-center shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        isH ? 'w-2 cursor-col-resize hover:bg-blue-500/20' : 'h-2 cursor-row-resize hover:bg-blue-500/20'
      } transition-colors`}
      title={t('game.resizeHandle.title')}
    >
      {/* Dotted grab indicator */}
      <div className={`flex ${isH ? 'flex-col' : 'flex-row'} gap-[3px]`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-1 h-1 rounded-full bg-gray-600 group-hover:bg-blue-400 transition-colors" />
        ))}
      </div>
    </div>
  )
}
