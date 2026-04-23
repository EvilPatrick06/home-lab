import { useCallback, useEffect, useRef, useState } from 'react'
import DiceRenderer, { type DiceRollRequest } from './DiceRenderer'
import type { DiceColors, DieType } from './dice-meshes'
import { DEFAULT_DICE_COLORS } from './dice-meshes'

// ─── Types ────────────────────────────────────────────────────

export interface Dice3dRollEvent {
  formula: string
  rolls: number[]
  total: number
  rollerName: string
  isSecret?: boolean
  isHidden?: boolean
  colors?: DiceColors
}

export interface DiceTrayEntry {
  id: string
  formula: string
  rolls: number[]
  total: number
  rollerName: string
  timestamp: number
  isHidden?: boolean
}

// ─── Global event bus for triggering 3D dice ──────────────────

type DiceEventHandler = (event: Dice3dRollEvent) => void
const listeners: Set<DiceEventHandler> = new Set()

/** Call this from anywhere to trigger a 3D dice animation */
export function trigger3dDice(event: Dice3dRollEvent): void {
  listeners.forEach((fn) => fn(event))
}

// ─── Dice tray event bus ──────────────────────────────────────

type DiceTrayHandler = (entry: DiceTrayEntry) => void
const trayListeners: Set<DiceTrayHandler> = new Set()

export function onDiceTrayUpdate(handler: DiceTrayHandler): () => void {
  trayListeners.add(handler)
  return () => {
    trayListeners.delete(handler)
  }
}

function emitTrayEntry(entry: DiceTrayEntry): void {
  trayListeners.forEach((fn) => fn(entry))
}

// ─── Parse formula into dice groups ───────────────────────────

function parseDiceGroups(formula: string): Array<{ type: DieType; count: number }> | null {
  const cleaned = formula
    .replace(/\(.*?\)/g, '')
    .replace(/[+-]\d+/g, '')
    .trim()

  const diceRegex = /(\d*)d(\d+)/gi
  const groups: Array<{ type: DieType; count: number }> = []
  let match: RegExpExecArray | null

  while ((match = diceRegex.exec(cleaned)) !== null) {
    const count = match[1] ? parseInt(match[1], 10) : 1
    const sides = parseInt(match[2], 10)

    const validTypes: Record<number, DieType> = {
      4: 'd4',
      6: 'd6',
      8: 'd8',
      10: 'd10',
      12: 'd12',
      20: 'd20',
      100: 'd100'
    }

    const dieType = validTypes[sides]
    if (dieType && count > 0 && count <= 20) {
      groups.push({ type: dieType, count })
    }
  }

  return groups.length > 0 ? groups : null
}

// ─── Component ────────────────────────────────────────────────

export default function DiceOverlay(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [rollRequest, setRollRequest] = useState<DiceRollRequest | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setSize({ width: Math.round(width), height: Math.round(height) })
        }
      }
    })
    ro.observe(el)

    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) })
    }

    return () => ro.disconnect()
  }, [])

  const handleAnimationComplete = useCallback((results?: { formula: string; rolls: number[]; total: number }) => {
    // Add to dice tray if we have results
    if (results) {
      emitTrayEntry({
        id: `tray-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        formula: results.formula,
        rolls: results.rolls,
        total: results.total,
        rollerName: '', // filled by event source
        timestamp: Date.now()
      })
    }

    setTimeout(() => {
      setVisible(false)
      setTimeout(() => setRollRequest(null), 300)
    }, 200)
  }, [])

  useEffect(() => {
    const handler: DiceEventHandler = (event) => {
      // Secret rolls don't show ANY dice
      if (event.isSecret) return

      const groups = parseDiceGroups(event.formula)
      if (!groups) return

      const totalDice = groups.reduce((sum, g) => sum + g.count, 0)
      if (totalDice === 0) return

      const request: DiceRollRequest = {
        dice: groups,
        results: event.rolls,
        formula: event.formula,
        onComplete: undefined,
        isHidden: event.isHidden || false,
        colors: event.colors || DEFAULT_DICE_COLORS
      }

      setRollRequest(request)
      setVisible(true)
    }

    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-[15] pointer-events-none transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {rollRequest && size.width > 0 && size.height > 0 && (
        <DiceRenderer
          rollRequest={rollRequest}
          width={size.width}
          height={size.height}
          onAnimationComplete={handleAnimationComplete}
        />
      )}
    </div>
  )
}
