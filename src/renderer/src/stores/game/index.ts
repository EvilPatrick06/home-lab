import { create } from 'zustand'
import type { ActiveLightSource, CombatTimerConfig } from '../../types/campaign'
import type { Handout, InGameTimeState, SidebarEntry } from '../../types/game-state'
import { createCombatLogSlice } from './combat-log-slice'
import { createConditionsSlice } from './conditions-slice'
import { createDarknessZoneSlice } from './darkness-zone-slice'
import { createDrawingSlice } from './drawing-slice'
import { createEffectsSlice } from './effects-slice'
import { createFloorSlice } from './floor-slice'
import { createFogSlice } from './fog-slice'
import { createInitiativeSlice } from './initiative-slice'
import { createJournalSlice } from './journal-slice'
import { createMapTokenSlice } from './map-token-slice'
import { createOcclusionSlice } from './occlusion-slice'
import { createPartyInventorySlice } from './party-inventory-slice'
import { createRegionSlice } from './region-slice'
import { createShopSlice } from './shop-slice'
import { createSidebarSlice } from './sidebar-slice'
import { createTimeSlice } from './time-slice'
import { createTimerSlice } from './timer-slice'
import { createTriggerSlice } from './trigger-slice'
import { type GameStoreState, initialState, type SessionLogEntry } from './types'
import { createVisionSlice } from './vision-slice'

