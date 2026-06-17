import { useEffect, useState } from 'react'
import { addToast } from '../../../../hooks/use-toast'
import { useT } from '../../../../i18n'
import { useCampaignStore } from '../../../../stores/use-campaign-store'
import Button from '../../../ui/Button'
import Modal from '../../../ui/Modal'

interface SessionStartRecapModalProps {
  open: boolean
  onClose: () => void
}

/**
 * PHASE-31 31D — "Previously on…" session-start recap. Generated from the campaign record (cached on
 * disk; Regenerate forces fresh). DM-only, never auto-broadcast. Save to Journal appends an AI-authored
 * entry WITHOUT starting a new session (this is session *start*, not end).
 */
export default function SessionStartRecapModal({ open, onClose }: SessionStartRecapModalProps): JSX.Element {
  const { t } = useT()
  const [loading, setLoading] = useState(false)
  const [recapText, setRecapText] = useState('')
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [wasCached, setWasCached] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  // 31E — Discord session recap (only when the bridge is on).
  const [discordRecap, setDiscordRecap] = useState('')
  const [discordBusy, setDiscordBusy] = useState(false)

  const campaign = useCampaignStore((s) => s.getActiveCampaign())

  const fetchDiscordRecap = async (mode: 'live' | 'last'): Promise<void> => {
    setDiscordBusy(true)
    try {
      const res = await window.api.bmoDiscordRecap(mode)
      if (res.ok && typeof res.recap === 'string') {
        setDiscordRecap(res.recap || t('game.sessionStartRecapModal.discordEmpty'))
      } else {
        setDiscordRecap(res.error || t('game.sessionStartRecapModal.discordFailed'))
      }
    } catch {
      setDiscordRecap(t('game.sessionStartRecapModal.discordFailed'))
    } finally {
      setDiscordBusy(false)
    }
  }

  const generate = async (force: boolean): Promise<void> => {
    if (!campaign?.id || !campaign.aiDm?.enabled) {
      addToast(t('game.sessionStartRecapModal.aiNotConfigured'), 'error')
      return
    }
    setLoading(true)
    setIsSaved(false)
    try {
      const result = await window.api.ai.generateSessionStartRecap(campaign.id, force)
      if (result.success && result.data) {
        setRecapText(result.data.text)
        setGeneratedAt(result.data.generatedAt)
        setWasCached(result.data.cached)
      } else {
        addToast(result.error || t('game.sessionStartRecapModal.generateFailed'), 'error')
      }
    } catch {
      addToast(t('game.sessionStartRecapModal.generateError'), 'error')
    } finally {
      setLoading(false)
    }
  }

  // Show the cached recap (or generate the first one) when the modal opens.
  useEffect(() => {
    if (open && !recapText && !loading) void generate(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSave = async (): Promise<void> => {
    if (!campaign || !recapText.trim()) return
    try {
      const maxSession = campaign.journal.entries.reduce((max, e) => Math.max(max, e.sessionNumber), 0)
      const newEntry = {
        id: crypto.randomUUID(),
        sessionNumber: maxSession + 1,
        date: new Date().toISOString(),
        title: t('game.sessionStartRecapModal.recapTitle'),
        content: recapText.trim(),
        isPrivate: false,
        authorId: 'ai-dm',
        createdAt: new Date().toISOString()
      }
      await useCampaignStore.getState().saveCampaign({
        ...campaign,
        journal: { ...campaign.journal, entries: [...campaign.journal.entries, newEntry] },
        updatedAt: new Date().toISOString()
      })
      setIsSaved(true)
      addToast(t('game.sessionStartRecapModal.savedToast'), 'success')
      // NOTE: no startNewSession() — this is session start, not end.
    } catch {
      addToast(t('game.sessionStartRecapModal.saveFailed'), 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('game.sessionStartRecapModal.title')}>
      <div className="space-y-4">
        <p className="text-muted text-xs">{t('game.sessionStartRecapModal.helperText')}</p>

        {loading && <p className="text-gray-400 text-sm">{t('game.sessionStartRecapModal.generating')}</p>}

        {recapText && (
          <div className="border border-border bg-surface rounded-lg p-3 w-full">
            {generatedAt && (
              <p className="text-muted text-[10px] mb-2">
                {wasCached ? t('game.sessionStartRecapModal.cachedHint') : t('game.sessionStartRecapModal.freshHint')}
              </p>
            )}
            <textarea
              className="w-full h-40 bg-transparent text-sm text-gray-200 resize-none focus:outline-none"
              value={recapText}
              onChange={(e) => setRecapText(e.target.value)}
            />
          </div>
        )}

        {campaign?.aiDm?.discordBridge && (
          <div className="border-t border-border/40 pt-3 space-y-2">
            <p className="text-muted text-[11px] font-semibold uppercase tracking-wide">
              {t('game.sessionStartRecapModal.discordTitle')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void fetchDiscordRecap('live')}
                disabled={discordBusy}
                className="text-xs px-2 py-1 rounded bg-surface-2 text-gray-300 hover:bg-gray-700 cursor-pointer disabled:opacity-50"
              >
                {t('game.sessionStartRecapModal.discordLive')}
              </button>
              <button
                type="button"
                onClick={() => void fetchDiscordRecap('last')}
                disabled={discordBusy}
                className="text-xs px-2 py-1 rounded bg-surface-2 text-gray-300 hover:bg-gray-700 cursor-pointer disabled:opacity-50"
              >
                {t('game.sessionStartRecapModal.discordLast')}
              </button>
            </div>
            {discordRecap && (
              <div className="bg-surface border border-border rounded p-2">
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{discordRecap}</p>
                <button
                  type="button"
                  onClick={() => setRecapText((prev) => (prev ? `${prev}\n\n${discordRecap}` : discordRecap))}
                  className="mt-1 text-xs text-accent hover:underline cursor-pointer"
                >
                  {t('game.sessionStartRecapModal.discordInsert')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-end items-center">
          <button
            type="button"
            onClick={() => void generate(true)}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer disabled:opacity-50"
          >
            {t('game.sessionStartRecapModal.regenerate')}
          </button>
          <Button onClick={handleSave} variant="primary" disabled={!recapText.trim() || isSaved}>
            {isSaved ? t('game.sessionStartRecapModal.saved') : t('game.sessionStartRecapModal.saveToJournal')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
