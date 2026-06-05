import { type Application, Container, Graphics } from 'pixi.js'
import { logger } from '../../../utils/logger'
import { WeatherOverlayLayer } from './weather-overlay'

/** All PixiJS layer refs created during initialization */
export interface MapLayers {
  world: Container
  gridGraphics: Graphics
  gridLabelContainer: Container
  terrainOverlay: Graphics
  regionGraphics: Graphics
  drawingGraphics: Graphics
  moveOverlay: Graphics
  aoeOverlay: Graphics
  tokenContainer: Container
  occlusionContainer: Container
  /** Phase 16b — map pins (spatial bookmarks with journal/NPC/location links), above tokens, below fog. */
  pinsContainer: Container
  selectionBoxGraphics: Graphics
  pingGraphics: Graphics
  fogGraphics: Graphics
  lightingGraphics: Graphics
  wallGraphics: Graphics
  measureGraphics: Graphics
  weatherOverlay: WeatherOverlayLayer
}

/**
 * Explicit render layer z-order. The map is ALWAYS above the background and ALWAYS
 * below drawings/tokens/everything else — three tiers the user can rely on:
 *   BACKGROUND  (the canvas clear color, behind the world container)
 *   < MAP        (the map image — LAYER_Z.map)
 *   < ADDONS     (grid, terrain, drawings, tokens, fog, lighting, … — everything higher)
 *
 * `world.sortableChildren = true` makes these zIndex values authoritative, so the layer
 * order can never be broken by the order in which children happen to be added (the map
 * image, for instance, is added asynchronously after its texture loads).
 */
export const LAYER_Z = {
  map: 0,
  grid: 10,
  gridLabels: 11,
  terrain: 20,
  regions: 25,
  drawings: 30,
  movement: 35,
  aoe: 38,
  tokens: 40,
  occlusion: 45,
  pins: 50,
  selectionBox: 55,
  pings: 60,
  fog: 70,
  lighting: 75,
  walls: 80,
  measure: 85,
  combat: 90,
  audioEmitter: 95
} as const

/**
 * Check whether WebGL is available before attempting PixiJS init.
 * Returns an error message string if unavailable, or null if OK.
 */
export function checkWebGLSupport(): string | null {
  try {
    const testCanvas = document.createElement('canvas')
    const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl')
    if (!gl) {
      logger.error('[MapCanvas] WebGL not available')
      return 'WebGL is not available. Check your GPU drivers.'
    }
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    return null
  } catch (err) {
    logger.error('[MapCanvas] WebGL check failed:', err)
    return `WebGL check failed: ${(err as Error).message}`
  }
}

/**
 * Wait until the container element has non-zero dimensions (up to 10 frames).
 * Returns true when ready, false if it timed out or was cancelled.
 */
export async function waitForContainerDimensions(container: HTMLElement, isCancelled: () => boolean): Promise<boolean> {
  let attempts = 0
  while ((container.clientWidth === 0 || container.clientHeight === 0) && attempts < 10) {
    logger.debug(`[MapCanvas] Container has zero dimensions, waiting... (attempt ${attempts + 1})`)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    attempts++
    if (isCancelled()) return false
  }
  if (container.clientWidth === 0 || container.clientHeight === 0) {
    logger.error('[MapCanvas] Container still has zero dimensions after waiting')
    return false
  }
  return true
}

/**
 * Initialize the PixiJS Application with standard settings.
 */
export async function initPixiApp(app: Application, container: HTMLElement): Promise<void> {
  await app.init({
    resizeTo: container,
    background: 0x111827,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl'
  })
}

/**
 * Create all map layers (world container, grid, terrain, movement, AoE,
 * tokens, fog, lighting, walls, measurement, weather) and add them to the
 * PixiJS stage in the correct z-order.
 */
