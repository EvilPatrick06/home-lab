import { useState } from 'react'
import type { SessionZeroData } from '../../components/campaign/SessionZeroStep'
import SessionZeroStep, { DEFAULT_SESSION_ZERO } from '../../components/campaign/SessionZeroStep'
import { Button, Card, Modal } from '../../components/ui'
import { useT } from '../../i18n'
import type { Campaign, CustomRule } from '../../types/campaign'

interface SessionZeroCardProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function SessionZeroCard({ campaign, saveCampaign }: SessionZeroCardProps): JSX.Element | null {
  const { t } = useT()
  const [showSessionZeroEdit, setShowSessionZeroEdit] = useState(false)
  const [editSessionZero, setEditSessionZero] = useState<SessionZeroData>({
    contentLimits: [],
    tone: 'heroic',
    pvpAllowed: false,
    characterDeathExpectation: 'possible',
    playSchedule: '',
    additionalNotes: '',
    lines: [],
    veils: [],
    xCardEnabled: false
  })
  const [editSessionZeroRules, setEditSessionZeroRules] = useState<CustomRule[]>([])
  const [newBanTopic, setNewBanTopic] = useState('')

  // PHASE-32 — render for EVERY campaign (defaults when no session-zero data) so any campaign can opt in.
  const sz = campaign.sessionZero ?? DEFAULT_SESSION_ZERO
  // Lines display-merge legacy contentLimits (one-way migration happens on first edit in the step).
  const lineTopics = [...new Set([...(sz.lines ?? []), ...sz.contentLimits])]
  const veilTopics = sz.veils ?? []
  const banList = campaign.aiBanList ?? []

  const removeBan = async (id: string): Promise<void> => {
    await saveCampaign({
      ...campaign,
      aiBanList: banList.filter((b) => b.id !== id),
      updatedAt: new Date().toISOString()
    })
  }
  const addBan = async (): Promise<void> => {
    const topic = newBanTopic.trim()
    if (!topic) return
    const entry = { id: crypto.randomUUID(), topic, addedAt: new Date().toISOString(), source: 'manual' as const }
    await saveCampaign({ ...campaign, aiBanList: [...banList, entry], updatedAt: new Date().toISOString() })
    setNewBanTopic('')
  }

  const openSessionZeroEdit = (): void => {
    const sz = campaign.sessionZero
    setEditSessionZero(
      sz
        ? { ...sz }
        : {
            contentLimits: [],
            tone: 'heroic',
            pvpAllowed: false,
            characterDeathExpectation: 'possible',
            playSchedule: '',
            additionalNotes: '',
            lines: [],
            veils: [],
            xCardEnabled: false
          }
    )
    setEditSessionZeroRules([...campaign.customRules])
    setShowSessionZeroEdit(true)
  }

  const handleSaveSessionZero = async (): Promise<void> => {
    await saveCampaign({
      ...campaign,
      sessionZero: editSessionZero,
      customRules: editSessionZeroRules,
      updatedAt: new Date().toISOString()
    })
    setShowSessionZeroEdit(false)
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{t('pages.sessionZeroCard.title')}</h3>
          <button onClick={openSessionZeroEdit} className="text-xs text-muted hover:text-accent cursor-pointer">
            {t('pages.sessionZeroCard.edit')}
          </button>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{t('pages.sessionZeroCard.tone')}</span>
            <span className="text-gray-200 capitalize">{sz.tone}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{t('pages.sessionZeroCard.pvp')}</span>
            <span className={sz.pvpAllowed ? 'text-red-400' : 'text-green-400'}>
              {sz.pvpAllowed ? t('pages.sessionZeroCard.allowed') : t('pages.sessionZeroCard.notAllowed')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{t('pages.sessionZeroCard.characterDeath')}</span>
            <span className="text-gray-200 capitalize">{sz.characterDeathExpectation}</span>
          </div>
          {lineTopics.length > 0 && (
            <div>
              <span className="text-gray-500">{t('pages.sessionZeroCard.lines')}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {lineTopics.map((l) => (
                  <span key={l} className="text-xs bg-red-900/30 text-red-300 px-2 py-0.5 rounded">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}
          {veilTopics.length > 0 && (
            <div>
              <span className="text-gray-500">{t('pages.sessionZeroCard.veils')}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {veilTopics.map((v) => (
                  <span key={v} className="text-xs bg-amber-900/30 text-amber-300 px-2 py-0.5 rounded">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{t('pages.sessionZeroCard.xCard')}</span>
            <span className={sz.xCardEnabled ? 'text-green-400' : 'text-gray-400'}>
              {sz.xCardEnabled ? t('pages.sessionZeroCard.allowed') : t('pages.sessionZeroCard.notAllowed')}
            </span>
          </div>
          {sz.playSchedule && (
            <div>
              <span className="text-gray-500">{t('pages.sessionZeroCard.schedule')}</span>{' '}
              <span className="text-gray-200">{sz.playSchedule}</span>
            </div>
          )}
          {/* PHASE-32 — AI ban list (topics added by the X-card during play, or manually here). */}
          <div className="pt-1">
            <span className="text-gray-500">{t('pages.sessionZeroCard.banList')}</span>
            {banList.length > 0 ? (
              <div className="flex flex-col gap-1 mt-1">
                {banList.map((b) => (
                  <div key={b.id} className="flex items-center gap-2">
                    <span className="text-xs bg-red-900/30 text-red-300 px-2 py-0.5 rounded">{b.topic}</span>
                    <span className="text-[10px] text-gray-600">{b.source}</span>
                    <button
                      onClick={() => void removeBan(b.id)}
                      className="text-[10px] text-gray-500 hover:text-red-300 cursor-pointer"
                    >
                      {t('pages.sessionZeroCard.banRemove')}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-gray-600 ms-1">{t('pages.sessionZeroCard.banEmpty')}</span>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <input
                name="ban-topic"
                value={newBanTopic}
                onChange={(e) => setNewBanTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addBan()}
                placeholder={t('pages.sessionZeroCard.banPlaceholder')}
                className="flex-1 px-2 py-1 text-xs bg-surface-2 border border-border rounded text-gray-200"
              />
              <button
                onClick={() => void addBan()}
                disabled={!newBanTopic.trim()}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer disabled:opacity-40"
              >
                {t('pages.sessionZeroCard.banAdd')}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Session Zero Edit Modal */}
      <Modal
        open={showSessionZeroEdit}
        onClose={() => setShowSessionZeroEdit(false)}
        title={t('pages.sessionZeroCard.editTitle')}
      >
        <div className="max-h-[60vh] overflow-y-auto pe-1">
          <SessionZeroStep
            data={editSessionZero}
            onChange={setEditSessionZero}
            customRules={editSessionZeroRules}
            onRulesChange={setEditSessionZeroRules}
          />
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowSessionZeroEdit(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSaveSessionZero}>{t('common.actions.save')}</Button>
        </div>
      </Modal>
    </>
  )
}
