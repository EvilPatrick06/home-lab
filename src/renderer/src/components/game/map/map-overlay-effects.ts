import type { Application, Container, Graphics } from 'pixi.js'
import { useEffect } from 'react'
import { LIGHT_SOURCES } from '../../../data/light-sources'
import { filterDrawingsByFloor, filterTerrainByFloor, filterWallsByFloor } from '../../../services/map/floor-filtering'
import { buildMapLightSources, recomputeVision } from '../../../services/map/vision-computation'
import { useGameStore } from '../../../stores/use-game-store'
import type { TurnState } from '../../../types/game-state'
import type { GameMap } from '../../../types/map'
import { type AoEConfig, clearAoEOverlay, drawAoEOverlay } from './aoe-overlay'
import type { AudioEmitterLayer } from './audio-emitter-overlay'
import { clearDrawingLayer, drawDrawings } from './drawing-layer'
import { destroyFogAnimation, drawFogOfWar, initFogAnimation } from './fog-overlay'
import { drawGrid, drawGridLabels } from './grid-layer'
import {
  getAnimatedRadius,
  hasActiveAnimations,
  installLightAnimationTicker,
  registerLightAnimation
} from './light-animation'
import { drawLightingOverlay, type LightingConfig } from './lighting-overlay'
import { clearMovementOverlay, drawMovementOverlay, drawTerrainOverlay } from './movement-overlay'
import { clearOcclusionLayer, updateOcclusionLayer } from './occlusion-layer'
import { drawRegions } from './region-layer'
import { drawWalls } from './wall-layer'
import { presetToWeatherType, type WeatherOverlayLayer } from './weather-overlay'

// TODO: Add playing state management
export interface OverlayEffectState {
  id: string
  type: 'audio' | 'visual'
  playing: boolean
  startedAt: number
  duration?: number  // ms, undefined = looping
}

const activeEffects = new Map<string, OverlayEffectState>()

export function startEffect(id: string, type: 'audio' | 'visual', duration?: number): void {
  activeEffects.set(id, { id, type, playing: true, startedAt: Date.now(), duration })
}

export function stopEffect(id: string): void {
  activeEffects.delete(id)
}

export function getActiveEffects(): OverlayEffectState[] {
  return Array.from(activeEffects.values())
}

export function isEffectPlaying(id: string): boolean {
  return activeEffects.has(id)
}

/** Refs passed into the overlay effects hook */
export interface OverlayRefs {
  containerRef: React.RefObject<HTMLDivElement | null>
  appRef: React.RefObject<Application | null>
  gridGraphicsRef: React.RefObject<Graphics | null>
  gridLabelContainerRef: React.RefObject<import('pixi.js').Container | null>
  fogGraphicsRef: React.RefObject<Graphics | null>
  wallGraphicsRef: React.RefObject<Graphics | null>
  lightingGraphicsRef: React.RefObject<Graphics | null>
  terrainOverlayRef: React.RefObject<Graphics | null>
  regionGraphicsRef: React.RefObject<Graphics | null>
  drawingGraphicsRef: React.RefObject<Graphics | null>
  aoeOverlayRef: React.RefObject<Graphics | null>
  moveOverlayRef: React.RefObject<Graphics | null>
  weatherOverlayRef: React.RefObject<WeatherOverlayLayer | null>
  audioEmitterLayerRef: React.RefObject<AudioEmitterLayer | null>
  occlusionContainerRef: React.RefObject<Container | null>
  bgSpriteRef: React.RefObject<import('pixi.js').Sprite | null>
  zoomRef: React.MutableRefObject<number>
  panRef: React.MutableRefObject<{ x: number; y: number }>
}

interface OverlayEffectsOptions {
  initialized: boolean
  map: GameMap | null
  isHost: boolean
  selectedTokenId: string | null
  isInitiativeMode?: boolean
  turnState?: TurnState | null
  activeAoE?: AoEConfig | null
  currentFloor: number
  applyTransform: () => void
  refs: OverlayRefs
}

/**
 * Hook that drives all map overlay rendering effects:
 * grid, fog animation, fog draw, walls, lighting, terrain, AoE, movement, weather.
 */
