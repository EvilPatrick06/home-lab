import { useCampaignStore } from '../../stores/use-campaign-store'
import { useGameStore } from '../../stores/use-game-store'
import type { Campaign, SavedGameState } from '../../types/campaign'

/**
 * Builds a savable campaign by merging current game state back onto the campaign object.
 */
export function buildSavableCampaign(campaign: Campaign): Campaign {
  const gs = useGameStore.getState()

  const savedGameState: SavedGameState = {
    initiative: gs.initiative,
    round: gs.round,
    conditions: gs.conditions,
    turnStates: gs.turnStates,
    isPaused: gs.isPaused,
    underwaterCombat: gs.underwaterCombat,
    ambientLight: gs.ambientLight,
    travelPace: gs.travelPace,
    marchingOrder: gs.marchingOrder,
    allies: gs.allies,
    enemies: gs.enemies,
    places: gs.places,
    inGameTime: gs.inGameTime,
    restTracking: gs.restTracking,
    activeLightSources: gs.activeLightSources,
    handouts: gs.handouts,
    combatTimer: gs.combatTimer ?? undefined
  }

  return {
    ...campaign,
    maps: gs.maps,
    activeMapId: gs.activeMapId ?? undefined,
    savedGameState,
    updatedAt: new Date().toISOString()
  }
}

/**
 * Saves the current game state into the campaign and persists it.
 */
export async function saveGameState(campaign: Campaign): Promise<void> {
  const savable = buildSavableCampaign(campaign)
  await useCampaignStore.getState().saveCampaign(savable)
}
