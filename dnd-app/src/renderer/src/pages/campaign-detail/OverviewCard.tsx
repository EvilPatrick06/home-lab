import { useState } from 'react'
import { Button, Card, Modal } from '../../components/ui'
import { useT } from '../../i18n'
import type { Campaign, TurnMode } from '../../types/campaign'

interface OverviewCardProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function OverviewCard({ campaign, saveCampaign }: OverviewCardProps): JSX.Element {
  const { t } = useT()
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
  // Draft string for the maxPlayers number input — clamp onBlur, see DetailsStep for context.
  const [maxPlayersDraft, setMaxPlayersDraft] = useState('4')

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
    setMaxPlayersDraft(String(campaign.settings.maxPlayers))
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
          <h3 className="text-lg font-semibold">{t('pages.overviewCard.title')}</h3>
          <button onClick={openOverviewEdit} className="text-xs text-muted hover:text-accent cursor-pointer">
            {t('pages.overviewCard.edit')}
          </button>
        </div>
        {campaign.description ? (
          <p className="text-gray-300 text-sm mb-4">{campaign.description}</p>
        ) : (
          <p className="text-gray-500 text-sm italic mb-4">{t('pages.overviewCard.noDescription')}</p>
        )}
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted">{t('pages.overviewCard.turnMode')}</span>
          <span className="capitalize">{campaign.turnMode}</span>
          <span className="text-muted">{t('pages.overviewCard.maxPlayers')}</span>
          <span>{campaign.settings.maxPlayers}</span>
          <span className="text-muted">{t('pages.overviewCard.levelRange')}</span>
          <span>
            {campaign.settings.levelRange.min} - {campaign.settings.levelRange.max}
          </span>
          <span className="text-muted">{t('pages.overviewCard.created')}</span>
          <span>{new Date(campaign.createdAt).toLocaleDateString()}</span>
        </div>
        {campaign.discordInviteUrl && (
          <div className="mt-4 pt-3 border-t border-gray-800">
            <span className="text-muted text-xs uppercase tracking-wider">{t('pages.overviewCard.discord')}</span>
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
            <span className="text-muted text-xs uppercase tracking-wider">{t('pages.overviewCard.lobbyMessage')}</span>
            <p className="text-gray-300 text-sm mt-1">{campaign.settings.lobbyMessage}</p>
          </div>
        )}
      </Card>

      {/* Overview Edit Modal */}
      <Modal
        open={showOverviewEdit}
        onClose={() => setShowOverviewEdit(false)}
        title={t('pages.overviewCard.editTitle')}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.overviewCard.campaignNameLabel')}</label>
            <input
              type="text"
              name="campaign-name"
              value={overviewForm.name}
              onChange={(e) => setOverviewForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.overviewCard.descriptionLabel')}</label>
            <textarea
              name="campaign-description"
              value={overviewForm.description}
              onChange={(e) => setOverviewForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500 h-20 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-muted text-xs mb-1">{t('pages.overviewCard.maxPlayers')}</label>
              <input
                type="number"
                name="max-players"
                value={maxPlayersDraft}
                onChange={(e) => setMaxPlayersDraft(e.target.value)}
                onBlur={() => {
                  const raw = parseInt(maxPlayersDraft, 10)
                  const numeric = Number.isFinite(raw) ? raw : 1
                  const clamped = numeric < 1 ? 1 : numeric > 8 ? 8 : numeric
                  setMaxPlayersDraft(String(clamped))
                  setOverviewForm((f) => ({ ...f, maxPlayers: clamped }))
                }}
                className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
                min={1}
                max={8}
              />
            </div>
            <div>
              <label className="block text-muted text-xs mb-1">{t('pages.overviewCard.turnMode')}</label>
              <select
                name="turn-mode"
                value={overviewForm.turnMode}
                onChange={(e) => setOverviewForm((f) => ({ ...f, turnMode: e.target.value as TurnMode }))}
                className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
              >
                <option value="initiative">{t('pages.overviewCard.turnModeInitiative')}</option>
                <option value="free">{t('pages.overviewCard.turnModeFree')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-muted text-xs mb-1">{t('pages.overviewCard.levelMin')}</label>
              <input
                type="number"
                name="level-min"
                value={overviewForm.levelMin}
                onChange={(e) =>
                  setOverviewForm((f) => ({ ...f, levelMin: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                }
                className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
                min={1}
                max={20}
              />
            </div>
            <div>
              <label className="block text-muted text-xs mb-1">{t('pages.overviewCard.levelMax')}</label>
              <input
                type="number"
                name="level-max"
                value={overviewForm.levelMax}
                onChange={(e) =>
                  setOverviewForm((f) => ({ ...f, levelMax: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                }
                className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
                min={1}
                max={20}
              />
            </div>
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.overviewCard.discordInviteUrlLabel')}</label>
            <input
              type="url"
              name="discord-invite-url"
              value={overviewForm.discordInviteUrl}
              onChange={(e) => setOverviewForm((f) => ({ ...f, discordInviteUrl: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('pages.overviewCard.discordInviteUrlPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-muted text-xs mb-1">{t('pages.overviewCard.lobbyMessage')}</label>
            <textarea
              name="lobby-message"
              value={overviewForm.lobbyMessage}
              onChange={(e) => setOverviewForm((f) => ({ ...f, lobbyMessage: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500 h-16 resize-none"
              placeholder={t('pages.overviewCard.lobbyMessagePlaceholder')}
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowOverviewEdit(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSaveOverview} disabled={!overviewForm.name.trim()}>
            {t('common.actions.save')}
          </Button>
        </div>
      </Modal>
    </>
  )
}
