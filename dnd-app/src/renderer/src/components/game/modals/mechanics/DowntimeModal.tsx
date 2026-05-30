import { useEffect, useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { addToast } from '../../../../hooks/use-toast'
import { type LanguageEntry, load5eLanguages } from '../../../../services/data-provider'
import {
  type DowntimeActivity,
  type ExtendedDowntimeActivity,
  getActiveDowntimeForCharacter,
  loadDowntimeActivities,
  loadExtendedDowntimeActivities
} from '../../../../services/downtime-service'
import type { Campaign } from '../../../../types/campaign'
import type { Character5e } from '../../../../types/character-5e'
import { logger } from '../../../../utils/logger'
import ActivitiesTab from './downtime/ActivitiesTab'
import CraftingTab from './downtime/CraftingTab'
import ExtendedTab from './downtime/ExtendedTab'
import TrainingTab from './downtime/TrainingTab'

type DowntimeTab = 'activities' | 'extended' | 'crafting' | 'training'

interface DowntimeModalProps {
  characterName?: string
  characterId?: string
  character?: Character5e | null
  campaign: Campaign
  onClose: () => void
  onApply?: (activity: string, days: number, goldCost: number, details: string) => void
  onSaveCampaign?: (campaign: Campaign) => void
  onBroadcastResult?: (message: string) => void
}

export default function DowntimeModal({
  characterName,
  characterId,
  character,
  campaign,
  onClose,
  onApply,
  onSaveCampaign,
  onBroadcastResult
}: DowntimeModalProps): JSX.Element {
  useEscapeKey(onClose)
  const [tab, setTab] = useState<DowntimeTab>('activities')
  const [activities, setActivities] = useState<DowntimeActivity[]>([])
  const [extendedActivities, setExtendedActivities] = useState<ExtendedDowntimeActivity[]>([])
  const [languages, setLanguages] = useState<LanguageEntry[]>([])

  useEffect(() => {
    loadDowntimeActivities()
      .then(setActivities)
      .catch((err) => {
        logger.error('Failed to load downtime activities', err)
        addToast('Failed to load downtime activities', 'error')
        setActivities([])
      })
    loadExtendedDowntimeActivities()
      .then(setExtendedActivities)
      .catch((err) => {
        logger.error('Failed to load extended downtime activities', err)
        addToast('Failed to load extended downtime activities', 'error')
        setExtendedActivities([])
      })
    load5eLanguages()
      .then(setLanguages)
      .catch((err) => {
        logger.error('Failed to load languages', err)
        addToast('Failed to load languages', 'error')
        setLanguages([])
      })
  }, [])

  const activeEntries = characterId ? getActiveDowntimeForCharacter(campaign, characterId) : []

  const saveCampaign = (c: Campaign): void => {
    onSaveCampaign?.(c)
    // boundary cast: IPC saveCampaign takes Record<string, unknown>; Campaign has no index signature
    window.api.saveCampaign(c as unknown as Record<string, unknown>)
  }

  const tabs: { id: DowntimeTab; label: string }[] = [
    { id: 'activities', label: 'Activities' },
    { id: 'extended', label: 'Extended' },
    { id: 'crafting', label: 'Crafting' },
    { id: 'training', label: 'Training' }
  ]

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-[600px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-bold text-amber-400">
            Downtime Activities {characterName ? `\u2014 ${characterName}` : ''}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 cursor-pointer">
            &#10005;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                tab === t.id
                  ? 'text-amber-400 border-b-2 border-amber-400 bg-gray-800/50'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {tab === 'activities' && (
            <ActivitiesTab
              activities={activities}
              activeEntries={activeEntries}
              characterId={characterId}
              characterName={characterName}
              campaign={campaign}
              onApply={onApply}
              onClose={onClose}
              saveCampaign={saveCampaign}
              onBroadcastResult={onBroadcastResult}
            />
          )}
          {tab === 'extended' && (
            <ExtendedTab
              activities={extendedActivities}
              characterName={characterName}
              onBroadcastResult={onBroadcastResult}
            />
          )}
          {tab === 'crafting' && (
            <CraftingTab
              character={character}
              characterId={characterId}
              characterName={characterName}
              campaign={campaign}
              saveCampaign={saveCampaign}
              onBroadcastResult={onBroadcastResult}
            />
          )}
          {tab === 'training' && (
            <TrainingTab
              character={character}
              characterId={characterId}
              characterName={characterName}
              campaign={campaign}
              activeEntries={activeEntries}
              languages={languages}
              saveCampaign={saveCampaign}
              onBroadcastResult={onBroadcastResult}
            />
          )}
        </div>
      </div>
    </div>
  )
}
