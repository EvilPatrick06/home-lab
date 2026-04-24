import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiceTrayEntry } from '.'
import { onDiceTrayUpdate } from '.'

const MAX_TRAY_ENTRIES = 5
const STORAGE_KEY = 'dnd-vtt-dice-tray-position'

interface Position {
  x: number
  y: number
}

function loadPosition(): Position | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as Position
  } catch {
    /* ignore */
  }
  return null
}

function savePosition(pos: Position): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  } catch {
    /* ignore */
  }
}

function getDieIcon(formula: string): string {
  if (formula.includes('d20')) return 'd20'
  if (formula.includes('d12')) return 'd12'
  if (formula.includes('d10') || formula.includes('d100')) return 'd10'
  if (formula.includes('d8')) return 'd8'
  if (formula.includes('d6')) return 'd6'
  if (formula.includes('d4')) return 'd4'
  return 'dice'
}

export default function DiceTray(): JSX.Element {
  const [entries, setEntries] = useState<DiceTrayEntry[]>([])
  const [position, setPosition] = useState<Position>({ x: -1, y: -1 })
  const [isDragging, setIsDragging] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const dragOffset = useRef<Position>({ x: 0, y: 0 })
  const trayRef = useRef<HTMLDivElement>(null)

  // Set initial position (bottom-right)
  useEffect(() => {
    const saved = loadPosition()
    if (saved && saved.x >= 0 && saved.y >= 0) {
      setPosition(saved)
    } else {
      setPosition({
        x: window.innerWidth - 280,
        y: window.innerHeight - 400
      })
    }
  }, [])

  // Subscribe to dice tray events
  useEffect(() => {
    return onDiceTrayUpdate((entry) => {
      setEntries((prev) => {
        const updated = [entry, ...prev].slice(0, MAX_TRAY_ENTRIES)
        return updated
      })
    })
  }, [])

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (trayRef.current) {
      const rect = trayRef.current.getBoundingClientRect()
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      setIsDragging(true)
    }
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent): void => {
      const newPos = {
        x: Math.max(0, Math.min(window.innerWidth - 260, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y))
      }
      setPosition(newPos)
    }

    const handleMouseUp = (): void => {
      setIsDragging(false)
      setPosition((pos) => {
        savePosition(pos)
        return pos
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setEntries([])
  }, [])

  if (entries.length === 0) return <></>

  return (
    <div ref={trayRef} className="fixed z-50 pointer-events-auto" style={{ left: position.x, top: position.y }}>
      {/* Header — draggable */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 bg-gray-800/95 border border-gray-600 rounded-t-lg select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">&#x2630;</span>
          <span className="text-xs font-medium text-gray-300">Dice Tray</span>
          <span className="text-xs text-gray-500">({entries.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-gray-400 hover:text-gray-200 text-xs px-1"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <button onClick={clearAll} className="text-gray-400 hover:text-red-400 text-xs px-1" title="Clear all">
            x
          </button>
        </div>
      </div>

      {/* Entries */}
      {!collapsed && (
        <div
          className="bg-gray-900/95 border border-t-0 border-gray-600 rounded-b-lg overflow-hidden"
          style={{ width: 250 }}
        >
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 last:border-b-0 hover:bg-gray-800/50 group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-amber-400 font-mono shrink-0">[{getDieIcon(entry.formula)}]</span>
                <div className="min-w-0">
                  <div className="text-sm text-white font-medium truncate">{entry.formula}</div>
                  {entry.rollerName && <div className="text-xs text-gray-500 truncate">{entry.rollerName}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-lg font-bold text-amber-300">{entry.total}</span>
                <button
                  onClick={() => removeEntry(entry.id)}
                  className="text-gray-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
