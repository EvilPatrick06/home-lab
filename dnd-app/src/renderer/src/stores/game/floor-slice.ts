import type { StateCreator } from 'zustand'
import type { FloorSliceState, GameStoreState } from './types'

export const createFloorSlice: StateCreator<GameStoreState, [], [], FloorSliceState> = (set) => ({
  currentFloor: 0,

  setCurrentFloor: (floor: number) => {
    set({ currentFloor: floor })
  }
})
