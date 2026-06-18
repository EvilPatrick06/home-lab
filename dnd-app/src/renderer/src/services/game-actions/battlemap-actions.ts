/**
 * PHASE-34 34H — the AI-initiated `generate_battlemap` executor. Hard-gated on the per-campaign
 * `allowMapGeneration` flag (the AI never even SEES the action unless it's on — but we gate here too,
 * defense in depth). Single-flight; fire-and-forget runner posts an auditable summary the AI reads
 * next turn (where to place_creature). Returns true synchronously (kick-off succeeded).
 */

import { useCampaignStore } from '../../stores/use-campaign-store'
import { getActiveCampaignId } from '../active-campaign-ref'
import { applyBattlemapSpec } from '../map/battlemap/apply-spec'
import { postDmMessage } from './broadcast-helpers'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

let inFlight = false

export function executeGenerateBattlemap(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const a = action as unknown as {
    description: string
    theme?: string
    widthCells?: number
    heightCells?: number
    switchTo?: boolean
  }
  const campaignId = getActiveCampaignId()
  const campaign = campaignId ? useCampaignStore.getState().campaigns.find((c) => c.id === campaignId) : undefined
  if ((campaign?.aiDm as { allowMapGeneration?: boolean } | undefined)?.allowMapGeneration !== true) {
    throw new Error('Map generation is disabled — enable it in AI DM settings')
  }
  if (!campaignId) throw new Error('No active campaign')
  if (inFlight) throw new Error('A battlemap is already generating')
  inFlight = true

  void (async () => {
    try {
      postDmMessage(stores, 'genmap', 'Generating battlemap…', true)
      const res = await window.api.ai.generateBattlemap({
        campaignId,
        prompt: a.description,
        theme: a.theme,
        widthCells: a.widthCells,
        heightCells: a.heightCells
      })
      if (!res.success || !res.spec) {
        postDmMessage(stores, 'genmap', `Battlemap generation failed: ${res.error ?? 'unknown error'}`, true)
        return
      }
      // applyBattlemapSpec posts the spawn-coords summary the AI uses for place_creature.
      applyBattlemapSpec(res.spec as never, { campaignId, switchTo: a.switchTo !== false, stores })
    } catch (err) {
      postDmMessage(stores, 'genmap', `Battlemap generation failed: ${(err as Error).message}`, true)
    } finally {
      inFlight = false
    }
  })()

  return true
}
