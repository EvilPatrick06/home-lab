import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../../hooks/use-reduced-motion'
import { play as playSound, type SoundEvent } from '../../../services/sound-manager'
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

  for (const match of cleaned.matchAll(diceRegex)) {
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
  // Phase 17e (GUI-3) — track the roll-dismiss timeouts so they're cleared if the component
  // unmounts mid-roll (otherwise setState fires on an unmounted component).
  const dismissTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  useEffect(() => () => dismissTimeoutsRef.current.forEach(clearTimeout), [])

  // Phase 22a — reactive reduced-motion (store flag OR OS pref). The dice event
  // handler is registered in a useEffect (not React-reactive), so mirror the
  // value into a ref it can read.
  const reducedMotion = useReducedMotion()
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion

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

    const t1 = setTimeout(() => {
      setVisible(false)
      const t2 = setTimeout(() => setRollRequest(null), 300)
      dismissTimeoutsRef.current.push(t2)
    }, 200)
    dismissTimeoutsRef.current.push(t1)
  }, [])

  useEffect(() => {
    const handler: DiceEventHandler = (event) => {
      // Secret rolls don't show ANY dice
      if (event.isSecret) return

      const groups = parseDiceGroups(event.formula)
      if (!groups) return

      const totalDice = groups.reduce((sum, g) => sum + g.count, 0)
      if (totalDice === 0) return

      // Phase 27c — play a dice sound for the roll (chat / command / network
      // rolls were silent; nothing else plays it, so no double-play). Solo d20s
      // get the nat-20 / nat-1 cue.
      const sidesFor = (t: DieType): number => parseInt(t.slice(1), 10)
      const maxType = groups.reduce((a, b) => (sidesFor(b.type) > sidesFor(a.type) ? b : a)).type
      const soloD20 = groups.length === 1 && groups[0].type === 'd20' && groups[0].count === 1
      if (soloD20 && event.rolls[0] === 20) playSound('nat-20')
      else if (soloD20 && event.rolls[0] === 1) playSound('nat-1')
      else playSound(`dice-${maxType}` as SoundEvent)

      // QA-S9: honor the Reduced Motion accessibility toggle. The 3D
      // canvas uses Three.js + cannon-es physics which CSS transitions
      // can't reach, so we read the store directly here and skip the
      // 3D path entirely — emit the tray entry immediately so the
      // result still shows up in the rolling history.
      if (reducedMotionRef.current) {
        emitTrayEntry({
          id: `tray-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          formula: event.formula,
          rolls: event.rolls,
          total: event.total,
          rollerName: event.rollerName,
          timestamp: Date.now(),
          isHidden: event.isHidden
        })
        return
      }

      const request: DiceRollRequest = {
        dice: groups,
        results: event.rolls,
        formula: event.formula,
        // Pass the event's authoritative total through so the Dice Tray entry
        // emitted by handleAnimationComplete reflects kh/kl/dh/dl + modifiers
        // rather than a naïve sum of all rolls.
        total: event.total,
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
