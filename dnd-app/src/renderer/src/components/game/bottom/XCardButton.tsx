import { useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n'
import { tapXCard } from '../../../services/chat-commands/commands-safety'

/**
 * PHASE-32 32E — the chat-panel X-Card button. Rendered ONLY when the campaign opts in
 * (aiDm.enabled && sessionZero.xCardEnabled), so existing campaigns see zero UI change. Clicking opens
 * a minimal confirm popover with an optional ban-topic; Confirm runs the same `tapXCard` path as `/xcard`.
 */
export default function XCardButton(): JSX.Element {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus() // initial focus on Cancel (least destructive)
  }, [open])

  const confirm = (): void => {
    tapXCard(topic)
    setTopic('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('game.xCard.buttonLabel')}
        title={t('game.xCard.buttonLabel')}
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-red-400 hover:bg-red-900/30 cursor-pointer text-sm font-bold"
      >
        ✕
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('game.xCard.confirmTitle')}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="absolute bottom-full end-0 mb-1 w-64 z-20 rounded-lg border border-border bg-surface p-3 shadow-lg space-y-2"
        >
          <p className="text-sm font-semibold text-gray-200">{t('game.xCard.confirmTitle')}</p>
          <p className="text-xs text-gray-400">{t('game.xCard.confirmBody')}</p>
          <input
            name="x-card-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('game.xCard.topicPlaceholder')}
            maxLength={200}
            className="w-full px-2 py-1 text-xs bg-surface-2 border border-border rounded text-gray-200"
          />
          <div className="flex justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 cursor-pointer"
            >
              {t('game.xCard.cancel')}
            </button>
            <button
              type="button"
              onClick={confirm}
              className="px-2 py-1 text-xs rounded bg-red-700 hover:bg-red-600 text-white cursor-pointer"
            >
              {t('game.xCard.confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
