import { AI_PROVIDER_LABELS } from '../../constants'
import { PRESET_LABELS } from '../../data/calendar-presets'
import { useT } from '../../i18n'
import type { AiProviderType, CalendarConfig, CampaignType, CustomRule, TurnMode } from '../../types/campaign'
import type { GameSystem } from '../../types/game-system'
import { GAME_SYSTEMS } from '../../types/game-system'
import type { GameMap } from '../../types/map'
import { Button, Card } from '../ui'
import type { SessionZeroData } from './SessionZeroStep'

interface AiDmSummary {
  provider: AiProviderType
  model: string
  ollamaUrl: string
}

interface ReviewStepProps {
  system: GameSystem
  name: string
  description: string
  maxPlayers: number
  turnMode: TurnMode
  lobbyMessage: string
  campaignType: CampaignType
  adventureName: string | null
  customRules: CustomRule[]
  maps: GameMap[]
  customAudioCount?: number
  calendar?: CalendarConfig | null
  aiDm?: AiDmSummary | null
  sessionZero?: SessionZeroData | null
  onSubmit: () => void
  submitting: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  combat: 'bg-red-900/40 text-red-300',
  exploration: 'bg-green-900/40 text-green-300',
  social: 'bg-blue-900/40 text-blue-300',
  rest: 'bg-purple-900/40 text-purple-300',
  other: 'bg-surface-2 text-gray-300'
}

export default function ReviewStep({
  system,
  name,
  description,
  maxPlayers,
  turnMode,
  lobbyMessage,
  campaignType,
  adventureName,
  customRules,
  maps,
  customAudioCount,
  calendar,
  aiDm,
  sessionZero,
  onSubmit,
  submitting
}: ReviewStepProps): JSX.Element {
  const { t } = useT()
  const hasSessionZeroData =
    sessionZero &&
    (sessionZero.tone !== 'heroic' ||
      sessionZero.pvpAllowed ||
      sessionZero.characterDeathExpectation !== 'possible' ||
      sessionZero.contentLimits.length > 0 ||
      sessionZero.playSchedule.trim() ||
      sessionZero.additionalNotes.trim())

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">{t('campaign.reviewStep.title')}</h2>
      <p className="text-muted text-sm mb-6">{t('campaign.reviewStep.subtitle')}</p>

      <div className="max-w-2xl space-y-4">
        <Card>
          <h3 className="text-lg font-semibold mb-3">{t('campaign.reviewStep.general')}</h3>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted">{t('campaign.reviewStep.name')}</span>
            <span>{name}</span>

            <span className="text-muted">{t('campaign.reviewStep.system')}</span>
            <span>{GAME_SYSTEMS[system]?.name ?? system}</span>

            <span className="text-muted">{t('campaign.reviewStep.type')}</span>
            <span className="capitalize">
              {campaignType === 'preset'
                ? t('campaign.reviewStep.adventureType', {
                    name: adventureName || t('campaign.reviewStep.noneSelected')
                  })
                : t('campaign.reviewStep.customCampaign')}
            </span>

            {description && (
              <>
                <span className="text-muted">{t('campaign.reviewStep.description')}</span>
                <span>{description}</span>
              </>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold mb-3">{t('campaign.reviewStep.settings')}</h3>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted">{t('campaign.reviewStep.maxPlayers')}</span>
            <span>{maxPlayers}</span>

            <span className="text-muted">{t('campaign.reviewStep.turnMode')}</span>
            <span className="capitalize">{turnMode}</span>

            {lobbyMessage && (
              <>
                <span className="text-muted">{t('campaign.reviewStep.lobbyMessage')}</span>
                <span>{lobbyMessage}</span>
              </>
            )}
          </div>
        </Card>

        {customRules.length > 0 && (
          <Card>
            <h3 className="text-lg font-semibold mb-3">
              {t('campaign.reviewStep.houseRules', { count: customRules.length })}
            </h3>
            <div className="space-y-2">
              {customRules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-2 text-sm">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[rule.category]}`}>
                    {rule.category}
                  </span>
                  <span>{rule.name}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {calendar && (
          <Card>
            <h3 className="text-lg font-semibold mb-3">{t('campaign.reviewStep.calendar')}</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted">{t('campaign.reviewStep.calendarSystem')}</span>
              <span>{PRESET_LABELS[calendar.preset]}</span>
              <span className="text-muted">{t('campaign.reviewStep.startingYear')}</span>
              <span>
                {calendar.startingYear} {calendar.yearLabel}
              </span>
              <span className="text-muted">{t('campaign.reviewStep.timeDisplay')}</span>
              <span className="capitalize">{calendar.exactTimeDefault}</span>
            </div>
          </Card>
        )}

        {aiDm && (
          <Card>
            <h3 className="text-lg font-semibold mb-3">{t('campaign.reviewStep.aiDm')}</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted">{t('campaign.reviewStep.provider')}</span>
              <span>{AI_PROVIDER_LABELS[aiDm.provider] ?? aiDm.provider}</span>
              <span className="text-muted">{t('campaign.reviewStep.model')}</span>
              <span>{aiDm.model}</span>
              {aiDm.provider === 'ollama' && (
                <>
                  <span className="text-muted">{t('campaign.reviewStep.url')}</span>
                  <span className="text-xs text-gray-300">{aiDm.ollamaUrl}</span>
                </>
              )}
            </div>
          </Card>
        )}

        {maps.length > 0 && (
          <Card>
            <h3 className="text-lg font-semibold mb-3">{t('campaign.reviewStep.maps', { count: maps.length })}</h3>
            <div className="flex flex-wrap gap-2">
              {maps.map((map) => (
                <span key={map.id} className="text-sm bg-surface-2 px-3 py-1 rounded-full text-gray-300">
                  {map.name}
                </span>
              ))}
            </div>
          </Card>
        )}

        {!!customAudioCount && customAudioCount > 0 && (
          <Card>
            <h3 className="text-lg font-semibold mb-3">
              {t('campaign.reviewStep.customAudio', { count: customAudioCount })}
            </h3>
            <p className="text-sm text-muted">
              {t('campaign.reviewStep.customAudioNote', { count: customAudioCount })}
            </p>
          </Card>
        )}

        {hasSessionZeroData && sessionZero && (
          <Card>
            <h3 className="text-lg font-semibold mb-3">{t('campaign.reviewStep.sessionZero')}</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted">{t('campaign.reviewStep.tone')}</span>
              <span className="capitalize">{sessionZero.tone}</span>

              <span className="text-muted">{t('campaign.reviewStep.pvp')}</span>
              <span>
                {sessionZero.pvpAllowed ? t('campaign.reviewStep.allowed') : t('campaign.reviewStep.notAllowed')}
              </span>

              <span className="text-muted">{t('campaign.reviewStep.characterDeath')}</span>
              <span className="capitalize">{sessionZero.characterDeathExpectation}</span>

              {sessionZero.contentLimits.length > 0 && (
                <>
                  <span className="text-muted">{t('campaign.reviewStep.contentLimits')}</span>
                  <span>{sessionZero.contentLimits.join(', ')}</span>
                </>
              )}

              {sessionZero.playSchedule.trim() && (
                <>
                  <span className="text-muted">{t('campaign.reviewStep.schedule')}</span>
                  <span>{sessionZero.playSchedule}</span>
                </>
              )}
            </div>
          </Card>
        )}

        <div className="pt-2">
          <Button onClick={onSubmit} disabled={submitting} className="w-full py-3 text-lg">
            {submitting ? t('campaign.reviewStep.creating') : t('campaign.reviewStep.create')}
          </Button>
        </div>
      </div>
    </div>
  )
}
