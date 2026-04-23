import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LibraryCategory } from '../../types/library'

interface ContentTooltipProps {
  category: LibraryCategory
  name: string
  children: ReactNode
  renderPreview: (category: LibraryCategory, name: string) => ReactNode | null
}

export default function ContentTooltip({ category, name, children, renderPreview }: ContentTooltipProps): JSX.Element {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)

  const show = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPosition({
      x: Math.min(rect.left, window.innerWidth - 340),
      y: rect.bottom + 4
    })
    timerRef.current = setTimeout(() => setVisible(true), 200)
  }, [])

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const preview = visible ? renderPreview(category, name) : null

  return (
    <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} className="inline">
      {children}
      {visible &&
        preview &&
        createPortal(
          <div
            className="fixed z-[100] max-w-xs w-80 shadow-xl pointer-events-none"
            style={{ left: position.x, top: position.y }}
          >
            {preview}
          </div>,
          document.body
        )}
    </span>
  )
}
