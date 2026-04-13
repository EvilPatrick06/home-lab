import { type Container, Graphics } from 'pixi.js'
import { canMoveToPosition } from '../../../services/combat/combat-rules'
import { isMovementBlockedByWall } from '../../../services/map/pathfinder'
import { useGameStore } from '../../../stores/use-game-store'
import type { TurnState } from '../../../types/game-state'
import type { GameMap, MapToken } from '../../../types/map'
import { pixelToHex } from './grid-layer'
import { drawMeasurement } from './measurement-tool'
import { findNearbyWallEndpoint, hitTestDoorHandle } from './wall-layer'

// ── Shared ref interfaces ─────────────────────────────────────────────────────

export interface DragState {
  tokenId: string
  startGridX: number
  startGridY: number
  offsetX: number
  offsetY: number
  selectedTokenIds: string[]
  selectedStartPositions: Array<{ tokenId: string; gridX: number; gridY: number }>
}

export interface MapEventRefs {
  zoom: React.MutableRefObject<number>
  pan: React.MutableRefObject<{ x: number; y: number }>
  isPanning: React.MutableRefObject<boolean>
  panStart: React.MutableRefObject<{ x: number; y: number }>
  spaceHeld: React.MutableRefObject<boolean>
  drag: React.MutableRefObject<DragState | null>
  selectionBox: React.MutableRefObject<{ startX: number; startY: number; currentX: number; currentY: number } | null>
  isFogPainting: React.MutableRefObject<boolean>
  lastFogCell: React.MutableRefObject<{ x: number; y: number } | null>
  measureStart: React.MutableRefObject<{ x: number; y: number } | null>
  wallStart: React.MutableRefObject<{ x: number; y: number } | null>
  ghost: React.MutableRefObject<Graphics | null>
  world: React.MutableRefObject<Container | null>
  tokenContainer: React.MutableRefObject<Container | null>
  selectionBoxGraphics: React.MutableRefObject<Graphics | null>
  measureGraphics: React.MutableRefObject<Graphics | null>
  wallGraphics: React.MutableRefObject<Graphics | null>
  drawingStart: React.MutableRefObject<{ x: number; y: number } | null>
  drawingPoints: React.MutableRefObject<Array<{ x: number; y: number }>>
  drawingGraphics: React.MutableRefObject<Graphics | null>
}

type ActiveTool =
  | 'select'
  | 'token'
  | 'fog-reveal'
  | 'fog-hide'
  | 'measure'
  | 'terrain'
  | 'wall'
  | 'fill'
  | 'draw-free'
  | 'draw-line'
  | 'draw-rect'
  | 'draw-circle'
  | 'draw-text'

// ── Wheel zoom ────────────────────────────────────────────────────────────────

export function createWheelHandler(
  refs: Pick<MapEventRefs, 'zoom' | 'pan'>,
  applyTransform: () => void
): (el: HTMLElement) => () => void {
  return (el: HTMLElement) => {
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.25, Math.min(4, refs.zoom.current * zoomFactor))

      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const worldMouseX = (mouseX - refs.pan.current.x) / refs.zoom.current
      const worldMouseY = (mouseY - refs.pan.current.y) / refs.zoom.current

      refs.zoom.current = newZoom
      refs.pan.current.x = mouseX - worldMouseX * newZoom
      refs.pan.current.y = mouseY - worldMouseY * newZoom

      applyTransform()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }
}

// ── Keyboard pan (WASD / Arrow keys) + Space for pan mode ─────────────────────

