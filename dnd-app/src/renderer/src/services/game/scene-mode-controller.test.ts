import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneModeState } from '../../stores/game/types'

const { storeState, sendMessage, sound } = vi.hoisted(() => ({
  storeState: {
    sceneMode: null as SceneModeState | null,
    sceneModePrevAmbient: null as string | null,
    setSceneMode(s: SceneModeState | null) {
      this.sceneMode = s
    },
    setSceneModePrevAmbient(a: string | null) {
      this.sceneModePrevAmbient = a
    }
  },
  sendMessage: vi.fn(),
  sound: { getCurrentAmbient: vi.fn(), playAmbient: vi.fn(), stopAmbient: vi.fn(), setAmbientVolume: vi.fn() }
}))

vi.mock('../../stores/use-game-store', () => ({ useGameStore: { getState: () => storeState } }))
vi.mock('../../stores/network-store', () => ({ useNetworkStore: { getState: () => ({ sendMessage }) } }))
vi.mock('../../services/sound-manager', () => sound)

import { enterSceneMode, exitSceneMode, isSceneActive } from './scene-mode-controller'

beforeEach(() => {
  vi.clearAllMocks()
  storeState.sceneMode = null
  storeState.sceneModePrevAmbient = null
  sound.getCurrentAmbient.mockReturnValue(null)
})

describe('scene-mode-controller (PHASE-35 35E)', () => {
  it('enter sets the store + broadcasts the scene payload', () => {
    enterSceneMode({ imageData: 'data:x', caption: 'Crypt', particleEffect: 'fog', ambient: 'keep' })
    expect(storeState.sceneMode).toMatchObject({ imageData: 'data:x', caption: 'Crypt', particleEffect: 'fog' })
    expect(isSceneActive()).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith('dm:scene-mode', { scene: expect.objectContaining({ caption: 'Crypt' }) })
  })

  it("ambient 'keep' sends no audio message", () => {
    enterSceneMode({ imageData: null, caption: null, particleEffect: 'none', ambient: 'keep' })
    expect(sendMessage).toHaveBeenCalledTimes(1) // only the scene broadcast
    expect(sound.playAmbient).not.toHaveBeenCalled()
    expect(sound.stopAmbient).not.toHaveBeenCalled()
  })

  it('track enter then exit restores the pre-scene ambient and broadcasts', () => {
    sound.getCurrentAmbient.mockReturnValue('ambient-cave')
    enterSceneMode({
      imageData: null,
      caption: null,
      particleEffect: 'none',
      ambient: 'ambient-forest' as never,
      ambientVolume: 0.5
    })
    expect(sound.setAmbientVolume).toHaveBeenCalledWith(0.5)
    expect(sound.playAmbient).toHaveBeenCalledWith('ambient-forest')
    expect(sendMessage).toHaveBeenCalledWith('dm:play-ambient', { ambient: 'ambient-forest', volume: 0.5 })

    // Now the playing track differs from the snapshot ('ambient-cave'); exit must restore it.
    sound.getCurrentAmbient.mockReturnValue('ambient-forest')
    exitSceneMode()
    expect(storeState.sceneMode).toBeNull()
    expect(sound.playAmbient).toHaveBeenCalledWith('ambient-cave')
    expect(sendMessage).toHaveBeenCalledWith('dm:scene-mode', { scene: null })
  })

  it('double-exit is a no-op (single scene broadcast)', () => {
    enterSceneMode({ imageData: null, caption: null, particleEffect: 'none', ambient: 'keep' })
    exitSceneMode()
    sendMessage.mockClear()
    exitSceneMode() // already null
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('re-enter while active does not overwrite the original prevAmbient snapshot', () => {
    sound.getCurrentAmbient.mockReturnValue('ambient-cave')
    enterSceneMode({ imageData: null, caption: null, particleEffect: 'none', ambient: 'stop' })
    expect(storeState.sceneModePrevAmbient).toBe('ambient-cave')
    // After 'stop', current ambient is now null; a re-enter must NOT re-snapshot.
    sound.getCurrentAmbient.mockReturnValue(null)
    enterSceneMode({ imageData: 'data:y', caption: 'Update', particleEffect: 'embers', ambient: 'keep' })
    expect(storeState.sceneModePrevAmbient).toBe('ambient-cave')
  })
})
