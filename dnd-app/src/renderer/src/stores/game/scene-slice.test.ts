import { beforeEach, describe, expect, it } from 'vitest'

import { useGameStore } from './index'
import type { SceneModeState } from './types'

const SCENE: SceneModeState = { imageData: null, caption: 'A misty crypt', particleEffect: 'fog', enteredAt: 1 }

describe('scene-slice (PHASE-35 35A)', () => {
  beforeEach(() => useGameStore.getState().reset())

  it('defaults sceneMode + sceneModePrevAmbient to null', () => {
    expect(useGameStore.getState().sceneMode).toBeNull()
    expect(useGameStore.getState().sceneModePrevAmbient).toBeNull()
  })

  it('setSceneMode stores then clears the scene', () => {
    useGameStore.getState().setSceneMode(SCENE)
    expect(useGameStore.getState().sceneMode).toEqual(SCENE)
    useGameStore.getState().setSceneMode(null)
    expect(useGameStore.getState().sceneMode).toBeNull()
  })

  it('setSceneModePrevAmbient stores the host-local ambient snapshot', () => {
    useGameStore.getState().setSceneModePrevAmbient('ambient-cave')
    expect(useGameStore.getState().sceneModePrevAmbient).toBe('ambient-cave')
  })

  it('reset() clears an active scene', () => {
    useGameStore.getState().setSceneMode(SCENE)
    useGameStore.getState().reset()
    expect(useGameStore.getState().sceneMode).toBeNull()
  })

  it('loadGameState lands sceneMode via the generic spread (late-joiner path)', () => {
    useGameStore.getState().loadGameState({
      sceneMode: { imageData: null, caption: 'x', particleEffect: 'embers', enteredAt: 1 }
    } as never)
    expect(useGameStore.getState().sceneMode).toEqual({
      imageData: null,
      caption: 'x',
      particleEffect: 'embers',
      enteredAt: 1
    })
  })
})