export function setupKeyboardPan(
  refs: Pick<MapEventRefs, 'spaceHeld' | 'pan'>,
  keysHeld: React.MutableRefObject<Set<string>>,
  panAnimRef: React.MutableRefObject<number>,
  applyTransform: () => void
): () => void {
  const PAN_SPEED = 8
  const PAN_KEYS = new Map([
    ['KeyW', { x: 0, y: PAN_SPEED }],
    ['ArrowUp', { x: 0, y: PAN_SPEED }],
    ['KeyS', { x: 0, y: -PAN_SPEED }],
    ['ArrowDown', { x: 0, y: -PAN_SPEED }],
    ['KeyA', { x: PAN_SPEED, y: 0 }],
    ['ArrowLeft', { x: PAN_SPEED, y: 0 }],
    ['KeyD', { x: -PAN_SPEED, y: 0 }],
    ['ArrowRight', { x: -PAN_SPEED, y: 0 }]
  ])

  const onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement
    const tag = target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (target?.isContentEditable || target?.closest?.('[contenteditable]')) return

    if (e.code === 'Escape') {
      const gs = useGameStore.getState()
      if (gs.pendingPlacement) {
        gs.setPendingPlacement(null)
        return
      }
    }
    if (e.code === 'Space') {
      e.preventDefault()
      refs.spaceHeld.current = true
      return
    }
    if (PAN_KEYS.has(e.code)) {
      e.preventDefault()
      keysHeld.current.add(e.code)
    }
  }

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      refs.spaceHeld.current = false
      return
    }
    keysHeld.current.delete(e.code)
  }

  const animate = (): void => {
    if (keysHeld.current.size > 0) {
      for (const code of keysHeld.current) {
        const delta = PAN_KEYS.get(code)
        if (delta) {
          refs.pan.current.x += delta.x
          refs.pan.current.y += delta.y
        }
      }
      applyTransform()
    }
    panAnimRef.current = requestAnimationFrame(animate)
  }
  panAnimRef.current = requestAnimationFrame(animate)

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    cancelAnimationFrame(panAnimRef.current)
  }
}

// ── Mouse down / move / up handlers ──────────────────────────────────────────

interface MouseHandlerOptions {
  refs: MapEventRefs
  map: GameMap | null
  activeTool: ActiveTool
  isHost: boolean
  isInitiativeMode: boolean | undefined
  turnState: TurnState | null | undefined
  selectedTokenIds: string[]
  applyTransform: () => void
  onTokenMove: (tokenId: string, gridX: number, gridY: number) => void
  onTokenSelect: (tokenIds: string[]) => void
  onCellClick: (gridX: number, gridY: number) => void
  onWallPlace?: (x1: number, y1: number, x2: number, y2: number) => void
  onDoorToggle?: (wallId: string) => void
  renderTokens: () => void
  drawingStrokeWidth?: number
  drawingColor?: string
  fogBrushSize?: number
}

