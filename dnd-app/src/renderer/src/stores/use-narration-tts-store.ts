import { create } from 'zustand'

interface NarrationTtsState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

const STORAGE_KEY = 'dnd-vtt-ai-narration-tts'

function loadPersistedEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persistEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // localStorage may be unavailable
  }
}

const initialEnabled = loadPersistedEnabled()

export const useNarrationTtsStore = create<NarrationTtsState>((set) => ({
  enabled: initialEnabled,

  setEnabled: (enabled) => {
    set({ enabled })
    persistEnabled(enabled)
  }
}))
