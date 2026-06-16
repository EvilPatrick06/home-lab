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

// PHASE-20 20F: keep the main-process narration gate in sync with this store.
// Guarded for vitest (no window.api).
function syncMain(enabled: boolean): void {
  if (typeof window !== 'undefined' && window.api?.bmoSetNarrationEnabled) {
    void window.api.bmoSetNarrationEnabled(enabled)
  }
}

// Sync the loaded value once at module init so main matches the persisted toggle.
syncMain(initialEnabled)

export const useNarrationTtsStore = create<NarrationTtsState>((set) => ({
  enabled: initialEnabled,

  setEnabled: (enabled) => {
    set({ enabled })
    persistEnabled(enabled)
    syncMain(enabled)
  }
}))
