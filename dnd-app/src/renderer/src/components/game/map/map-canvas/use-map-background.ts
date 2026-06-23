import { Assets, type Container, Sprite } from 'pixi.js'
import { useEffect } from 'react'
import type { GameMap } from '../../../../types/map'
import { logger } from '../../../../utils/logger'
import { LAYER_Z } from '../map-pixi-setup'

/**
 * Load and display the map background sprite, extracted from MapCanvas.tsx.
 *
 * Behavior-preserving decomposition: this is the single "Load and display map
 * background" `useEffect` moved verbatim, with the same dependency array
 * (`[initialized, map?.imagePath, applyTransform]`). It is invoked once, in the
 * same position, so the component's overall hook-call order is unchanged.
 *
 * On a fresh texture load it also seeds the initial fit-to-container zoom/pan.
 */
export function useMapBackground(args: {
  initialized: boolean
  map: GameMap | null
  containerRef: React.RefObject<HTMLDivElement | null>
  worldRef: React.RefObject<Container | null>
  bgSpriteRef: React.MutableRefObject<Sprite | null>
  zoomRef: React.MutableRefObject<number>
  panRef: React.MutableRefObject<{ x: number; y: number }>
  applyTransform: () => void
  setBgLoadError: (msg: string | null) => void
}): void {
  const { initialized, map, containerRef, worldRef, bgSpriteRef, zoomRef, panRef, applyTransform, setBgLoadError } =
    args
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs (bgSpriteRef, worldRef, zoomRef, panRef, containerRef) + setBgLoadError are stable (useRef/setState); re-run only on init/imagePath/applyTransform (preserves original MapCanvas deps)
  useEffect(() => {
    if (!initialized || !worldRef.current) return
    const loadBg = async (): Promise<void> => {
      if (bgSpriteRef.current) {
        worldRef.current?.removeChild(bgSpriteRef.current)
        // Destroy the SPRITE only — NOT the texture. The texture is owned by Assets
        // (Assets.load below caches it under the image path). Destroying it here fires
        // PixiJS's "Texture managed by Assets was destroyed instead of unloaded" warning
        // AND leaves a stale cache entry that then warns "[Cache] already has key" when
        // the same map reloads. Letting Assets keep it cached also makes re-opening a
        // map instant (bounded by the number of distinct map images).
        bgSpriteRef.current.destroy({ children: true })
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
        // The map image is the MAP tier: above the background, below every add-on layer.
        // sortableChildren on the world makes this zIndex authoritative (the addChildAt(0)
        // is just a sensible default for the unsorted case).
        sprite.zIndex = LAYER_Z.map
        worldRef.current?.addChildAt(sprite, 0)
        bgSpriteRef.current = sprite
        setBgLoadError(null)
        const container = containerRef.current
        if (container && sprite.texture.width > 0) {
          const cw = container.clientWidth,
            ch = container.clientHeight
          const mw = sprite.texture.width,
            mh = sprite.texture.height
          // COVER-fit (max, not min): the map fills the whole viewport so the dark canvas
          // background is never visible OVER/around the map on load — the map is always on
          // top of the background. Panning past the map edge into the void is still allowed
          // (no clamp); this just sets the initial framing so the background can't show
          // across the map area. Centered so the cropped overflow is even on both sides.
          const scale = Math.max(cw / mw, ch / mh)
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
}