export function useMapOverlayEffects(opts: OverlayEffectsOptions): void {
  const {
    initialized,
    map,
    isHost,
    selectedTokenId,
    isInitiativeMode,
    turnState,
    activeAoE,
    currentFloor,
    applyTransform,
    refs
  } = opts

  // Draw grid
  useEffect(() => {
    if (!initialized || !refs.gridGraphicsRef.current || !map) return
    drawGrid(refs.gridGraphicsRef.current, map.grid, map.width, map.height)

    // Render grid coordinate labels
    if (refs.gridLabelContainerRef.current) {
      drawGridLabels(refs.gridLabelContainerRef.current, map.grid, map.width, map.height, refs.zoomRef.current)
    }

    if (!map.imagePath && !refs.bgSpriteRef.current) {
      const container = refs.containerRef.current
      if (container) {
        const cw = container.clientWidth
        const ch = container.clientHeight
        const scale = Math.min(cw / map.width, ch / map.height, 1)
        refs.zoomRef.current = scale
        refs.panRef.current = {
          x: (cw - map.width * scale) / 2,
          y: (ch - map.height * scale) / 2
        }
        applyTransform()
      }
    }
  }, [initialized, map?.grid, map?.width, map?.height, map?.imagePath, applyTransform, map, refs])

  // Initialize fog animation ticker
  useEffect(() => {
    if (!initialized || !refs.appRef.current || !refs.fogGraphicsRef.current || !map) return
    initFogAnimation(refs.appRef.current, refs.fogGraphicsRef.current, map.grid, map.width, map.height)
    return () => {
      destroyFogAnimation()
    }
  }, [initialized, map?.grid, map?.width, map?.height, refs, map])

  // Draw fog of war
  const partyVisionCells = useGameStore((s) => s.partyVisionCells)
  const activeLightSources = useGameStore((s) => s.activeLightSources)

  useEffect(() => {
    if (!initialized || !refs.fogGraphicsRef.current || !map) return
    refs.fogGraphicsRef.current.alpha = isHost ? 0.3 : 1
    drawFogOfWar(
      refs.fogGraphicsRef.current,
      map.fogOfWar,
      map.grid,
      map.width,
      map.height,
      map.fogOfWar.dynamicFogEnabled ? partyVisionCells : undefined
    )
  }, [initialized, map?.fogOfWar, map?.grid, map?.width, map?.height, isHost, map, refs, partyVisionCells])

  // Draw walls (DM only), filtered by current floor
  useEffect(() => {
    if (!initialized || !refs.wallGraphicsRef.current || !map) return
    const walls = filterWallsByFloor(map.wallSegments ?? [], currentFloor)
    if (isHost && walls.length > 0) {
      drawWalls(refs.wallGraphicsRef.current, walls, map.grid, isHost)
    } else {
      refs.wallGraphicsRef.current.clear()
    }
  }, [initialized, map?.wallSegments, map?.grid, isHost, map, refs, currentFloor])

  // Register light animations whenever active light sources change
  useEffect(() => {
    if (!initialized) return
    const sources = useGameStore.getState().activeLightSources
    const tokens = map?.tokens ?? []

    for (const ls of sources) {
      const token = tokens.find((t) => t.id === ls.entityId)
      if (!token) continue
      const def = LIGHT_SOURCES[ls.sourceName]
      const baseBright = def ? Math.ceil(def.brightRadius / 5) : 4
      const baseDim = def ? Math.ceil(def.dimRadius / 5) : 4
      registerLightAnimation(ls.id, baseBright, baseDim, ls.animation)
    }
  }, [initialized, map?.tokens])

  // Install light animation ticker
  useEffect(() => {
    if (!initialized || !refs.appRef.current) return
    const cleanup = installLightAnimationTicker(refs.appRef.current.ticker)
    return () => {
      cleanup()
    }
  }, [initialized, refs])

  // Draw lighting overlay (floor-filtered walls for shadow casting)
  // Sets up a per-frame redraw when light animations are active.
  useEffect(() => {
    if (!initialized || !refs.lightingGraphicsRef.current || !map) return
    const ambientLight = useGameStore.getState().ambientLight
    const currentActiveLightSources = useGameStore.getState().activeLightSources
    const walls = filterWallsByFloor(map.wallSegments ?? [], currentFloor)

    const darknessZones = map.darknessZones ?? []
    if (walls.length === 0 && ambientLight === 'bright' && darknessZones.length === 0) {
      refs.lightingGraphicsRef.current.clear()
      return
    }

    const tokens = map.tokens ?? []

    const buildLightSources = () => {
      return currentActiveLightSources.map((ls) => {
        const token = tokens.find((t) => t.id === ls.entityId)
        const def = LIGHT_SOURCES[ls.sourceName]
        const baseBright = def ? Math.ceil(def.brightRadius / 5) : 4
        const baseDim = def ? Math.ceil(def.dimRadius / 5) : 4

        // Use animated radii if available
        const animated = getAnimatedRadius(ls.id)
        return {
          x: token?.gridX ?? 0,
          y: token?.gridY ?? 0,
          brightRadius: animated ? animated.brightRadius : baseBright,
          dimRadius: animated ? animated.dimRadius : baseDim
        }
      })
    }

    const viewerTokens = !isHost ? tokens.filter((t) => t.entityType === 'player') : []
    // Build per-token darkvision ranges (in grid cells: feet / 5)
    const tokenDarkvisionRanges = new Map<string, number>()
    for (const t of viewerTokens) {
      const range = t.darkvisionRange ?? (t.darkvision ? 60 : 0)
      if (range > 0) tokenDarkvisionRanges.set(t.id, Math.ceil(range / 5))
    }
    const config: LightingConfig = {
      ambientLight,
      tokenDarkvisionRanges
    }

    // Initial draw
    const lightSources = buildLightSources()
    drawLightingOverlay(refs.lightingGraphicsRef.current, map, viewerTokens, lightSources, config, isHost)

    // If any lights are animated, set up a per-frame redraw via ticker
    if (hasActiveAnimations() && refs.appRef.current) {
      const gfx = refs.lightingGraphicsRef.current
      const app = refs.appRef.current
      const redraw = (): void => {
        const animatedSources = buildLightSources()
        drawLightingOverlay(gfx, map, viewerTokens, animatedSources, config, isHost)
      }
      app.ticker.add(redraw)
      return () => {
        app.ticker.remove(redraw)
      }
    }
  }, [initialized, map, isHost, refs, currentFloor])

  // Draw terrain overlay (floor-filtered)
  useEffect(() => {
    if (!initialized || !refs.terrainOverlayRef.current || !map) return
    const terrain = filterTerrainByFloor(map.terrain ?? [], currentFloor)
    if (terrain.length > 0) {
      drawTerrainOverlay(refs.terrainOverlayRef.current, terrain, map.grid.cellSize)
    } else {
      refs.terrainOverlayRef.current.clear()
    }
  }, [initialized, map?.terrain, map?.grid.cellSize, map, refs, currentFloor])

  // Draw scene regions
  useEffect(() => {
    if (!initialized || !refs.regionGraphicsRef.current || !map) return
    const regions = map.regions ?? []
    if (regions.length > 0) {
      drawRegions(refs.regionGraphicsRef.current, regions, map.grid, isHost, currentFloor)
    } else {
      refs.regionGraphicsRef.current.clear()
    }
  }, [initialized, map?.regions, map?.grid, isHost, map, refs, currentFloor])

  // Draw map annotations/drawings (floor-filtered)
  useEffect(() => {
    if (!initialized || !refs.drawingGraphicsRef.current || !map) return
    const drawings = filterDrawingsByFloor(map.drawings ?? [], currentFloor)
    if (drawings.length > 0) {
      drawDrawings(refs.drawingGraphicsRef.current, drawings, isHost)
    } else {
      clearDrawingLayer(refs.drawingGraphicsRef.current)
    }
  }, [initialized, map?.drawings, isHost, map, refs, currentFloor])

  // Draw AoE overlay
  useEffect(() => {
    if (!initialized || !refs.aoeOverlayRef.current || !map) return
    if (activeAoE) {
      drawAoEOverlay(refs.aoeOverlayRef.current, activeAoE, map.grid.cellSize)
    } else {
      clearAoEOverlay(refs.aoeOverlayRef.current)
    }
  }, [initialized, activeAoE, map?.grid.cellSize, map, refs])

  // Draw movement overlay when a token is selected during initiative
  useEffect(() => {
    if (!initialized || !refs.moveOverlayRef.current || !map) return
    if (!isInitiativeMode || !selectedTokenId || !turnState) {
      clearMovementOverlay(refs.moveOverlayRef.current)
      return
    }
    const token = map.tokens.find((t) => t.id === selectedTokenId)
    if (!token) {
      clearMovementOverlay(refs.moveOverlayRef.current)
      return
    }
    const gridWidth = Math.ceil(map.width / map.grid.cellSize)
    const gridHeight = Math.ceil(map.height / map.grid.cellSize)
    const floorTerrain = filterTerrainByFloor(map.terrain ?? [], currentFloor)
    const floorWalls = filterWallsByFloor(map.wallSegments ?? [], currentFloor)
    drawMovementOverlay(
      refs.moveOverlayRef.current,
      token.gridX,
      token.gridY,
      turnState.movementRemaining,
      turnState.movementMax,
      map.grid.cellSize,
      floorTerrain,
      gridWidth,
      gridHeight,
      floorWalls
    )
  }, [
    initialized,
    isInitiativeMode,
    selectedTokenId,
    turnState?.movementRemaining,
    map?.tokens,
    map?.grid.cellSize,
    map?.width,
    map?.height,
    map?.terrain,
    map?.wallSegments,
    map,
    turnState,
    refs,
    currentFloor
  ])

  // Vision computation when dynamic fog is enabled, or map/tokens/lights change
  useEffect(() => {
    if (!initialized || !map || !isHost) return
    if (!map.fogOfWar.dynamicFogEnabled) return
    const lightSources = buildMapLightSources(activeLightSources, map.tokens)
    const { visibleCells } = recomputeVision(map, undefined, lightSources)
    useGameStore.getState().setPartyVisionCells(visibleCells)
    useGameStore.getState().addExploredCells(map.id, visibleCells)
  }, [
    initialized,
    map?.fogOfWar.dynamicFogEnabled,
    map?.tokens,
    map?.wallSegments,
    map?.id,
    isHost,
    map,
    activeLightSources
  ])

  // Weather overlay
  const weatherOverride = useGameStore((s) => s.weatherOverride)
  const showWeatherOverlay = useGameStore((s) => s.showWeatherOverlay)

  useEffect(() => {
    if (!initialized || !refs.weatherOverlayRef.current) return
    if (!showWeatherOverlay) {
      refs.weatherOverlayRef.current.setWeather(null)
      return
    }
    const weatherType = presetToWeatherType(weatherOverride?.preset)
    refs.weatherOverlayRef.current.setWeather(weatherType)
  }, [initialized, weatherOverride?.preset, showWeatherOverlay, refs])

  // Audio emitters
  useEffect(() => {
    if (!initialized || !refs.audioEmitterLayerRef.current || !map) return
    // Set the map reference for occlusion calculations
    refs.audioEmitterLayerRef.current.setMap(map)

    const emitters = map.audioEmitters ?? []
    const emittersWithPlaying = emitters.map((emitter) => ({
      ...emitter,
      playing: emitter.playing ?? false
    }))
    refs.audioEmitterLayerRef.current.updateEmitters(emittersWithPlaying)
  }, [initialized, map?.audioEmitters, map, refs])

  // Update listener position when tokens change (player moves)
  useEffect(() => {
    if (!initialized || !refs.audioEmitterLayerRef.current || !map) return
    // Update listener position based on player token position
    const playerToken = map.tokens.find((token) => token.entityType === 'player')
    if (playerToken) {
      const listenerX = playerToken.gridX + playerToken.sizeX / 2
      const listenerY = playerToken.gridY + playerToken.sizeY / 2
      refs.audioEmitterLayerRef.current.setListenerPosition(listenerX, listenerY)
    }
  }, [initialized, map?.tokens, map, refs])

  // Occlusion / foreground tiles (above tokens, fade on proximity to party)
  useEffect(() => {
    if (!initialized || !refs.occlusionContainerRef.current || !map) return
    const tiles = map.occlusionTiles ?? []
    if (tiles.length === 0) {
      clearOcclusionLayer(refs.occlusionContainerRef.current)
      return
    }
    const partyTokens = map.tokens.filter((t) => t.entityType === 'player')
    updateOcclusionLayer(refs.occlusionContainerRef.current, tiles, partyTokens, map.grid.cellSize, currentFloor)
  }, [initialized, map?.occlusionTiles, map?.tokens, map?.grid.cellSize, map, refs, currentFloor])
}
