import 'pixi.js/unsafe-eval' // CSP-compatible PixiJS shaders (must be before any pixi usage)
import { Application, Assets, type Container, type Graphics, Sprite } from 'pixi.js'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LIGHT_SOURCES } from '../../../data/light-sources'
import {
  calculateZoomToFit,
  createPing,
  getActivePings,
  getGridLabel,
  getPingAnimation,
  type MapPing
} from '../../../services/map/map-utils'

type _MapPing = MapPing

import {
  buildVisionSet,
  getLightingAtPoint,
  isTokenInVisionSet,
  type PartyVisionResult,
  type Point,
  type Segment,
  type VisibilityPolygon
} from '../../../services/map/vision-computation'

type _PartyVisionResult = PartyVisionResult
type _Point = Point
type _Segment = Segment
type _VisibilityPolygon = VisibilityPolygon

import { getDragPayload, hasLibraryDrag } from '../../../services/library/drag-data'
import { getPlayerFloor, getTokenFloor } from '../../../services/map/floor-filtering'
import { monsterToTokenData } from '../../../services/map/monster-to-token'
import { useGameStore } from '../../../stores/use-game-store'
import type { TurnState } from '../../../types/game-state'
import type { GameMap, MapToken } from '../../../types/map'
import { logger } from '../../../utils/logger'
import type { AoEConfig } from './aoe-overlay'
import { AudioEmitterLayer } from './audio-emitter-overlay'
import { createCombatAnimationLayer } from './combat-animations'
import { destroyFogAnimation } from './fog-overlay'
import type { MapEventRefs } from './map-event-handlers'
import { createWheelHandler, setupKeyboardPan, setupMouseHandlers } from './map-event-handlers'
import { useMapOverlayEffects } from './map-overlay-effects'
import {
  checkWebGLSupport,
  createMapLayers,
  initPixiApp,
  type MapLayers,
  waitForContainerDimensions
} from './map-pixi-setup'
import { clearMeasurement } from './measurement-tool'

// Re-export map-utils functions so they are available to map subsystem consumers
export { calculateZoomToFit, getGridLabel }

import { animateTokenMove, destroyTokenAnimations } from './token-animation'
import { createTokenSprite } from './token-sprite'
import type { WeatherOverlayLayer } from './weather-overlay'

const FloorSelector = lazy(() => import('./FloorSelector'))

interface MapCanvasProps {
  map: GameMap | null
  isHost: boolean
  myCharacterId?: string | null
  selectedTokenIds: string[]
  activeTool:
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
  drawingStrokeWidth?: number
  drawingColor?: string
  fogBrushSize: number
  onTokenMove: (tokenId: string, gridX: number, gridY: number) => void
  onTokenSelect: (tokenIds: string[]) => void
  onCellClick: (gridX: number, gridY: number) => void
  onWallPlace?: (x1: number, y1: number, x2: number, y2: number) => void
  onDoorToggle?: (wallId: string) => void
  turnState?: TurnState | null
  isInitiativeMode?: boolean
  activeAoE?: AoEConfig | null
  /** Entity ID of the creature whose turn it is (for active turn glow) */
  activeEntityId?: string | null
  /** Callback for right-click on a token (context menu) */
  onTokenContextMenu?: (x: number, y: number, token: MapToken, mapId: string, selectedTokenIds: string[]) => void
  /** Callback for right-click on an empty cell (DM only) */
  onEmptyCellContextMenu?: (gridX: number, gridY: number, screenX: number, screenY: number) => void
}

