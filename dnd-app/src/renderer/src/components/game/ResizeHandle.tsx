import { useCallback, useEffect, useRef } from 'react'

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  onDoubleClick?: () => void
}

export default function ResizeHandle({ direction, onResize, onDoubleClick }: ResizeHandleProps): JSX.Element {
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
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      className={`group flex items-center justify-center shrink-0 ${
        isH ? 'w-2 cursor-col-resize hover:bg-blue-500/20' : 'h-2 cursor-row-resize hover:bg-blue-500/20'
      } transition-colors`}
      title="Drag to resize, double-click to collapse/expand"
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
