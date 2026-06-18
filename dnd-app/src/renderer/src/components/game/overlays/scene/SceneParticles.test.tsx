// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { reducedMotion } = vi.hoisted(() => ({ reducedMotion: { value: false } }))
vi.mock('../../../../hooks/use-reduced-motion', () => ({ useReducedMotion: () => reducedMotion.value }))

import SceneParticles from './SceneParticles'

beforeEach(() => {
  reducedMotion.value = false
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    }
  )
  // jsdom/happy-dom have no real 2D context — return null so the rAF loop no-ops cleanly.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('SceneParticles (PHASE-35 35C)', () => {
  it('renders nothing for effect="none"', () => {
    const { container } = render(<SceneParticles effect="none" />)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('renders nothing when reducedMotion is on, even for embers', () => {
    reducedMotion.value = true
    const { container } = render(<SceneParticles effect="embers" />)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('renders an aria-hidden canvas for an active effect', () => {
    const { container } = render(<SceneParticles effect="embers" />)
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas?.getAttribute('aria-hidden')).toBe('true')
  })

  it('unmounts without throwing', () => {
    const { unmount } = render(<SceneParticles effect="snow" />)
    expect(() => unmount()).not.toThrow()
  })
})