export const useGameStore = create<GameStoreState>()((...a) => {
  const [set, _get] = a

  return {
    ...initialState,

    // Compose all slices
    ...createShopSlice(...a),
    ...createMapTokenSlice(...a),
    ...createInitiativeSlice(...a),
    ...createConditionsSlice(...a),
    ...createFloorSlice(...a),
    ...createFogSlice(...a),
    ...createSidebarSlice(...a),
    ...createTimerSlice(...a),
    ...createCombatLogSlice(...a),
    ...createTimeSlice(...a),
    ...createEffectsSlice(...a),
    ...createVisionSlice(...a),
    ...createDrawingSlice(...a),
    ...createRegionSlice(...a),
    ...createTriggerSlice(...a),
    ...createOcclusionSlice(...a),
    ...createDarknessZoneSlice(...a),
    ...createJournalSlice(...a),
    ...createPartyInventorySlice(...a),

    // --- Reaction prompt ---
    pendingReactionPrompt: null,
    setPendingReactionPrompt: (prompt) => set({ pendingReactionPrompt: prompt }),

    // --- Trade/Inspect ephemeral state ---
    pendingTradeOffer: null,
    setPendingTradeOffer: (offer) => set({ pendingTradeOffer: offer }),
    clearPendingTradeOffer: () => set({ pendingTradeOffer: null }),
    pendingTradeResult: null,
    setPendingTradeResult: (result) => set({ pendingTradeResult: result }),
    clearPendingTradeResult: () => set({ pendingTradeResult: null }),
    inspectedCharacterData: null,
    setInspectedCharacter: (data) => set({ inspectedCharacterData: data }),
    clearInspectedCharacter: () => set({ inspectedCharacterData: null }),

    // --- Game flow ---
    setPaused: (paused: boolean) => set({ isPaused: paused }),
    setTurnMode: (mode: 'initiative' | 'free') => set({ turnMode: mode }),

    reset: () =>
      set({
        ...initialState,
        shopOpen: false,
        shopName: 'General Store',
        shopInventory: [],
        shopMarkup: 1.0,
        allies: [],
        enemies: [],
        places: [],
        timerSeconds: 0,
        timerRunning: false,
        timerTargetName: '',
        hiddenDiceResults: [],
        diceHistory: [],
        underwaterCombat: false,
        flankingEnabled: false,
        groupInitiativeEnabled: false,
        diagonalRule: 'standard' as const,
        ambientLight: 'bright' as const,
        travelPace: null,
        marchingOrder: [],
        inGameTime: null,
        restTracking: null,
        activeLightSources: [],
        pendingPlacement: null,
        weatherOverride: null,
        moonOverride: null,
        savedWeatherPresets: [],
        showWeatherOverlay: true,
        handouts: [],
        combatTimer: null,
        customEffects: [],
        combatLog: [],
        pendingGroupRoll: null,
        groupRollResults: [],
        currentFloor: 0,
        centerOnEntityId: null,
        sessionLog: [],
        currentSessionId: `session-${Date.now()}`,
        currentSessionLabel: `Session 1`,
        partyVisionCells: [],
        pendingReactionPrompt: null,
        sharedJournal: [],
        partyInventory: { items: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, transactionLog: [] },
        triggers: [],
        pendingTradeOffer: null,
        pendingTradeResult: null,
        inspectedCharacterData: null
      }),

    loadGameState: (
      state: Partial<import('../../types/game-state').GameState> & {
        allies?: SidebarEntry[]
        enemies?: SidebarEntry[]
        places?: SidebarEntry[]
        inGameTime?: InGameTimeState | null
        restTracking?: { lastLongRestSeconds: number | null; lastShortRestSeconds: number | null } | null
        activeLightSources?: ActiveLightSource[]
        sessionLog?: SessionLogEntry[]
        currentSessionId?: string
        currentSessionLabel?: string
        weatherOverride?: GameStoreState['weatherOverride']
        moonOverride?: string | null
        savedWeatherPresets?: GameStoreState['savedWeatherPresets']
        handouts?: Handout[]
        combatTimer?: CombatTimerConfig | null
        sharedJournal?: import('../../types/game-state').SharedJournalEntry[]
        partyInventory?: import('../../types/game-state').PartyInventory
      }
    ) => {
      const {
        allies,
        enemies,
        places,
        inGameTime,
        restTracking,
        activeLightSources,
        sessionLog,
        currentSessionId,
        currentSessionLabel,
        weatherOverride,
        moonOverride,
        savedWeatherPresets,
        handouts,
        combatTimer,
        sharedJournal,
        partyInventory,
        ...gameState
      } = state
      set({
        ...gameState,
        ...(allies ? { allies } : {}),
        ...(enemies ? { enemies } : {}),
        ...(places ? { places } : {}),
        ...(inGameTime !== undefined ? { inGameTime } : {}),
        ...(restTracking !== undefined ? { restTracking } : {}),
        ...(activeLightSources ? { activeLightSources } : {}),
        ...(sessionLog ? { sessionLog } : {}),
        ...(currentSessionId ? { currentSessionId } : {}),
        ...(currentSessionLabel ? { currentSessionLabel } : {}),
        ...(weatherOverride !== undefined ? { weatherOverride } : {}),
        ...(moonOverride !== undefined ? { moonOverride } : {}),
        ...(savedWeatherPresets ? { savedWeatherPresets } : {}),
        ...(handouts ? { handouts } : {}),
        ...(combatTimer !== undefined ? { combatTimer } : {}),
        ...(sharedJournal ? { sharedJournal } : {}),
        ...(partyInventory ? { partyInventory } : {})
      })
    },

    // --- Combat environment ---
    setUnderwaterCombat: (enabled: boolean) => set({ underwaterCombat: enabled }),
    setFlankingEnabled: (enabled: boolean) => set({ flankingEnabled: enabled }),
    setGroupInitiativeEnabled: (enabled: boolean) => set({ groupInitiativeEnabled: enabled }),
    setDiagonalRule: (rule: 'standard' | 'alternate') => set({ diagonalRule: rule }),
    setAmbientLight: (level: 'bright' | 'dim' | 'darkness') => set({ ambientLight: level }),

    // --- Exploration ---
    setTravelPace: (pace: 'fast' | 'normal' | 'slow' | null) => set({ travelPace: pace }),
    setMarchingOrder: (order: string[]) => set({ marchingOrder: order })
  }
})

// Re-export types
export type { GameStoreState, SessionLogEntry } from './types'
