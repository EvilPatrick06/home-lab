import { create } from 'zustand'

/**
 * Phase 16c — tracks which DM reference tools are currently shown as non-blocking floating
 * windows (vs. blocking modals). Persists per-tool to sessionStorage so reopening a tool
 * defaults to whichever surface (modal vs floating) was last used in this session.
 *
 * Only side-panel reference tools float (initiative, creature lookup, DM notes). Confirmation
 * and combat-input modals (AttackModal, SpellModal, …) intentionally stay blocking — never here.
 */
export type FloatingToolId = 'initiative' | 'creatures' | 'notes'

const KEY = 'floating-tools-state'

function load(): Record<FloatingToolId, boolean> {
  const empty = { initiative: false, creatures: false, notes: false }
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return empty
    return { ...empty, ...(JSON.parse(raw) as Partial<Record<FloatingToolId, boolean>>) }
  } catch {
    return empty
  }
}

interface FloatingToolsState {
  floating: Record<FloatingToolId, boolean>
  setFloating: (tool: FloatingToolId, value: boolean) => void
}

export const useFloatingToolsStore = create<FloatingToolsState>((set, get) => ({
  floating: load(),
  setFloating: (tool, value) => {
    const next = { ...get().floating, [tool]: value }
    set({ floating: next })
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // sessionStorage unavailable — in-memory state still works for this session.
    }
  }
}))
