import { create } from 'zustand'
import { migrateBastion } from '../../types/bastion'
import { logger } from '../../utils/logger'
import { createEventSlice } from './event-slice'
import { createFacilitySlice } from './facility-slice'
import type { BastionState, CrudSliceState } from './types'

export const useBastionStore = create<BastionState>()((...a) => {
  const [set, get] = a

  const crudSlice: CrudSliceState = {
    bastions: [],
    loading: false,
    facilityDefs: [],
    hasLoaded: false,

    loadBastions: async () => {
      if (get().hasLoaded) return
      set({ loading: true })
      try {
        const rawData = await window.api.loadBastions()
        const rawArray = rawData as unknown as Record<string, unknown>[]
        const bastions = rawArray.map((raw) => migrateBastion(raw))

        // Auto-save any bastions that were migrated from old format
        for (let i = 0; i < bastions.length; i++) {
          const raw = rawArray[i]
          if (!('basicFacilities' in raw && 'specialFacilities' in raw)) {
            await window.api.saveBastion(bastions[i] as unknown as Record<string, unknown>)
          }
        }

        set({ bastions, loading: false, hasLoaded: true })
      } catch (error) {
        logger.error('Failed to load bastions:', error)
        set({ loading: false })
      }
    },

    saveBastion: async (bastion) => {
      try {
        const result = await window.api.saveBastion(bastion as unknown as Record<string, unknown>)
        if (result && !result.success) {
          logger.error('Failed to save bastion:', (result as { success: boolean; error?: string }).error)
          return
        }
        const { bastions } = get()
        const index = bastions.findIndex((b) => b.id === bastion.id)
        if (index >= 0) {
          const updated = [...bastions]
          updated[index] = bastion
          set({ bastions: updated })
        } else {
          set({ bastions: [...bastions, bastion] })
        }
      } catch (error) {
        logger.error('Failed to save bastion:', error)
      }
    },

    deleteBastion: async (id) => {
      try {
        await window.api.deleteBastion(id)
        set({ bastions: get().bastions.filter((b) => b.id !== id) })
      } catch (error) {
        logger.error('Failed to delete bastion:', error)
      }
    },

    deleteAllBastions: async () => {
      const { bastions } = get()
      for (const b of bastions) {
        try {
          await window.api.deleteBastion(b.id)
        } catch (error) {
          logger.error('Failed to delete bastion:', b.id, error)
        }
      }
      set({ bastions: [] })
    },

    setFacilityDefs: (defs) => set({ facilityDefs: defs })
  }

  return {
    ...crudSlice,
    ...createFacilitySlice(...a),
    ...createEventSlice(...a)
  }
})

// Re-export types so existing imports can use them if needed
export type { BastionState } from './types'