export function setupMouseHandlers(el: HTMLElement, opts: MouseHandlerOptions): () => void {
  const {
    refs,
    map,
    activeTool,
    isHost,
    isInitiativeMode,
    turnState,
    selectedTokenIds,
    applyTransform,
    drawingStrokeWidth = 3,
    drawingColor = '#ffffff',
    fogBrushSize = 1
  } = opts
  const { onTokenMove, onTokenSelect, onCellClick, onWallPlace, onDoorToggle, renderTokens } = opts

  const onMouseDown = (e: MouseEvent): void => {
    // Middle button or space+left for panning
    if (e.button === 1 || (e.button === 0 && refs.spaceHeld.current)) {
      refs.isPanning.current = true
      refs.panStart.current = { x: e.clientX - refs.pan.current.x, y: e.clientY - refs.pan.current.y }
      e.preventDefault()
      return
    }

    if (e.button === 0 && !refs.spaceHeld.current && map) {
      const rect = el.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
      const worldX = (canvasX - refs.pan.current.x) / refs.zoom.current
      const worldY = (canvasY - refs.pan.current.y) / refs.zoom.current
      const gridX = Math.floor((worldX - (map.grid.offsetX % map.grid.cellSize)) / map.grid.cellSize)
      const gridY = Math.floor((worldY - (map.grid.offsetY % map.grid.cellSize)) / map.grid.cellSize)

      if (activeTool === 'measure') {
        if (!refs.measureStart.current) {
          refs.measureStart.current = { x: worldX, y: worldY }
        }
        return
      }

      if (activeTool === 'fog-reveal' || activeTool === 'fog-hide') {
        refs.isFogPainting.current = true
        refs.lastFogCell.current = { x: gridX, y: gridY }
        // Paint all cells within the brush radius
        const halfBrush = Math.floor(fogBrushSize / 2)
        for (let dx = -halfBrush; dx <= halfBrush; dx++) {
          for (let dy = -halfBrush; dy <= halfBrush; dy++) {
            onCellClick(gridX + dx, gridY + dy)
          }
        }
        return
      }

      if (activeTool === 'wall') {
        let snapX = Math.round((worldX - map.grid.offsetX) / map.grid.cellSize)
        let snapY = Math.round((worldY - map.grid.offsetY) / map.grid.cellSize)
        const existingWalls = map.wallSegments ?? []
        const nearby = findNearbyWallEndpoint(snapX, snapY, existingWalls)
        if (nearby) {
          snapX = nearby.x
          snapY = nearby.y
        }

        if (!refs.wallStart.current) {
          refs.wallStart.current = { x: snapX, y: snapY }
        } else {
          const start = refs.wallStart.current
          if (start.x !== snapX || start.y !== snapY) {
            onWallPlace?.(start.x, start.y, snapX, snapY)
          }
          refs.wallStart.current = null
          if (refs.wallGraphics.current) refs.wallGraphics.current.clear()
        }
        return
      }

      // Drawing tools
      if (activeTool.startsWith('draw-')) {
        if (!refs.drawingStart.current) {
          refs.drawingStart.current = { x: worldX, y: worldY }
          refs.drawingPoints.current = [{ x: worldX, y: worldY }]
        }
        return
      }

      // Click-to-place token
      const pending = useGameStore.getState().pendingPlacement
      if (pending && map) {
        useGameStore.getState().commitPlacement(map.id, gridX, gridY)
        return
      }

      if (activeTool === 'token' || activeTool === 'terrain') {
        onCellClick(gridX, gridY)
        return
      }

      // Door toggle: DM clicks on a door handle to open/close it
      if (activeTool === 'select' && isHost && onDoorToggle) {
        const walls = map.wallSegments ?? []
        if (walls.length > 0) {
          const doorWall = hitTestDoorHandle(worldX, worldY, walls, map.grid)
          if (doorWall) {
            onDoorToggle(doorWall.id)
            return
          }
        }
      }

      if (activeTool === 'select' && !refs.drag.current) {
        // Start selection box if clicking on empty space
        refs.selectionBox.current = { startX: worldX, startY: worldY, currentX: worldX, currentY: worldY }
        onTokenSelect([])
      }
    }
  }

  const onMouseMove = (e: MouseEvent): void => {
    if (refs.isPanning.current) {
      refs.pan.current.x = e.clientX - refs.panStart.current.x
      refs.pan.current.y = e.clientY - refs.panStart.current.y
      applyTransform()
      return
    }

    // Fog painting (click-and-drag)
    if (refs.isFogPainting.current && map) {
      const rect = el.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
      const worldX = (canvasX - refs.pan.current.x) / refs.zoom.current
      const worldY = (canvasY - refs.pan.current.y) / refs.zoom.current
      const gx = Math.floor((worldX - (map.grid.offsetX % map.grid.cellSize)) / map.grid.cellSize)
      const gy = Math.floor((worldY - (map.grid.offsetY % map.grid.cellSize)) / map.grid.cellSize)
      if (!refs.lastFogCell.current || refs.lastFogCell.current.x !== gx || refs.lastFogCell.current.y !== gy) {
        refs.lastFogCell.current = { x: gx, y: gy }
        // Paint all cells within the brush radius
        const halfBrush = Math.floor(fogBrushSize / 2)
        for (let dx = -halfBrush; dx <= halfBrush; dx++) {
          for (let dy = -halfBrush; dy <= halfBrush; dy++) {
            onCellClick(gx + dx, gy + dy)
          }
        }
      }
      return
    }

    // Selection box dragging
    if (refs.selectionBox.current && !refs.drag.current && refs.selectionBoxGraphics.current) {
      const rect = el.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
      const worldX = (canvasX - refs.pan.current.x) / refs.zoom.current
      const worldY = (canvasY - refs.pan.current.y) / refs.zoom.current

      refs.selectionBox.current.currentX = worldX
      refs.selectionBox.current.currentY = worldY

      // Draw selection box
      const box = refs.selectionBox.current
      const graphics = refs.selectionBoxGraphics.current
      graphics.clear()
      graphics.setStrokeStyle({ width: 2, color: 0x00ff00, alpha: 0.8 })
      graphics.setFillStyle({ color: 0x00ff00, alpha: 0.1 })
      const minX = Math.min(box.startX, box.currentX)
      const minY = Math.min(box.startY, box.currentY)
      const width = Math.abs(box.currentX - box.startX)
      const height = Math.abs(box.currentY - box.startY)
      graphics.rect(minX, minY, width, height)
      graphics.fill()
      graphics.stroke()
    }

    // Token dragging
    if (refs.drag.current && map && refs.world.current) {
      const rect = el.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
      const worldX = (canvasX - refs.pan.current.x) / refs.zoom.current
      const worldY = (canvasY - refs.pan.current.y) / refs.zoom.current

      // Move all selected tokens by the same delta
      const deltaX = worldX - refs.drag.current.offsetX - refs.drag.current.startGridX * map.grid.cellSize
      const deltaY = worldY - refs.drag.current.offsetY - refs.drag.current.startGridY * map.grid.cellSize

      refs.drag.current.selectedTokenIds.forEach((tokenId) => {
        const tokenSprite = refs.tokenContainer.current?.children.find((c) => c.label === `token-${tokenId}`)
        if (tokenSprite) {
          const startPos = refs.drag.current!.selectedStartPositions.find((p) => p.tokenId === tokenId)
          if (startPos) {
            tokenSprite.x = startPos.gridX * map.grid.cellSize + deltaX
            tokenSprite.y = startPos.gridY * map.grid.cellSize + deltaY
          }
        }
      })
    }

    // Ghost token for click-to-place and fog brush preview
    handleCursorPreview(e, el, refs, map, activeTool, fogBrushSize)

    // Measurement tool
    if (refs.measureStart.current && refs.measureGraphics.current && map) {
      const rect = el.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
      const worldX = (canvasX - refs.pan.current.x) / refs.zoom.current
      const worldY = (canvasY - refs.pan.current.y) / refs.zoom.current
      const diagonalRule = useGameStore.getState().diagonalRule

      drawMeasurement(
        refs.measureGraphics.current,
        refs.measureStart.current,
        { x: worldX, y: worldY },
        map.grid.cellSize,
        {
          gridType: map.grid.type,
          offsetX: map.grid.offsetX,
          offsetY: map.grid.offsetY,
          diagonalRule
        }
      )
    }

    // Drawing tools (live preview)
    if (refs.drawingStart.current && activeTool.startsWith('draw-') && refs.drawingGraphics.current) {
      const rect = el.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
      const worldX = (canvasX - refs.pan.current.x) / refs.zoom.current
      const worldY = (canvasY - refs.pan.current.y) / refs.zoom.current

      // Add point to drawing path for free drawing
      if (activeTool === 'draw-free') {
        refs.drawingPoints.current.push({ x: worldX, y: worldY })
      } else if (['draw-line', 'draw-rect', 'draw-circle'].includes(activeTool)) {
        // For shapes, update the end point
        refs.drawingPoints.current = [refs.drawingStart.current, { x: worldX, y: worldY }]
      }

      // Render live preview
      const gfx = refs.drawingGraphics.current
      gfx.clear()
      const color = Number(drawingColor.replace('#', '0x')) || 0xffffff
      gfx.setStrokeStyle({ width: drawingStrokeWidth, color, alpha: 0.6 })

      if (activeTool === 'draw-free' && refs.drawingPoints.current.length > 1) {
        const pts = refs.drawingPoints.current
        gfx.moveTo(pts[0]!.x, pts[0]!.y)
        for (let i = 1; i < pts.length; i++) {
          gfx.lineTo(pts[i]!.x, pts[i]!.y)
        }
        gfx.stroke()
      } else if (activeTool === 'draw-line') {
        const start = refs.drawingStart.current
        gfx.moveTo(start.x, start.y)
        gfx.lineTo(worldX, worldY)
        gfx.stroke()
      } else if (activeTool === 'draw-rect') {
        const start = refs.drawingStart.current
        const w = worldX - start.x
        const h = worldY - start.y
        gfx.rect(start.x, start.y, w, h)
        gfx.stroke()
      } else if (activeTool === 'draw-circle') {
        const start = refs.drawingStart.current
        const dx = worldX - start.x
        const dy = worldY - start.y
        const radius = Math.sqrt(dx * dx + dy * dy)
        gfx.circle(start.x, start.y, radius)
        gfx.stroke()
      }
    }
  }

  const onMouseUp = (e: MouseEvent): void => {
    if (refs.isFogPainting.current) {
      refs.isFogPainting.current = false
      refs.lastFogCell.current = null
      return
    }

    // Finish selection box
    if (refs.selectionBox.current && map && refs.selectionBoxGraphics.current) {
      const box = refs.selectionBox.current

      // Calculate selection bounds in world coordinates
      const minX = Math.min(box.startX, box.currentX)
      const maxX = Math.max(box.startX, box.currentX)
      const minY = Math.min(box.startY, box.currentY)
      const maxY = Math.max(box.startY, box.currentY)

      // Find tokens within the selection box
      const selectedTokenIds: string[] = []
      for (const token of map.tokens) {
        const tokenCenterX = token.gridX * map.grid.cellSize + (token.sizeX * map.grid.cellSize) / 2
        const tokenCenterY = token.gridY * map.grid.cellSize + (token.sizeY * map.grid.cellSize) / 2
        const tokenRadius = (Math.min(token.sizeX, token.sizeY) * map.grid.cellSize) / 2

        // Check if token center is within selection box (with some tolerance for token size)
        if (
          tokenCenterX + tokenRadius >= minX &&
          tokenCenterX - tokenRadius <= maxX &&
          tokenCenterY + tokenRadius >= minY &&
          tokenCenterY - tokenRadius <= maxY
        ) {
          selectedTokenIds.push(token.id)
        }
      }

      // Update selection
      onTokenSelect(selectedTokenIds)

      // Clear selection box
      refs.selectionBoxGraphics.current.clear()
      refs.selectionBox.current = null
      return
    }

    // Finish drawing
    if (refs.drawingStart.current && activeTool.startsWith('draw-')) {
      const drawingData = {
        id: crypto.randomUUID(),
        type: activeTool as 'draw-free' | 'draw-line' | 'draw-rect' | 'draw-circle' | 'draw-text',
        points: refs.drawingPoints.current,
        color: drawingColor,
        strokeWidth: drawingStrokeWidth,
        visibleToPlayers: true // All drawings are visible by default
      }

      // For text tool, prompt for text input
      if (activeTool === 'draw-text') {
        const text = prompt('Enter text:')
        if (text?.trim()) {
          drawingData.text = text.trim()
          useGameStore.getState().addDrawing(map!.id, drawingData)
        }
      } else {
        useGameStore.getState().addDrawing(map!.id, drawingData)
      }

      // Reset drawing state
      refs.drawingStart.current = null
      refs.drawingPoints.current = []
      if (refs.drawingGraphics.current) {
        refs.drawingGraphics.current.clear()
      }
      return
    }

    if (refs.isPanning.current) {
      refs.isPanning.current = false
      return
    }

    // Finish token drag - snap to grid
    if (refs.drag.current && map) {
      const rect = el.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
      const worldX = (canvasX - refs.pan.current.x) / refs.zoom.current
      const worldY = (canvasY - refs.pan.current.y) / refs.zoom.current

      // Calculate the delta movement from the primary dragged token
      const primaryToken = map.tokens.find((t) => t.id === refs.drag.current!.tokenId)
      if (!primaryToken) {
        refs.drag.current = null
        return
      }

      let primaryNewGridX: number
      let primaryNewGridY: number
      const gridType = map.grid.type
      if (gridType === 'gridless') {
        primaryNewGridX = (worldX - refs.drag.current.offsetX) / map.grid.cellSize
        primaryNewGridY = (worldY - refs.drag.current.offsetY) / map.grid.cellSize
      } else if (gridType === 'hex' || gridType === 'hex-flat' || gridType === 'hex-pointy') {
        const orientation = gridType === 'hex-pointy' ? 'pointy' : 'flat'
        const hex = pixelToHex(
          worldX - refs.drag.current.offsetX,
          worldY - refs.drag.current.offsetY,
          map.grid.cellSize,
          map.grid.offsetX,
          map.grid.offsetY,
          orientation
        )
        primaryNewGridX = hex.col
        primaryNewGridY = hex.row
      } else {
        primaryNewGridX = Math.round((worldX - refs.drag.current.offsetX) / map.grid.cellSize)
        primaryNewGridY = Math.round((worldY - refs.drag.current.offsetY) / map.grid.cellSize)
      }

      // Calculate delta from primary token's original position
      const deltaX = primaryNewGridX - primaryToken.gridX
      const deltaY = primaryNewGridY - primaryToken.gridY

      // Move all selected tokens by the same delta
      refs.drag.current.selectedTokenIds.forEach((tokenId) => {
        const token = map.tokens.find((t) => t.id === tokenId)
        if (!token) return

        const startPos = refs.drag.current!.selectedStartPositions.find((p) => p.tokenId === tokenId)
        if (!startPos) return

        const newGridX = startPos.gridX + deltaX
        const newGridY = startPos.gridY + deltaY

        // Only move if position actually changed
        if (newGridX !== startPos.gridX || newGridY !== startPos.gridY) {
          // Check if walls block this movement (simplified - only check primary token for now)
          const walls = map.wallSegments ?? []
          const movementBlocked =
            walls.length > 0 && isMovementBlockedByWall(startPos.gridX, startPos.gridY, newGridX, newGridY, walls)

          if (!movementBlocked) {
            if (isInitiativeMode && turnState && tokenId === refs.drag.current!.tokenId) {
              // Only apply initiative checks to the primary dragged token
              const moveCheck = canMoveToPosition(
                startPos.gridX,
                startPos.gridY,
                newGridX,
                newGridY,
                turnState,
                map.terrain ?? []
              )
              if (moveCheck.allowed) {
                onTokenMove(tokenId, newGridX, newGridY)
                checkPortalTeleport(map, tokenId, newGridX, newGridY, isHost)
              }
            } else {
              onTokenMove(tokenId, newGridX, newGridY)
              checkPortalTeleport(map, tokenId, newGridX, newGridY, isHost)
            }
          }
        }
      })

      refs.drag.current = null
    }

    // Finish measurement
    if (refs.measureStart.current && activeTool === 'measure') {
      refs.measureStart.current = null
    }
  }

  el.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)

  return () => {
    el.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }
}

