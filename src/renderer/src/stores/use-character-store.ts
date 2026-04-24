import { create } from 'zustand'
import { addToast } from '../hooks/use-toast'
import type { Character } from '../types/character'
import type { ActiveCondition } from '../types/character-common'
import { logger } from '../utils/logger'

interface CharacterState {
  characters: Character[]
  selectedCharacterId: string | null
  loading: boolean
  setSelectedCharacter: (id: string | null) => void
  loadCharacters: () => Promise<void>
  saveCharacter: (character: Character) => Promise<void>
  deleteCharacter: (id: string) => Promise<void>
  deleteAllCharacters: () => Promise<void>
  toggleArmorEquipped: (characterId: string, armorId: string) => Promise<void>
  addCondition: (characterId: string, condition: ActiveCondition) => Promise<void>
  removeCondition: (characterId: string, conditionName: string) => Promise<void>
  updateConditionValue: (characterId: string, conditionName: string, newValue: number) => Promise<void>
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  selectedCharacterId: null,
  loading: false,

  setSelectedCharacter: (id) => set({ selectedCharacterId: id }),

  loadCharacters: async () => {
    set({ loading: true })
    try {
      const rawData = await window.api.loadCharacters()
      if (!Array.isArray(rawData)) {
        const err = rawData as { success?: boolean; error?: string } | undefined
        logger.error('Failed to load characters:', err?.error ?? 'unexpected response')
        set({ loading: false })
        return
      }
      const characters = rawData.filter(
        (c) => c != null && typeof c === 'object' && typeof (c as Record<string, unknown>).id === 'string'
      ) as unknown as Character[]
      set({ characters, loading: false })
    } catch (error) {
      logger.error('Failed to load characters:', error)
      set({ loading: false })
    }
  },

  saveCharacter: async (character: Character) => {
    try {
      const result = await window.api.saveCharacter(character as unknown as Record<string, unknown>)
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string }
        if (!typedResult.success) {
          const errorMessage = typedResult.error || 'Failed to save character'
          logger.error('Character save returned failure:', errorMessage, 'id:', character.id)
          addToast(`Failed to save "${character.name}": ${errorMessage}`, 'error')
          throw new Error(errorMessage)
        }
      }

      // Only update local state on success
      const { characters } = get()
      const index = characters.findIndex((c) => c.id === character.id)
      if (index >= 0) {
        const updated = [...characters]
        updated[index] = character
        set({ characters: updated })
      } else {
        set({ characters: [...characters, character] })
      }
    } catch (error) {
      logger.error('Failed to save character:', error, 'id:', character.id, 'name:', character.name)
      if (error instanceof Error && !error.message.includes('Failed to save')) {
        // Only show toast for unexpected errors, not the ones we already handled above
        addToast(`Failed to save "${character.name}"`, 'error')
      }
      throw error
    }
  },

  deleteCharacter: async (id: string) => {
    try {
      const result = await window.api.deleteCharacter(id)
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string }
        if (!typedResult.success) {
          const errorMessage = typedResult.error || 'Failed to delete character'
          logger.error('Character delete returned failure:', errorMessage, 'id:', id)
          addToast(`Failed to delete character: ${errorMessage}`, 'error')
          throw new Error(errorMessage)
        }
      }

      // Only update local state on success
      const { characters } = get()
      const character = characters.find((c) => c.id === id)
      set({ characters: characters.filter((c) => c.id !== id) })

      // Clear selected character if it was deleted
      if (get().selectedCharacterId === id) {
        set({ selectedCharacterId: null })
      }

      // Show success toast
      if (character) {
        addToast(`Deleted "${character.name}"`, 'success')
      }
    } catch (error) {
      logger.error('Failed to delete character:', error, 'id:', id)
      if (error instanceof Error && !error.message.includes('Failed to delete')) {
        // Only show toast for unexpected errors, not the ones we already handled above
        addToast('Failed to delete character', 'error')
      }
      throw error
    }
  },

  deleteAllCharacters: async () => {
    const { characters } = get()
    await Promise.allSettled(
      characters.map((c) =>
        window.api.deleteCharacter(c.id).catch((error) => logger.error('Failed to delete character:', c.id, error))
      )
    )
    set({ characters: [], selectedCharacterId: null })
  },

  toggleArmorEquipped: async (characterId: string, armorId: string) => {
    const { characters } = get()
    const char = characters.find((c) => c.id === characterId)
    if (!char) return

    const updatedArmor = char.armor.map((a) => {
      if (a.id === armorId) {
        return { ...a, equipped: !a.equipped }
      }
      // Unequip other armor of same type when equipping
      if (char.armor.find((x) => x.id === armorId)?.type === a.type && a.id !== armorId) {
        return { ...a, equipped: false }
      }
      return a
    })

    const updated = { ...char, armor: updatedArmor, updatedAt: new Date().toISOString() } as Character
    await get().saveCharacter(updated)
  },

  addCondition: async (characterId: string, condition: ActiveCondition) => {
    const { characters } = get()
    const char = characters.find((c) => c.id === characterId)
    if (!char) return

    const conditions = [...(char.conditions ?? []), condition]
    const updated = { ...char, conditions, updatedAt: new Date().toISOString() } as Character
    await get().saveCharacter(updated)
  },

  removeCondition: async (characterId: string, conditionName: string) => {
    const { characters } = get()
    const char = characters.find((c) => c.id === characterId)
    if (!char) return

    const conditions = (char.conditions ?? []).filter((c) => c.name !== conditionName)
    const updated = { ...char, conditions, updatedAt: new Date().toISOString() } as Character
    await get().saveCharacter(updated)
  },

  updateConditionValue: async (characterId: string, conditionName: string, newValue: number) => {
    const { characters } = get()
    const char = characters.find((c) => c.id === characterId)
    if (!char) return

    if (newValue <= 0) {
      // Remove the condition when value drops to 0
      const conditions = (char.conditions ?? []).filter((c) => c.name !== conditionName)
      const updated = { ...char, conditions, updatedAt: new Date().toISOString() } as Character
      await get().saveCharacter(updated)
    } else {
      const conditions = (char.conditions ?? []).map((c) => (c.name === conditionName ? { ...c, value: newValue } : c))
      const updated = { ...char, conditions, updatedAt: new Date().toISOString() } as Character
      await get().saveCharacter(updated)
    }
  }
}))
