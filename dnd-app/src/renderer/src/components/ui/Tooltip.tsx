import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAccessibilityStore } from '../../stores/use-accessibility-store'

interface TooltipProps {
  text: string
  children: React.ReactNode
  delay?: number // ms before showing, default 300
  position?: 'top' | 'bottom' // preferred position, auto-flips if not enough space
}

export default function Tooltip({ text, children, delay = 300, position = 'top' }: TooltipProps): JSX.Element {
  const tooltipsEnabled = useAccessibilityStore((s) => s.tooltipsEnabled)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const [actualPosition, setActualPosition] = useState(position)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const GAP = 6

      // Calculate preferred placement
      let pos = position
      if (position === 'top' && rect.top < 40) pos = 'bottom'
      else if (position === 'bottom' && rect.bottom > window.innerHeight - 40) pos = 'top'

      const y = pos === 'top' ? rect.top - GAP : rect.bottom + GAP
      setCoords({ x: centerX, y })
      setActualPosition(pos)
      setVisible(true)
    }, delay)
  }, [delay, position])

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

  // Clamp tooltip to viewport horizontally after it renders
  useEffect(() => {
    if (!visible || !tooltipRef.current) return
    const el = tooltipRef.current
    const rect = el.getBoundingClientRect()
    if (rect.left < 4) {
      el.style.transform = `translateX(${4 - rect.left}px)`
    } else if (rect.right > window.innerWidth - 4) {
      el.style.transform = `translateX(${window.innerWidth - 4 - rect.right}px)`
    }
  }, [visible])

  if (!tooltipsEnabled) {
    return <>{children}</>
  }

  return (
    <div ref={wrapperRef} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} className="inline-flex">
      {children}
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="fixed z-[9999] pointer-events-none"
            style={{
              left: coords.x,
              top: actualPosition === 'top' ? coords.y : coords.y,
              transform: `translateX(-50%)${actualPosition === 'top' ? ' translateY(-100%)' : ''}`
            }}
          >
            <div className="px-2 py-1 text-[11px] font-medium text-gray-100 bg-gray-900 border border-gray-700 rounded shadow-lg whitespace-nowrap">
              {text}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