// ── Portal helper ────────────────────────────────────────────────────────────

function checkPortalTeleport(
  map: GameMap,
  tokenId: string,
  gridX: number,
  gridY: number,
  isHost: boolean
): void {
  const portal = map.terrain?.find(
    (t) => t.type === 'portal' && t.x === Math.round(gridX) && t.y === Math.round(gridY)
  )
  if (!portal || !portal.portalTarget) return

  const target = portal.portalTarget
  const gs = useGameStore.getState()

  // Teleport token
  gs.teleportToken(tokenId, map.id, target.mapId, target.gridX, target.gridY)

  // Deselect it just in case
  gs.removeFromSelection(tokenId)

  if (isHost && map.id !== target.mapId) {
    if (window.confirm('Token entered portal. Switch to target map?')) {
      gs.setActiveMap(target.mapId)
    }
  }
}

// ── Ghost token helper ───────────────────────────────────────────────────────

function handleCursorPreview(
  e: MouseEvent,
  el: HTMLElement,
  refs: Pick<MapEventRefs, 'pan' | 'zoom' | 'ghost' | 'world'>,
  map: GameMap | null,
  activeTool: ActiveTool,
  fogBrushSize: number
): void {
  const pending = useGameStore.getState().pendingPlacement
  if (!map || !refs.world.current) return

  const rect = el.getBoundingClientRect()
  const canvasX = e.clientX - rect.left
  const canvasY = e.clientY - rect.top
  const worldX = (canvasX - refs.pan.current.x) / refs.zoom.current
  const worldY = (canvasY - refs.pan.current.y) / refs.zoom.current
  const gx = Math.floor((worldX - (map.grid.offsetX % map.grid.cellSize)) / map.grid.cellSize)
  const gy = Math.floor((worldY - (map.grid.offsetY % map.grid.cellSize)) / map.grid.cellSize)

  if (pending || activeTool === 'fog-hide' || activeTool === 'fog-reveal') {
    if (!refs.ghost.current) {
      refs.ghost.current = new Graphics()
      refs.ghost.current.alpha = 0.5
      refs.world.current.addChild(refs.ghost.current)
    }
    const g = refs.ghost.current
    g.clear()

    if (pending) {
      const sizeX = pending.tokenData.sizeX ?? 1
      const sizeY = pending.tokenData.sizeY ?? 1
      const px = (gx + map.grid.offsetX / map.grid.cellSize) * map.grid.cellSize
      const py = (gy + map.grid.offsetY / map.grid.cellSize) * map.grid.cellSize
      g.circle(
        px + (sizeX * map.grid.cellSize) / 2,
        py + (sizeY * map.grid.cellSize) / 2,
        (Math.min(sizeX, sizeY) * map.grid.cellSize) / 2 - 2
      )
      g.fill({ color: 0x22d3ee, alpha: 0.4 })
      g.stroke({ color: 0x22d3ee, width: 2, alpha: 0.8 })
    } else if (activeTool === 'fog-hide' || activeTool === 'fog-reveal') {
      const px = (gx + map.grid.offsetX / map.grid.cellSize) * map.grid.cellSize + map.grid.cellSize / 2
      const py = (gy + map.grid.offsetY / map.grid.cellSize) * map.grid.cellSize + map.grid.cellSize / 2
      const radius = Math.max(1, fogBrushSize) * map.grid.cellSize * 0.5
      g.circle(px, py, radius)
      g.fill({ color: activeTool === 'fog-reveal' ? 0xffffff : 0x000000, alpha: 0.4 })
      g.stroke({ color: activeTool === 'fog-reveal' ? 0xffffff : 0x888888, width: 2, alpha: 0.8 })
    }
  } else if (refs.ghost.current) {
    refs.ghost.current.clear()
  }
}

// ── Token context menu helper ────────────────────────────────────────────────

export function handleTokenRightClick(
  e: { stopPropagation: () => void; global: { x: number; y: number } },
  token: MapToken,
  mapId: string,
  containerEl: HTMLElement | null,
  onTokenContextMenu?: (x: number, y: number, token: MapToken, mapId: string) => void
): void {
  e.stopPropagation()
  if (!onTokenContextMenu) return
  const canvas = containerEl?.querySelector('canvas')
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const screenX = e.global.x + rect.left
  const screenY = e.global.y + rect.top
  onTokenContextMenu(screenX, screenY, token, mapId)
}
