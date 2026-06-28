import type { MapEventRefs } from './map-event-handlers'

/**
 * Touch input for the map canvas (mobile / tablet).
 *
 * Design: the existing pointer/mouse pipeline (`setupMouseHandlers`,
 * `createWheelHandler`, the Pixi sprite `pointerdown` handlers) already
 * implements every gesture — token drag, selection box, fog paint, measure,
 * draw, pan. Rather than re-implement all of that for touch, we translate a
 * SINGLE-finger touch into the synthetic `mousedown`/`mousemove`/`mouseup`
 * stream those handlers listen for, so one finger behaves exactly like the left
 * mouse button. Multi-touch (two fingers) is handled here directly as
 * pinch-zoom + two-finger pan, mirroring the wheel-zoom math so it composes with
 * the same `zoomRef`/`panRef`/`applyTransform`.
 *
 * Token-drag start still flows through Pixi's federated `pointerdown` (touch
 * generates real pointer events), so `dragRef` is set before our synthetic
 * `mousedown` reaches the container handler — identical ordering to the desktop
 * pointerdown→mousedown sequence.
 *
 * A stationary long-press synthesizes a `contextmenu` event so DM tap-and-hold
 * opens the empty-cell radial menu (handled by `useEmptyCellContextMenu`).
 */

const ZOOM_MIN = 0.25
const ZOOM_MAX = 4
const LONG_PRESS_MS = 500
const MOVE_CANCEL_PX = 10

interface TouchPoint {
  x: number
  y: number
}

function dist(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function centroid(a: TouchPoint, b: TouchPoint): TouchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function setupTouchHandlers(
  el: HTMLElement,
  refs: Pick<MapEventRefs, 'zoom' | 'pan'>,
  applyTransform: () => void
): () => void {
  let mode: 'none' | 'single' | 'pinch' = 'none'
  let singleActive = false
  let movedPastThreshold = false
  let longPressFired = false
  let startPoint: TouchPoint = { x: 0, y: 0 }
  let lastSingle: TouchPoint = { x: 0, y: 0 }
  let pinchPrevDist = 0
  let pinchPrevCenter: TouchPoint = { x: 0, y: 0 }
  let longPressTimer: ReturnType<typeof setTimeout> | null = null

  const clearLongPress = (): void => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  const dispatchMouse = (type: 'mousedown' | 'mousemove' | 'mouseup', p: TouchPoint, button = 0): void => {
    const target = type === 'mousedown' ? el : window
    target.dispatchEvent(
      new MouseEvent(type, { clientX: p.x, clientY: p.y, button, bubbles: true, cancelable: true, view: window })
    )
  }

  const dispatchContextMenu = (p: TouchPoint): void => {
    el.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: p.x, clientY: p.y, button: 2, bubbles: true, cancelable: true })
    )
  }

  const endSingle = (): void => {
    if (singleActive) {
      dispatchMouse('mouseup', lastSingle)
      singleActive = false
    }
  }

  const onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      const t = e.touches[0]!
      startPoint = { x: t.clientX, y: t.clientY }
      lastSingle = startPoint
      mode = 'single'
      singleActive = true
      movedPastThreshold = false
      longPressFired = false
      dispatchMouse('mousedown', startPoint)
      clearLongPress()
      longPressTimer = setTimeout(() => {
        if (mode === 'single' && !movedPastThreshold) {
          longPressFired = true
          // End the in-progress single gesture (closes any empty selection box)
          // before opening the context menu at the press point.
          endSingle()
          dispatchContextMenu(startPoint)
          mode = 'none'
        }
      }, LONG_PRESS_MS)
      e.preventDefault()
      return
    }
    if (e.touches.length >= 2) {
      clearLongPress()
      // A second finger landed mid-drag: finalize the single gesture so we don't
      // leave a token half-dragged, then switch to pinch.
      endSingle()
      mode = 'pinch'
      const a = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
      const b = { x: e.touches[1]!.clientX, y: e.touches[1]!.clientY }
      pinchPrevDist = dist(a, b)
      pinchPrevCenter = centroid(a, b)
      e.preventDefault()
    }
  }

  const onTouchMove = (e: TouchEvent): void => {
    if (mode === 'pinch' && e.touches.length >= 2) {
      const a = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
      const b = { x: e.touches[1]!.clientX, y: e.touches[1]!.clientY }
      const newDist = dist(a, b)
      const newCenter = centroid(a, b)
      const rect = el.getBoundingClientRect()
      const cx = newCenter.x - rect.left
      const cy = newCenter.y - rect.top

      // Zoom around the pinch centroid (same anchoring as the wheel handler).
      if (pinchPrevDist > 0) {
        const factor = newDist / pinchPrevDist
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, refs.zoom.current * factor))
        const worldX = (cx - refs.pan.current.x) / refs.zoom.current
        const worldY = (cy - refs.pan.current.y) / refs.zoom.current
        refs.zoom.current = newZoom
        refs.pan.current.x = cx - worldX * newZoom
        refs.pan.current.y = cy - worldY * newZoom
      }
      // Two-finger pan by the centroid delta.
      refs.pan.current.x += newCenter.x - pinchPrevCenter.x
      refs.pan.current.y += newCenter.y - pinchPrevCenter.y

      pinchPrevDist = newDist
      pinchPrevCenter = newCenter
      applyTransform()
      e.preventDefault()
      return
    }

    if (mode === 'single' && singleActive && e.touches.length === 1) {
      const t = e.touches[0]!
      const p = { x: t.clientX, y: t.clientY }
      if (!movedPastThreshold && dist(p, startPoint) > MOVE_CANCEL_PX) {
        movedPastThreshold = true
        clearLongPress()
      }
      lastSingle = p
      dispatchMouse('mousemove', p)
      e.preventDefault()
    }
  }

  const onTouchEnd = (e: TouchEvent): void => {
    clearLongPress()
    if (mode === 'single' && !longPressFired) {
      endSingle()
    }
    // Once every finger is lifted, reset to a clean slate. While >0 fingers
    // remain after a pinch, stay inert until the user lifts off and re-touches,
    // so a leftover finger doesn't suddenly start panning.
    if (e.touches.length === 0) {
      mode = 'none'
      singleActive = false
      longPressFired = false
    } else if (mode === 'single') {
      mode = 'none'
    }
  }

  const onTouchCancel = (): void => {
    clearLongPress()
    endSingle()
    mode = 'none'
    singleActive = false
  }

  el.addEventListener('touchstart', onTouchStart, { passive: false })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd)
  el.addEventListener('touchcancel', onTouchCancel)

  return () => {
    clearLongPress()
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('touchcancel', onTouchCancel)
  }
}
