import { create } from 'zustand'

interface NarrationTtsState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  // PHASE-21 21B: barge-in — new narration interrupts stale audio. Default OFF.
  bargeIn: boolean
  setBargeIn: (bargeIn: boolean) => void
}

const STORAGE_KEY = 'dnd-vtt-ai-narration-tts'
const BARGE_IN_KEY = 'dnd-vtt-ai-narration-barge-in'

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

const initialEnabled = loadPersistedBool(STORAGE_KEY)
const initialBargeIn = loadPersistedBool(BARGE_IN_KEY)

// PHASE-20 20F / PHASE-21 21B: keep the main-process gates in sync with this store.
// Guarded for vitest (no window.api).
function syncEnabledMain(enabled: boolean): void {
  if (typeof window !== 'undefined' && window.api?.bmoSetNarrationEnabled) {
    void window.api.bmoSetNarrationEnabled(enabled)
  }
}

function syncBargeInMain(bargeIn: boolean): void {
  if (typeof window !== 'undefined' && window.api?.bmoSetBargeInEnabled) {
    void window.api.bmoSetBargeInEnabled(bargeIn)
  }
}

// Sync the loaded values once at module init so main matches the persisted toggles.
syncEnabledMain(initialEnabled)
syncBargeInMain(initialBargeIn)

export const useNarrationTtsStore = create<NarrationTtsState>((set) => ({
  enabled: initialEnabled,

  setEnabled: (enabled) => {
    set({ enabled })
    persistBool(STORAGE_KEY, enabled)
    syncEnabledMain(enabled)
  },

  bargeIn: initialBargeIn,

  setBargeIn: (bargeIn) => {
    set({ bargeIn })
    persistBool(BARGE_IN_KEY, bargeIn)
    syncBargeInMain(bargeIn)
  }
}))