export function createMapLayers(app: Application): MapLayers {
  // World container for pan/zoom. sortableChildren makes the explicit per-layer zIndex
  // authoritative so the map image (added later, async) is always at the back of the
  // content and can never be covered by — or cover — another layer by add-order accident.
  const world = new Container()
  world.label = 'world'
  world.sortableChildren = true
  app.stage.addChild(world)

  // Grid layer
  const gridGraphics = new Graphics()
  gridGraphics.label = 'grid'
  gridGraphics.zIndex = LAYER_Z.grid
  world.addChild(gridGraphics)

  // Grid coordinate labels (above grid, below terrain)
  const gridLabelContainer = new Container()
  gridLabelContainer.label = 'grid-labels'
  gridLabelContainer.zIndex = LAYER_Z.gridLabels
  world.addChild(gridLabelContainer)

  // Terrain overlay layer (above grid labels, below tokens)
  const terrainOverlay = new Graphics()
  terrainOverlay.label = 'terrain'
  terrainOverlay.zIndex = LAYER_Z.terrain
  world.addChild(terrainOverlay)

  // Region overlay layer (above terrain, below drawings)
  const regionGraphics = new Graphics()
  regionGraphics.label = 'regions'
  regionGraphics.zIndex = LAYER_Z.regions
  world.addChild(regionGraphics)

  // Drawing/annotation layer (above regions, below movement)
  const drawingGraphics = new Graphics()
  drawingGraphics.label = 'drawings'
  drawingGraphics.zIndex = LAYER_Z.drawings
  world.addChild(drawingGraphics)

  // Movement overlay layer (above drawings, below tokens)
  const moveOverlay = new Graphics()
  moveOverlay.label = 'movement'
  moveOverlay.zIndex = LAYER_Z.movement
  world.addChild(moveOverlay)

  // AoE overlay layer (above movement, below tokens)
  const aoeOverlay = new Graphics()
  aoeOverlay.label = 'aoe'
  aoeOverlay.zIndex = LAYER_Z.aoe
  world.addChild(aoeOverlay)

  // Token layer
  const tokenContainer = new Container()
  tokenContainer.label = 'tokens'
  tokenContainer.zIndex = LAYER_Z.tokens
  world.addChild(tokenContainer)

  // Occlusion / foreground layer (above tokens — fades on proximity to party tokens)
  const occlusionContainer = new Container()
  occlusionContainer.label = 'occlusion'
  occlusionContainer.zIndex = LAYER_Z.occlusion
  world.addChild(occlusionContainer)

  // Phase 16b — map pins layer (between tokens and fog so pins read above tokens but hide under fog)
  const pinsContainer = new Container()
  pinsContainer.label = 'pins'
  pinsContainer.zIndex = LAYER_Z.pins
  world.addChild(pinsContainer)

  // Selection box overlay (above tokens, below pings)
  const selectionBoxGraphics = new Graphics()
  selectionBoxGraphics.label = 'selection-box'
  selectionBoxGraphics.zIndex = LAYER_Z.selectionBox
  world.addChild(selectionBoxGraphics)

  // Ping overlay (above selection box, below fog)
  const pingGraphics = new Graphics()
  pingGraphics.label = 'pings'
  pingGraphics.zIndex = LAYER_Z.pings
  world.addChild(pingGraphics)

  // Fog layer (above tokens for players, but DM can see through)
  const fogGraphics = new Graphics()
  fogGraphics.label = 'fog'
  fogGraphics.zIndex = LAYER_Z.fog
  world.addChild(fogGraphics)

  // Lighting overlay (above fog, below walls)
  const lightingGraphics = new Graphics()
  lightingGraphics.label = 'lighting'
  lightingGraphics.zIndex = LAYER_Z.lighting
  world.addChild(lightingGraphics)

  // Wall overlay (above lighting, below measure)
  const wallGraphics = new Graphics()
  wallGraphics.label = 'walls'
  wallGraphics.zIndex = LAYER_Z.walls
  world.addChild(wallGraphics)

  // Measurement overlay
  const measureGraphics = new Graphics()
  measureGraphics.label = 'measure'
  measureGraphics.zIndex = LAYER_Z.measure
  world.addChild(measureGraphics)

  // Weather overlay (screen-space, added to stage above world)
  const weatherOverlay = new WeatherOverlayLayer(app)
  weatherOverlay.getContainer().label = 'weather'

  logger.debug('[MapCanvas] All layers created, ready to render')

  return {
    world,
    gridGraphics,
    gridLabelContainer,
    terrainOverlay,
    regionGraphics,
    drawingGraphics,
    moveOverlay,
    aoeOverlay,
    tokenContainer,
    occlusionContainer,
    pinsContainer,
    selectionBoxGraphics,
    pingGraphics,
    fogGraphics,
    lightingGraphics,
    wallGraphics,
    measureGraphics,
    weatherOverlay
  }
}
