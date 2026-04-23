import type { StateCreator } from 'zustand'
import { publishSystemChat } from '../../events/system-chat-bridge'
import type { ActiveLightSource, LightAnimation } from '../../types/campaign'
import type { Character5e } from '../../types/character-5e'
import type { Handout, InGameTimeState } from '../../types/game-state'
import type { GameStoreState, SessionLogEntry, TimeSliceState } from './types'

/**
 * PHB 2024: A stable creature at 0 HP regains 1 HP after 1d4 hours.
 * Checks for Stable conditions whose recovery timer has elapsed.
 */
function checkStableCreatureRecovery(get: () => GameStoreState): void {
  const { inGameTime, conditions, maps } = get()
  if (!inGameTime) return

  const stableConditions = conditions.filter(
    (c) => c.condition === 'Stable' && c.stabilizedAtSeconds != null && c.recoveryDurationSeconds != null
  )

  for (const stableCond of stableConditions) {
    const elapsed = inGameTime.totalSeconds - (stableCond.stabilizedAtSeconds ?? 0)
    if (elapsed >= (stableCond.recoveryDurationSeconds ?? Infinity)) {
      // Recovery time elapsed — set HP to 1 and remove Stable condition
      get().removeCondition(stableCond.id)

      // Set token HP to 1
      for (const map of maps) {
        const token = map.tokens.find((t) => t.entityId === stableCond.entityId)
        if (token && token.currentHP != null && token.currentHP <= 0) {
          get().updateToken(map.id, token.id, { currentHP: 1 })
        }
      }

      // Sync character HP if player
      try {
        const { useCharacterStore } = require('../../stores/use-character-store')
        const charStore = useCharacterStore.getState()
        const char = charStore.characters.find((c: { id: string }) => c.id === stableCond.entityId) as Character5e | undefined
        if (char && char.hitPoints.current <= 0) {
          charStore.saveCharacter({
            ...char,
            hitPoints: { ...char.hitPoints, current: 1 },
            deathSaves: { successes: 0, failures: 0 }
          })
        }
      } catch {
        // Character store may not be available in all contexts
      }

      const hours = Math.round((stableCond.recoveryDurationSeconds ?? 0) / 3600)
      publishSystemChat({
        senderId: 'system',
        senderName: 'System',
        content: `${stableCond.entityName} regains 1 HP after ${hours} hour${hours !== 1 ? 's' : ''} of being stable.`,
        timestamp: Date.now(),
        isSystem: true
      })
    }
  }
}

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
    // PHB 2024: Check if stable creatures regain 1 HP
    checkStableCreatureRecovery(get)
  },
  advanceTimeDays: (days: number) => {
    const { inGameTime } = get()
    if (!inGameTime) return
    set({ inGameTime: { totalSeconds: inGameTime.totalSeconds + days * 24 * 3600 } })
    // Check for expired custom effects after time advance
    get().checkExpiredEffects()
    // PHB 2024: Check if stable creatures regain 1 HP
    checkStableCreatureRecovery(get)
  },

  // --- Rest tracking ---
  restTracking: null,
  setRestTracking: (rt) => set({ restTracking: rt }),

  // --- Light sources ---
  activeLightSources: [],
  lightSource: (
    entityId: string,
    entityName: string,
    sourceName: string,
    durationSeconds: number,
    animation?: LightAnimation
  ) => {
    const { inGameTime } = get()
    if (!inGameTime) return
    const source: ActiveLightSource = {
      id: crypto.randomUUID(),
      entityId,
      entityName,
      sourceName,
      durationSeconds,
      startedAtSeconds: inGameTime.totalSeconds,
      ...(animation ? { animation } : {})
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
