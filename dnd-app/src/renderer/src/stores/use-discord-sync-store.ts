import { create } from 'zustand'

// PHASE-22 22E: DM-side Discord sync state — a bounded activity feed of events the
// Pi pushes to the VTT, plus the opt-in "push VTT state to Discord" toggle.
export interface DiscordActivityEntry {
  id: string
  at: number
  kind: 'message' | 'roll' | 'join' | 'leave' | 'initiative' | 'info'
  summary: string
}

interface DiscordSyncState {
  activity: DiscordActivityEntry[]
  syncToDiscordEnabled: boolean
  addActivity: (entry: Omit<DiscordActivityEntry, 'id' | 'at'> & { id?: string; at?: number }) => void
  clearActivity: () => void
  setSyncToDiscordEnabled: (enabled: boolean) => void
}

const ACTIVITY_CAP = 100
const STORAGE_KEY = 'dnd-vtt:discord-sync-enabled'

function loadPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persist(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // localStorage may be unavailable
  }
}

let _seq = 0

export const useDiscordSyncStore = create<DiscordSyncState>((set) => ({
  activity: [],
  syncToDiscordEnabled: loadPersisted(),

  addActivity: (entry) =>
    set((s) => {
      const full: DiscordActivityEntry = {
        id: entry.id ?? `act-${++_seq}`,
        at: entry.at ?? Date.now(),
        kind: entry.kind,
        summary: entry.summary
      }
      // Newest first, bounded FIFO.
      const next = [full, ...s.activity]
      return { activity: next.length > ACTIVITY_CAP ? next.slice(0, ACTIVITY_CAP) : next }
    }),

  clearActivity: () => set({ activity: [] }),

  setSyncToDiscordEnabled: (enabled) => {
    persist(enabled)
    set({ syncToDiscordEnabled: enabled })
  }
}))
