import { useEffect, useState } from 'react'
import { addToast } from '../../../../hooks/use-toast'
import { useT } from '../../../../i18n'
import { useCampaignStore } from '../../../../stores/use-campaign-store'
import Button from '../../../ui/Button'
import Modal from '../../../ui/Modal'

interface CampaignQaModalProps {
  open: boolean
  onClose: () => void
}

interface QaRow {
  id: string
  question: string
  answer: string
  timestamp: string
}

/** The exact refusal sentence the archivist returns when records don't contain the answer (mirrors campaign-qa.ts). */
const REFUSAL = 'Not recorded in the campaign log.'

/**
 * PHASE-31 31D — campaign Q&A archivist. A private, out-of-fiction reference assistant grounded in the
 * campaign record. DM-only; never broadcasts to players; never touches the in-fiction DM conversation.
 */
export default function CampaignQaModal({ open, onClose }: CampaignQaModalProps): JSX.Element {
  const { t } = useT()
  const [history, setHistory] = useState<QaRow[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const campaign = useCampaignStore((s) => s.getActiveCampaign())

  const refresh = async (): Promise<void> => {
    if (!campaign?.id) return
    const res = await window.api.ai.campaignQaHistory(campaign.id)
    if (res.success && res.data) setHistory([...res.data].reverse()) // newest first
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — refresh only when the modal opens
  useEffect(() => {
    if (open) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleAsk = async (): Promise<void> => {
    const q = question.trim()
    if (!q || !campaign?.id) return
    if (!campaign.aiDm?.enabled) {
      addToast(t('game.campaignQaModal.aiNotConfigured'), 'error')
      return
    }
    setAsking(true)
    try {
      const res = await window.api.ai.campaignQaAsk(campaign.id, q)
      if (res.success && res.data) {
        setQuestion('')
        await refresh()
      } else {
        addToast(res.error || t('game.campaignQaModal.askFailed'), 'error')
      }
    } catch {
      addToast(t('game.campaignQaModal.askFailed'), 'error')
    } finally {
      setAsking(false)
    }
  }

  const handleClear = async (): Promise<void> => {
    if (!campaign?.id) return
    await window.api.ai.campaignQaClear(campaign.id)
    setHistory([])
  }

  return (
    <Modal open={open} onClose={onClose} title={t('game.campaignQaModal.title')}>
      <div className="space-y-3">
        <p className="text-muted text-xs">{t('game.campaignQaModal.privacyNote')}</p>

        <div className="border border-border bg-surface rounded-lg p-3 max-h-72 overflow-y-auto space-y-3">
          {history.length === 0 ? (
            <p className="text-gray-500 text-sm">{t('game.campaignQaModal.empty')}</p>
          ) : (
            history.map((row) => (
              <div key={row.id} className="text-sm">
                <p className="text-accent font-semibold">{row.question}</p>
                <p className={row.answer === REFUSAL ? 'text-gray-500 italic' : 'text-gray-200'}>{row.answer}</p>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 h-16 bg-surface border border-border rounded px-2 py-1 text-sm text-gray-200 resize-none focus:outline-none"
            placeholder={t('game.campaignQaModal.placeholder')}
            maxLength={2000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button onClick={handleAsk} variant="primary" disabled={asking || !question.trim()}>
            {asking ? t('game.campaignQaModal.asking') : t('game.campaignQaModal.ask')}
          </Button>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClear}
            disabled={history.length === 0}
            className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer disabled:opacity-40"
          >
            {t('game.campaignQaModal.clearHistory')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
