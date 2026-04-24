import { create } from 'zustand'

export interface Macro {
  id: string
  name: string
  command: string // e.g., "/roll 1d20+$mod.str" or "/attack longsword"
  icon?: string // single emoji character, e.g., "⚔️"
  color?: string // tailwind bg class, e.g., "bg-red-900/40"
}

interface MacroStoreState {
  /** 10 hotbar slots (index 0-9), null = empty slot */
  hotbar: (Macro | null)[]
  /** Full macro library (may include macros not on hotbar) */
  macros: Macro[]
  /** Currently loaded character ID */
  _characterId: string | null

  setHotbarSlot: (index: number, macro: Macro | null) => void
  clearHotbarSlot: (index: number) => void
  swapHotbarSlots: (fromIndex: number, toIndex: number) => void
  addMacro: (macro: Macro) => void
  updateMacro: (id: string, updates: Partial<Macro>) => void
  removeMacro: (id: string) => void
  importMacros: (macros: Macro[]) => void
  loadForCharacter: (characterId: string) => void
  saveForCharacter: (characterId: string) => void
}

const EMPTY_HOTBAR: (Macro | null)[] = Array.from({ length: 10 }, () => null)

function storageKey(characterId: string): string {
  return `dnd-vtt-macros-${characterId}`
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null

function debouncedSave(characterId: string, hotbar: (Macro | null)[], macros: Macro[]): void {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(storageKey(characterId), JSON.stringify({ hotbar, macros }))
    } catch {
      /* storage full — silently ignore */
    }
  }, 300)
}

export const useMacroStore = create<MacroStoreState>((set, get) => ({
  hotbar: [...EMPTY_HOTBAR],
  macros: [],
  _characterId: null,

  setHotbarSlot: (index, macro) => {
    if (index < 0 || index > 9) return
    const hotbar = [...get().hotbar]
    hotbar[index] = macro
    set({ hotbar })
    // Also ensure macro is in library
    if (macro) {
      const { macros } = get()
      if (!macros.some((m) => m.id === macro.id)) {
        set({ macros: [...macros, macro] })
      }
    }
    const charId = get()._characterId
    if (charId) debouncedSave(charId, get().hotbar, get().macros)
  },

  clearHotbarSlot: (index) => {
    if (index < 0 || index > 9) return
    const hotbar = [...get().hotbar]
    hotbar[index] = null
    set({ hotbar })
    const charId = get()._characterId
    if (charId) debouncedSave(charId, hotbar, get().macros)
  },

  swapHotbarSlots: (fromIndex, toIndex) => {
    if (fromIndex < 0 || fromIndex > 9 || toIndex < 0 || toIndex > 9) return
    const hotbar = [...get().hotbar]
    const temp = hotbar[fromIndex]
    hotbar[fromIndex] = hotbar[toIndex]
    hotbar[toIndex] = temp
    set({ hotbar })
    const charId = get()._characterId
    if (charId) debouncedSave(charId, hotbar, get().macros)
  },

  addMacro: (macro) => {
    const { macros } = get()
    if (macros.some((m) => m.id === macro.id)) return
    const updated = [...macros, macro]
    set({ macros: updated })
    const charId = get()._characterId
    if (charId) debouncedSave(charId, get().hotbar, updated)
  },

  updateMacro: (id, updates) => {
    const macros = get().macros.map((m) => (m.id === id ? { ...m, ...updates } : m))
    // Also update hotbar references
    const hotbar = get().hotbar.map((slot) => (slot && slot.id === id ? { ...slot, ...updates } : slot))
    set({ macros, hotbar })
    const charId = get()._characterId
    if (charId) debouncedSave(charId, hotbar, macros)
  },

  removeMacro: (id) => {
    const macros = get().macros.filter((m) => m.id !== id)
    const hotbar = get().hotbar.map((slot) => (slot && slot.id === id ? null : slot))
    set({ macros, hotbar })
    const charId = get()._characterId
    if (charId) debouncedSave(charId, hotbar, macros)
  },

  importMacros: (incoming) => {
    const { macros } = get()
    const existingNames = new Set(macros.map((m) => m.name))
    const newMacros = incoming.filter((m) => !existingNames.has(m.name))
    if (newMacros.length === 0) return
    const updated = [...macros, ...newMacros]
    set({ macros: updated })
    const charId = get()._characterId
    if (charId) debouncedSave(charId, get().hotbar, updated)
  },

  loadForCharacter: (characterId) => {
    try {
      const raw = localStorage.getItem(storageKey(characterId))
      if (raw) {
        const data = JSON.parse(raw) as { hotbar?: (Macro | null)[]; macros?: Macro[] }
        const hotbar = Array.isArray(data.hotbar) ? data.hotbar.slice(0, 10) : [...EMPTY_HOTBAR]
        // Pad to 10 if shorter
        while (hotbar.length < 10) hotbar.push(null)
        set({
          hotbar,
          macros: Array.isArray(data.macros) ? data.macros : [],
          _characterId: characterId
        })
      } else {
        set({ hotbar: [...EMPTY_HOTBAR], macros: [], _characterId: characterId })
      }
    } catch {
      set({ hotbar: [...EMPTY_HOTBAR], macros: [], _characterId: characterId })
    }
  },

  saveForCharacter: (characterId) => {
    const { hotbar, macros } = get()
    try {
      localStorage.setItem(storageKey(characterId), JSON.stringify({ hotbar, macros }))
    } catch {
      /* ignore */
    }
  }
}))
