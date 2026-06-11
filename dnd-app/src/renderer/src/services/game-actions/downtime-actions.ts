/**
 * Downtime DM actions (P6.14 — G23).
 *
 * The engine tracks downtime activities on the campaign (campaign.downtimeProgress,
 * with day/gold budgets + status), edited via the DowntimeModal UI. The AI DM had no
 * verbs to start or advance them. These executors mutate the active campaign through
 * the downtime-service helpers and persist via the campaign store.
 *
 * Renderer-side `DmAction` is the loose `{ action: string; [k]: unknown }` shape, so
 * fields are read with explicit `as` casts, matching the other executors here.
 */

import { useCampaignStore } from '../../stores/use-campaign-store'
import type { DowntimeProgressEntry } from '../../types/campaign'
import { addDowntimeProgress, advanceTrackedDowntime } from '../downtime-service'
import { postDmMessage } from './broadcast-helpers'
import { resolveCharacterIdByName } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

export function executeStartDowntime(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const characterName = action.characterName as string
  const activityId = action.activityId as string
  const activityName = action.activityName as string
  const daysRequired = action.daysRequired as number
  const goldRequired = (action.goldRequired as number | undefined) ?? 0
  const details = action.details as string | undefined

  const campaign = useCampaignStore.getState().getActiveCampaign()
  if (!campaign) throw new Error('No active campaign for downtime')

  // 08G — store the real character id (not a peerId) so the per-character downtime UI finds it;
  // the name fallback keeps solo/offline flows (no lobby roster) working.
  const characterId = resolveCharacterIdByName(characterName, stores) ?? characterName
  const entry: DowntimeProgressEntry = {
    id: crypto.randomUUID(),
    activityId,
    activityName,
    characterId,
    characterName,
    daysSpent: 0,
    daysRequired,
    goldSpent: 0,
    goldRequired,
    startedAt: new Date().toISOString(),
    details,
    status: 'in-progress'
  }
  const updated = addDowntimeProgress(campaign, entry)
  useCampaignStore
    .getState()
    .saveCampaign(updated)
    .catch(() => {})
  postDmMessage(
    stores,
    'downtime-start',
    `🛠️ ${characterName} begins ${activityName} (${daysRequired} days${goldRequired > 0 ? `, ${goldRequired} gp` : ''}).`
  )
  return true
}

export function executeAdvanceDowntime(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const characterName = action.characterName as string
  const activityName = action.activityName as string | undefined
  const days = action.days as number

  const campaign = useCampaignStore.getState().getActiveCampaign()
  if (!campaign) throw new Error('No active campaign for downtime')

  const entry = (campaign.downtimeProgress ?? []).find(
    (e) =>
      e.status === 'in-progress' &&
      e.characterName.toLowerCase() === characterName.toLowerCase() &&
      (!activityName || e.activityName.toLowerCase() === activityName.toLowerCase())
  )
  if (!entry) throw new Error(`No in-progress downtime for ${characterName}${activityName ? ` (${activityName})` : ''}`)

  const { campaign: updated, complete } = advanceTrackedDowntime(campaign, entry.id, days)
  useCampaignStore
    .getState()
    .saveCampaign(updated)
    .catch(() => {})

  const after = updated.downtimeProgress?.find((e) => e.id === entry.id)
  postDmMessage(
    stores,
    'downtime-advance',
    complete
      ? `✅ ${characterName} completes ${entry.activityName}!`
      : `⏳ ${characterName} spends ${days} day${days !== 1 ? 's' : ''} on ${entry.activityName} (${after?.daysSpent ?? entry.daysSpent}/${entry.daysRequired} days).`
  )
  return true
}
