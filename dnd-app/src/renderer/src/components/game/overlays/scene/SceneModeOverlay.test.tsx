// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../hooks/use-reduced-motion', () => ({ useReducedMotion: () => true })) // suppress particles in tests

import type { SceneModeState } from '../../../../stores/game/types'
import { useGameStore } from '../../../../stores/use-game-store'
import SceneModeOverlay from './SceneModeOverlay'

const SCENE: SceneModeState = {
  imageData: 'data:image/png;base64,ART',
  caption: 'The crypt yawns',
  particleEffect: 'none',
  enteredAt: 5
}

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  useGameStore.getState().setSceneMode(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('SceneModeOverlay (PHASE-35 35D)', () => {
  it('renders nothing when no scene is active', () => {
    const { container } = render(<SceneModeOverlay isDM={true} onExit={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the art image and caption for an active scene', () => {
    useGameStore.getState().setSceneMode(SCENE)
    render(<SceneModeOverlay isDM={false} onExit={() => {}} />)
    const img = screen.getByRole('img', { name: SCENE.caption as string })
    expect(img).toBeTruthy()
    expect(screen.getByText('The crypt yawns')).toBeTruthy()
  })

  it('renders the gradient fallback (no img) when imageData is null', () => {
    useGameStore.getState().setSceneMode({ ...SCENE, imageData: null })
    const { container } = render(<SceneModeOverlay isDM={false} onExit={() => {}} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.bg-gradient-to-b')).not.toBeNull()
  })

  it('shows the DM exit button only for the DM and fires onExit', () => {
    useGameStore.getState().setSceneMode(SCENE)
    const onExit = vi.fn()
    const { rerender, queryByText } = render(<SceneModeOverlay isDM={false} onExit={onExit} />)
    expect(queryByText('Exit scene')).toBeNull()
    rerender(<SceneModeOverlay isDM={true} onExit={onExit} />)
    fireEvent.click(screen.getByText('Exit scene'))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})
