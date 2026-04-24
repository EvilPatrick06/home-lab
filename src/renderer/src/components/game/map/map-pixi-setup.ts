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
  selectionBoxGraphics: Graphics
  pingGraphics: Graphics
  fogGraphics: Graphics
  lightingGraphics: Graphics
  wallGraphics: Graphics
  measureGraphics: Graphics
  weatherOverlay: WeatherOverlayLayer
}

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
  // World container for pan/zoom
  const world = new Container()
  world.label = 'world'
  app.stage.addChild(world)

  // Grid layer
  const gridGraphics = new Graphics()
  gridGraphics.label = 'grid'
  world.addChild(gridGraphics)

  // Grid coordinate labels (above grid, below terrain)
  const gridLabelContainer = new Container()
  gridLabelContainer.label = 'grid-labels'
  world.addChild(gridLabelContainer)

  // Terrain overlay layer (above grid labels, below tokens)
  const terrainOverlay = new Graphics()
  terrainOverlay.label = 'terrain'
  world.addChild(terrainOverlay)

  // Region overlay layer (above terrain, below drawings)
  const regionGraphics = new Graphics()
  regionGraphics.label = 'regions'
  world.addChild(regionGraphics)

  // Drawing/annotation layer (above regions, below movement)
  const drawingGraphics = new Graphics()
  drawingGraphics.label = 'drawings'
  world.addChild(drawingGraphics)

  // Movement overlay layer (above drawings, below tokens)
  const moveOverlay = new Graphics()
  moveOverlay.label = 'movement'
  world.addChild(moveOverlay)

  // AoE overlay layer (above movement, below tokens)
  const aoeOverlay = new Graphics()
  aoeOverlay.label = 'aoe'
  world.addChild(aoeOverlay)

  // Token layer
  const tokenContainer = new Container()
  tokenContainer.label = 'tokens'
  world.addChild(tokenContainer)

  // Selection box overlay (above tokens, below pings)
  const selectionBoxGraphics = new Graphics()
  selectionBoxGraphics.label = 'selection-box'
  world.addChild(selectionBoxGraphics)

  // Ping overlay (above selection box, below fog)
  const pingGraphics = new Graphics()
  pingGraphics.label = 'pings'
  world.addChild(pingGraphics)

  // Fog layer (above tokens for players, but DM can see through)
  const fogGraphics = new Graphics()
  fogGraphics.label = 'fog'
  world.addChild(fogGraphics)

  // Lighting overlay (above fog, below walls)
  const lightingGraphics = new Graphics()
  lightingGraphics.label = 'lighting'
  world.addChild(lightingGraphics)

  // Wall overlay (above lighting, below measure)
  const wallGraphics = new Graphics()
  wallGraphics.label = 'walls'
  world.addChild(wallGraphics)

  // Measurement overlay
  const measureGraphics = new Graphics()
  measureGraphics.label = 'measure'
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
    selectionBoxGraphics,
    pingGraphics,
    fogGraphics,
    lightingGraphics,
    wallGraphics,
    measureGraphics,
    weatherOverlay
  }
}
