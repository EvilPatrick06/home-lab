import { describe, expect, it } from 'vitest'
import type { GameMap } from '../../types/map'
import { collectPreloadImagePaths, MAX_PRELOAD_MAPS } from './preload-adjacent'

function map(id: string, imagePath: string | undefined, portals: string[] = []): GameMap {
  return {
    id,
    imagePath,
    terrain: portals.map((mapId, i) => ({
      x: i,
      y: 0,
      type: 'portal' as const,
      movementCost: 1,
      portalTarget: { mapId, gridX: 0, gridY: 0 }
    }))
  } as unknown as GameMap
}

describe('collectPreloadImagePaths (16f)', () => {
  it('returns the image paths of portal-linked maps', () => {
    const a = map('a', 'a.png', ['b', 'c'])
    const b = map('b', 'b.png')
    const c = map('c', 'c.png')
    expect(collectPreloadImagePaths(a, [a, b, c])).toEqual(['b.png', 'c.png'])
  })

  it('dedupes repeated targets and skips the current map / missing imagePath / unknown targets', () => {
    const a = map('a', 'a.png', ['b', 'b', 'a', 'missing', 'noimg'])
    const b = map('b', 'b.png')
    const noimg = map('noimg', undefined)
    expect(collectPreloadImagePaths(a, [a, b, noimg])).toEqual(['b.png'])
  })

  it('caps at MAX_PRELOAD_MAPS', () => {
    const targets = ['b', 'c', 'd', 'e', 'f']
    const a = map('a', 'a.png', targets)
    const all = [a, ...targets.map((id) => map(id, `${id}.png`))]
    expect(collectPreloadImagePaths(a, all)).toHaveLength(MAX_PRELOAD_MAPS)
  })

  it('returns empty when there are no portals', () => {
    const a = map('a', 'a.png')
    expect(collectPreloadImagePaths(a, [a])).toEqual([])
  })
})
