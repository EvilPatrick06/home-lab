import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import type { TurnMode } from '../../types/campaign'
import { Input } from '../ui'

interface DetailsData {
  name: string
  description: string
  maxPlayers: number
  turnMode: TurnMode
  lobbyMessage: string
  isPublic: boolean
  /** Phase 32 — 'p2p' = this device hosts the WebRTC mesh; 'cloud' = the
   * always-on Pi relays the session. Default 'p2p'. */
  hostingMode: 'p2p' | 'cloud'
}

interface DetailsStepProps {
  data: DetailsData
  onChange: (data: DetailsData) => void
}

export default function DetailsStep({ data, onChange }: DetailsStepProps): JSX.Element {
  const { t } = useT()
  const update = <K extends keyof DetailsData>(key: K, value: DetailsData[K]): void => {
    onChange({ ...data, [key]: value })
  }

  // Draft string for the maxPlayers number input — keeps "-99" et al visible during typing
  // and clamps onBlur. Per-keystroke clamping reads "-", "9", "9" as 1, 19, 60 (max).
  const [maxPlayersDraft, setMaxPlayersDraft] = useState(() => String(data.maxPlayers))
  useEffect(() => {
    setMaxPlayersDraft(String(data.maxPlayers))
  }, [data.maxPlayers])

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">{t('campaign.detailsStep.title')}</h2>
      <p className="text-muted text-sm mb-6">{t('campaign.detailsStep.subtitle')}</p>

      <div className="max-w-lg space-y-5">
        <Input
          label={t('campaign.detailsStep.campaignName')}
          placeholder={t('campaign.detailsStep.campaignNamePlaceholder')}
          value={data.name}
          onChange={(e) => update('name', e.target.value)}
          required
        />

        <div>
          <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.description')}</label>
          <textarea
            aria-label={t('campaign.detailsStep.descriptionPlaceholder')}
            className="w-full p-3 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
            rows={3}
            placeholder={t('campaign.detailsStep.descriptionPlaceholder')}
            value={data.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.maxPlayers')}</label>
          <input
            type="number"
            min={2}
            max={8}
            className="w-24 p-3 rounded-lg bg-surface-2 border border-border text-fg
              focus:outline-none focus:border-amber-500 transition-colors"
            value={maxPlayersDraft}
            onChange={(e) => setMaxPlayersDraft(e.target.value)}
            onBlur={() => {
              const raw = parseInt(maxPlayersDraft, 10)
              const numeric = Number.isFinite(raw) ? raw : 2
              const val = numeric < 2 ? 2 : numeric > 8 ? 8 : numeric
              setMaxPlayersDraft(String(val))
              update('maxPlayers', val)
            }}
          />
          <span className="text-gray-500 text-sm ml-3">{t('campaign.detailsStep.maxPlayersRange')}</span>
        </div>

        <div>
          <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.turnMode')}</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => update('turnMode', 'initiative')}
              className={`flex-1 p-3 rounded-lg border text-left transition-all cursor-pointer
                ${
                  data.turnMode === 'initiative'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">{t('campaign.detailsStep.initiative')}</div>
              <div className="text-xs text-muted mt-1">{t('campaign.detailsStep.initiativeDesc')}</div>
            </button>
            <button
              type="button"
              onClick={() => update('turnMode', 'free')}
              className={`flex-1 p-3 rounded-lg border text-left transition-all cursor-pointer
                ${
                  data.turnMode === 'free'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">{t('campaign.detailsStep.free')}</div>
              <div className="text-xs text-muted mt-1">{t('campaign.detailsStep.freeDesc')}</div>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.lobbyMessage')}</label>
          <textarea
            aria-label={t('campaign.detailsStep.lobbyMessagePlaceholder')}
            className="w-full p-3 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
            rows={2}
            placeholder={t('campaign.detailsStep.lobbyMessagePlaceholder')}
            value={data.lobbyMessage}
            onChange={(e) => update('lobbyMessage', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.visibility')}</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => update('isPublic', true)}
              className={`flex-1 p-3 rounded-lg border text-left transition-all cursor-pointer
                ${
                  data.isPublic
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">{t('campaign.detailsStep.public')}</div>
              <div className="text-xs text-muted mt-1">{t('campaign.detailsStep.publicDesc')}</div>
            </button>
            <button
              type="button"
              onClick={() => update('isPublic', false)}
              className={`flex-1 p-3 rounded-lg border text-left transition-all cursor-pointer
                ${
                  !data.isPublic
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">{t('campaign.detailsStep.private')}</div>
              <div className="text-xs text-muted mt-1">{t('campaign.detailsStep.privateDesc')}</div>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.hosting')}</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => update('hostingMode', 'p2p')}
              className={`flex-1 p-3 rounded-lg border text-left transition-all cursor-pointer
                ${
                  data.hostingMode === 'p2p'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">{t('campaign.detailsStep.hostingThisDevice')}</div>
              <div className="text-xs text-muted mt-1">{t('campaign.detailsStep.hostingThisDeviceDesc')}</div>
            </button>
            <button
              type="button"
              onClick={() => update('hostingMode', 'cloud')}
              className={`flex-1 p-3 rounded-lg border text-left transition-all cursor-pointer
                ${
                  data.hostingMode === 'cloud'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">{t('campaign.detailsStep.hostingCloud')}</div>
              <div className="text-xs text-muted mt-1">{t('campaign.detailsStep.hostingCloudDesc')}</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
