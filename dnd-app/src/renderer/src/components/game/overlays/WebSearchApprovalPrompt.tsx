import { useState } from 'react'
import { Z } from '../../../constants'
import { useT } from '../../../i18n'
import { useAiDmStore } from '../../../stores/use-ai-dm-store'

/**
 * WebSearchApprovalPrompt — shown to the DM when the AI DM requests a web search
 * mid-stream. The stream pauses at status 'pending_approval' until the DM approves
 * or rejects; without this UI the stream hung indefinitely (the store tracked the
 * request but nothing surfaced it). Gated on the DM at the GameLayout mount.
 */
export default function WebSearchApprovalPrompt(): JSX.Element | null {
  const { t } = useT()
  const webSearchStatus = useAiDmStore((s) => s.webSearchStatus)
  const [submitting, setSubmitting] = useState(false)

  if (webSearchStatus?.status !== 'pending_approval') return null

  const decide = (approved: boolean): void => {
    if (submitting) return
    setSubmitting(true)
    // The main process replies with a 'searching' or 'rejected' status event, which
    // flips webSearchStatus out of 'pending_approval' and unmounts this prompt.
    void window.api.ai.approveWebSearch(webSearchStatus.streamId, approved).finally(() => setSubmitting(false))
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/70"
      style={{ zIndex: Z.MODAL }}
      role="presentation"
    >
      <div className="bg-surface border border-amber-500/50 rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-amber-600/10">
          <span className="text-accent font-bold text-lg">{t('game.webSearchApproval.title')}</span>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm text-muted">{t('game.webSearchApproval.description')}</p>
          <div className="rounded-lg border border-border bg-black/20 px-3 py-2 text-sm text-gray-200 break-words">
            “{webSearchStatus.query}”
          </div>
        </div>
        <div className="flex gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            disabled={submitting}
            onClick={() => decide(false)}
            className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-muted hover:bg-white/5 disabled:opacity-50"
          >
            {t('game.webSearchApproval.reject')}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => decide(true)}
            className="flex-1 px-3 py-2 rounded-lg bg-accent text-black font-semibold text-sm hover:opacity-90 disabled:opacity-50"
          >
            {t('game.webSearchApproval.approve')}
          </button>
        </div>
      </div>
    </div>
  )
}
