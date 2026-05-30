import { useState } from 'react'
import { addToast } from '../../../../hooks/use-toast'
import { useT } from '../../../../i18n'
import { useCampaignStore } from '../../../../stores/use-campaign-store'
import { useGameStore } from '../../../../stores/use-game-store'
import Button from '../../../ui/Button'
import Modal from '../../../ui/Modal'

interface EndOfSessionModalProps {
  open: boolean
  onClose: () => void
  onSkip: () => void
}

export default function EndOfSessionModal({ open, onClose, onSkip }: EndOfSessionModalProps): JSX.Element {
  const { t } = useT()
  const [generating, setGenerating] = useState(false)
  const [recapText, setRecapText] = useState('')
  const [isSaved, setIsSaved] = useState(false)

  const campaign = useCampaignStore((s) => s.getActiveCampaign())
  const sessionLog = useGameStore((s) => s.sessionLog)
  const currentSessionLabel = useGameStore((s) => s.currentSessionLabel)

  const handleGenerateRecap = async () => {
    if (!campaign?.id || !campaign.aiDm?.enabled) {
      addToast(t('game.endOfSessionModal.aiNotConfigured'), 'error')
      return
    }

    setGenerating(true)
    setRecapText('')
    setIsSaved(false)

    try {
      const result = await window.api.ai.generateEndOfSessionRecap(campaign.id)
      if (result.success && result.data) {
        setRecapText(result.data)
      } else {
        addToast(result.error || t('game.endOfSessionModal.generateFailed'), 'error')
      }
    } catch (_e) {
      addToast(t('game.endOfSessionModal.generateError'), 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveRecap = async () => {
    if (!campaign || !recapText.trim()) return

    try {
      const maxSession = campaign.journal.entries.reduce((max, e) => Math.max(max, e.sessionNumber), 0)

      const newEntry = {
        id: crypto.randomUUID(),
        sessionNumber: maxSession + 1,
        date: new Date().toISOString(),
        title: t('game.endOfSessionModal.recapTitle', { label: currentSessionLabel }),
        content: recapText.trim(),
        isPrivate: false,
        authorId: 'ai-dm',
        createdAt: new Date().toISOString()
      }

      const updatedCampaign = {
        ...campaign,
        journal: {
          ...campaign.journal,
          entries: [...campaign.journal.entries, newEntry]
        },
        updatedAt: new Date().toISOString()
      }

      await useCampaignStore.getState().saveCampaign(updatedCampaign)
      setIsSaved(true)
      addToast(t('game.endOfSessionModal.savedToast'), 'success')
      // Clear session logs to prep for next session
      useGameStore.getState().startNewSession()
      setTimeout(onClose, 1500)
    } catch (_e) {
      addToast(t('game.endOfSessionModal.saveFailed'), 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('game.endOfSessionModal.title')}>
      <div className="space-y-4">
        <div className="text-gray-300 text-sm">
          <p>{t('game.endOfSessionModal.notesCount', { count: sessionLog.length })}</p>
          <p className="text-gray-400 mt-2 text-xs">{t('game.endOfSessionModal.helperText')}</p>
        </div>

        {recapText && (
          <div className="mt-4 border border-gray-700 bg-gray-900 rounded-lg p-3 max-h-64 overflow-y-auto w-full">
            <h4 className="text-amber-400 text-xs font-bold mb-2 uppercase tracking-wide">
              {t('game.endOfSessionModal.recapDraft')}
            </h4>
            <textarea
              className="w-full h-32 bg-transparent text-sm text-gray-200 resize-none focus:outline-none"
              value={recapText}
              onChange={(e) => setRecapText(e.target.value)}
            />
          </div>
        )}

        <div className="mt-6 flex gap-3 justify-end items-center">
          <button
            type="button"
            onClick={() => {
              onSkip()
              onClose()
            }}
            className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
          >
            {t('game.endOfSessionModal.skipClose')}
          </button>

          {!recapText || isSaved ? (
            <Button onClick={handleGenerateRecap} disabled={generating || isSaved} className="gap-2">
              {generating ? t('game.endOfSessionModal.generating') : t('game.endOfSessionModal.generateRecap')}
            </Button>
          ) : (
            <Button onClick={handleSaveRecap} variant="primary">
              {t('game.endOfSessionModal.saveToJournal')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
