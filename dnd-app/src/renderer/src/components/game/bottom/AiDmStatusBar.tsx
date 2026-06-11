import { useT } from '../../../i18n'
import type { AiProviderType } from '../../../types/campaign'

interface AiDmStatusBarProps {
  isTyping: boolean
  paused: boolean
  usable: boolean | null
  probeFailed: boolean
  provider: AiProviderType | null
  usedTokens: number
  /** Conversation-history budget from the live token meter (PHASE-10 10C); null = unavailable. */
  maxTokens: number | null
  onRecheck: () => void
}

/**
 * Presentational AI-DM status bar (PHASE-10 10B). Render precedence:
 *  typing → paused → checking (unknown) → not-ready (provider-appropriate) → ready.
 * The dot/label row is a click-to-recheck button. Kept presentational so PHASE-14
 * can mount a connection badge / truncation alert alongside it.
 */
export function AiDmStatusBar({
  isTyping,
  paused,
  usable,
  probeFailed,
  provider,
  usedTokens,
  maxTokens,
  onRecheck
}: AiDmStatusBarProps): JSX.Element {
  const { t } = useT()

  let dotClass: string
  let label: string
  if (isTyping) {
    dotClass = 'bg-accent animate-pulse'
    label = t('game.chatPanel.aiResponding')
  } else if (paused) {
    dotClass = 'bg-gray-500'
    label = t('game.chatPanel.aiPaused')
  } else if (usable === null && !probeFailed) {
    dotClass = 'bg-gray-500 animate-pulse'
    label = t('game.chatPanel.aiChecking')
  } else if (usable === false || probeFailed) {
    dotClass = 'bg-amber-500'
    label =
      provider === 'ollama' || provider === null
        ? t('game.chatPanel.aiNoModel')
        : t('game.chatPanel.aiProviderUnavailable')
  } else {
    dotClass = 'bg-green-500'
    label = t('game.chatPanel.aiReady')
  }

  const overBudget = maxTokens != null && usedTokens > maxTokens
  const tokenText =
    maxTokens == null
      ? t('game.chatPanel.tokensUsedOnly', { used: usedTokens.toLocaleString() })
      : t('game.chatPanel.tokens', { used: usedTokens.toLocaleString(), max: maxTokens.toLocaleString() })

  return (
    <div className="border-t border-gray-800/50 px-2 py-1 shrink-0 flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={onRecheck}
        title={t('game.chatPanel.aiRecheckTitle')}
        className="flex items-center gap-2 cursor-pointer hover:opacity-80"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className="text-gray-500">{label}</span>
      </button>
      <span
        className={`ml-auto ${overBudget ? 'text-amber-500' : 'text-gray-600'}`}
        title={t('game.chatPanel.tokensTitle')}
      >
        {tokenText}
      </span>
    </div>
  )
}
