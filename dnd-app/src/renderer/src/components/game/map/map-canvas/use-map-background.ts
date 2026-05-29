import { Assets, type Container, Sprite } from 'pixi.js'
import { useEffect } from 'react'
import type { GameMap } from '../../../../types/map'
import { logger } from '../../../../utils/logger'

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
    // biome-ignore lint/correctness/useExhaustiveDependencies: refs + setBgLoadError are stable; re-run only on init/imagePath/applyTransform change (preserves original MapCanvas deps)
  }, [initialized, map?.imagePath, applyTransform])
}
