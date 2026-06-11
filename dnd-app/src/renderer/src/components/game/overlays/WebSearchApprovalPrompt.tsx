import { useEffect, useId, useRef, useState } from 'react'
import { WEB_SEARCH_APPROVAL_TIMEOUT_MS, Z } from '../../../constants'
import { useT } from '../../../i18n'
import { useAiDmStore } from '../../../stores/use-ai-dm-store'
import { pushDmAlert } from './DmAlertTray'

/** Live countdown to the main process's hard auto-reject deadline. */
function Countdown({ deadline }: { deadline: number }): JSX.Element {
  const { t } = useT()
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [deadline])
  return (
    <span className={`text-xs font-mono ${remaining <= 10 ? 'text-red-400' : 'text-gray-500'}`}>
      {t('game.webSearchApproval.countdown', { remaining })}
    </span>
  )
}

/**
 * WebSearchApprovalPrompt — shown to the DM when the AI DM requests a web search
 * mid-stream. The stream pauses at status 'pending_approval' until the DM approves
 * or rejects; without this UI the stream hung indefinitely (the store tracked the
 * request but nothing surfaced it). Gated on the DM at the GameLayout mount.
 *
 * 04D — a real dialog: role/aria-modal/labelling, Escape-to-reject, Tab focus trap,
 * initial focus on the least-destructive (Reject) button, a live auto-reject countdown,
 * and graceful handling of a stale (already-expired) request.
 */
export default function WebSearchApprovalPrompt(): JSX.Element | null {
  const { t } = useT()
  const webSearchStatus = useAiDmStore((s) => s.webSearchStatus)
  const clearWebSearchStatus = useAiDmStore((s) => s.clearWebSearchStatus)
  const markWebSearchDecided = useAiDmStore((s) => s.markWebSearchDecided)
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  const isPending = webSearchStatus?.status === 'pending_approval'
  const streamId = webSearchStatus?.streamId

  const decide = (approved: boolean): void => {
    if (submitting || !streamId) return
    setSubmitting(true)
    // Mark decided BEFORE the IPC so the store's silent-auto-reject alert never double-fires
    // for a DM-clicked reject.
    markWebSearchDecided()
    // The main process replies with a 'searching' or 'rejected' status event, which
    // flips webSearchStatus out of 'pending_approval' and unmounts this prompt.
    void window.api.ai
      .approveWebSearch(streamId, approved)
      .then((res) => {
        // success:false ⇒ the request already timed out / was cancelled and no status event
        // is coming — clear the status so the modal unmounts instead of wedging open (F1/F7).
        if (res && res.success === false) {
          pushDmAlert('warning', t('game.webSearchApproval.staleRequest'))
          clearWebSearchStatus()
        }
      })
      .finally(() => setSubmitting(false))
  }

  // Dialog keyboard handling (mirrors ui/Modal.tsx) — Escape rejects (resumes the stream with
  // the denial block, the safe default), Tab/Shift+Tab cycle within the dialog.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-bind only when the pending request toggles; decide is recreated each render but stable in behavior
  useEffect(() => {
    if (!isPending) return
    previousFocusRef.current = document.activeElement as HTMLElement
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        decide(false)
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    // Initial focus on the Reject button (first focusable — least destructive).
    const raf = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    })
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      previousFocusRef.current?.focus()
    }
  }, [isPending])

  if (!isPending || !webSearchStatus) return null

  const deadline = webSearchStatus.receivedAt + WEB_SEARCH_APPROVAL_TIMEOUT_MS

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70" style={{ zIndex: Z.MODAL }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface border border-amber-500/50 rounded-xl shadow-2xl w-full max-w-md flex flex-col"
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-amber-600/10">
          <span id={titleId} className="text-accent font-bold text-lg">
            {t('game.webSearchApproval.title')}
          </span>
          <span className="ml-auto">
            <Countdown deadline={deadline} />
          </span>
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
