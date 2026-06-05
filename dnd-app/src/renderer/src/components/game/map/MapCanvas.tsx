import 'pixi.js/unsafe-eval' // CSP-compatible PixiJS shaders (must be before any pixi usage)
import { Application, Assets, type Container, type Graphics, type Sprite } from 'pixi.js'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LIGHT_SOURCES } from '../../../data/light-sources'
import { useT } from '../../../i18n'
import {
  calculateZoomToFit,
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

import { getTokenStats } from '../../../services/game/token-stats'
import { getPlayerFloor, getTokenFloor } from '../../../services/map/floor-filtering'
import { collectPreloadImagePaths } from '../../../services/map/preload-adjacent'
import { useGameStore } from '../../../stores/use-game-store'
import { logger } from '../../../utils/logger'
import { AudioEmitterLayer } from './audio-emitter-overlay'
import { createCombatAnimationLayer } from './combat-animations'
import { destroyFogAnimation } from './fog-overlay'
import { GRID_HUD_KEY } from './map-canvas/grid-coord'
import {
  useEmptyCellContextMenu,
  useGridHudHover,
  useManualPanStamp,
  usePingOnDoubleClick,
  useResetViewHotkey
} from './map-canvas/map-canvas-hooks'
import type { MapCanvasProps } from './map-canvas/types'
import { useMapBackground } from './map-canvas/use-map-background'
import { useMapCanvasHandlers } from './map-canvas/use-map-canvas-handlers'
import type { MapEventRefs } from './map-event-handlers'
import { clampPanAxis, createWheelHandler, setupKeyboardPan, setupMouseHandlers } from './map-event-handlers'
import { useMapOverlayEffects } from './map-overlay-effects'
import {
  checkWebGLSupport,
  createMapLayers,
  initPixiApp,
  type MapLayers,
  waitForContainerDimensions
} from './map-pixi-setup'
import { clearMeasurement } from './measurement-tool'
import { renderPins } from './pin-layer'
import { safeDestroy } from './pixi-safe-destroy'

// Re-export map-utils functions so they are available to map subsystem consumers
export { calculateZoomToFit, getGridLabel }

import { animateTokenMove, destroyTokenAnimations } from './token-animation'
import { createTokenSprite } from './token-sprite'
import type { WeatherOverlayLayer } from './weather-overlay'

const FloorSelector = lazy(() => import('./FloorSelector'))

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
  onPinClick,
  drawingStrokeWidth,
  drawingColor
}: MapCanvasProps): JSX.Element {
  const { t } = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const gridGraphicsRef = useRef<Graphics | null>(null)
  const gridLabelContainerRef = useRef<Container | null>(null)
  const fogGraphicsRef = useRef<Graphics | null>(null)
  const tokenContainerRef = useRef<Container | null>(null)
  const pinsContainerRef = useRef<Container | null>(null)
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
  // Phase 16a — timestamp of the last manual pan/zoom; auto-pan-on-turn-change is suppressed
  // for 5s after the user manually moves the camera, so it doesn't fight them.
  const lastManualPanAtRef = useRef(0)
  // Phase 16g — hover grid-coordinate readout (toggleable, per-viewer via localStorage).
  const [showGridHud, setShowGridHud] = useState(() => localStorage.getItem(GRID_HUD_KEY) !== 'false')
  const [hoverCoord, setHoverCoord] = useState<string | null>(null)
  // BUG-8 — in-app text input for the map Text tool (Electron disables window.prompt
  // so the old prompt() never appeared). Positioned at the click (container-relative).
  const [drawingTextInput, setDrawingTextInput] = useState<{
    data: import('../../../types/map').DrawingData
    x: number
    y: number
    value: string
  } | null>(null)
  // Phase 16f — fade-to-black transition when the active map changes.
  const prevMapIdRef = useRef<string | undefined>(undefined)
  const [fading, setFading] = useState(false)
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
    const zoom = zoomRef.current
    // Clamp the pan so the map can't be dragged off into the background (the reported
    // WASD bug: holding a pan key slid the map away and let the grey canvas creep over
    // it). Uses the loaded map image's dimensions; no-op until it's loaded.
    const bg = bgSpriteRef.current
    const container = containerRef.current
    if (bg && container && bg.texture.width > 0 && bg.texture.height > 0) {
      panRef.current.x = clampPanAxis(panRef.current.x, bg.texture.width * zoom, container.clientWidth)
      panRef.current.y = clampPanAxis(panRef.current.y, bg.texture.height * zoom, container.clientHeight)
    }
    worldRef.current.scale.set(zoom)
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
      pinsContainerRef.current = layers.pinsContainer
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

  // Load and display map background (extracted to useMapBackground).
  useMapBackground({
    initialized,
    map,
    containerRef,
    worldRef,
    bgSpriteRef,
    zoomRef,
    panRef,
    applyTransform,
    setBgLoadError
  })

  // Phase 16f — brief fade-to-black on active-map change (skipped on first mount + when the
  // viewer prefers reduced motion). The overlay always has a 300ms opacity transition; we flip
  // it on (→black) then off (→clear) for a ~600ms total dip that masks the texture swap.
  useEffect(() => {
    const id = map?.id
    const prev = prevMapIdRef.current
    prevMapIdRef.current = id
    if (prev === undefined || prev === id || !id) return
    const reduce =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    if (reduce) return
    setFading(true)
    const t = setTimeout(() => setFading(false), 300)
    return () => clearTimeout(t)
  }, [map?.id])

  // Phase 16f — preload textures of portal-linked maps so switching to one has no asset-load
  // stutter. Host only (clients receive map data lazily on switch); capped + best-effort.
  const allMaps = useGameStore((s) => s.maps)
  useEffect(() => {
    if (!isHost || !map) return
    for (const path of collectPreloadImagePaths(map, allMaps)) {
      void Assets.load(path).catch(() => {})
    }
  }, [isHost, map, allMaps])

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
      const isOwnToken = !isHost && myCharacterId != null && token.entityId === myCharacterId
      const appearanceKey = `${isSelected},${isActive},${token.label},${token.color ?? ''},${token.currentHP ?? ''},${getTokenStats(token).maxHP ?? ''},${showHpBar},${token.sizeX ?? 1},${token.sizeY ?? 1},${(token.conditions ?? []).join(',')},${lighting},${token.nameVisible ?? ''},${isHost},${isOnCurrentFloor},${JSON.stringify(token.aura ?? null)},${isOwnToken}`
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
        createTokenSprite(
          token,
          map.grid.cellSize,
          isSelected,
          isActive,
          showHpBar,
          lighting,
          isHost,
          cached.sprite,
          myCharacterId
        )
        cache.set(token.id, { sprite: cached.sprite, key })
        continue
      }
      const sprite = createTokenSprite(
        token,
        map.grid.cellSize,
        isSelected,
        isActive,
        showHpBar,
        lighting,
        isHost,
        undefined,
        myCharacterId
      )
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
        safeDestroy(entry.sprite, { children: true })
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

  // Phase 16b — render map pins (filtered by viewer visibility + current floor).
  useEffect(() => {
    const container = pinsContainerRef.current
    if (!initialized || !container || !map) {
      container?.removeChildren().forEach((c) => safeDestroy(c, { children: true }))
      return
    }
    const pins = (map.pins ?? []).filter((p) => {
      if (!isHost && p.visibleToPlayers === false) return false
      return (p.floor ?? 0) === currentFloor
    })
    renderPins(container, pins, map.grid.cellSize, zoomRef.current, onPinClick)
  }, [initialized, map, isHost, currentFloor, onPinClick])

  // Mouse wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return createWheelHandler({ zoom: zoomRef, pan: panRef }, applyTransform)(el)
  }, [applyTransform])

  // Phase 16g — hover grid-coordinate HUD (extracted to useGridHudHover).
  useGridHudHover({ containerRef, panRef, zoomRef }, showGridHud, map, setHoverCoord)

  // Phase 16a — stamp the last manual pan/zoom (extracted to useManualPanStamp).
  useManualPanStamp(containerRef, lastManualPanAtRef, spaceHeldRef)

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
      fogBrushSize,
      onRequestDrawingText: (data, clientX, clientY) => {
        const rect = containerRef.current?.getBoundingClientRect()
        setDrawingTextInput({ data, x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0), value: '' })
      }
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
  const centerViaAutoPan = useGameStore((s) => s.centerViaAutoPan)
  const clearCenterRequest = useGameStore((s) => s.clearCenterRequest)
  useEffect(() => {
    if (!centerOnEntityId || !map || !containerRef.current) return
    // Phase 16a — auto-pan (turn change) is suppressed for 5s after a manual pan/zoom so the
    // camera doesn't fight the user. An explicit "Center on Me" (viaAutoPan === false) ignores this.
    if (centerViaAutoPan && Date.now() - lastManualPanAtRef.current < 5000) {
      clearCenterRequest()
      return
    }
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
  }, [centerOnEntityId, centerViaAutoPan, map, applyTransform, clearCenterRequest])

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
      // React doesn't guarantee cleanup ordering: the parent effect's
      // `app.destroy(true, { children: true })` may run first, nulling the
      // ticker. Calling `.remove()` on a null ticker throws "Cannot read
      // properties of null (reading 'remove')", which the error boundary
      // catches on Solo Play → Return to Lobby (C-2 from QA report).
      app.ticker?.remove(renderPings)
      try {
        gfx.clear()
      } catch {
        // gfx may have been destroyed alongside the app.
      }
    }
  }, [initialized])

  // Double-click to ping at location (extracted to usePingOnDoubleClick).
  usePingOnDoubleClick({ containerRef, panRef, zoomRef }, map, isHost)

  const pendingPlacement = useGameStore((s) => s.pendingPlacement)

  // Library drag-and-drop + reset-view handlers (extracted to useMapCanvasHandlers).
  const { handleLibraryDragOver, handleLibraryDrop, handleResetView } = useMapCanvasHandlers({
    containerRef,
    panRef,
    zoomRef,
    applyTransform,
    map,
    currentFloor
  })

  // Reset map view on the Home key (extracted to useResetViewHotkey).
  useResetViewHotkey(handleResetView)

  // GM-2 — auto-fit the map to the viewport on session start / map switch so the
  // first frame is consistently framed (previously the initial view sometimes
  // opened off-screen at zoom 1, needing a manual Reset View). Ref-guarded to fit
  // once per map id — it frames on load/switch but never stomps the user's later
  // pan/zoom (handleResetView identity changes don't re-fit the same map).
  const lastFittedMapIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!initialized || !map?.id) return
    if (lastFittedMapIdRef.current === map.id) return
    lastFittedMapIdRef.current = map.id
    handleResetView()
  }, [initialized, map?.id, handleResetView])

  // Right-click on empty cell handler, DM only (extracted to useEmptyCellContextMenu).
  useEmptyCellContextMenu({ containerRef, worldRef, panRef, zoomRef }, isHost, onEmptyCellContextMenu, map)

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-surface ${pendingPlacement ? 'cursor-crosshair' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={handleLibraryDragOver}
      onDrop={handleLibraryDrop}
      role="img"
      aria-label={t('game.mapCanvas.canvasLabel')}
    >
      <div ref={containerRef} className="w-full h-full" />
      {/* Phase 16f — map-switch fade overlay (always transitions; opacity flips on map change). */}
      <div
        className="absolute inset-0 z-30 bg-black pointer-events-none transition-opacity duration-300"
        style={{ opacity: fading ? 1 : 0 }}
        aria-hidden="true"
      />
      {/* Phase 16g — hover grid-coordinate readout + its toggle. */}
      {showGridHud && hoverCoord && (
        <div className="absolute bottom-2 right-2 z-20 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none font-mono">
          {hoverCoord}
        </div>
      )}
      {/* BUG-8 — in-app text entry for the Text drawing tool (window.prompt is a
          no-op in Electron). Enter commits the label; Escape / blur cancels. */}
      {drawingTextInput && map && (
        <input
          // Focus via ref (not autoFocus) so the transient at-cursor box is ready to
          // type without tripping the a11y autofocus lint.
          ref={(el) => el?.focus()}
          type="text"
          value={drawingTextInput.value}
          onChange={(e) => setDrawingTextInput({ ...drawingTextInput, value: e.target.value })}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              const text = drawingTextInput.value.trim()
              if (text) useGameStore.getState().addDrawing(map.id, { ...drawingTextInput.data, text })
              setDrawingTextInput(null)
            } else if (e.key === 'Escape') {
              setDrawingTextInput(null)
            }
          }}
          onBlur={() => setDrawingTextInput(null)}
          placeholder={t('game.mapCanvas.enterText')}
          className="absolute z-40 px-2 py-1 text-sm bg-surface border border-accent rounded text-white shadow-lg"
          style={{ left: drawingTextInput.x, top: drawingTextInput.y }}
        />
      )}
      <button
        onClick={() => {
          const next = !showGridHud
          setShowGridHud(next)
          localStorage.setItem(GRID_HUD_KEY, next ? 'true' : 'false')
          if (!next) setHoverCoord(null)
        }}
        title={showGridHud ? t('game.mapCanvas.hideGridCoords') : t('game.mapCanvas.showGridCoords')}
        aria-label={t('game.mapCanvas.toggleGridReadout')}
        className={`absolute bottom-2 left-2 z-20 px-2 py-1 text-xs font-mono rounded cursor-pointer transition-colors ${
          showGridHud ? 'bg-amber-600/70 text-white' : 'bg-black/50 text-muted hover:text-gray-200'
        }`}
      >
        A1
      </button>
      {/* Reset View button lives in GameLayout's top-right control cluster now
          (inline with the other map controls + the gear) instead of as a
          separate `absolute top-3 right-3` element that sat BEHIND the cluster
          and the settings gear. It fires RESET_MAP_VIEW_EVENT, which
          useResetViewHotkey (above) handles via handleResetView. */}
      {isHost && hasMultipleFloors && map?.floors && (
        <Suspense fallback={null}>
          <FloorSelector floors={map.floors} currentFloor={currentFloor} onFloorChange={setCurrentFloor} />
        </Suspense>
      )}
      {pendingPlacement && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-surface/90 border border-cyan-500/60 rounded-lg px-4 py-2 text-xs text-cyan-300 pointer-events-none">
          {t('game.mapCanvas.clickToPlace')}{' '}
          <span className="font-semibold">{pendingPlacement.tokenData.label ?? t('game.mapCanvas.tokenFallback')}</span>
          {t('game.mapCanvas.pressEscPrefix')} <kbd className="px-1 py-0.5 bg-surface-2 rounded text-gray-200">Esc</kbd>
          {t('game.mapCanvas.pressEscSuffix')}
        </div>
      )}
      {initError && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="bg-surface-2 border border-red-500 rounded-lg p-6 max-w-md text-center">
            <p className="text-red-400 font-semibold text-lg mb-2">{t('game.mapCanvas.rendererError')}</p>
            <p className="text-gray-300 text-sm mb-4">{initError}</p>
            <p className="text-gray-500 text-xs mb-4">{t('game.mapCanvas.rendererErrorHint')}</p>
            <button
              className="px-4 py-2 bg-amber-600 hover:bg-accent-strong text-white rounded text-sm"
              onClick={() => {
                setInitError(null)
                setRetryCount((c) => c + 1)
              }}
            >
              {t('game.mapCanvas.retry')}
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
            <p className="text-lg">{t('game.mapCanvas.noMapLoaded')}</p>
            <p className="text-sm mt-1">
              {isHost ? t('game.mapCanvas.useMapSelector') : t('game.mapCanvas.waitingForDm')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
