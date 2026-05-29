import type { Container } from 'pixi.js'
import { useEffect } from 'react'
import { createPing } from '../../../../services/map/map-utils'
import type { GameMap } from '../../../../types/map'
import { formatGridLabel } from './grid-coord'

/**
 * Self-contained event-listener custom hooks extracted from MapCanvas.tsx.
 *
 * Behavior-preserving decomposition: each hook wraps exactly one `useEffect` that
 * was previously inline in the component, with the same dependency array and body.
 * They take refs + values explicitly and never call hooks conditionally, so the
 * component's overall hook-call order is unchanged when they are invoked in place.
 */

interface PanZoomRefs {
  containerRef: React.RefObject<HTMLDivElement | null>
  panRef: React.MutableRefObject<{ x: number; y: number }>
  zoomRef: React.MutableRefObject<number>
}

/**
 * Phase 16g — hover grid-coordinate HUD. Compute the cell under the cursor on pointermove
 * (mirrors the pointer→grid math used by click-to-place); clear on leave. Skipped entirely
 * when the readout is toggled off, so there's no per-move cost.
 */
export function useGridHudHover(
  refs: PanZoomRefs,
  showGridHud: boolean,
  map: GameMap | null,
  setHoverCoord: (coord: string | null) => void
): void {
  const { containerRef, panRef, zoomRef } = refs
  useEffect(() => {
    const el = containerRef.current
    if (!el || !showGridHud || !map) return
    const cellSize = map.grid.cellSize
    const gridType = map.grid.type
    const onMove = (e: PointerEvent): void => {
      const rect = el.getBoundingClientRect()
      const worldX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current
      const worldY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current
      setHoverCoord(formatGridLabel(Math.floor(worldX / cellSize), Math.floor(worldY / cellSize), gridType))
    }
    const onLeave = (): void => setHoverCoord(null)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: refs + setHoverCoord are stable; re-bind only on showGridHud/map change (preserves original MapCanvas deps)
  }, [showGridHud, map])
}

/**
 * Phase 16a — stamp the last manual pan/zoom. Wheel = zoom; pointerdown with the pan triggers
 * (space held or middle mouse button) = drag-pan. Token clicks (plain left button) don't count.
 */
export function useManualPanStamp(
  containerRef: React.RefObject<HTMLDivElement | null>,
  lastManualPanAtRef: React.MutableRefObject<number>,
  spaceHeldRef: React.MutableRefObject<boolean>
): void {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const stamp = (): void => {
      lastManualPanAtRef.current = Date.now()
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (spaceHeldRef.current || e.button === 1) stamp()
    }
    el.addEventListener('wheel', stamp, { passive: true })
    el.addEventListener('pointerdown', onPointerDown)
    return () => {
      el.removeEventListener('wheel', stamp)
      el.removeEventListener('pointerdown', onPointerDown)
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: all refs are stable; bind once on mount (preserves original MapCanvas deps)
  }, [])
}

/** Double-click to ping at location. */
export function usePingOnDoubleClick(refs: PanZoomRefs, map: GameMap | null, isHost: boolean): void {
  const { containerRef, panRef, zoomRef } = refs
  useEffect(() => {
    const el = containerRef.current
    if (!el || !map) return
    const handler = (e: MouseEvent): void => {
      const rect = el.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
      const worldX = (canvasX - panRef.current.x) / zoomRef.current
      const worldY = (canvasY - panRef.current.y) / zoomRef.current
      createPing(worldX, worldY, isHost ? 'DM' : 'Player')
    }
    el.addEventListener('dblclick', handler)
    return () => el.removeEventListener('dblclick', handler)
    // biome-ignore lint/correctness/useExhaustiveDependencies: pan/zoom refs are stable; re-bind only on map/isHost change (preserves original MapCanvas deps)
  }, [map, isHost])
}

/** Reset map view on the Home key (delegates to the caller's reset handler). */
export function useResetViewHotkey(handleResetView: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Home') {
        e.preventDefault()
        handleResetView()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleResetView])
}

interface EmptyCellContextMenuRefs extends PanZoomRefs {
  worldRef: React.RefObject<Container | null>
}

/** Right-click on empty cell handler (DM only). */
export function useEmptyCellContextMenu(
  refs: EmptyCellContextMenuRefs,
  isHost: boolean,
  onEmptyCellContextMenu: ((gridX: number, gridY: number, screenX: number, screenY: number) => void) | undefined,
  map: GameMap | null
): void {
  const { containerRef, worldRef, panRef, zoomRef } = refs
  useEffect(() => {
    const el = containerRef.current
    if (!el || !isHost || !onEmptyCellContextMenu || !map) return
    const handler = (e: MouseEvent): void => {
      // Only process if right-click
      if (e.button !== 2) return
      e.preventDefault()

      // Check if we clicked on a token — if so, let the token handler deal with it
      const world = worldRef.current
      if (!world) return
      const canvas = el.querySelector('canvas')
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top

      // Convert screen to world coordinates
      const worldX = (canvasX - panRef.current.x) / zoomRef.current
      const worldY = (canvasY - panRef.current.y) / zoomRef.current

      // Check if any token contains this point
      const cellSize = map.grid.cellSize
      const hitToken = map.tokens.some((token) => {
        const tokenSize = cellSize * Math.max(token.sizeX, token.sizeY)
        const cx = token.gridX * cellSize + tokenSize / 2
        const cy = token.gridY * cellSize + tokenSize / 2
        const radius = (tokenSize - 4) / 2
        const dx = worldX - cx
        const dy = worldY - cy
        return dx * dx + dy * dy <= radius * radius
      })
      if (hitToken) return

      // Convert to grid cell
      const gridX = Math.floor(worldX / cellSize)
      const gridY = Math.floor(worldY / cellSize)
      if (gridX < 0 || gridY < 0) return

      onEmptyCellContextMenu(gridX, gridY, e.clientX, e.clientY)
    }
    el.addEventListener('contextmenu', handler)
    return () => el.removeEventListener('contextmenu', handler)
    // biome-ignore lint/correctness/useExhaustiveDependencies: world/pan/zoom refs are stable; re-bind only on isHost/handler/map change (preserves original MapCanvas deps)
  }, [isHost, onEmptyCellContextMenu, map])
}
