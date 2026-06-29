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
   * always-on Pi relays the session; 'solo' = single-player only (no hosting).
   * Default 'p2p'. */
  hostingMode: 'p2p' | 'cloud' | 'solo'
}

interface DetailsStepProps {
  data: DetailsData
  onChange: (data: DetailsData) => void
}

export default function DetailsStep({ data, onChange }: DetailsStepProps): JSX.Element {
  const { t } = useT()
  // Solo is single-player: max-players and visibility don't apply, so they're hidden.
  const isSolo = data.hostingMode === 'solo'
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
            name="description"
            aria-label={t('campaign.detailsStep.descriptionPlaceholder')}
            className="w-full p-3 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
            rows={3}
            placeholder={t('campaign.detailsStep.descriptionPlaceholder')}
            value={data.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </div>

        {/* Hosting comes BEFORE max players: it determines whether max-players / visibility
            even apply (Solo hides both). */}
        <div>
          <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.hosting')}</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => update('hostingMode', 'p2p')}
              className={`flex-1 p-3 rounded-lg border text-start transition-all cursor-pointer
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
              className={`flex-1 p-3 rounded-lg border text-start transition-all cursor-pointer
                ${
                  data.hostingMode === 'cloud'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">{t('campaign.detailsStep.hostingCloud')}</div>
              <div className="text-xs text-muted mt-1">{t('campaign.detailsStep.hostingCloudDesc')}</div>
            </button>
            <button
              type="button"
              onClick={() => update('hostingMode', 'solo')}
              className={`flex-1 p-3 rounded-lg border text-start transition-all cursor-pointer
                ${
                  data.hostingMode === 'solo'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-border bg-surface/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">{t('campaign.detailsStep.hostingSolo')}</div>
              <div className="text-xs text-muted mt-1">{t('campaign.detailsStep.hostingSoloDesc')}</div>
            </button>
          </div>
        </div>

        {/* Max players only applies to multiplayer — hidden for Solo. */}
        {!isSolo && (
          <div>
            <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.maxPlayers')}</label>
            <input
              type="number"
              name="max-players"
              min={2}
              max={8}
              className="w-24 p-3 rounded-lg bg-surface-2 border border-border text-fg
                focus:outline-none focus:border-amber-500 transition-colors"
              value={maxPlayersDraft}
              onChange={(e) => {
                // WIZ-1 — clamp the upper bound on input so an out-of-range value
                // (e.g. 999) never shows in the field; the label promises 2-8. The
                // lower bound + empty field normalize on blur so the user can still
                // clear and retype.
                const next = e.target.value
                const raw = parseInt(next, 10)
                if (Number.isFinite(raw) && raw > 8) {
                  setMaxPlayersDraft('8')
                  update('maxPlayers', 8)
                } else {
                  setMaxPlayersDraft(next)
                  if (Number.isFinite(raw) && raw >= 2) update('maxPlayers', raw)
                }
              }}
              onBlur={() => {
                const raw = parseInt(maxPlayersDraft, 10)
                const numeric = Number.isFinite(raw) ? raw : 2
                const val = numeric < 2 ? 2 : numeric > 8 ? 8 : numeric
                setMaxPlayersDraft(String(val))
                update('maxPlayers', val)
              }}
            />
            <span className="text-gray-500 text-sm ms-3">{t('campaign.detailsStep.maxPlayersRange')}</span>
          </div>
        )}

        <div>
          <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.turnMode')}</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => update('turnMode', 'initiative')}
              className={`flex-1 p-3 rounded-lg border text-start transition-all cursor-pointer
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
              className={`flex-1 p-3 rounded-lg border text-start transition-all cursor-pointer
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

        {/* Lobby message greets players when they join — no lobby exists in solo. */}
        {!isSolo && (
          <div>
            <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.lobbyMessage')}</label>
            <textarea
              name="lobby-message"
              aria-label={t('campaign.detailsStep.lobbyMessagePlaceholder')}
              className="w-full p-3 rounded-lg bg-surface-2 border border-border text-fg
                placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
              rows={2}
              placeholder={t('campaign.detailsStep.lobbyMessagePlaceholder')}
              value={data.lobbyMessage}
              onChange={(e) => update('lobbyMessage', e.target.value)}
            />
          </div>
        )}

        {/* Visibility (public/private lobby listing) only applies to multiplayer. */}
        {!isSolo && (
          <div>
            <label className="block text-muted mb-2 text-sm">{t('campaign.detailsStep.visibility')}</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => update('isPublic', true)}
                className={`flex-1 p-3 rounded-lg border text-start transition-all cursor-pointer
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
                className={`flex-1 p-3 rounded-lg border text-start transition-all cursor-pointer
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
        )}
      </div>
    </div>
  )
}
