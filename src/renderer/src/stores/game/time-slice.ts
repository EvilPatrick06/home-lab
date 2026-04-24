import type { StateCreator } from 'zustand'
import type { ActiveLightSource } from '../../types/campaign'
import type { Handout, InGameTimeState } from '../../types/game-state'
import type { GameStoreState, SessionLogEntry, TimeSliceState } from './types'

export const createTimeSlice: StateCreator<GameStoreState, [], [], TimeSliceState> = (set, get) => ({
  // --- In-game time ---
  inGameTime: null,
  setInGameTime: (time: InGameTimeState | null) => set({ inGameTime: time }),
  advanceTimeSeconds: (seconds: number) => {
    const { inGameTime } = get()
    if (!inGameTime) return
    set({ inGameTime: { totalSeconds: inGameTime.totalSeconds + seconds } })
    // Check for expired custom effects after time advance
    get().checkExpiredEffects()
  },
  advanceTimeDays: (days: number) => {
    const { inGameTime } = get()
    if (!inGameTime) return
    set({ inGameTime: { totalSeconds: inGameTime.totalSeconds + days * 24 * 3600 } })
    // Check for expired custom effects after time advance
    get().checkExpiredEffects()
  },

  // --- Rest tracking ---
  restTracking: null,
  setRestTracking: (rt) => set({ restTracking: rt }),

  // --- Light sources ---
  activeLightSources: [],
  lightSource: (entityId: string, entityName: string, sourceName: string, durationSeconds: number) => {
    const { inGameTime } = get()
    if (!inGameTime) return
    const source: ActiveLightSource = {
      id: crypto.randomUUID(),
      entityId,
      entityName,
      sourceName,
      durationSeconds,
      startedAtSeconds: inGameTime.totalSeconds
    }
    set((s) => ({ activeLightSources: [...s.activeLightSources, source] }))
  },
  extinguishSource: (sourceId: string) => {
    set((s) => ({ activeLightSources: s.activeLightSources.filter((ls) => ls.id !== sourceId) }))
  },
  checkExpiredSources: (): ActiveLightSource[] => {
    const { inGameTime, activeLightSources } = get()
    if (!inGameTime) return []
    const expired = activeLightSources.filter(
      (ls) => ls.durationSeconds !== Infinity && inGameTime.totalSeconds - ls.startedAtSeconds >= ls.durationSeconds
    )
    if (expired.length > 0) {
      set({
        activeLightSources: activeLightSources.filter(
          (ls) => ls.durationSeconds === Infinity || inGameTime.totalSeconds - ls.startedAtSeconds < ls.durationSeconds
        )
      })
    }
    return expired
  },

  // --- Weather & Moon Overrides ---
  weatherOverride: null,
  moonOverride: null,
  savedWeatherPresets: [],
  showWeatherOverlay: true,
  setWeatherOverride: (override) => set({ weatherOverride: override }),
  setMoonOverride: (override) => set({ moonOverride: override }),
  setShowWeatherOverlay: (show: boolean) => set({ showWeatherOverlay: show }),
  addSavedWeatherPreset: (preset) =>
    set((s) => ({
      savedWeatherPresets: [...s.savedWeatherPresets.filter((p) => p.name !== preset.name), preset]
    })),
  removeSavedWeatherPreset: (name) =>
    set((s) => ({
      savedWeatherPresets: s.savedWeatherPresets.filter((p) => p.name !== name)
    })),

  // --- Session Log ---
  sessionLog: [],
  currentSessionId: `session-${Date.now()}`,
  currentSessionLabel: `Session 1 — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,

  addLogEntry: (content: string, inGameTimestamp?: string) => {
    const { currentSessionId, currentSessionLabel } = get()
    const entry: SessionLogEntry = {
      id: `log-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      sessionId: currentSessionId,
      sessionLabel: currentSessionLabel,
      realTimestamp: Date.now(),
      inGameTimestamp,
      content
    }
    set((s) => ({ sessionLog: [entry, ...s.sessionLog] }))
  },

  updateLogEntry: (entryId: string, content: string) => {
    set((s) => ({
      sessionLog: s.sessionLog.map((e) => (e.id === entryId ? { ...e, content, editedAt: Date.now() } : e))
    }))
  },

  deleteLogEntry: (entryId: string) => {
    set((s) => ({
      sessionLog: s.sessionLog.filter((e) => e.id !== entryId)
    }))
  },

  startNewSession: () => {
    const { sessionLog } = get()
    const sessionCount = new Set(sessionLog.map((e) => e.sessionId)).size + 1
    const label = `Session ${sessionCount} — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    set({
      currentSessionId: `session-${Date.now()}`,
      currentSessionLabel: label
    })
  },

  // --- Handouts ---
  handouts: [],
  addHandout: (handout: Handout) => {
    set((s) => ({ handouts: [...s.handouts, handout] }))
  },
  updateHandout: (id: string, updates: Partial<Handout>) => {
    set((s) => ({
      handouts: s.handouts.map((h) => (h.id === id ? { ...h, ...updates } : h))
    }))
  },
  removeHandout: (id: string) => {
    set((s) => ({ handouts: s.handouts.filter((h) => h.id !== id) }))
  }
})
