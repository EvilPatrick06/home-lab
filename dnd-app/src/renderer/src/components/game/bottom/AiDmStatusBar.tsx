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
  /** PHASE-14 14B — provider connection health. Only degraded/disconnected render a chip. */
  connection?: 'connected' | 'degraded' | 'disconnected' | null
  /** PHASE-14 14C — the last completed turn's context was trimmed to fit the window. */
  contextTruncated?: boolean
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
  onRecheck,
  connection,
  contextTruncated
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

      {/* PHASE-14 14B/14C — health chips. role=status announces transitions politely. Shape+
          border+color+label together (never color alone). Only renders when something is wrong. */}
      <span role="status" className="flex items-center gap-1.5">
        {connection === 'degraded' && (
          <span className="px-1.5 py-0.5 rounded border border-amber-500/60 text-amber-400 leading-none">
            ▲ {t('game.aiStatusBar.connDegraded')}
          </span>
        )}
        {connection === 'disconnected' && (
          <span className="px-1.5 py-0.5 rounded border border-red-500/60 text-red-400 leading-none">
            ■ {t('game.aiStatusBar.connDisconnected')}
          </span>
        )}
        {contextTruncated && (
          <span
            className="px-1.5 py-0.5 rounded border border-amber-500/60 text-amber-400 leading-none"
            title={t('game.aiStatusBar.contextTrimmedTitle')}
          >
            ✂ {t('game.aiStatusBar.contextTrimmed')}
          </span>
        )}
      </span>

      <span
        className={`ml-auto ${overBudget ? 'text-amber-500' : 'text-gray-600'}`}
        title={t('game.chatPanel.tokensTitle')}
      >
        {tokenText}
      </span>
    </div>
  )
}
