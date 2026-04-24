import { useState } from 'react'
import { Button, Card, Modal } from '../../components/ui'
import type { Campaign, TurnMode } from '../../types/campaign'

interface OverviewCardProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function OverviewCard({ campaign, saveCampaign }: OverviewCardProps): JSX.Element {
  const [showOverviewEdit, setShowOverviewEdit] = useState(false)
  const [overviewForm, setOverviewForm] = useState({
    name: '',
    description: '',
    maxPlayers: 4,
    turnMode: 'initiative' as TurnMode,
    levelMin: 1,
    levelMax: 20,
    lobbyMessage: '',
    discordInviteUrl: ''
  })

  const openOverviewEdit = (): void => {
    setOverviewForm({
      name: campaign.name,
      description: campaign.description,
      maxPlayers: campaign.settings.maxPlayers,
      turnMode: campaign.turnMode,
      levelMin: campaign.settings.levelRange.min,
      levelMax: campaign.settings.levelRange.max,
      lobbyMessage: campaign.settings.lobbyMessage,
      discordInviteUrl: campaign.discordInviteUrl ?? ''
    })
    setShowOverviewEdit(true)
  }

  const handleSaveOverview = async (): Promise<void> => {
    await saveCampaign({
      ...campaign,
      name: overviewForm.name.trim() || campaign.name,
      description: overviewForm.description,
      turnMode: overviewForm.turnMode,
      discordInviteUrl: overviewForm.discordInviteUrl.trim() || undefined,
      settings: {
        ...campaign.settings,
        maxPlayers: overviewForm.maxPlayers,
        levelRange: { min: overviewForm.levelMin, max: overviewForm.levelMax },
        lobbyMessage: overviewForm.lobbyMessage
      },
      updatedAt: new Date().toISOString()
    })
    setShowOverviewEdit(false)
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Overview</h3>
          <button onClick={openOverviewEdit} className="text-xs text-gray-400 hover:text-amber-400 cursor-pointer">
            Edit
          </button>
        </div>
        {campaign.description ? (
          <p className="text-gray-300 text-sm mb-4">{campaign.description}</p>
        ) : (
          <p className="text-gray-500 text-sm italic mb-4">No description</p>
        )}
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-gray-400">Turn Mode</span>
          <span className="capitalize">{campaign.turnMode}</span>
          <span className="text-gray-400">Max Players</span>
          <span>{campaign.settings.maxPlayers}</span>
          <span className="text-gray-400">Level Range</span>
          <span>
            {campaign.settings.levelRange.min} - {campaign.settings.levelRange.max}
          </span>
          <span className="text-gray-400">Created</span>
          <span>{new Date(campaign.createdAt).toLocaleDateString()}</span>
        </div>
        {campaign.discordInviteUrl && (
          <div className="mt-4 pt-3 border-t border-gray-800">
            <span className="text-gray-400 text-xs uppercase tracking-wider">Discord</span>
            <a
              href={campaign.discordInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-indigo-400 hover:text-indigo-300 text-sm mt-1 truncate"
            >
              {campaign.discordInviteUrl}
            </a>
          </div>
        )}
        {campaign.settings.lobbyMessage && (
          <div className="mt-4 pt-3 border-t border-gray-800">
            <span className="text-gray-400 text-xs uppercase tracking-wider">Lobby Message</span>
            <p className="text-gray-300 text-sm mt-1">{campaign.settings.lobbyMessage}</p>
          </div>
        )}
      </Card>

      {/* Overview Edit Modal */}
      <Modal open={showOverviewEdit} onClose={() => setShowOverviewEdit(false)} title="Edit Overview">
        <div className="space-y-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Campaign Name *</label>
            <input
              type="text"
              value={overviewForm.name}
              onChange={(e) => setOverviewForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Description</label>
            <textarea
              value={overviewForm.description}
              onChange={(e) => setOverviewForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-20 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-xs mb-1">Max Players</label>
              <input
                type="number"
                value={overviewForm.maxPlayers}
                onChange={(e) =>
                  setOverviewForm((f) => ({
                    ...f,
                    maxPlayers: Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1))
                  }))
                }
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                min={1}
                max={8}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Turn Mode</label>
              <select
                value={overviewForm.turnMode}
                onChange={(e) => setOverviewForm((f) => ({ ...f, turnMode: e.target.value as TurnMode }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              >
                <option value="initiative">Initiative</option>
                <option value="free">Free</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-xs mb-1">Level Min</label>
              <input
                type="number"
                value={overviewForm.levelMin}
                onChange={(e) =>
                  setOverviewForm((f) => ({ ...f, levelMin: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                }
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                min={1}
                max={20}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Level Max</label>
              <input
                type="number"
                value={overviewForm.levelMax}
                onChange={(e) =>
                  setOverviewForm((f) => ({ ...f, levelMax: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                }
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                min={1}
                max={20}
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Discord Invite URL</label>
            <input
              type="url"
              value={overviewForm.discordInviteUrl}
              onChange={(e) => setOverviewForm((f) => ({ ...f, discordInviteUrl: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              placeholder="https://discord.gg/..."
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Lobby Message</label>
            <textarea
              value={overviewForm.lobbyMessage}
              onChange={(e) => setOverviewForm((f) => ({ ...f, lobbyMessage: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-16 resize-none"
              placeholder="Message shown to players in the lobby"
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowOverviewEdit(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveOverview} disabled={!overviewForm.name.trim()}>
            Save
          </Button>
        </div>
      </Modal>
    </>
  )
}
