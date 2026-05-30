import { useState } from 'react'
import type { SessionZeroData } from '../../components/campaign/SessionZeroStep'
import SessionZeroStep from '../../components/campaign/SessionZeroStep'
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
    additionalNotes: ''
  })
  const [editSessionZeroRules, setEditSessionZeroRules] = useState<CustomRule[]>([])

  if (!campaign.sessionZero) return null

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
            additionalNotes: ''
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
          <button onClick={openSessionZeroEdit} className="text-xs text-gray-400 hover:text-amber-400 cursor-pointer">
            {t('pages.sessionZeroCard.edit')}
          </button>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{t('pages.sessionZeroCard.tone')}</span>
            <span className="text-gray-200 capitalize">{campaign.sessionZero.tone}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{t('pages.sessionZeroCard.pvp')}</span>
            <span className={campaign.sessionZero.pvpAllowed ? 'text-red-400' : 'text-green-400'}>
              {campaign.sessionZero.pvpAllowed
                ? t('pages.sessionZeroCard.allowed')
                : t('pages.sessionZeroCard.notAllowed')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{t('pages.sessionZeroCard.characterDeath')}</span>
            <span className="text-gray-200 capitalize">{campaign.sessionZero.characterDeathExpectation}</span>
          </div>
          {campaign.sessionZero.contentLimits.length > 0 && (
            <div>
              <span className="text-gray-500">{t('pages.sessionZeroCard.contentLimits')}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {campaign.sessionZero.contentLimits.map((l) => (
                  <span key={l} className="text-xs bg-red-900/30 text-red-300 px-2 py-0.5 rounded">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}
          {campaign.sessionZero.playSchedule && (
            <div>
              <span className="text-gray-500">{t('pages.sessionZeroCard.schedule')}</span>{' '}
              <span className="text-gray-200">{campaign.sessionZero.playSchedule}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Session Zero Edit Modal */}
      <Modal
        open={showSessionZeroEdit}
        onClose={() => setShowSessionZeroEdit(false)}
        title={t('pages.sessionZeroCard.editTitle')}
      >
        <div className="max-h-[60vh] overflow-y-auto pr-1">
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
