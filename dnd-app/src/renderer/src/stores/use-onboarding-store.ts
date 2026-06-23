import { create } from 'zustand'

// First-run guided tour state (suggestions-log 2026-06-22). The completion flag
// lives in localStorage alongside the other UI prefs (so it travels with the
// Settings export). The tour auto-opens once on first run and is re-launchable
// from Settings.
const DONE_KEY = 'dnd-vtt-hasCompletedOnboarding'

function readDone(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DONE_KEY) === 'true'
  } catch {
    return true // storage unavailable → don't nag
  }
}

interface OnboardingState {
  isOpen: boolean
  hasCompleted: boolean
  /** Re-launch the tour (e.g. from Settings). */
  open: () => void
  /** Mark complete/skip and persist so it never auto-opens again. */
  complete: () => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  isOpen: !readDone(),
  hasCompleted: readDone(),
  open: () => set({ isOpen: true }),
  complete: () => {
    try {
      localStorage.setItem(DONE_KEY, 'true')
    } catch {
      /* ignore */
    }
    set({ isOpen: false, hasCompleted: true })
  }
}))
