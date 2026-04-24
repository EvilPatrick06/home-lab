import { create } from 'zustand'

export type ColorblindMode = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'

export interface KeyCombo {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

interface AccessibilityState {
  uiScale: number // 75-150, default 100
  colorblindMode: ColorblindMode
  reducedMotion: boolean
  screenReaderMode: boolean
  tooltipsEnabled: boolean
  customKeybindings: Record<string, KeyCombo> | null // null = use defaults

  setUiScale: (scale: number) => void
  setColorblindMode: (mode: ColorblindMode) => void
  setReducedMotion: (v: boolean) => void
  setScreenReaderMode: (v: boolean) => void
  setTooltipsEnabled: (v: boolean) => void
  setCustomKeybinding: (action: string, combo: KeyCombo) => void
  resetKeybinding: (action: string) => void
  resetAllKeybindings: () => void
}

const STORAGE_KEY = 'dnd-vtt-accessibility'

function loadPersistedState(): Partial<AccessibilityState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function persist(state: AccessibilityState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        uiScale: state.uiScale,
        colorblindMode: state.colorblindMode,
        reducedMotion: state.reducedMotion,
        screenReaderMode: state.screenReaderMode,
        tooltipsEnabled: state.tooltipsEnabled,
        customKeybindings: state.customKeybindings
      })
    )
  } catch {
    // localStorage may be unavailable
  }
}

const saved = loadPersistedState()

export const useAccessibilityStore = create<AccessibilityState>((set, get) => ({
  uiScale: (saved.uiScale as number) ?? 100,
  colorblindMode: (saved.colorblindMode as ColorblindMode) ?? 'none',
  reducedMotion: (saved.reducedMotion as boolean) ?? false,
  screenReaderMode: (saved.screenReaderMode as boolean) ?? false,
  tooltipsEnabled: (saved.tooltipsEnabled as boolean) ?? true,
  customKeybindings: (saved.customKeybindings as Record<string, KeyCombo> | null) ?? null,

  setUiScale: (scale) => {
    const clamped = Math.max(75, Math.min(150, scale))
    set({ uiScale: clamped })
    persist(get())
  },

  setColorblindMode: (mode) => {
    set({ colorblindMode: mode })
    persist(get())
  },

  setReducedMotion: (v) => {
    set({ reducedMotion: v })
    persist(get())
  },

  setScreenReaderMode: (v) => {
    set({ screenReaderMode: v })
    persist(get())
  },

  setTooltipsEnabled: (v) => {
    set({ tooltipsEnabled: v })
    persist(get())
  },

  setCustomKeybinding: (action, combo) => {
    const current = get().customKeybindings ?? {}
    const updated = { ...current, [action]: combo }
    set({ customKeybindings: updated })
    persist(get())
  },

  resetKeybinding: (action) => {
    const current = get().customKeybindings
    if (!current) return
    const updated = { ...current }
    delete updated[action]
    set({ customKeybindings: Object.keys(updated).length > 0 ? updated : null })
    persist(get())
  },

  resetAllKeybindings: () => {
    set({ customKeybindings: null })
    persist(get())
  }
}))
