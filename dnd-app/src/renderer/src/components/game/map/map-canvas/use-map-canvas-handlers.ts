import { useCallback } from 'react'
import { getDragPayload, hasLibraryDrag } from '../../../../services/library/drag-data'
import { monsterToTokenData } from '../../../../services/map/monster-to-token'
import { useGameStore } from '../../../../stores/use-game-store'
import type { GameMap } from '../../../../types/map'

/**
 * Library drag-and-drop + reset-view handlers extracted from MapCanvas.tsx.
 *
 * Behavior-preserving decomposition: the three `useCallback`s below were previously
 * inline in the component, in this exact order. The hook is invoked once, in the same
 * position, so the component's overall hook-call order is unchanged.
 */
export function useMapCanvasHandlers(args: {
  containerRef: React.RefObject<HTMLDivElement | null>
  panRef: React.MutableRefObject<{ x: number; y: number }>
  zoomRef: React.MutableRefObject<number>
  applyTransform: () => void
  map: GameMap | null
  currentFloor: number
}): {
  handleLibraryDragOver: (e: React.DragEvent) => void
  handleLibraryDrop: (e: React.DragEvent) => Promise<void>
  handleResetView: () => void
} {
  const { containerRef, panRef, zoomRef, applyTransform, map, currentFloor } = args

  // Library drag-and-drop: monsters from library → map tokens
  const handleLibraryDragOver = useCallback((e: React.DragEvent) => {
    if (hasLibraryDrag(e)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: pan/zoom/container refs are stable (useRef); re-create only on map/currentFloor (preserves original MapCanvas deps)
  const handleLibraryDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      const payload = getDragPayload(e)
      if (payload?.type !== 'library-monster' || !map) return

      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
      const worldX = (canvasX - panRef.current.x) / zoomRef.current
      const worldY = (canvasY - panRef.current.y) / zoomRef.current
      const cellSize = map.grid.cellSize
      const gridX = Math.floor(worldX / cellSize)
      const gridY = Math.floor(worldY / cellSize)

      const { loadAllStatBlocks } = await import('../../../../services/data-provider')
      const allMonsters = await loadAllStatBlocks()
      const monster = allMonsters.find((m) => m.id === payload.itemId)
      if (!monster) return
      const tokenData = monsterToTokenData(monster)
      useGameStore
        .getState()
        .addToken(map.id, { ...tokenData, id: crypto.randomUUID(), gridX, gridY, floor: currentFloor })
    },
    [map, currentFloor]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: container/pan/zoom refs are stable (useRef); re-create only on applyTransform/map (preserves original MapCanvas deps)
  const handleResetView = useCallback((): void => {
    // COVER-fit: scale the map so it FILLS the viewport (max ratio), then center it, so
    // Reset View never leaves the dark background showing across the map. Panning past the
    // edge into the void afterwards is still allowed. Falls back to (1.0, 0, 0) when the
    // container or map dimensions aren't measurable yet.
    const el = containerRef.current
    if (el && map && map.width > 0 && map.height > 0) {
      const vw = el.clientWidth
      const vh = el.clientHeight
      if (vw > 0 && vh > 0) {
        const scale = Math.max(vw / map.width, vh / map.height)
        const newZoom = scale > 0 ? scale : 1
        zoomRef.current = newZoom
        panRef.current = {
          x: (vw - map.width * newZoom) / 2,
          y: (vh - map.height * newZoom) / 2
        }
        applyTransform()
        return
      }
    }
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    applyTransform()
  }, [applyTransform, map])

  return { handleLibraryDragOver, handleLibraryDrop, handleResetView }
}
