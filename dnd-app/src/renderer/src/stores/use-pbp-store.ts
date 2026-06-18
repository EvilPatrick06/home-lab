import { create } from 'zustand'

/**
 * PHASE-36 36E — renderer-local play-by-post state. `autoAdvance` is a persisted DM toggle
 * (default OFF); `lastStatus` is volatile (populated by the section's polling, read by the
 * auto-advance hook for `expectedTurnIndex`). Nothing here drives behavior unless the DM
 * starts a session AND flips autoAdvance on.
 */
export interface PbpStatusSnapshot {
  active: boolean
  turnIndex: number
  round: number
  scene: string
  campaignId: string
}

interface PbpState {
  autoAdvance: boolean
  lastStatus: PbpStatusSnapshot | null
  setAutoAdvance: (v: boolean) => void
  setLastStatus: (s: PbpStatusSnapshot | null) => void
}

const STORAGE_KEY = 'dnd-vtt-pbp-auto-advance'

function loadPersistedBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function persistBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // localStorage may be unavailable
  }
}

export const usePbpStore = create<PbpState>((set) => ({
  autoAdvance: loadPersistedBool(STORAGE_KEY),
  lastStatus: null,
  setAutoAdvance: (v) => {
    set({ autoAdvance: v })
    persistBool(STORAGE_KEY, v)
  },
  setLastStatus: (s) => set({ lastStatus: s })
}))
