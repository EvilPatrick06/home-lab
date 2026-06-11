import { create } from 'zustand'
import { dynamicKeys } from '../constants'
import { addToast } from '../hooks/use-toast'
import { i18n } from '../i18n'
import { getEffectiveArmor, getEffectiveConditions } from '../services/character/effective-character-5e'
import type { Character } from '../types/character'
import { migrateCharacter5eFromV3ToV4 } from '../types/character-5e-migration'
import type { ActiveCondition } from '../types/character-common'
import { logger } from '../utils/logger'

// Phase 15c.5 — convert every Character5e to the canonical v4 shape on load.
// Old saves carry the legacy v3 inline arrays (typed via Character5eV3); the
// shim derives refs + state and strips the v3 fields. Idempotent: already-v4
// saves pass through unchanged. Non-5e characters pass through untouched.
function applyV4Migration(character: Character): Character {
  if (character.gameSystem !== 'dnd5e') return character
  // Character is Character5e; Character5eV3 only adds optional v3 fields, so a
  // Character flows into the v3-typed param and the v4 result flows back out.
  return migrateCharacter5eFromV3ToV4(character)
}

function cleanupCharacterLocalStorage(characterId: string) {
  localStorage.removeItem(dynamicKeys.macroStorage(characterId))
  localStorage.removeItem(dynamicKeys.builderDraft(characterId))
}

interface CharacterState {
  characters: Character[]
  selectedCharacterId: string | null
  loading: boolean
  setSelectedCharacter: (id: string | null) => void
  loadCharacters: () => Promise<void>
  saveCharacter: (character: Character) => Promise<void>
  /** Phase 23c — apply an in-memory character update (e.g. a DM broadcast) without
   * a disk write. Inserts if absent so a player's sheet reflects DM edits live. */
  updateCharacterInState: (id: string, data: Character) => void
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
      const characters =
        // boundary: deserialized IPC payload (Record<string, unknown>[]) reinterpreted as persisted Characters
        (
          rawData.filter(
            (c) => c != null && typeof c === 'object' && typeof (c as Record<string, unknown>).id === 'string'
          ) as unknown as Character[]
        ).map(applyV4Migration)
      set({ characters, loading: false })
    } catch (error) {
      logger.error('Failed to load characters:', error)
      set({ loading: false })
    }
  },

  saveCharacter: async (character: Character) => {
    try {
      // boundary: IPC serialization param is Record<string, unknown>; an interface has no index signature
      const result = await window.api.saveCharacter(character as unknown as Record<string, unknown>)
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string }
        if (!typedResult.success) {
          const errorMessage = typedResult.error || 'Failed to save character'
          logger.error('Character save returned failure:', errorMessage, 'id:', character.id)
          addToast(
            i18n.t('notify.characterStore.saveFailedWithReason', { label: character.name, reason: errorMessage }),
            'error'
          )
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
        addToast(i18n.t('notify.characterStore.saveFailed', { label: character.name }), 'error')
      }
      throw error
    }
  },

  updateCharacterInState: (id, data) => {
    const { characters } = get()
    const idx = characters.findIndex((c) => c.id === id)
    if (idx >= 0) {
      const updated = [...characters]
      updated[idx] = data
      set({ characters: updated })
    } else {
      set({ characters: [...characters, data] })
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
          addToast(i18n.t('notify.characterStore.deleteFailedWithReason', { reason: errorMessage }), 'error')
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
        addToast(i18n.t('notify.characterStore.deleted', { label: character.name }), 'success')
      }

      cleanupCharacterLocalStorage(id)
    } catch (error) {
      logger.error('Failed to delete character:', error, 'id:', id)
      if (error instanceof Error && !error.message.includes('Failed to delete')) {
        // Only show toast for unexpected errors, not the ones we already handled above
        addToast(i18n.t('notify.characterStore.deleteFailed'), 'error')
      }
      throw error
    }
  },

  deleteAllCharacters: async () => {
    const { characters } = get()
    await Promise.allSettled(
      characters.map((c) =>
        window.api
          .deleteCharacter(c.id)
          .then(() => cleanupCharacterLocalStorage(c.id))
          .catch((error) => logger.error('Failed to delete character:', c.id, error))
      )
    )
    set({ characters: [], selectedCharacterId: null })
  },

  toggleArmorEquipped: async (characterId: string, armorId: string) => {
    const { characters } = get()
    const char = characters.find((c) => c.id === characterId)
    if (!char) return

    const currentArmor = getEffectiveArmor(char)
    const updatedArmor = currentArmor.map((a) => {
      if (a.id === armorId) {
        return { ...a, equipped: !a.equipped }
      }
      // Unequip other armor of same type when equipping
      if (currentArmor.find((x) => x.id === armorId)?.type === a.type && a.id !== armorId) {
        return { ...a, equipped: false }
      }
      return a
    })

    // Phase 15c.5 — rebuild v3 armor + re-derive v4 refs/state via the shim.
    const updated = migrateCharacter5eFromV3ToV4({
      ...char,
      armor: updatedArmor,
      armorRefs: undefined,
      state: { ...char.state, armorEquipped: undefined },
      updatedAt: new Date().toISOString()
    })
    await get().saveCharacter(updated)
  },

  addCondition: async (characterId: string, condition: ActiveCondition) => {
    const { characters } = get()
    const char = characters.find((c) => c.id === characterId)
    if (!char) return

    // Phase 17ac — idempotent add. Previously this blindly appended,
    // letting an already-applied condition (e.g. Unconscious from
    // hitting 0 HP, then re-toggled via DM token menu / chat command)
    // stack multiple copies of itself. The user saw 3× "Unconscious"
    // chips after a few death-save toggles. Now we replace if a
    // same-named condition already exists (so duration counters
    // refresh) and skip the stale duplicate entry.
    const existing = getEffectiveConditions(char)
    const filteredExisting = existing.filter((c) => c.name !== condition.name)
    const conditions = [...filteredExisting, condition]
    const updated = migrateCharacter5eFromV3ToV4({
      ...char,
      conditions,
      conditionRefs: undefined,
      updatedAt: new Date().toISOString()
    })
    await get().saveCharacter(updated)
  },

  removeCondition: async (characterId: string, conditionName: string) => {
    const { characters } = get()
    const char = characters.find((c) => c.id === characterId)
    if (!char) return

    const conditions = getEffectiveConditions(char).filter((c) => c.name !== conditionName)
    const updated = migrateCharacter5eFromV3ToV4({
      ...char,
      conditions,
      conditionRefs: undefined,
      updatedAt: new Date().toISOString()
    })
    await get().saveCharacter(updated)
  },

  updateConditionValue: async (characterId: string, conditionName: string, newValue: number) => {
    const { characters } = get()
    const char = characters.find((c) => c.id === characterId)
    if (!char) return

    const existing = getEffectiveConditions(char)
    // PHASE-02 02A — condition `value`/`duration` now ride in each ref's overrides,
    // so the rebuild-via-shim below persists the value (the migration writes it into
    // conditionRefs[].ref.overrides; getEffectiveConditions reads it back).
    const conditions =
      newValue <= 0
        ? existing.filter((c) => c.name !== conditionName)
        : existing.map((c) => (c.name === conditionName ? { ...c, value: newValue } : c))
    const updated = migrateCharacter5eFromV3ToV4({
      ...char,
      conditions,
      conditionRefs: undefined,
      updatedAt: new Date().toISOString()
    })
    await get().saveCharacter(updated)
  }
}))