export default function MapCanvas({
  map,
  isHost,
  myCharacterId,
  selectedTokenIds,
  activeTool,
  fogBrushSize,
  onTokenMove,
  onTokenSelect,
  onCellClick,
  onWallPlace,
  onDoorToggle,
  turnState,
  isInitiativeMode,
  activeAoE,
  activeEntityId,
  onTokenContextMenu,
  onEmptyCellContextMenu,
  drawingStrokeWidth,
  drawingColor
}: MapCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const gridGraphicsRef = useRef<Graphics | null>(null)
  const gridLabelContainerRef = useRef<Container | null>(null)
  const fogGraphicsRef = useRef<Graphics | null>(null)
  const tokenContainerRef = useRef<Container | null>(null)
  const selectionBoxGraphicsRef = useRef<Graphics | null>(null)
  const pingGraphicsRef = useRef<Graphics | null>(null)
  const measureGraphicsRef = useRef<Graphics | null>(null)
  const moveOverlayRef = useRef<Graphics | null>(null)
  const drawingGraphicsRef = useRef<Graphics | null>(null)
  const terrainOverlayRef = useRef<Graphics | null>(null)
  const regionGraphicsRef = useRef<Graphics | null>(null)
  const aoeOverlayRef = useRef<Graphics | null>(null)
  const bgSpriteRef = useRef<Sprite | null>(null)
  const weatherOverlayRef = useRef<WeatherOverlayLayer | null>(null)
  const combatAnimLayerRef = useRef<{ container: Container; destroy: () => void } | null>(null)
  const audioEmitterLayerRef = useRef<AudioEmitterLayer | null>(null)
  const occlusionContainerRef = useRef<Container | null>(null)
  const tokenSpriteMapRef = useRef(new Map<string, { sprite: Container; key: string }>())

  // Pan and zoom state
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const spaceHeldRef = useRef(false)

  // Dragging tokens
  const dragRef = useRef<{
    tokenId: string
    startGridX: number
    startGridY: number
    offsetX: number
    offsetY: number
    selectedTokenIds: string[]
    selectedStartPositions: Array<{ tokenId: string; gridX: number; gridY: number }>
  } | null>(null)

  // Selection box
  const selectionBoxRef = useRef<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)

  // Fog painting state
  const isFogPaintingRef = useRef(false)
  const lastFogCellRef = useRef<{ x: number; y: number } | null>(null)

  // Measurement / Wall / Ghost
  const measureStartRef = useRef<{ x: number; y: number } | null>(null)
  const wallStartRef = useRef<{ x: number; y: number } | null>(null)
  const wallGraphicsRef = useRef<Graphics | null>(null)
  const lightingGraphicsRef = useRef<Graphics | null>(null)
  const ghostRef = useRef<Graphics | null>(null)

  // Drawing refs
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null)
  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([])

  const [initialized, setInitialized] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [_retryCount, setRetryCount] = useState(0)
  const [bgLoadError, setBgLoadError] = useState<string | null>(null)

  const currentFloor = useGameStore((s) => s.currentFloor)
  const setCurrentFloor = useGameStore((s) => s.setCurrentFloor)

  const applyTransform = useCallback(() => {
    if (!worldRef.current) return
    worldRef.current.scale.set(zoomRef.current)
    worldRef.current.x = panRef.current.x
    worldRef.current.y = panRef.current.y
  }, [])

  // Initialize PixiJS
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    const app = new Application()
    appRef.current = app

    const initApp = async (): Promise<void> => {
      const webglError = checkWebGLSupport()
      if (webglError) {
        if (!cancelled) setInitError(webglError)
        return
      }
      if (cancelled) return
      const container = containerRef.current!
      const ready = await waitForContainerDimensions(container, () => cancelled)
      if (!ready) {
        if (!cancelled) setInitError('Map container has zero dimensions. Try resizing the window.')
        return
      }
      if (cancelled) return
      logger.debug(`[MapCanvas] Container dimensions: ${container.clientWidth}x${container.clientHeight}`)
      try {
        await initPixiApp(app, container)
      } catch (err) {
        const msg = (err as Error).message || String(err)
        if (!cancelled) setInitError(`PixiJS init failed: ${msg}`)
        logger.error('[MapCanvas] PixiJS init failed:', err)
        return
      }
      if (cancelled) {
        try {
          app.destroy(true, { children: true })
        } catch {
          /* */
        }
        return
      }
      logger.debug('[MapCanvas] PixiJS initialized successfully')
      container.appendChild(app.canvas)
      const layers: MapLayers = createMapLayers(app)
      worldRef.current = layers.world
      gridGraphicsRef.current = layers.gridGraphics
      gridLabelContainerRef.current = layers.gridLabelContainer
      terrainOverlayRef.current = layers.terrainOverlay
      regionGraphicsRef.current = layers.regionGraphics
      drawingGraphicsRef.current = layers.drawingGraphics
      moveOverlayRef.current = layers.moveOverlay
      aoeOverlayRef.current = layers.aoeOverlay
      tokenContainerRef.current = layers.tokenContainer
      occlusionContainerRef.current = layers.occlusionContainer
      selectionBoxGraphicsRef.current = layers.selectionBoxGraphics
      pingGraphicsRef.current = layers.pingGraphics
      fogGraphicsRef.current = layers.fogGraphics
      lightingGraphicsRef.current = layers.lightingGraphics
      wallGraphicsRef.current = layers.wallGraphics
      measureGraphicsRef.current = layers.measureGraphics
      weatherOverlayRef.current = layers.weatherOverlay
      const combatLayer = createCombatAnimationLayer(app)
      layers.world.addChild(combatLayer.container)
      combatAnimLayerRef.current = combatLayer
      const audioEmitterLayer = new AudioEmitterLayer()
      audioEmitterLayer.onToggle((emitterId) => {
        const state = useGameStore.getState()
        const activeMapId = state.activeMapId
        if (activeMapId) {
          state.toggleEmitterPlaying(activeMapId, emitterId)
        }
      })
      layers.world.addChild(audioEmitterLayer.getContainer())
      audioEmitterLayerRef.current = audioEmitterLayer
      setInitialized(true)
      setInitError(null)
    }
    initApp()
    return () => {
      cancelled = true
      combatAnimLayerRef.current?.destroy()
      combatAnimLayerRef.current = null
      audioEmitterLayerRef.current?.destroy()
      audioEmitterLayerRef.current = null
      if (weatherOverlayRef.current) {
        weatherOverlayRef.current.destroy()
        weatherOverlayRef.current = null
      }
      destroyFogAnimation()
      destroyTokenAnimations()
      try {
        app.destroy(true, { children: true })
      } catch {
        /* */
      }
      appRef.current = null
      worldRef.current = null
      setInitialized(false)
    }
  }, [])

  // Handle window resize
  useEffect(() => {
    const handleResize = (): void => {
      appRef.current?.resize()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Load and display map background
  useEffect(() => {
    if (!initialized || !worldRef.current) return
    const loadBg = async (): Promise<void> => {
      if (bgSpriteRef.current) {
        worldRef.current?.removeChild(bgSpriteRef.current)
        bgSpriteRef.current.destroy({ children: true, texture: true })
        bgSpriteRef.current = null
      }
      if (!map?.imagePath) return
      try {
        const resolvedUrl = new URL(map.imagePath, window.location.href).href
        logger.debug('[MapCanvas] Loading background image:', resolvedUrl)
        const texture = await Assets.load(map.imagePath)
        if (texture.source) texture.source.scaleMode = 'nearest'
        const sprite = new Sprite(texture)
        sprite.label = 'bg'
        worldRef.current?.addChildAt(sprite, 0)
        bgSpriteRef.current = sprite
        setBgLoadError(null)
        const container = containerRef.current
        if (container && sprite.texture.width > 0) {
          const cw = container.clientWidth,
            ch = container.clientHeight
          const mw = sprite.texture.width,
            mh = sprite.texture.height
          const scale = Math.min(cw / mw, ch / mh, 1)
          zoomRef.current = scale
          panRef.current = { x: (cw - mw * scale) / 2, y: (ch - mh * scale) / 2 }
          applyTransform()
        }
      } catch (err) {
        const msg = `Failed to load map image: ${map.imagePath}`
        logger.warn('[MapCanvas]', msg, err)
        setBgLoadError(msg)
      }
    }
    loadBg()
  }, [initialized, map?.imagePath, applyTransform])

  // Clear stale drag/measurement state when tool changes
  useEffect(() => {
    dragRef.current = null
    selectionBoxRef.current = null
    measureStartRef.current = null
    isFogPaintingRef.current = false
    lastFogCellRef.current = null
    if (selectionBoxGraphicsRef.current) {
      selectionBoxGraphicsRef.current.clear()
    }
  }, [])

  // Reset floor when switching maps (avoids stale floor index)
  useEffect(() => {
    if (currentFloor > 0 && (!map?.floors || currentFloor >= map.floors.length)) {
      setCurrentFloor(0)
    }
  }, [map?.floors, currentFloor, setCurrentFloor])

  // Auto-lock players to their character token's floor
  useEffect(() => {
    if (isHost || !map || !myCharacterId) return
    const playerFloor = getPlayerFloor(map.tokens, myCharacterId)
    if (playerFloor !== currentFloor) {
      setCurrentFloor(playerFloor)
    }
  }, [isHost, map?.tokens, myCharacterId, currentFloor, setCurrentFloor, map])

  const hasMultipleFloors = useMemo(() => (map?.floors?.length ?? 0) > 1, [map?.floors?.length])

  // All overlay rendering effects (grid, fog, walls, lighting, terrain, AoE, movement, weather, audio)
  useMapOverlayEffects({
    initialized,
    map,
    isHost,
    selectedTokenId: selectedTokenIds[0] ?? null,
    isInitiativeMode,
    turnState,
    activeAoE,
    currentFloor,
    applyTransform,
    refs: {
      containerRef,
      appRef,
      gridGraphicsRef,
      gridLabelContainerRef,
      fogGraphicsRef,
      wallGraphicsRef,
      lightingGraphicsRef,
      terrainOverlayRef,
      regionGraphicsRef,
      drawingGraphicsRef,
      aoeOverlayRef,
      moveOverlayRef,
      weatherOverlayRef,
      audioEmitterLayerRef,
      occlusionContainerRef,
      bgSpriteRef,
      zoomRef,
      panRef
    }
  })

  // Render tokens (diff-based)
  const hpBarsVisibility = useGameStore((s) => s.hpBarsVisibility)
  const partyVisionCells = useGameStore((s) => s.partyVisionCells)

  const renderTokens = useCallback(() => {
    if (!tokenContainerRef.current || !map) return
    const container = tokenContainerRef.current
    const cache = tokenSpriteMapRef.current
    const showHpBar = hpBarsVisibility === 'all' || (hpBarsVisibility === 'dm-only' && isHost)
    const visibleTokenIds = new Set<string>()

    // Build vision set for dynamic token visibility
    const dynamicFogEnabled = map.fogOfWar.dynamicFogEnabled ?? false
    const visionSet = dynamicFogEnabled && !isHost ? buildVisionSet(partyVisionCells) : null

    // Build light sources for lighting condition computation
    const ambientLight = useGameStore.getState().ambientLight
    const activeLightSources = useGameStore.getState().activeLightSources
    const tokens = map.tokens ?? []
    const lightSourcesForBadge = activeLightSources.map((ls) => {
      const t = tokens.find((tk) => tk.id === ls.entityId)
      const def = LIGHT_SOURCES[ls.sourceName]
      return {
        x: t?.gridX ?? 0,
        y: t?.gridY ?? 0,
        brightRadius: def ? Math.ceil(def.brightRadius / 5) : 4,
        dimRadius: def ? Math.ceil(def.dimRadius / 5) : 4
      }
    })

    for (const token of map.tokens) {
      const tokenFloor = getTokenFloor(token)
      const isOnCurrentFloor = tokenFloor === currentFloor

      // Players: strictly locked to current floor — skip off-floor tokens entirely
      if (!isHost && !isOnCurrentFloor) continue
      if (!isHost && !token.visibleToPlayers) continue
      // Dynamic vision: hide non-player tokens outside party vision
      if (visionSet && token.entityType !== 'player' && !isTokenInVisionSet(token, visionSet)) continue
      visibleTokenIds.add(token.id)
      const isSelected = selectedTokenIds.includes(token.id)
      const isActive = !!activeEntityId && token.entityId === activeEntityId

      // Compute lighting condition at token center
      const tokenCenter = {
        x: (token.gridX + token.sizeX / 2) * map.grid.cellSize,
        y: (token.gridY + token.sizeY / 2) * map.grid.cellSize
      }
      const lighting = getLightingAtPoint(tokenCenter, lightSourcesForBadge, ambientLight, map.grid.cellSize)

      // Split key: position and appearance are tracked separately for animation
      const posKey = `${token.gridX},${token.gridY}`
      const appearanceKey = `${isSelected},${isActive},${token.label},${token.color ?? ''},${token.currentHP ?? ''},${token.maxHP ?? ''},${showHpBar},${token.sizeX ?? 1},${token.sizeY ?? 1},${(token.conditions ?? []).join(',')},${lighting},${token.nameVisible ?? ''},${isHost},${isOnCurrentFloor},${JSON.stringify(token.aura ?? null)}`
      const key = `${posKey},${appearanceKey}`
      const cached = cache.get(token.id)
      if (cached && cached.key === key) continue

      // If only position changed, animate the existing sprite
      const cachedPosKey = cached?.key.split(',').slice(0, 2).join(',')
      const cachedAppearanceKey = cached?.key.split(',').slice(2).join(',')
      if (cached && cachedPosKey !== posKey && cachedAppearanceKey === appearanceKey && appRef.current) {
        const targetX = token.gridX * map.grid.cellSize
        const targetY = token.gridY * map.grid.cellSize
        animateTokenMove(appRef.current, token.id, cached.sprite, targetX, targetY)
        cache.set(token.id, { sprite: cached.sprite, key })
        continue
      }

      if (cached) {
        // Reuse container, removes children but preserves avatar container if possible
        createTokenSprite(token, map.grid.cellSize, isSelected, isActive, showHpBar, lighting, isHost, cached.sprite)
        cache.set(token.id, { sprite: cached.sprite, key })
        continue
      }
      const sprite = createTokenSprite(token, map.grid.cellSize, isSelected, isActive, showHpBar, lighting, isHost)
      sprite.label = `token-${token.id}`

      // DM: dim off-floor tokens so all floors are visible at a glance
      if (isHost && !isOnCurrentFloor) {
        sprite.alpha = 0.3
      }

      sprite.on('pointerdown', (e) => {
        if (activeTool !== 'select') return
        if (e.button === 2) return
        e.stopPropagation()

        // Handle multi-selection logic
        const isCtrlPressed = e.ctrlKey || e.metaKey
        let newSelection: string[]

        if (isCtrlPressed) {
          // Add/remove from selection
          if (selectedTokenIds.includes(token.id)) {
            // Remove from selection
            newSelection = selectedTokenIds.filter((id) => id !== token.id)
          } else {
            // Add to selection
            newSelection = [...selectedTokenIds, token.id]
          }
        } else {
          // Single selection - clear and select this token
          newSelection = [token.id]
        }

        onTokenSelect(newSelection)

        if (!isHost && token.entityType !== 'player') return
        // Block players from dragging tokens that don't belong to them
        if (!isHost && myCharacterId && token.entityId !== myCharacterId) return

        // Only allow dragging if this token is in the selection
        if (!newSelection.includes(token.id)) return

        const worldPos = worldRef.current?.toLocal(e.global)
        if (!worldPos) return
        // Get starting positions for all selected tokens
        const selectedStartPositions = selectedTokenIds
          .map((tokenId) => {
            const selectedToken = map.tokens.find((t) => t.id === tokenId)
            return selectedToken
              ? {
                  tokenId,
                  gridX: selectedToken.gridX,
                  gridY: selectedToken.gridY
                }
              : null
          })
          .filter(Boolean) as Array<{ tokenId: string; gridX: number; gridY: number }>

        dragRef.current = {
          tokenId: token.id,
          startGridX: token.gridX,
          startGridY: token.gridY,
          offsetX: worldPos.x - token.gridX * map.grid.cellSize,
          offsetY: worldPos.y - token.gridY * map.grid.cellSize,
          selectedTokenIds,
          selectedStartPositions
        }
      })
      sprite.on('rightclick', (e) => {
        e.stopPropagation()
        if (!onTokenContextMenu || !map) return
        const canvas = containerRef.current?.querySelector('canvas')
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        onTokenContextMenu(e.global.x + rect.left, e.global.y + rect.top, token, map.id, selectedTokenIds)
      })
      container.addChild(sprite)
      cache.set(token.id, { sprite, key })
    }
    for (const [tokenId, entry] of cache) {
      if (!visibleTokenIds.has(tokenId)) {
        container.removeChild(entry.sprite)
        entry.sprite.destroy({ children: true })
        cache.delete(tokenId)
      }
    }
  }, [
    map,
    selectedTokenIds,
    isHost,
    myCharacterId,
    activeTool,
    onTokenSelect,
    activeEntityId,
    onTokenContextMenu,
    hpBarsVisibility,
    partyVisionCells,
    currentFloor
  ])

  useEffect(() => {
    if (initialized) renderTokens()
  }, [initialized, renderTokens])

  // Mouse wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return createWheelHandler({ zoom: zoomRef, pan: panRef }, applyTransform)(el)
  }, [applyTransform])

  // Keyboard pan
  const keysHeldRef = useRef(new Set<string>())
  const panAnimRef = useRef<number>(0)
  useEffect(() => {
    return setupKeyboardPan({ spaceHeld: spaceHeldRef, pan: panRef }, keysHeldRef, panAnimRef, applyTransform)
  }, [applyTransform])

  // Mouse events
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const eventRefs: MapEventRefs = {
      zoom: zoomRef,
      pan: panRef,
      isPanning: isPanningRef,
      panStart: panStartRef,
      spaceHeld: spaceHeldRef,
      drag: dragRef,
      selectionBox: selectionBoxRef,
      isFogPainting: isFogPaintingRef,
      lastFogCell: lastFogCellRef,
      measureStart: measureStartRef,
      wallStart: wallStartRef,
      ghost: ghostRef,
      world: worldRef,
      tokenContainer: tokenContainerRef,
      selectionBoxGraphics: selectionBoxGraphicsRef,
      measureGraphics: measureGraphicsRef,
      wallGraphics: wallGraphicsRef,
      drawingStart: drawingStartRef,
      drawingPoints: drawingPointsRef,
      drawingGraphics: drawingGraphicsRef
    }
    return setupMouseHandlers(el, {
      refs: eventRefs,
      map,
      activeTool,
      isHost,
      isInitiativeMode,
      turnState,
      selectedTokenIds,
      applyTransform,
      onTokenMove,
      onTokenSelect,
      onCellClick,
      onWallPlace,
      onDoorToggle,
      renderTokens,
      drawingStrokeWidth,
      drawingColor,
      fogBrushSize
    })
  }, [
    map,
    activeTool,
    isHost,
    applyTransform,
    onTokenMove,
    onTokenSelect,
    onCellClick,
    renderTokens,
    isInitiativeMode,
    onWallPlace,
    onDoorToggle,
    turnState,
    drawingColor,
    drawingStrokeWidth,
    fogBrushSize,
    selectedTokenIds
  ])

  // Clear measurement when tool changes
  useEffect(() => {
    if (activeTool !== 'measure' && measureGraphicsRef.current) {
      clearMeasurement(measureGraphicsRef.current)
      measureStartRef.current = null
    }
  }, [activeTool])

  // Center map on entity
  const centerOnEntityId = useGameStore((s) => s.centerOnEntityId)
  const clearCenterRequest = useGameStore((s) => s.clearCenterRequest)
  useEffect(() => {
    if (!centerOnEntityId || !map || !containerRef.current) return
    const token = map.tokens.find((t) => t.entityId === centerOnEntityId)
    if (!token) {
      clearCenterRequest()
      return
    }
    const cellSize = map.grid.cellSize
    const rect = containerRef.current.getBoundingClientRect()
    panRef.current = {
      x: rect.width / 2 - (token.gridX * cellSize + cellSize / 2) * zoomRef.current,
      y: rect.height / 2 - (token.gridY * cellSize + cellSize / 2) * zoomRef.current
    }
    applyTransform()
    clearCenterRequest()
  }, [centerOnEntityId, map, applyTransform, clearCenterRequest])

  // Ping rendering — animate active pings on the map
  useEffect(() => {
    if (!initialized || !pingGraphicsRef.current || !appRef.current) return
    const gfx = pingGraphicsRef.current
    const app = appRef.current

    const renderPings = (): void => {
      gfx.clear()
      const pings = getActivePings()
      for (const ping of pings) {
        const anim = getPingAnimation(ping)
        if (!anim) continue
        gfx.setStrokeStyle({ width: 3, color: ping.color, alpha: anim.opacity })
        gfx.circle(ping.x, ping.y, 15 * anim.scale)
        gfx.stroke()
        // Inner dot
        gfx.circle(ping.x, ping.y, 4)
        gfx.fill({ color: ping.color, alpha: anim.opacity })
      }
    }

    app.ticker.add(renderPings)
    return () => {
      app.ticker.remove(renderPings)
      gfx.clear()
    }
  }, [initialized])

  // Double-click to ping at location
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
  }, [map, isHost])

  const pendingPlacement = useGameStore((s) => s.pendingPlacement)

  // Library drag-and-drop: monsters from library → map tokens
  const handleLibraryDragOver = useCallback((e: React.DragEvent) => {
    if (hasLibraryDrag(e)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleLibraryDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      const payload = getDragPayload(e)
      if (!payload || payload.type !== 'library-monster' || !map) return

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

      const { loadAllStatBlocks } = await import('../../../services/data-provider')
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

  const handleResetView = useCallback((): void => {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    applyTransform()
  }, [applyTransform])

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

  // Right-click on empty cell handler (DM only)
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
  }, [isHost, onEmptyCellContextMenu, map])

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-gray-900 ${pendingPlacement ? 'cursor-crosshair' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={handleLibraryDragOver}
      onDrop={handleLibraryDrop}
      role="img"
      aria-label="Game map canvas"
    >
      <div ref={containerRef} className="w-full h-full" />
      {map && (
        <button
          onClick={handleResetView}
          title="Reset View (Home)"
          aria-label="Reset map view"
          className="absolute bottom-3 right-3 z-20 px-3 py-1.5 text-xs font-medium
            bg-gray-800/90 border border-gray-700 rounded-lg text-gray-400 hover:text-gray-200
            hover:bg-gray-700 transition-colors cursor-pointer backdrop-blur-sm"
        >
          Reset View
        </button>
      )}
      {isHost && hasMultipleFloors && map?.floors && (
        <Suspense fallback={null}>
          <FloorSelector floors={map.floors} currentFloor={currentFloor} onFloorChange={setCurrentFloor} />
        </Suspense>
      )}
      {pendingPlacement && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-gray-900/90 border border-cyan-500/60 rounded-lg px-4 py-2 text-xs text-cyan-300 pointer-events-none">
          Click to place <span className="font-semibold">{pendingPlacement.tokenData.label ?? 'token'}</span>. Press{' '}
          <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-200">Esc</kbd> to cancel.
        </div>
      )}
      {initError && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="bg-gray-800 border border-red-500 rounded-lg p-6 max-w-md text-center">
            <p className="text-red-400 font-semibold text-lg mb-2">Map Renderer Error</p>
            <p className="text-gray-300 text-sm mb-4">{initError}</p>
            <p className="text-gray-500 text-xs mb-4">
              Try updating your GPU drivers or check the console (Ctrl+Shift+I) for details.
            </p>
            <button
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm"
              onClick={() => {
                setInitError(null)
                setRetryCount((c) => c + 1)
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {bgLoadError && !initError && (
        <div className="absolute top-2 left-2 z-20 bg-yellow-900/90 border border-yellow-600 rounded px-3 py-2 text-yellow-200 text-xs max-w-xs">
          {bgLoadError}
        </div>
      )}
      {!map && !initError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-5xl mb-4">&#9635;</div>
            <p className="text-lg">No map loaded</p>
            <p className="text-sm mt-1">
              {isHost ? 'Use the Map Selector to add a map' : 'Waiting for the DM to load a map'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
