import { create } from 'zustand'
import { SETTINGS_KEYS } from '../constants'

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

const STORAGE_KEY = SETTINGS_KEYS.ACCESSIBILITY

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

/**
 * Default `reducedMotion` from the OS-level `prefers-reduced-motion` media query
 * when the user hasn't explicitly set it in-app. Falls back to `false` outside a
 * browser context (e.g. SSR/test) or when matchMedia is unavailable.
 */
function detectOsReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const osReducedMotion = detectOsReducedMotion()

export const useAccessibilityStore = create<AccessibilityState>((set, get) => ({
  uiScale: (saved.uiScale as number) ?? 100,
  colorblindMode: (saved.colorblindMode as ColorblindMode) ?? 'none',
  reducedMotion: (saved.reducedMotion as boolean) ?? osReducedMotion,
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

// Track OS `prefers-reduced-motion` changes live and apply them when the user
// has not explicitly set an in-app override (i.e. saved.reducedMotion is undefined).
// Once the user toggles the in-app setting, persistence wins and we stop tracking.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && saved.reducedMotion === undefined) {
  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const listener = (e: MediaQueryListEvent): void => {
      // Re-check persistence — user may have toggled in-app between events
      const persisted = loadPersistedState()
      if (persisted.reducedMotion === undefined) {
        useAccessibilityStore.setState({ reducedMotion: e.matches })
      }
    }
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', listener)
    } else if (typeof (mq as MediaQueryList & { addListener?: (l: typeof listener) => void }).addListener === 'function') {
      // Older WebKit
      ;(mq as MediaQueryList & { addListener: (l: typeof listener) => void }).addListener(listener)
    }
  } catch {
    // matchMedia unavailable in this environment
  }
}
