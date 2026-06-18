import type { StateCreator } from 'zustand'
import type { GameStoreState, SceneSliceState } from './types'

/**
 * PHASE-35 35A — cinematic scene-mode state. `sceneMode === null` is the tactical grid (default);
 * a non-null value is the full-bleed scene every player sees. `sceneModePrevAmbient` is a host-local
 * snapshot (NOT synced) used to restore the pre-scene ambient track on exit.
 */
export const createSceneSlice: StateCreator<GameStoreState, [], [], SceneSliceState> = (set) => ({
  sceneMode: null,
  sceneModePrevAmbient: null,
  setSceneMode: (scene) => set({ sceneMode: scene }),
  setSceneModePrevAmbient: (ambient) => set({ sceneModePrevAmbient: ambient })
})
